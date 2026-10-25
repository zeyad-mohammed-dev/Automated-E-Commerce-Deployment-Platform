import mongoose from 'mongoose';
import * as DBService from './db.service.js';
import { ProductModel } from '../db/models/product.model.js';
import { CategoryModel } from '../db/models/category.model.js';
import { NotFoundError, ValidationError } from '../utils/errors/index.js';
import { escapeRegex } from '../utils/slug.js';
import { putImage } from '../utils/storage/index.js';
import { publishEvent, eventTypes } from './events.service.js';
import { toSearchDoc } from './search-doc.js';

const MAX_IMAGES = 5;
const MAX_LIMIT = 50;

const populateCategory = { path: 'category', select: 'name slug image' };

const sortOptions = {
  newest: { createdAt: -1 },
  priceAsc: { price: 1 },
  priceDesc: { price: -1 },
  bestSelling: { soldCount: -1, createdAt: -1 },
  rating: { rating: -1, reviewCount: -1 },
};

const toNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ValidationError({ message: `${field} must be a number` });
  }
  return number;
};

const parseList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (error) {
    // not JSON, fall back to a comma separated list
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const assertCategory = async (categoryId) => {
  if (!mongoose.isValidObjectId(categoryId)) {
    throw new ValidationError({ message: 'Invalid category' });
  }
  const category = await DBService.findOne({
    model: CategoryModel,
    filter: { _id: categoryId, isDeleted: false },
  });
  if (!category) throw new ValidationError({ message: 'Category does not exist' });
  return category;
};

const resolveCategoryId = async (category) => {
  if (mongoose.isValidObjectId(category)) return category;
  const found = await DBService.findOne({
    model: CategoryModel,
    filter: { slug: String(category).toLowerCase(), isDeleted: false },
  });
  return found ? found._id : null;
};

export const buildProductFilter = async (query = {}) => {
  const filter = { isDeleted: false };

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: regex }, { brand: regex }, { description: regex }];
  }

  if (query.category) {
    const categoryId = await resolveCategoryId(query.category);
    if (!categoryId) return null;
    filter.category = categoryId;
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = toNumber(query.minPrice, 'minPrice');
    if (query.maxPrice !== undefined) filter.price.$lte = toNumber(query.maxPrice, 'maxPrice');
  }

  if (query.onSale === 'true') filter.discountPercent = { $gt: 0 };
  if (query.inStock === 'true') filter.stockQuantity = { $gt: 0 };

  return filter;
};

export const getProducts = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 12, 1), MAX_LIMIT);

  const filter = await buildProductFilter(query);
  if (!filter) {
    return { page, limit, totalCount: 0, totalPages: 0, products: [] };
  }

  const [products, totalCount] = await Promise.all([
    DBService.find({
      model: ProductModel,
      filter,
      options: {
        sort: sortOptions[query.sort] || sortOptions.newest,
        skip: (page - 1) * limit,
        limit,
        populate: populateCategory,
      },
    }),
    DBService.countDocuments({ model: ProductModel, filter }),
  ]);

  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit), products };
};

export const getProductById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new NotFoundError({ message: 'Product not found' });
  }
  const product = await DBService.findOne({
    model: ProductModel,
    filter: { _id: id, isDeleted: false },
    options: { populate: populateCategory },
  });
  if (!product) throw new NotFoundError({ message: 'Product not found' });
  return product;
};

const uploadImages = async (files = []) => {
  return await Promise.all(files.map((file) => putImage({ file, folder: 'products' })));
};

export const addProduct = async ({ body, files }) => {
  const name = body.name?.trim();
  if (!name) throw new ValidationError({ message: 'Product name is required' });
  if (body.price === undefined) throw new ValidationError({ message: 'Product price is required' });
  if (!body.category) throw new ValidationError({ message: 'Product category is required' });

  await assertCategory(body.category);

  if (files.length > MAX_IMAGES) {
    throw new ValidationError({ message: `A product can have up to ${MAX_IMAGES} images` });
  }

  const data = {
    name,
    description: body.description ?? '',
    brand: body.brand ?? '',
    price: toNumber(body.price, 'price'),
    category: body.category,
  };
  if (body.discountPercent !== undefined) data.discountPercent = toNumber(body.discountPercent, 'discountPercent');
  if (body.stockQuantity !== undefined) data.stockQuantity = toNumber(body.stockQuantity, 'stockQuantity');
  if (body.rating !== undefined) data.rating = toNumber(body.rating, 'rating');
  if (body.reviewCount !== undefined) data.reviewCount = toNumber(body.reviewCount, 'reviewCount');

  data.images = await uploadImages(files);

  const created = await DBService.create({ model: ProductModel, data });
  const product = await getProductById(created._id);

  await publishEvent({ type: eventTypes.productUpserted, data: toSearchDoc(product) });
  return product;
};

export const updateProduct = async ({ id, body, files }) => {
  const product = await getProductById(id);
  const update = {};

  for (const field of ['name', 'description', 'brand']) {
    if (body[field] !== undefined) update[field] = String(body[field]).trim();
  }
  if (update.name === '') throw new ValidationError({ message: 'Product name cannot be empty' });

  for (const field of ['price', 'discountPercent', 'stockQuantity', 'rating', 'reviewCount']) {
    if (body[field] !== undefined) update[field] = toNumber(body[field], field);
  }

  if (body.category !== undefined) {
    await assertCategory(body.category);
    update.category = body.category;
  }

  const removeImages = parseList(body.removeImages);
  if (removeImages.length || files.length) {
    const kept = product.images.filter((image) => !removeImages.includes(image));
    if (kept.length + files.length > MAX_IMAGES) {
      throw new ValidationError({ message: `A product can have up to ${MAX_IMAGES} images` });
    }
    update.images = [...kept, ...(await uploadImages(files))];
  }

  await DBService.findOneAndUpdate({
    model: ProductModel,
    filter: { _id: product._id },
    update,
  });

  const updated = await getProductById(product._id);
  await publishEvent({ type: eventTypes.productUpserted, data: toSearchDoc(updated) });
  return updated;
};

export const deleteProduct = async (id) => {
  const product = await getProductById(id);

  await DBService.findOneAndUpdate({
    model: ProductModel,
    filter: { _id: product._id },
    update: { isDeleted: true },
  });

  await publishEvent({
    type: eventTypes.productDeleted,
    data: { id: String(product._id) },
  });
};

// All products as search documents, used by searchservice for its first sync
export const exportProducts = async () => {
  const products = await DBService.find({
    model: ProductModel,
    filter: { isDeleted: false },
    options: { sort: { createdAt: 1 }, populate: populateCategory },
  });
  return products.map(toSearchDoc);
};

// Called by ordersservice after an order is recorded
export const adjustStock = async ({ items, action = 'purchase' }) => {
  if (!Array.isArray(items) || !items.length) {
    throw new ValidationError({ message: 'items must be a non-empty array' });
  }
  if (!['purchase', 'restock'].includes(action)) {
    throw new ValidationError({ message: 'action must be purchase or restock' });
  }

  // Plain $inc / $set (no update pipeline) so it also runs on DocumentDB.
  // For every item the "not enough" case is checked first, so only one of the two applies.
  const operations = items.flatMap((item) => {
    const quantity = Number(item.quantity);
    if (!mongoose.isValidObjectId(item.productId) || !Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError({ message: 'Each item needs a valid productId and quantity' });
    }
    const _id = item.productId;

    if (action === 'purchase') {
      // the payment already went through, so the stock stops at zero instead of failing
      return [
        { updateOne: { filter: { _id, stockQuantity: { $lt: quantity } }, update: { $set: { stockQuantity: 0 }, $inc: { soldCount: quantity } } } },
        { updateOne: { filter: { _id, stockQuantity: { $gte: quantity } }, update: { $inc: { stockQuantity: -quantity, soldCount: quantity } } } },
      ];
    }

    return [
      { updateOne: { filter: { _id, soldCount: { $lt: quantity } }, update: { $set: { soldCount: 0 }, $inc: { stockQuantity: quantity } } } },
      { updateOne: { filter: { _id, soldCount: { $gte: quantity } }, update: { $inc: { soldCount: -quantity, stockQuantity: quantity } } } },
    ];
  });

  await DBService.bulkWrite({ model: ProductModel, operations });

  const ids = items.map((item) => item.productId);
  const products = await DBService.find({
    model: ProductModel,
    filter: { _id: { $in: ids }, isDeleted: false },
    options: { populate: populateCategory },
  });
  for (const product of products) {
    await publishEvent({ type: eventTypes.productUpserted, data: toSearchDoc(product) });
  }
};

// ---- used by the gRPC layer ----

export const listAllProducts = async () => {
  return await DBService.find({
    model: ProductModel,
    filter: { isDeleted: false },
    options: { sort: { createdAt: 1 }, populate: populateCategory },
  });
};

export const searchProducts = async (text) => {
  const query = String(text || '').trim();
  if (!query) return [];
  const regex = new RegExp(escapeRegex(query), 'i');
  return await DBService.find({
    model: ProductModel,
    filter: {
      isDeleted: false,
      $or: [{ name: regex }, { brand: regex }, { description: regex }],
    },
    options: { populate: populateCategory },
  });
};

export const findProductForGrpc = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return await DBService.findOne({
    model: ProductModel,
    filter: { _id: id, isDeleted: false },
    options: { populate: populateCategory },
  });
};
