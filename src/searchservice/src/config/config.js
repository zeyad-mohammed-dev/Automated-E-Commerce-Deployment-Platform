import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(__dirname, '.env.dev'), quiet: true });
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT) || 8080;
export const DB_URI = process.env.DB_URI;
export const REDIS_URL = process.env.REDIS_URL;

export const CATALOG_SERVICE_URL =
  process.env.CATALOG_SERVICE_URL || 'http://productcatalogservice:8080';
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
export const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS ?? 300);
export const CATALOG_EVENTS_CHANNEL =
  process.env.CATALOG_EVENTS_CHANNEL || 'catalog.events';
