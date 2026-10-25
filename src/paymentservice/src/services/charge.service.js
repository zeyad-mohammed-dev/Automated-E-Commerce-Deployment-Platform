import * as redisService from './redis.service.js';
import { getIntent } from './intent.service.js';
import { fromMoney, round2 } from '../utils/money.js';
import { ValidationError } from '../utils/errors/index.js';

const CONSUMED_TTL = 30 * 24 * 60 * 60;

// checkoutservice still calls Charge with a "credit card". The number field now carries
// the payment (intent) id of a payment that was already completed (mock page or Stripe).
// Charge only checks it and marks it as used, so one payment can pay for one order.
export const charge = async ({ amount, creditCard }) => {
  const reference = String(creditCard?.credit_card_number || '').trim();
  if (!reference) throw new ValidationError({ message: 'Payment reference is missing' });

  let intent;
  try {
    intent = await getIntent(reference);
  } catch (error) {
    throw new ValidationError({ message: 'Payment not found' });
  }

  if (intent.status !== 'paid') throw new ValidationError({ message: 'Payment is not completed' });
  if (intent.currency !== amount?.currency_code) {
    throw new ValidationError({ message: 'Payment currency does not match the order' });
  }
  if (Math.abs(round2(fromMoney(amount)) - intent.amount) > 0.01) {
    throw new ValidationError({ message: 'Payment amount does not match the order' });
  }

  const first = await redisService.setIfAbsent({
    key: redisService.consumedKey(reference),
    value: 1,
    ttl: CONSUMED_TTL,
  });
  if (!first) throw new ValidationError({ message: 'This payment was already used' });

  return { transactionId: String(intent.reference) };
};
