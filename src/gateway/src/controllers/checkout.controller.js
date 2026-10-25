import { successResponse } from '../utils/response/success.response.js';
import { PAYMENT_SERVICE_URL } from '../config/config.js';
import { callService, readJson } from '../services/http.client.js';
import { ForbiddenError, ValidationError } from '../utils/errors/index.js';

export const createCheckoutController = ({ checkoutService }) => ({
  quote: async (req, res) => {
    const quote = await checkoutService.quote({ cartId: req.auth.id, address: req.body.shippingAddress });
    return successResponse({ res, message: 'Quote calculated successfully', data: { quote } });
  },

  start: async (req, res) => {
    const payment = await checkoutService.start({ auth: req.auth, body: req.body });
    return successResponse({ res, message: 'Payment created successfully', data: { payment }, statusCode: 201 });
  },

  // the browser asks again and again until the order exists
  confirm: async (req, res) => {
    const intentId = String(req.body.intentId || '');
    if (!intentId) throw new ValidationError({ message: 'intentId is required' });
    const result = await checkoutService.processPayment({ intentId, userId: req.auth.id, refresh: true });
    return successResponse({ res, message: 'Checkout status fetched successfully', data: result });
  },

  getIntent: async (req, res) => {
    const payment = await checkoutService.getIntent({ intentId: req.params.intentId });
    if (payment.userId !== req.auth.id) throw new ForbiddenError({ message: 'This payment is not yours' });
    const { userId, metadata, ...visible } = payment;
    return successResponse({ res, message: 'Payment fetched successfully', data: { payment: visible } });
  },

  // the "Pay" button of the fake pay page (only works when the payment provider is mock)
  mockPay: async (req, res, next) => {
    const payment = await checkoutService.getIntent({ intentId: req.params.intentId });
    if (payment.userId !== req.auth.id) throw new ForbiddenError({ message: 'This payment is not yours' });

    const response = await callService(PAYMENT_SERVICE_URL, `/api/payments/intents/${encodeURIComponent(req.params.intentId)}/mock-pay`, { method: 'POST' });
    const body = await readJson(response);
    return res.status(response.status).json(body ?? { success: false, message: 'Payment service failed' });
  },

  // paymentservice calls this when a payment is confirmed, so the order exists even if the customer closed the tab
  paymentPaid: async (req, res) => {
    const intentId = String(req.body.intentId || '');
    if (!intentId) throw new ValidationError({ message: 'intentId is required' });
    const result = await checkoutService.processPayment({ intentId });
    return successResponse({ res, message: 'Payment processed', data: result });
  },
});
