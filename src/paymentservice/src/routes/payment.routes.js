import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { internalAuthMiddleware } from '../middlewares/internal-auth.middleware.js';

const router = Router();

// Stripe calls this one. It is protected by the webhook signature, not by the internal key.
router.post('/webhook', asyncHandler(paymentController.webhook));

// the "pay" button of the mock page, only works in mock mode
router.post('/intents/:id/mock-pay', asyncHandler(paymentController.mockPay));

// for the gateway
router.post('/intents', internalAuthMiddleware(), asyncHandler(paymentController.createIntent));
router.get('/intents/:id', internalAuthMiddleware(), asyncHandler(paymentController.getIntent));
router.post('/intents/:id/order', internalAuthMiddleware(), asyncHandler(paymentController.attachOrder));

export default router;
