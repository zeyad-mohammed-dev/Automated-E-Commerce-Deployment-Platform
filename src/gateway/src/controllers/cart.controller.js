import { successResponse } from '../utils/response/success.response.js';
import { ValidationError } from '../utils/errors/index.js';

export const createCartController = ({ cartService }) => ({
  getCart: async (req, res) => {
    const cart = await cartService.getView(req.cartId);
    return successResponse({ res, message: 'Cart fetched successfully', data: { cart } });
  },

  addItem: async (req, res) => {
    const cart = await cartService.addItem({ cartId: req.cartId, productId: req.body.productId, quantity: req.body.quantity });
    return successResponse({ res, message: 'Added to cart', data: { cart } });
  },

  setQuantity: async (req, res) => {
    const cart = await cartService.setQuantity({ cartId: req.cartId, productId: req.params.productId, quantity: req.body.quantity });
    return successResponse({ res, message: 'Cart updated successfully', data: { cart } });
  },

  removeItem: async (req, res) => {
    const cart = await cartService.setQuantity({ cartId: req.cartId, productId: req.params.productId, quantity: 0 });
    return successResponse({ res, message: 'Removed from cart', data: { cart } });
  },

  clear: async (req, res) => {
    await cartService.clear(req.cartId);
    return successResponse({ res, message: 'Cart cleared successfully' });
  },

  merge: async (req, res) => {
    const guestId = String(req.body.guestId || '');
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(guestId)) throw new ValidationError({ message: 'guestId is invalid' });
    const cart = await cartService.merge({ guestCartId: `guest-${guestId}`, userCartId: req.auth.id });
    return successResponse({ res, message: 'Cart merged successfully', data: { cart } });
  },
});
