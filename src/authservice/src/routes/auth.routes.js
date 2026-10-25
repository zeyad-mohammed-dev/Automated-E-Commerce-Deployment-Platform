import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { authenticationMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', asyncHandler(authController.register));
router.post('/confirm-email', asyncHandler(authController.confirmEmail));
router.post('/resend-otp', asyncHandler(authController.resendOtp));
router.post('/login', asyncHandler(authController.login));
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/reset-password', asyncHandler(authController.resetPassword));
router.post('/logout', authenticationMiddleware, asyncHandler(authController.logout));

export default router;
