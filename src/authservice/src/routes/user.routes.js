import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { authenticationMiddleware, authorizationMiddleware } from '../middlewares/auth.middleware.js';
import { roleEnum } from '../db/models/user.model.js';

const router = Router();

router.use(authenticationMiddleware);

router.get('/me', asyncHandler(userController.getMe));
router.patch('/me', asyncHandler(userController.updateMe));
router.patch('/me/password', asyncHandler(userController.changePassword));

router.get('/me/wishlist', asyncHandler(userController.getWishlist));
router.put('/me/wishlist/:productId', asyncHandler(userController.addToWishlist));
router.delete('/me/wishlist/:productId', asyncHandler(userController.removeFromWishlist));

// admin only
router.get('/stats', authorizationMiddleware([roleEnum.admin]), asyncHandler(userController.getUserStats));
router.get('/', authorizationMiddleware([roleEnum.admin]), asyncHandler(userController.listUsers));
router.patch('/:id/ban', authorizationMiddleware([roleEnum.admin]), asyncHandler(userController.setBanned));

export default router;
