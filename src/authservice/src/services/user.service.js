import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import * as DBService from './db.service.js';
import { UserModel, roleEnum } from '../db/models/user.model.js';
import { hashPassword, serializeUser } from './auth.service.js';
import { revokeAllTokens, signAccessToken } from './token.service.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors/index.js';
import { validateAddress, validateName, validatePassword, validatePhone } from '../utils/validators.js';
import { escapeRegex } from '../utils/slug.js';

const MAX_WISHLIST = 200;
const MAX_LIMIT = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getUserOrFail = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError({ message: 'User not found' });
  const user = await DBService.findById({ model: UserModel, id });
  if (!user) throw new NotFoundError({ message: 'User not found' });
  return user;
};

export const getMe = async (id) => serializeUser(await getUserOrFail(id));

export const updateMe = async ({ id, body }) => {
  const update = {};
  if (body.name !== undefined) update.name = validateName(body.name);
  if (body.phone !== undefined) update.phone = validatePhone(body.phone);
  if (body.address !== undefined) {
    for (const [field, value] of Object.entries(validateAddress(body.address))) {
      update[`address.${field}`] = value;
    }
  }

  await DBService.updateOne({ model: UserModel, filter: { _id: id }, update });
  return serializeUser(await getUserOrFail(id));
};

export const changePassword = async ({ id, body }) => {
  const newPassword = validatePassword(body.newPassword);
  const user = await DBService.findOne({
    model: UserModel,
    filter: { _id: id },
    options: { projection: '+password' },
  });
  if (!user) throw new NotFoundError({ message: 'User not found' });

  if (!(await bcrypt.compare(String(body.oldPassword || ''), user.password))) {
    throw new UnauthorizedError({ message: 'The current password is wrong' });
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  // every old token stops working, the user gets a fresh one
  await revokeAllTokens(String(user._id));
  await sleep(2);
  return { token: signAccessToken({ user }) };
};

export const getWishlist = async (id) => (await getUserOrFail(id)).wishlist;

export const addToWishlist = async ({ id, productId }) => {
  const product = String(productId || '').trim();
  if (!product || product.length > 64) throw new ValidationError({ message: 'Invalid product id' });

  const user = await getUserOrFail(id);
  if (!user.wishlist.includes(product) && user.wishlist.length >= MAX_WISHLIST) {
    throw new ConflictError({ message: 'The wishlist is full' });
  }

  await DBService.updateOne({
    model: UserModel,
    filter: { _id: id },
    update: { $addToSet: { wishlist: product } },
  });
  return (await getUserOrFail(id)).wishlist;
};

export const removeFromWishlist = async ({ id, productId }) => {
  await getUserOrFail(id);
  await DBService.updateOne({
    model: UserModel,
    filter: { _id: id },
    update: { $pull: { wishlist: String(productId) } },
  });
  return (await getUserOrFail(id)).wishlist;
};

// ---- admin ----

export const listUsers = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), MAX_LIMIT);

  const filter = {};
  if (query.role) {
    if (!roleEnum[query.role]) throw new ValidationError({ message: 'Invalid role' });
    filter.role = query.role;
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(String(query.q).trim()), 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const [users, totalCount] = await Promise.all([
    DBService.find({
      model: UserModel,
      filter,
      options: { sort: { createdAt: -1 }, skip: (page - 1) * limit, limit },
    }),
    DBService.countDocuments({ model: UserModel, filter }),
  ]);

  return {
    page,
    limit,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    users: users.map(serializeUser),
  };
};

export const setBanned = async ({ id, isBanned, actorId }) => {
  if (typeof isBanned !== 'boolean') throw new ValidationError({ message: 'isBanned must be true or false' });

  const user = await getUserOrFail(id);
  if (String(user._id) === String(actorId)) throw new ConflictError({ message: 'You can not suspend yourself' });
  if (user.role === roleEnum.admin) throw new ConflictError({ message: 'An admin can not be suspended' });

  user.isBanned = isBanned;
  await user.save();
  if (isBanned) await revokeAllTokens(String(user._id));
  return serializeUser(user);
};

export const getUserStats = async () => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [total, admins, banned, newUsers] = await Promise.all([
    DBService.countDocuments({ model: UserModel }),
    DBService.countDocuments({ model: UserModel, filter: { role: roleEnum.admin } }),
    DBService.countDocuments({ model: UserModel, filter: { isBanned: true } }),
    DBService.countDocuments({ model: UserModel, filter: { createdAt: { $gte: since } } }),
  ]);
  return { total, admins, banned, newLast30Days: newUsers };
};
