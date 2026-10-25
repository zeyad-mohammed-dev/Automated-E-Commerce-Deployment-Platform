import { otpTypesEnum } from '../utils/otp.types.js';
import { redisClient } from '../db/redis.connection.db.js';

export const otpKey = ({ email, otpType = otpTypesEnum.confirmEmail }) => {
  return `OTP::${email}::${otpType}`;
};

export const otpRequestAttemptsKey = ({
  email,
  otpType = otpTypesEnum.confirmEmail,
}) => {
  return `${otpKey({ email, otpType })}::OtpRequestAttempts`;
};

export const otpRequestFrozenUntilKey = ({
  email,
  otpType = otpTypesEnum.confirmEmail,
}) => {
  return `${otpKey({ email, otpType })}::OtpRequestFrozenUntil`;
};

export const otpVerifyAttemptsKey = ({
  email,
  otpType = otpTypesEnum.confirmEmail,
}) => {
  return `${otpKey({ email, otpType })}::OtpVerifyAttempts`;
};

export const baseRevokeTokenKey = (userId) => {
  return `RevokeToken::${userId}`;
};
export const revokeTokenKey = ({ userId, jti }) => {
  return `${baseRevokeTokenKey(userId)}::${jti}`;
};

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
