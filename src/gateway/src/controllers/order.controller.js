import { fetchData } from '../services/http.client.js';
import { ORDERS_SERVICE_URL } from '../config/config.js';
import { successResponse } from '../utils/response/success.response.js';
import { NotFoundError } from '../utils/errors/index.js';

const safe = (value) => encodeURIComponent(String(value));

export const getMyOrders = async (req, res) => {
  const params = new URLSearchParams({ userId: req.auth.id });
  for (const field of ['page', 'limit', 'status']) {
    if (req.query[field]) params.set(field, String(req.query[field]));
  }
  const data = await fetchData(ORDERS_SERVICE_URL, `/api/orders?${params}`, { internal: true });
  return successResponse({ res, message: 'Orders fetched successfully', data });
};

export const getMyOrder = async (req, res) => {
  const { order } = await fetchData(ORDERS_SERVICE_URL, `/api/orders/${safe(req.params.orderId)}`, { internal: true });
  // somebody else's order looks like a missing one
  if (order.userId !== req.auth.id) throw new NotFoundError({ message: 'Order not found' });
  return successResponse({ res, message: 'Order fetched successfully', data: { order } });
};
