import { timingSafeEqual } from 'node:crypto';
import { INTERNAL_API_KEY } from '../config/config.js';
import { UnauthorizedError } from '../utils/errors/index.js';

// Protects the write routes. The gateway checks the user JWT and role,
// then calls this service with the shared key.
export const internalAuthMiddleware = (key = INTERNAL_API_KEY) => {
  return (req, res, next) => {
    if (!key) return next();

    const received = Buffer.from(String(req.headers['x-internal-key'] || ''));
    const expected = Buffer.from(key);

    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return next(new UnauthorizedError({ message: 'Invalid internal key' }));
    }
    next();
  };
};
