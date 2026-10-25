import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(__dirname, '.env.dev'), quiet: true });
}

const url = (value, fallback) => (value || fallback).replace(/\/$/, '');

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT) || 8080;
export const REDIS_URL = process.env.REDIS_URL;
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const AUTH_SERVICE_URL = url(process.env.AUTH_SERVICE_URL, 'http://authservice:8080');
export const CATALOG_SERVICE_URL = url(process.env.CATALOG_SERVICE_URL, 'http://productcatalogservice:8080');
export const SEARCH_SERVICE_URL = url(process.env.SEARCH_SERVICE_URL, 'http://searchservice:8080');
export const ORDERS_SERVICE_URL = url(process.env.ORDERS_SERVICE_URL, 'http://ordersservice:8080');
export const PAYMENT_SERVICE_URL = url(process.env.PAYMENT_SERVICE_URL, 'http://paymentservice:8080');

export const CART_SERVICE_ADDR = process.env.CART_SERVICE_ADDR || 'cartservice:7070';
export const CHECKOUT_SERVICE_ADDR = process.env.CHECKOUT_SERVICE_ADDR || 'checkoutservice:5050';
export const SHIPPING_SERVICE_ADDR = process.env.SHIPPING_SERVICE_ADDR || 'shippingservice:50051';
export const CURRENCY_SERVICE_ADDR = process.env.CURRENCY_SERVICE_ADDR || 'currencyservice:7000';
export const RECOMMENDATION_SERVICE_ADDR = process.env.RECOMMENDATION_SERVICE_ADDR || 'recommendationservice:8080';

export const STORE_CURRENCY = process.env.STORE_CURRENCY || 'EGP';
