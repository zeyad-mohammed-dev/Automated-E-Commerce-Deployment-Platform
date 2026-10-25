import mongoose from 'mongoose';
import { UserModel } from '../db/models/user.model.js';
import * as DBService from '../services/db.service.js';
import { verifyAccessToken } from '../services/token.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors/index.js';

export const authenticationMiddleware = asyncHandler(async (req, res, next) => {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError({ message: 'Please log in first' });
  }

  const decoded = await verifyAccessToken(token);
  if (!mongoose.isValidObjectId(decoded.sub)) {
    throw new UnauthorizedError({ message: 'Invalid or expired token' });
  }

  const user = await DBService.findById({ model: UserModel, id: decoded.sub });
  if (!user) throw new UnauthorizedError({ message: 'Invalid or expired token' });
  if (user.isBanned) throw new ForbiddenError({ message: 'This account has been suspended' });

  req.user = user;
  req.decoded = decoded;
  next();
});

export const authorizationMiddleware = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new ForbiddenError({ message: 'You are not allowed to do this' }));
    }
    next();
  };
};
