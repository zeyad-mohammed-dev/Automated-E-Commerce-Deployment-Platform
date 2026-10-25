import { redisClient } from '../db/redis.connection.db.js';

export const revokeTokenKey = ({ userId, jti }) => `RevokeToken::${userId}::${jti}`;
export const baseRevokeTokenKey = (userId) => `RevokeToken::${userId}`;

export const get = async (key) => {
  try {
    try {
      return JSON.parse(await redisClient.get(key));
    } catch (error) {
      return await redisClient.get(key);
    }
  } catch (error) {
    console.log('Error on redis get method');
  }
};

export const exists = async (key) => {
  try {
    return await redisClient.exists(key);
  } catch (error) {
    console.log('Error on redis exists method');
  }
};

// true only for the first caller
export const setIfAbsent = async ({ key, value = 1, ttl }) => {
  try {
    return (await redisClient.set(key, String(value), { NX: true, EX: ttl })) === 'OK';
  } catch (error) {
    console.log('Error on redis setIfAbsent method');
    return true;
  }
};

export const deleteKey = async (key) => {
  try {
    return await redisClient.del(key);
  } catch (error) {
    console.log('Error on redis deleteKey method');
  }
};
