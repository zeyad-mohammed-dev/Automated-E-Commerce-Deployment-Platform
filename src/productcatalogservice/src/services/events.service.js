import { redisClient } from '../db/redis.connection.db.js';
import { CATALOG_EVENTS_CHANNEL } from '../config/config.js';

export const eventTypes = {
  productUpserted: 'product.upserted',
  productDeleted: 'product.deleted',
};

// Best effort: a Redis problem should never fail an admin request.
export const publishEvent = async ({ type, data }) => {
  try {
    if (!redisClient.isReady) return false;
    const message = JSON.stringify({ type, data, at: new Date().toISOString() });
    await redisClient.publish(CATALOG_EVENTS_CHANNEL, message);
    return true;
  } catch (error) {
    console.log('Error on publishing catalog event', error.message);
    return false;
  }
};
