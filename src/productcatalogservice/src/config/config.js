import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(__dirname, '.env.dev'), quiet: true });
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT) || 3550;
export const HTTP_PORT = Number(process.env.HTTP_PORT) || 8080;
export const DB_URI = process.env.DB_URI;
export const REDIS_URL = process.env.REDIS_URL;

export const STORE_CURRENCY = process.env.STORE_CURRENCY || 'EGP';
export const CURRENCY_SERVICE_ADDR =
  process.env.CURRENCY_SERVICE_ADDR || 'currencyservice:7000';
export const CURRENCY_RATE_TTL = Number(process.env.CURRENCY_RATE_TTL) || 600;

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
export const S3_BUCKET = process.env.S3_BUCKET;
export const S3_REGION = process.env.S3_REGION;
export const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
export const CATALOG_EVENTS_CHANNEL =
  process.env.CATALOG_EVENTS_CHANNEL || 'catalog.events';
