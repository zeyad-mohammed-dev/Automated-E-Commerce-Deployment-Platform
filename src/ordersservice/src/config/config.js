import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(__dirname, '.env.dev'), quiet: true });
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT) || 8080;
export const DATABASE_URL = process.env.DATABASE_URL;
export const DATABASE_SSL = process.env.DATABASE_SSL === 'true';
export const CATALOG_SERVICE_URL =
  process.env.CATALOG_SERVICE_URL || 'http://productcatalogservice:8080';
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
