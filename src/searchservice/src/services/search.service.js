import { SearchProductModel } from '../db/models/search-product.model.js';
import * as DBService from './db.service.js';
import { escapeRegex } from '../utils/slug.js';
import { ValidationError } from '../utils/errors/index.js';

const MAX_LIMIT = 50;
const MAX_TERMS = 8;

const sortOptions = {
  newest: { sourceCreatedAt: -1 },
  priceAsc: { finalPrice: 1 },
  priceDesc: { finalPrice: -1 },
  bestSelling: { soldCount: -1, sourceCreatedAt: -1 },
  rating: { rating: -1, reviewCount: -1 },
  relevance: { score: -1, soldCount: -1, sourceCreatedAt: -1 },
};

const outputFields = {
  _id: 0,
  id: '$productId',
  name: 1,
  description: 1,
  brand: 1,
  price: 1,
  discountPercent: 1,
  finalPrice: 1,
  images: 1,
  rating: 1,
  reviewCount: 1,
  soldCount: 1,
  stockQuantity: 1,
  category: 1,
  createdAt: '$sourceCreatedAt',
};

const toNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ValidationError({ message: `${field} must be a number` });
  }
  return number;
};

export const buildSearchText = ({ name, brand, category, description }) => {
  return [name, brand, category?.name, description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const splitTerms = (q) => {
  return String(q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
};

const relevanceScore = (terms) => {
  const parts = terms.flatMap((term) => {
    const regex = escapeRegex(term);
    return [
      { $cond: [{ $regexMatch: { input: '$name', regex, options: 'i' } }, 5, 0] },
      { $cond: [{ $regexMatch: { input: '$brand', regex, options: 'i' } }, 3, 0] },
      { $cond: [{ $regexMatch: { input: '$category.name', regex, options: 'i' } }, 2, 0] },
    ];
  });
  return { $add: parts };
};

export const buildSearchPipeline = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 12, 1), MAX_LIMIT);
  const terms = splitTerms(query.q);

  const match = {};
  // every word must appear somewhere in the product text
  if (terms.length) {
    match.$and = terms.map((term) => ({ searchText: { $regex: escapeRegex(term) } }));
  }
  if (query.category) {
    const category = String(query.category);
    match.$or = [{ 'category.slug': category.toLowerCase() }, { 'category.id': category }];
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    match.finalPrice = {};
    if (query.minPrice !== undefined) match.finalPrice.$gte = toNumber(query.minPrice, 'minPrice');
    if (query.maxPrice !== undefined) match.finalPrice.$lte = toNumber(query.maxPrice, 'maxPrice');
  }
  if (query.onSale === 'true') match.discountPercent = { $gt: 0 };
  if (query.inStock === 'true') match.stockQuantity = { $gt: 0 };

  const sortKey = sortOptions[query.sort] && (query.sort !== 'relevance' || terms.length)
    ? query.sort
    : terms.length
      ? 'relevance'
      : 'newest';

  const pipeline = [{ $match: match }];
  if (terms.length) pipeline.push({ $addFields: { score: relevanceScore(terms) } });
  pipeline.push({ $sort: sortOptions[sortKey] });
  pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit }, { $project: outputFields });

  // no $facet on purpose: DocumentDB does not support it, so the total is a separate count
  return { match, pipeline, page, limit, terms, sort: sortKey };
};

export const searchProducts = async (query = {}) => {
  const { match, pipeline, page, limit, sort } = buildSearchPipeline(query);

  const [results, totalCount] = await Promise.all([
    DBService.aggregate({ model: SearchProductModel, pipeline }),
    DBService.countDocuments({ model: SearchProductModel, filter: match }),
  ]);

  return {
    query: String(query.q || ''),
    sort,
    page,
    limit,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    results,
  };
};

// for the search bar dropdown
export const getSuggestions = async (q) => {
  const terms = splitTerms(q);
  if (!terms.length) return [];

  const pipeline = [
    { $match: { $and: terms.map((term) => ({ name: { $regex: escapeRegex(term), $options: 'i' } })) } },
    { $sort: { soldCount: -1 } },
    { $limit: 6 },
    { $project: { _id: 0, id: '$productId', name: 1, image: { $arrayElemAt: ['$images', 0] }, finalPrice: 1 } },
  ];
  return await DBService.aggregate({ model: SearchProductModel, pipeline });
};

export const countIndexed = async () => {
  return await DBService.countDocuments({ model: SearchProductModel });
};
