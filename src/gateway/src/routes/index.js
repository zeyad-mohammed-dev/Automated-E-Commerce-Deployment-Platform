import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { attachUser, cartOwner, internalOnly, requireAdmin, requireAuth } from '../middlewares/auth.middleware.js';
import { proxyTo } from '../services/proxy.js';
import { createShopController } from '../controllers/shop.controller.js';
import { createCartController } from '../controllers/cart.controller.js';
import { createCheckoutController } from '../controllers/checkout.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import { AUTH_SERVICE_URL, CATALOG_SERVICE_URL, ORDERS_SERVICE_URL } from '../config/config.js';

export const createRoutes = ({ grpc, cartService, checkoutService }) => {
  const router = Router();
  const shop = createShopController({ grpc });
  const cart = createCartController({ cartService });
  const checkout = createCheckoutController({ checkoutService });

  // ---- called by other services, not by browsers ----
  router.post('/internal/payments/paid', internalOnly, asyncHandler(checkout.paymentPaid));

  // product images that are saved on the catalog disk (the S3 driver gives full urls instead)
  router.use('/uploads', proxyTo(CATALOG_SERVICE_URL, { forwardAuth: false }));

  router.use('/api', attachUser);

  // ---- public ----
  router.get('/api/categories', asyncHandler(shop.getCategories));
  router.get('/api/products', asyncHandler(shop.getProducts));
  router.get('/api/products/:id', asyncHandler(shop.getProduct));
  router.get('/api/search', asyncHandler(shop.search));
  router.get('/api/search/suggestions', asyncHandler(shop.suggestions));
  router.get('/api/track', asyncHandler(shop.trackOrder));

  // register, login, OTP, profile and wishlist rules live in authservice
  router.use('/api/auth', proxyTo(AUTH_SERVICE_URL));
  router.use('/api/users/me', requireAuth, proxyTo(AUTH_SERVICE_URL));

  // ---- cart (guest or user) ----
  router.get('/api/cart', cartOwner, asyncHandler(cart.getCart));
  router.post('/api/cart/items', cartOwner, asyncHandler(cart.addItem));
  router.patch('/api/cart/items/:productId', cartOwner, asyncHandler(cart.setQuantity));
  router.delete('/api/cart/items/:productId', cartOwner, asyncHandler(cart.removeItem));
  router.delete('/api/cart', cartOwner, asyncHandler(cart.clear));
  router.post('/api/cart/merge', requireAuth, asyncHandler(cart.merge));

  // ---- logged in ----
  router.get('/api/wishlist', requireAuth, asyncHandler(shop.getWishlist));
  router.put('/api/wishlist/:productId', requireAuth, asyncHandler(shop.changeWishlist('PUT')));
  router.delete('/api/wishlist/:productId', requireAuth, asyncHandler(shop.changeWishlist('DELETE')));

  router.post('/api/checkout/quote', requireAuth, asyncHandler(checkout.quote));
  router.post('/api/checkout/start', requireAuth, asyncHandler(checkout.start));
  router.post('/api/checkout/confirm', requireAuth, asyncHandler(checkout.confirm));
  router.get('/api/checkout/intent/:intentId', requireAuth, asyncHandler(checkout.getIntent));
  router.post('/api/checkout/mock-pay/:intentId', requireAuth, asyncHandler(checkout.mockPay));

  router.get('/api/orders', requireAuth, asyncHandler(orderController.getMyOrders));
  router.get('/api/orders/:orderId', requireAuth, asyncHandler(orderController.getMyOrder));

  // ---- admin dashboard ----
  const admin = Router();
  admin.use(requireAdmin);
  admin.get('/stats', asyncHandler(adminController.getStats));
  admin.use('/products', proxyTo(CATALOG_SERVICE_URL, { internal: true, rewrite: (url) => url.replace('/api/admin', '/api') }));
  admin.use('/categories', proxyTo(CATALOG_SERVICE_URL, { internal: true, rewrite: (url) => url.replace('/api/admin', '/api') }));
  admin.use('/orders', proxyTo(ORDERS_SERVICE_URL, { internal: true, rewrite: (url) => url.replace('/api/admin', '/api') }));
  // authservice checks the admin role again
  admin.use('/users', proxyTo(AUTH_SERVICE_URL, { rewrite: (url) => url.replace('/api/admin', '/api') }));
  router.use('/api/admin', admin);

  return router;
};
