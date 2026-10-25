import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { internalAuthMiddleware } from '../middlewares/internal-auth.middleware.js';

const router = Router();

// checkoutservice (Go) calls this one without any header, so it stays open inside the cluster
router.post('/', asyncHandler(orderController.createOrder));

// everything else is for the gateway
router.use(internalAuthMiddleware());

router.get('/stats', asyncHandler(orderController.getStats));
router.get('/track', asyncHandler(orderController.trackOrder));

router.get('/', asyncHandler(orderController.getOrders));
router.get('/:orderId', asyncHandler(orderController.getOrder));
router.patch('/:orderId/status', asyncHandler(orderController.updateStatus));
router.patch('/:orderId/details', asyncHandler(orderController.updateDetails));

export default router;
