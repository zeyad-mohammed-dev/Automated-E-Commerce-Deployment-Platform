import mongoose from 'mongoose';
import * as DBService from './db.service.js';
import { CategoryModel } from '../db/models/category.model.js';
import { ProductModel } from '../db/models/product.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors/index.js';
import { slugify } from '../utils/slug.js';
import { putImage } from '../utils/storage/index.js';
import { publishEvent, eventTypes } from './events.service.js';
import { toSearchDoc } from './search-doc.js';

export const getCategories = async () => {
  return await DBService.find({
    model: CategoryModel,
    filter: { isDeleted: false },
    options: { sort: { name: 1 }, lean: true },
  });
};

export const getCategoryById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new NotFoundError({ message: 'Category not found' });
  }
  const category = await DBService.findOne({
    model: CategoryModel,
    filter: { _id: id, isDeleted: false },
  });
  if (!category) throw new NotFoundError({ message: 'Category not found' });
  return category;
};

export const addCategory = async ({ body, file }) => {
  const name = body.name?.trim();
  if (!name) throw new ValidationError({ message: 'Category name is required' });

  const slug = slugify(body.slug || name);
  if (!slug) throw new ValidationError({ message: 'Category slug is invalid' });

  const exists = await DBService.findOne({
    model: CategoryModel,
    filter: { $or: [{ name }, { slug }] },
  });
  if (exists) throw new ConflictError({ message: 'Category already exists' });

  const image = file ? await putImage({ file, folder: 'categories' }) : '';
  return await DBService.create({ model: CategoryModel, data: { name, slug, image } });
};

const republishProductsOf = async (categoryId) => {
  const products = await DBService.find({
    model: ProductModel,
    filter: { category: categoryId, isDeleted: false },
    options: { populate: 'category' },
  });
  for (const product of products) {
    await publishEvent({ type: eventTypes.productUpserted, data: toSearchDoc(product) });
  }
};

export const updateCategory = async ({ id, body, file }) => {
  const category = await getCategoryById(id);
  const update = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) throw new ValidationError({ message: 'Category name cannot be empty' });
    update.name = name;
  }
  if (body.slug !== undefined || body.name !== undefined) {
    update.slug = slugify(body.slug || update.name || category.name);
  }

  if (update.name || update.slug) {
    const clash = await DBService.findOne({
      model: CategoryModel,
      filter: {
        _id: { $ne: category._id },
        $or: [
          ...(update.name ? [{ name: update.name }] : []),
          ...(update.slug ? [{ slug: update.slug }] : []),
        ],
      },
    });
    if (clash) throw new ConflictError({ message: 'Category already exists' });
  }

  if (file) update.image = await putImage({ file, folder: 'categories' });

  const updated = await DBService.findOneAndUpdate({
    model: CategoryModel,
    filter: { _id: category._id },
    update,
  });

  // category name/slug are part of the search documents
  await republishProductsOf(category._id);
  return updated;
};

export const deleteCategory = async (id) => {
  const category = await getCategoryById(id);

  const productsCount = await DBService.countDocuments({
    model: ProductModel,
    filter: { category: category._id, isDeleted: false },
  });
  if (productsCount > 0) {
    throw new ConflictError({
      message: 'Cannot delete a category that still has products',
    });
  }

  await DBService.findOneAndUpdate({
    model: CategoryModel,
    filter: { _id: category._id },
    update: { isDeleted: true },
  });
};
