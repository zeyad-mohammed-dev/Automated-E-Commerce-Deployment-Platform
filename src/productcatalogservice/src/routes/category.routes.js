import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { internalAuthMiddleware } from '../middlewares/internal-auth.middleware.js';
import { uploadCategoryImage } from '../middlewares/upload.middleware.js';

const router = Router();

router.get('/', asyncHandler(categoryController.getCategories));

router.post(
  '/',
  internalAuthMiddleware(),
  uploadCategoryImage,
  asyncHandler(categoryController.addCategory),
);
router.patch(
  '/:id',
  internalAuthMiddleware(),
  uploadCategoryImage,
  asyncHandler(categoryController.updateCategory),
);
router.delete('/:id', internalAuthMiddleware(), asyncHandler(categoryController.deleteCategory));

export default router;
