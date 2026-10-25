import { fetchData } from '../services/http.client.js';
import { getProduct, getProducts } from '../services/catalog.client.js';
import {
  AUTH_SERVICE_URL,
  CATALOG_SERVICE_URL,
  ORDERS_SERVICE_URL,
  SEARCH_SERVICE_URL,
} from '../config/config.js';
import { successResponse } from '../utils/response/success.response.js';
import { NotFoundError, ValidationError } from '../utils/errors/index.js';

const queryString = (req) => (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '');

export const createShopController = ({ grpc }) => ({
  getCategories: async (req, res) => {
    const data = await fetchData(CATALOG_SERVICE_URL, '/api/categories');
    return successResponse({ res, message: 'Categories fetched successfully', data });
  },

  getProducts: async (req, res) => {
    const data = await fetchData(CATALOG_SERVICE_URL, `/api/products${queryString(req)}`);
    return successResponse({ res, message: 'Products fetched successfully', data });
  },

  // the product and a few products the recommendation service suggests with it
  getProduct: async (req, res) => {
    const product = await getProduct(req.params.id);
    if (!product) throw new NotFoundError({ message: 'Product not found' });

    let related = [];
    try {
      const userId = req.auth?.id || 'visitor';
      const { product_ids: ids = [] } = await grpc.listRecommendations(userId, [String(product._id || product.id)]);
      related = await getProducts(ids.slice(0, 4));
    } catch (error) {
      // recommendations are a bonus, the page must work without them
    }
    return successResponse({ res, message: 'Product fetched successfully', data: { product, related } });
  },

  search: async (req, res) => {
    const data = await fetchData(SEARCH_SERVICE_URL, `/api/search${queryString(req)}`);
    return successResponse({ res, message: 'Search completed successfully', data });
  },

  suggestions: async (req, res) => {
    const data = await fetchData(SEARCH_SERVICE_URL, `/api/search/suggestions${queryString(req)}`);
    return successResponse({ res, message: 'Suggestions fetched successfully', data });
  },

  getWishlist: async (req, res) => {
    const { wishlist: ids } = await fetchData(AUTH_SERVICE_URL, '/api/users/me/wishlist', {
      headers: { Authorization: `Bearer ${req.auth.token}` },
    });
    const products = await getProducts(ids);
    return successResponse({ res, message: 'Wishlist fetched successfully', data: { wishlist: products, ids } });
  },

  changeWishlist: (method) => async (req, res) => {
    const data = await fetchData(AUTH_SERVICE_URL, `/api/users/me/wishlist/${encodeURIComponent(req.params.productId)}`, {
      method,
      headers: { Authorization: `Bearer ${req.auth.token}` },
    });
    return successResponse({ res, message: method === 'PUT' ? 'Added to wishlist' : 'Removed from wishlist', data: { ids: data.wishlist } });
  },

  // public order tracking: the email must match the order
  trackOrder: async (req, res) => {
    const { orderId, trackingId, email } = req.query;
    if ((!orderId && !trackingId) || !email) {
      throw new ValidationError({ message: 'Order id (or tracking id) and email are required' });
    }
    const params = new URLSearchParams({ email: String(email), ...(orderId ? { orderId: String(orderId) } : { trackingId: String(trackingId) }) });
    const data = await fetchData(ORDERS_SERVICE_URL, `/api/orders/track?${params}`, { internal: true });
    return successResponse({ res, message: 'Order fetched successfully', data });
  },
});
