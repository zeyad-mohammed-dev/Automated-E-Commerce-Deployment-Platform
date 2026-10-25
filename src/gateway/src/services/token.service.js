import jwt from 'jsonwebtoken';
import * as redisService from './redis.service.js';
import { JWT_SECRET } from '../config/config.js';
import { UnauthorizedError } from '../utils/errors/index.js';

// Same rules as authservice: signature, one revoked token, or "everything before this time" revoked
export const verifyToken = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new UnauthorizedError({ message: 'Invalid or expired token' });
  }

  const userId = decoded.sub;
  if (await redisService.exists(redisService.revokeTokenKey({ userId, jti: decoded.jti }))) {
    throw new UnauthorizedError({ message: 'Token has been revoked' });
  }

  const revokedBefore = await redisService.get(redisService.baseRevokeTokenKey(userId));
  if (revokedBefore && decoded.iatMs <= Number(revokedBefore)) {
    throw new UnauthorizedError({ message: 'Token has been revoked' });
  }

  return { id: userId, role: decoded.role, token };
};
