import { fetchData } from '../services/http.client.js';
import { AUTH_SERVICE_URL, CATALOG_SERVICE_URL, ORDERS_SERVICE_URL } from '../config/config.js';
import { successResponse } from '../utils/response/success.response.js';

// One call for the dashboard home: sales, users and products together
export const getStats = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const headers = { Authorization: `Bearer ${req.auth.token}` };

  const [orders, users, products] = await Promise.all([
    fetchData(ORDERS_SERVICE_URL, `/api/orders/stats?days=${days}`, { internal: true }),
    fetchData(AUTH_SERVICE_URL, '/api/users/stats', { headers }),
    fetchData(CATALOG_SERVICE_URL, '/api/products?limit=1'),
  ]);

  return successResponse({
    res,
    message: 'Stats fetched successfully',
    data: { orders: orders.stats, users: users.stats, products: { total: products.totalCount } },
  });
};
