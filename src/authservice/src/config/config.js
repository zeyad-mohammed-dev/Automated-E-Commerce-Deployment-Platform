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

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL) || 7 * 24 * 60 * 60;
export const OTP_TTL = Number(process.env.OTP_TTL) || 600;

export const SMTP_HOST = process.env.SMTP_HOST;
export const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
export const SMTP_USER = process.env.SMTP_USER;
export const SMTP_PASS = process.env.SMTP_PASS;
export const MAIL_FROM = process.env.MAIL_FROM || 'Shopora <no-reply@shopora.com>';

export const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
