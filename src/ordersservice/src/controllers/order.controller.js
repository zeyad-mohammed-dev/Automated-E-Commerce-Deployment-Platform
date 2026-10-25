import * as orderService from '../services/order.service.js';
import { successResponse } from '../utils/response/success.response.js';
import { ordersCreatedTotal, orderStatusChangesTotal } from '../utils/metrics.js';
import { ConflictError, ValidationError } from '../utils/errors/index.js';

export const createOrder = async (req, res) => {
  try {
    // the background work (names, stock) keeps running after the response
    const { order } = await orderService.createOrder({ body: req.body });
    ordersCreatedTotal.inc({ result: 'created' });
    return successResponse({ res, message: 'Order recorded successfully', data: { order }, statusCode: 201 });
  } catch (error) {
    let result = 'error';
    if (error instanceof ConflictError) result = 'duplicate';
    else if (error instanceof ValidationError) result = 'invalid';
    ordersCreatedTotal.inc({ result });
    throw error;
  }
};

export const getOrders = async (req, res) => {
  const data = await orderService.getOrders(req.query);
  return successResponse({ res, message: 'Orders fetched successfully', data });
};

export const getOrder = async (req, res) => {
  const order = await orderService.getOrder(req.params.orderId);
  return successResponse({ res, message: 'Order fetched successfully', data: { order } });
};

export const trackOrder = async (req, res) => {
  const order = await orderService.trackOrder({
    orderId: req.query.orderId,
    trackingId: req.query.trackingId,
    email: req.query.email,
  });
  return successResponse({ res, message: 'Order fetched successfully', data: { order } });
};

export const updateStatus = async (req, res) => {
  const { order } = await orderService.updateStatus({
    orderId: req.params.orderId,
    status: req.body.status,
    note: req.body.note,
  });
  orderStatusChangesTotal.inc({ status: order.status });
  return successResponse({ res, message: 'Order status updated successfully', data: { order } });
};

export const updateDetails = async (req, res) => {
  const order = await orderService.updateDetails({ orderId: req.params.orderId, body: req.body });
  return successResponse({ res, message: 'Order details updated successfully', data: { order } });
};

export const getStats = async (req, res) => {
  const stats = await orderService.getStats({ days: req.query.days });
  return successResponse({ res, message: 'Stats fetched successfully', data: { stats } });
};
