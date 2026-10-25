import { CATALOG_SERVICE_URL, INTERNAL_API_KEY } from '../config/config.js';

const headers = () => ({
  'Content-Type': 'application/json',
  ...(INTERNAL_API_KEY ? { 'x-internal-key': INTERNAL_API_KEY } : {}),
});

// Both calls are best effort. An order that was already paid must never fail because of them.
export const createCatalogClient = ({ baseUrl = CATALOG_SERVICE_URL, fetchFn = fetch } = {}) => ({
  getProductSnapshot: async (productId) => {
    try {
      const response = await fetchFn(`${baseUrl}/api/products/${encodeURIComponent(productId)}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return null;
      const { data } = await response.json();
      return {
        name: data.product.name,
        picture: data.product.images?.[0] || null,
        unitPrice: data.product.finalPrice,
      };
    } catch (error) {
      console.error(`Could not read product ${productId}: ${error.message}`);
      return null;
    }
  },

  adjustStock: async ({ items, action }) => {
    try {
      const response = await fetchFn(`${baseUrl}/api/products/stock/adjust`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action,
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) console.error(`Stock ${action} failed with status ${response.status}`);
      return response.ok;
    } catch (error) {
      console.error(`Stock ${action} failed: ${error.message}`);
      return false;
    }
  },
});
