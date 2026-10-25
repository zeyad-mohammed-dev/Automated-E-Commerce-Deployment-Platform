import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { internalAuthMiddleware } from '../middlewares/internal-auth.middleware.js';
import { uploadProductImages } from '../middlewares/upload.middleware.js';

const router = Router();

router.get('/', asyncHandler(productController.getProducts));

// internal routes, keep them before '/:id'
router.get('/export', internalAuthMiddleware(), asyncHandler(productController.exportProducts));
router.post('/stock/adjust', internalAuthMiddleware(), asyncHandler(productController.adjustStock));

router.get('/:id', asyncHandler(productController.getProduct));

router.post(
  '/',
  internalAuthMiddleware(),
  uploadProductImages,
  asyncHandler(productController.addProduct),
);
router.patch(
  '/:id',
  internalAuthMiddleware(),
  uploadProductImages,
  asyncHandler(productController.updateProduct),
);
router.delete('/:id', internalAuthMiddleware(), asyncHandler(productController.deleteProduct));

export default router;
