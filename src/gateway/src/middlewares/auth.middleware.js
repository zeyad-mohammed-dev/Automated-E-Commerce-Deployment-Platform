import { verifyToken } from '../services/token.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../utils/errors/index.js';
import { INTERNAL_API_KEY } from '../config/config.js';
import { timingSafeEqual } from 'node:crypto';

const bearer = (req) => {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

// the user is optional: no header = guest, a bad token = 401 so the frontend can log out
export const attachUser = asyncHandler(async (req, res, next) => {
  const token = bearer(req);
  req.auth = token ? await verifyToken(token) : null;
  next();
});

export const requireAuth = (req, res, next) => {
  if (!req.auth) return next(new UnauthorizedError({ message: 'Please log in first' }));
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.auth) return next(new UnauthorizedError({ message: 'Please log in first' }));
  if (req.auth.role !== 'admin') return next(new ForbiddenError({ message: 'You are not allowed to do this' }));
  next();
};

// the cart belongs to the user, or to a guest id that the browser keeps
export const cartOwner = (req, res, next) => {
  if (req.auth) {
    req.cartId = req.auth.id;
    return next();
  }
  const guestId = String(req.headers['x-guest-id'] || '');
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(guestId)) {
    return next(new ValidationError({ message: 'x-guest-id header is required for guests' }));
  }
  req.cartId = `guest-${guestId}`;
  next();
};

export const internalOnly = (req, res, next) => {
  if (!INTERNAL_API_KEY) return next();
  const received = Buffer.from(String(req.headers['x-internal-key'] || ''));
  const expected = Buffer.from(INTERNAL_API_KEY);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return next(new UnauthorizedError({ message: 'Invalid internal key' }));
  }
  next();
};
