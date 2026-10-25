import * as userService from '../services/user.service.js';
import { successResponse } from '../utils/response/success.response.js';

export const getMe = async (req, res) => {
  const user = await userService.getMe(req.user._id);
  return successResponse({ res, message: 'Profile fetched successfully', data: { user } });
};

export const updateMe = async (req, res) => {
  const user = await userService.updateMe({ id: req.user._id, body: req.body });
  return successResponse({ res, message: 'Profile updated successfully', data: { user } });
};

export const changePassword = async (req, res) => {
  const data = await userService.changePassword({ id: req.user._id, body: req.body });
  return successResponse({ res, message: 'Password changed successfully', data });
};

export const getWishlist = async (req, res) => {
  const wishlist = await userService.getWishlist(req.user._id);
  return successResponse({ res, message: 'Wishlist fetched successfully', data: { wishlist } });
};

export const addToWishlist = async (req, res) => {
  const wishlist = await userService.addToWishlist({ id: req.user._id, productId: req.params.productId });
  return successResponse({ res, message: 'Added to wishlist', data: { wishlist } });
};

export const removeFromWishlist = async (req, res) => {
  const wishlist = await userService.removeFromWishlist({ id: req.user._id, productId: req.params.productId });
  return successResponse({ res, message: 'Removed from wishlist', data: { wishlist } });
};

export const listUsers = async (req, res) => {
  const data = await userService.listUsers(req.query);
  return successResponse({ res, message: 'Users fetched successfully', data });
};

export const getUserStats = async (req, res) => {
  const stats = await userService.getUserStats();
  return successResponse({ res, message: 'Stats fetched successfully', data: { stats } });
};

export const setBanned = async (req, res) => {
  const user = await userService.setBanned({
    id: req.params.id,
    isBanned: req.body.isBanned,
    actorId: req.user._id,
  });
  return successResponse({ res, message: 'User updated successfully', data: { user } });
};
