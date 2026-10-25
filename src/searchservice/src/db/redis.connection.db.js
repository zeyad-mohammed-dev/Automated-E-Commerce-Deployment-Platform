import { createClient } from 'redis';
import colors from 'colors';
import { REDIS_URL } from '../config/config.js';

// this client only subscribes, so it is not used for normal commands
export const redisSubscriber = createClient({
  url: REDIS_URL,
});

redisSubscriber.on('error', (error) => {
  console.error(`Redis error: ${error.message}`);
});

export const connectRedis = async () => {
  try {
    await redisSubscriber.connect();
    console.log(colors.bgYellow(`Redis connected successfully ⚡`));
  } catch (error) {
    console.log(error);
    console.error(`Redis connection failed: ${error.message}`);
  }
};
