import { PAYMENT_PROVIDER } from '../../config/config.js';
import { createStripeProvider } from './stripe.provider.js';

// the mock provider has no calls: the "pay page" is a page of our own website
export const mockProvider = { name: 'mock' };

export const createProvider = (name = PAYMENT_PROVIDER) => {
  return name === 'stripe' ? createStripeProvider() : mockProvider;
};
