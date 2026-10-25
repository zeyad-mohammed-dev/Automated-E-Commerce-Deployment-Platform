import * as categoryService from '../services/category.service.js';
import { successResponse } from '../utils/response/success.response.js';

export const getCategories = async (req, res) => {
  const categories = await categoryService.getCategories();
  return successResponse({ res, message: 'Categories fetched successfully', data: { categories } });
};

export const addCategory = async (req, res) => {
  const category = await categoryService.addCategory({ body: req.body, file: req.file });
  return successResponse({ res, message: 'Category created successfully', data: { category }, statusCode: 201 });
};

export const updateCategory = async (req, res) => {
  const category = await categoryService.updateCategory({
    id: req.params.id,
    body: req.body,
    file: req.file,
  });
  return successResponse({ res, message: 'Category updated successfully', data: { category } });
};

export const deleteCategory = async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  return successResponse({ res, message: 'Category deleted successfully' });
};
