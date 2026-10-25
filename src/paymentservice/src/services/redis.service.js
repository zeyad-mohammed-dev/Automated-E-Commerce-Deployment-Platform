import { redisClient } from '../db/redis.connection.db.js';

export const intentKey = (intentId) => `payment::intent::${intentId}`;
export const referenceKey = (reference) => `payment::reference::${reference}`;
export const consumedKey = (intentId) => `payment::intent::${intentId}::consumed`;

export const set = async ({ key, value, ttl }) => {
  try {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    return ttl
      ? await redisClient.set(key, data, { EX: ttl })
      : await redisClient.set(key, data);
  } catch (error) {
    console.log('Error on redis set method');
  }
};

export const update = async ({ key, value, ttl }) => {
  try {
    if (!(await redisClient.exists(key))) {
      return 0;
    }

    await set({ key, value, ttl });
  } catch (error) {
    console.log('Error on redis update method');
  }
};

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

export const ttl = async (key) => {
  try {
    return await redisClient.ttl(key);
  } catch (error) {
    console.log('Error on redis ttl method');
  }
};

export const exists = async (key) => {
  try {
    return await redisClient.exists(key);
  } catch (error) {
    console.log('Error on redis exists method');
  }
};

export const expire = async ({ key, ttl }) => {
  try {
    return await redisClient.expire(key, ttl);
  } catch (error) {
    console.log('Error on redis expire method');
  }
};

export const mGet = async (keys) => {
  try {
    if (!keys.length) return 0;
    const values = await redisClient.mGet(keys);
    return values.map((value) => {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    });
  } catch (error) {
    console.log('Error on redis mGet method');
  }
};

export const keys = async (pattern) => {
  try {
    return await redisClient.keys(`${pattern}*`);
  } catch (error) {
    console.log('Error on redis keys method');
  }
};

export const deleteKey = async (key) => {
  try {
    if (!key.length) return 0;
    return await redisClient.del(key);
  } catch (error) {
    console.log('Error on redis deleteKey method');
  }
};

export const incr = async (key) => {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    console.log('Error on redis incr method');
  }
};

// true only for the first caller, used to make sure one payment pays for one order
export const setIfAbsent = async ({ key, value, ttl }) => {
  try {
    const result = await redisClient.set(key, String(value), { NX: true, EX: ttl });
    return result === 'OK';
  } catch (error) {
    console.log('Error on redis setIfAbsent method');
    return false;
  }
};
