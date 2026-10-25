import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import * as redisService from './redis.service.js';
import { JWT_SECRET, ACCESS_TOKEN_TTL } from '../config/config.js';
import { UnauthorizedError } from '../utils/errors/index.js';

export const signAccessToken = ({ user }) => {
  const payload = { sub: String(user._id), role: user.role, iatMs: Date.now() };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL, jwtid: randomUUID() });
};

export const verifyAccessToken = async (token) => {
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

  // set when the password changes: every token issued before that moment is dead
  const revokedBefore = await redisService.get(redisService.baseRevokeTokenKey(userId));
  if (revokedBefore && decoded.iatMs <= Number(revokedBefore)) {
    throw new UnauthorizedError({ message: 'Token has been revoked' });
  }

  return decoded;
};

export const revokeToken = async (decoded) => {
  const remaining = decoded.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return;
  await redisService.set({
    key: redisService.revokeTokenKey({ userId: decoded.sub, jti: decoded.jti }),
    value: 1,
    ttl: remaining,
  });
};

export const revokeAllTokens = async (userId) => {
  await redisService.set({
    key: redisService.baseRevokeTokenKey(userId),
    value: Date.now(),
    ttl: ACCESS_TOKEN_TTL,
  });
};
