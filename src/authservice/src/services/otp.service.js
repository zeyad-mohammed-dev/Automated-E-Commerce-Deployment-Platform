import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import * as redisService from './redis.service.js';
import { sendOtpEmail } from './mail.service.js';
import { OTP_TTL } from '../config/config.js';
import { ValidationError, TooManyRequestsError } from '../utils/errors/index.js';

const MAX_REQUESTS = 5;
const REQUEST_WINDOW = 10 * 60;
const FREEZE_TIME = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

const hashOtp = (otp) => createHash('sha256').update(String(otp)).digest('hex');

export const generateOtp = () => String(randomInt(0, 1000000)).padStart(6, '0');

export const createOtp = async ({ email, otpType, send }) => {
  const frozenKey = redisService.otpRequestFrozenUntilKey({ email, otpType });
  if (await redisService.exists(frozenKey)) {
    const wait = await redisService.ttl(frozenKey);
    throw new TooManyRequestsError({
      message: `Too many requests. Please try again after ${Math.max(wait, 1)} seconds`,
    });
  }

  const attemptsKey = redisService.otpRequestAttemptsKey({ email, otpType });
  const attempts = await redisService.incr(attemptsKey);
  if (attempts === 1) await redisService.expire({ key: attemptsKey, ttl: REQUEST_WINDOW });

  if (attempts > MAX_REQUESTS) {
    await redisService.set({ key: frozenKey, value: 1, ttl: FREEZE_TIME });
    await redisService.deleteKey(attemptsKey);
    throw new TooManyRequestsError({
      message: `Too many requests. Please try again after ${FREEZE_TIME} seconds`,
    });
  }

  const otp = generateOtp();
  await redisService.set({ key: redisService.otpKey({ email, otpType }), value: hashOtp(otp), ttl: OTP_TTL });
  await redisService.deleteKey(redisService.otpVerifyAttemptsKey({ email, otpType }));

  await sendOtpEmail({ email, otp, otpType, send });
};

export const verifyOtp = async ({ email, otpType, otp }) => {
  const key = redisService.otpKey({ email, otpType });
  const stored = await redisService.get(key);
  if (!stored) throw new ValidationError({ message: 'The code is invalid or expired' });

  const verifyKey = redisService.otpVerifyAttemptsKey({ email, otpType });
  const tries = await redisService.incr(verifyKey);
  if (tries === 1) await redisService.expire({ key: verifyKey, ttl: OTP_TTL });
  if (tries > MAX_VERIFY_ATTEMPTS) {
    await redisService.deleteKey(key);
    throw new ValidationError({ message: 'Too many wrong codes. Please request a new one' });
  }

  const received = Buffer.from(hashOtp(otp));
  const expected = Buffer.from(String(stored));
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new ValidationError({ message: 'The code is invalid or expired' });
  }

  await redisService.deleteKey(key);
  await redisService.deleteKey(verifyKey);
};
