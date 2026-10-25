import bcrypt from 'bcryptjs';
import * as DBService from './db.service.js';
import { UserModel, roleEnum } from '../db/models/user.model.js';
import { createOtp, verifyOtp } from './otp.service.js';
import { signAccessToken, revokeToken, revokeAllTokens } from './token.service.js';
import { otpTypesEnum } from '../utils/otp.types.js';
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../utils/errors/index.js';
import {
  normalizeEmail,
  validateName,
  validatePassword,
  validatePhone,
} from '../utils/validators.js';
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } from '../config/config.js';

const SALT_ROUNDS = 10;

export const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

export const serializeUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isConfirmed: user.isConfirmed,
  isBanned: user.isBanned,
  address: user.address,
  createdAt: user.createdAt,
});

export const register = async ({ body, send }) => {
  const name = validateName(body.name);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const phone = validatePhone(body.phone);

  const existing = await DBService.findOne({ model: UserModel, filter: { email } });
  if (existing?.isConfirmed) throw new ConflictError({ message: 'Email is already registered' });

  const hashed = await hashPassword(password);
  if (existing) {
    // an unconfirmed account can try again
    await DBService.updateOne({
      model: UserModel,
      filter: { _id: existing._id },
      update: { name, phone, password: hashed },
    });
  } else {
    await DBService.create({ model: UserModel, data: { name, email, phone, password: hashed } });
  }

  await createOtp({ email, otpType: otpTypesEnum.confirmEmail, send });
  return { email };
};

export const confirmEmail = async ({ body }) => {
  const email = normalizeEmail(body.email);
  const user = await DBService.findOne({ model: UserModel, filter: { email } });
  if (!user || user.isConfirmed) {
    throw new ValidationError({ message: 'The code is invalid or expired' });
  }

  await verifyOtp({ email, otpType: otpTypesEnum.confirmEmail, otp: body.otp });
  user.isConfirmed = true;
  await user.save();

  return { token: signAccessToken({ user }), user: serializeUser(user) };
};

// The answer is the same whether the account exists or not, so emails can not be probed
export const resendOtp = async ({ body, send }) => {
  const email = normalizeEmail(body.email);
  const otpType = body.otpType === otpTypesEnum.resetPassword
    ? otpTypesEnum.resetPassword
    : otpTypesEnum.confirmEmail;

  const user = await DBService.findOne({ model: UserModel, filter: { email } });
  const allowed =
    user && (otpType === otpTypesEnum.confirmEmail ? !user.isConfirmed : user.isConfirmed);

  if (allowed) await createOtp({ email, otpType, send });
};

export const login = async ({ body }) => {
  const email = normalizeEmail(body.email);
  const user = await DBService.findOne({
    model: UserModel,
    filter: { email },
    options: { projection: '+password' },
  });

  const matches = user ? await bcrypt.compare(String(body.password || ''), user.password) : false;
  if (!matches) throw new UnauthorizedError({ message: 'Invalid email or password' });

  if (!user.isConfirmed) throw new ForbiddenError({ message: 'Please confirm your email first' });
  if (user.isBanned) throw new ForbiddenError({ message: 'This account has been suspended' });

  return { token: signAccessToken({ user }), user: serializeUser(user) };
};

export const logout = async ({ decoded }) => {
  await revokeToken(decoded);
};

export const resetPassword = async ({ body }) => {
  const email = normalizeEmail(body.email);
  const newPassword = validatePassword(body.newPassword);

  const user = await DBService.findOne({ model: UserModel, filter: { email, isConfirmed: true } });
  if (!user) throw new ValidationError({ message: 'The code is invalid or expired' });

  await verifyOtp({ email, otpType: otpTypesEnum.resetPassword, otp: body.otp });

  user.password = await hashPassword(newPassword);
  await user.save();
  await revokeAllTokens(String(user._id));
};

// Creates the first admin from env. It does nothing when the account already exists.
export const ensureAdmin = async () => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return null;

  const email = normalizeEmail(ADMIN_EMAIL);
  const existing = await DBService.findOne({ model: UserModel, filter: { email } });
  if (existing) return existing;

  return await DBService.create({
    model: UserModel,
    data: {
      name: ADMIN_NAME,
      email,
      password: await hashPassword(validatePassword(ADMIN_PASSWORD)),
      role: roleEnum.admin,
      isConfirmed: true,
    },
  });
};
