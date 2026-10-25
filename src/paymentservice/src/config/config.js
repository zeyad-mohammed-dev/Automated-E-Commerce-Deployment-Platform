import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(__dirname, '.env.dev'), quiet: true });
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT) || 50051;
export const HTTP_PORT = Number(process.env.HTTP_PORT) || 8080;
export const REDIS_URL = process.env.REDIS_URL;
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_API_BASE = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');

export const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
export const PAID_CALLBACK_URL = process.env.PAID_CALLBACK_URL;
export const INTENT_TTL = Number(process.env.INTENT_TTL) || 7200;
