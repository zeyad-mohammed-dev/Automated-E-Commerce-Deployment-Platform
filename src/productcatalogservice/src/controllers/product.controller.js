import * as productService from '../services/product.service.js';
import { successResponse } from '../utils/response/success.response.js';

export const getProducts = async (req, res) => {
  const data = await productService.getProducts(req.query);
  return successResponse({ res, message: 'Products fetched successfully', data });
};

export const exportProducts = async (req, res) => {
  const products = await productService.exportProducts();
  return successResponse({ res, message: 'Products exported successfully', data: { products } });
};

export const getProduct = async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return successResponse({ res, message: 'Product fetched successfully', data: { product } });
};

export const addProduct = async (req, res) => {
  const product = await productService.addProduct({ body: req.body, files: req.files || [] });
  return successResponse({ res, message: 'Product created successfully', data: { product }, statusCode: 201 });
};

export const updateProduct = async (req, res) => {
  const product = await productService.updateProduct({
    id: req.params.id,
    body: req.body,
    files: req.files || [],
  });
  return successResponse({ res, message: 'Product updated successfully', data: { product } });
};

export const deleteProduct = async (req, res) => {
  await productService.deleteProduct(req.params.id);
  return successResponse({ res, message: 'Product deleted successfully' });
};

export const adjustStock = async (req, res) => {
  await productService.adjustStock(req.body);
  return successResponse({ res, message: 'Stock updated successfully' });
};
