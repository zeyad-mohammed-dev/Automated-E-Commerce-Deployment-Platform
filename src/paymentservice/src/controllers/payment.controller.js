import * as intentService from '../services/intent.service.js';
import { successResponse } from '../utils/response/success.response.js';

export const createIntent = async (req, res) => {
  const data = await intentService.createIntent({ body: req.body });
  return successResponse({ res, message: 'Payment created successfully', data: { payment: data }, statusCode: 201 });
};

export const getIntent = async (req, res) => {
  const payment = await intentService.getIntentStatus({
    id: req.params.id,
    refresh: req.query.refresh === 'true',
  });
  return successResponse({ res, message: 'Payment fetched successfully', data: { payment } });
};

export const attachOrder = async (req, res) => {
  const payment = await intentService.attachOrder({ id: req.params.id, orderId: req.body.orderId });
  return successResponse({ res, message: 'Order linked to the payment', data: { payment } });
};

export const mockPay = async (req, res) => {
  const payment = await intentService.mockPay({ id: req.params.id });
  return successResponse({ res, message: 'Payment completed', data: { payment } });
};

export const webhook = async (req, res) => {
  const result = await intentService.handleWebhook({
    rawBody: req.rawBody,
    signature: req.headers['stripe-signature'],
  });
  return res.json({ success: true, ...result });
};
