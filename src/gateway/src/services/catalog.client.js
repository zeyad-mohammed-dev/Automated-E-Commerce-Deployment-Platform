import { CATALOG_SERVICE_URL } from '../config/config.js';
import { callService, readJson } from './http.client.js';
import { BadGatewayError } from '../utils/errors/index.js';

// -> the product, or null when it does not exist (or was deleted)
export const getProduct = async (id) => {
  const response = await callService(CATALOG_SERVICE_URL, `/api/products/${encodeURIComponent(id)}`, { timeoutMs: 5000 });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new BadGatewayError({ message: 'Catalog service failed' });
  return (await readJson(response))?.data?.product ?? null;
};

export const getProducts = async (ids) => {
  const products = await Promise.all(ids.map((id) => getProduct(id).catch(() => null)));
  return products.filter(Boolean);
};
