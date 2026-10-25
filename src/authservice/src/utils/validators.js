import { ValidationError } from './errors/index.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[0-9+\-\s]{8,16}$/;

export const normalizeEmail = (email) => {
  const value = String(email || '').trim().toLowerCase();
  if (!emailRegex.test(value) || value.length > 254) {
    throw new ValidationError({ message: 'Please enter a valid email' });
  }
  return value;
};

export const validateName = (name) => {
  const value = String(name || '').trim();
  if (value.length < 2 || value.length > 60) {
    throw new ValidationError({ message: 'Name must be between 2 and 60 characters' });
  }
  return value;
};

export const validatePassword = (password) => {
  const value = String(password || '');
  if (value.length < 8 || value.length > 72 || !/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new ValidationError({
      message: 'Password must be 8 to 72 characters and include a letter and a number',
    });
  }
  return value;
};

export const validatePhone = (phone) => {
  if (phone === undefined || phone === null || phone === '') return '';
  const value = String(phone).trim();
  if (!phoneRegex.test(value)) throw new ValidationError({ message: 'Please enter a valid phone number' });
  return value;
};

export const validateAddress = (address) => {
  if (typeof address !== 'object' || address === null || Array.isArray(address)) {
    throw new ValidationError({ message: 'Address must be an object' });
  }
  const result = {};
  for (const [field, max] of [['streetAddress', 255], ['city', 100], ['state', 100], ['country', 100], ['zipCode', 20]]) {
    if (address[field] !== undefined) {
      const value = String(address[field]).trim();
      if (value.length > max) throw new ValidationError({ message: `${field} is too long` });
      result[field] = value;
    }
  }
  return result;
};
