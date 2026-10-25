import * as authService from '../services/auth.service.js';
import { successResponse } from '../utils/response/success.response.js';
import { authEventsTotal } from '../utils/metrics.js';

const track = async (event, action) => {
  try {
    const result = await action();
    authEventsTotal.inc({ event, result: 'ok' });
    return result;
  } catch (error) {
    authEventsTotal.inc({ event, result: error.statusCode >= 500 || !error.statusCode ? 'error' : 'rejected' });
    throw error;
  }
};

export const register = async (req, res) => {
  const data = await track('register', () => authService.register({ body: req.body }));
  return successResponse({
    res,
    message: 'Account created. We sent a code to your email',
    data,
    statusCode: 201,
  });
};

export const confirmEmail = async (req, res) => {
  const data = await track('confirm_email', () => authService.confirmEmail({ body: req.body }));
  return successResponse({ res, message: 'Email confirmed successfully', data });
};

export const resendOtp = async (req, res) => {
  await authService.resendOtp({ body: req.body });
  return successResponse({ res, message: 'If the account exists, a new code was sent to the email' });
};

export const login = async (req, res) => {
  const data = await track('login', () => authService.login({ body: req.body }));
  return successResponse({ res, message: 'Logged in successfully', data });
};

export const logout = async (req, res) => {
  await authService.logout({ decoded: req.decoded });
  return successResponse({ res, message: 'Logged out successfully' });
};

export const forgotPassword = async (req, res) => {
  await authService.resendOtp({ body: { email: req.body.email, otpType: 'resetPassword' } });
  return successResponse({ res, message: 'If the account exists, a code was sent to the email' });
};

export const resetPassword = async (req, res) => {
  await track('reset_password', () => authService.resetPassword({ body: req.body }));
  return successResponse({ res, message: 'Password changed successfully' });
};
