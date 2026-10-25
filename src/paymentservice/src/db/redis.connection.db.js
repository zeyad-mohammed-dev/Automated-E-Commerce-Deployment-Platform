import { createClient } from 'redis';
import colors from 'colors';
import { REDIS_URL } from '../config/config.js';

export const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on('error', (error) => {
  console.error(`Redis error: ${error.message}`);
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log(colors.bgYellow(`Redis connected successfully ⚡`));
  } catch (error) {
    console.log(error);
    console.error(`Redis connection failed: ${error.message}`);
  }
};
