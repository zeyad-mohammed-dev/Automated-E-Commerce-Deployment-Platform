import { randomUUID } from 'node:crypto';
import * as redisService from './redis.service.js';
import { createProvider } from './providers/index.js';
import {
  FRONTEND_URL,
  INTENT_TTL,
  INTERNAL_API_KEY,
  PAID_CALLBACK_URL,
} from '../config/config.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors/index.js';
import { intentsTotal, paymentsPaidTotal } from '../utils/metrics.js';
import { round2 } from '../utils/money.js';

const PAID_TTL = 30 * 24 * 60 * 60;

const defaultDeps = {
  provider: createProvider(),
  notifyPaid: async (intent) => notifyGateway(intent),
};

const textOf = (value, field, max) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new ValidationError({ message: `${field} is too long` });
  return result;
};

export const validateIntentBody = (body = {}) => {
  const amount = round2(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError({ message: 'amount must be greater than zero' });
  }

  const currency = textOf(body.currency || 'EGP', 'currency', 8).toUpperCase();

  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    throw new ValidationError({ message: 'items must be a list of 1 to 100 lines' });
  }
  const items = body.items.map((item) => {
    const price = round2(Number(item.price));
    const quantity = Number(item.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError({ message: 'Each item needs a price and a quantity' });
    }
    return { name: textOf(item.name || 'Item', 'item name', 120) || 'Item', price, quantity };
  });

  const itemsTotal = round2(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  if (Math.abs(itemsTotal - amount) > 0.01) {
    throw new ValidationError({ message: 'amount does not match the items total' });
  }

  const customer = body.customer || {};
  const userId = textOf(body.userId, 'userId', 64);
  if (!userId) throw new ValidationError({ message: 'userId is required' });

  const metadata = body.metadata ?? {};
  if (JSON.stringify(metadata).length > 4000) {
    throw new ValidationError({ message: 'metadata is too big' });
  }

  return {
    userId,
    amount,
    currency,
    items,
    customer: {
      name: textOf(customer.name, 'customer name', 120),
      email: textOf(customer.email, 'customer email', 254),
      phone: textOf(customer.phone, 'customer phone', 32).replace(/[^0-9]/g, ''),
      address: textOf(customer.address, 'customer address', 255).replace(/[^A-Za-z0-9@\-_.,:\s]/g, ''),
    },
    metadata,
  };
};

export const toPublicIntent = (intent) => ({
  intentId: intent.id,
  status: intent.status,
  amount: intent.amount,
  currency: intent.currency,
  provider: intent.provider,
  reference: intent.reference,
  paymentMethod: intent.paymentMethod ?? null,
  orderId: intent.orderId ?? null,
  userId: intent.userId,
  metadata: intent.metadata,
  mock: intent.provider === 'mock',
  createdAt: intent.createdAt,
  paidAt: intent.paidAt ?? null,
});

const save = async (intent, ttl = INTENT_TTL) => {
  await redisService.set({ key: redisService.intentKey(intent.id), value: intent, ttl });
};

export const getIntent = async (id) => {
  const intent = await redisService.get(redisService.intentKey(String(id)));
  if (!intent || typeof intent !== 'object') {
    throw new NotFoundError({ message: 'Payment not found' });
  }
  return intent;
};

export const createIntent = async ({ body, deps = defaultDeps }) => {
  const data = validateIntentBody(body);
  const id = randomUUID();

  const returnUrl = `${FRONTEND_URL}/checkout/result?intent=${id}`;
  let payment;

  if (deps.provider.name === 'mock') {
    payment = { url: `${FRONTEND_URL}/checkout/mock-pay?intent=${id}`, reference: `mock-${id}` };
  } else {
    payment = await deps.provider.createPayment({
      intentId: id,
      amount: data.amount,
      currency: data.currency,
      customer: data.customer,
      items: data.items,
      successUrl: returnUrl,
      cancelUrl: `${returnUrl}&status=cancelled`,
    });
  }

  const intent = {
    id,
    userId: data.userId,
    amount: data.amount,
    currency: data.currency,
    status: 'pending',
    provider: deps.provider.name,
    reference: String(payment.reference),
    paymentUrl: payment.url,
    metadata: data.metadata,
    createdAt: new Date().toISOString(),
  };

  await save(intent);
  await redisService.set({ key: redisService.referenceKey(intent.reference), value: id, ttl: INTENT_TTL });
  intentsTotal.inc({ result: 'created' });

  return { ...toPublicIntent(intent), paymentUrl: intent.paymentUrl };
};

async function notifyGateway(intent) {
  if (!PAID_CALLBACK_URL) return false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(PAID_CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(INTERNAL_API_KEY ? { 'x-internal-key': INTERNAL_API_KEY } : {}),
        },
        body: JSON.stringify({ intentId: intent.id, userId: intent.userId }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return true;
      console.error(`Paid callback answered ${response.status} (attempt ${attempt})`);
    } catch (error) {
      console.error(`Paid callback failed (attempt ${attempt}): ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  return false;
}

// Safe to call many times (webhook, polling, mock button). The gateway is told only once.
export const markPaid = async ({ id, paymentMethod, source, deps = defaultDeps }) => {
  const intent = await getIntent(id);
  if (intent.status === 'paid') return { intent, changed: false };

  intent.status = 'paid';
  intent.paidAt = new Date().toISOString();
  intent.paymentMethod = paymentMethod ?? intent.paymentMethod;
  delete intent.failureReason;
  await save(intent, PAID_TTL);
  paymentsPaidTotal.inc({ source });

  const first = await redisService.setIfAbsent({ key: `${redisService.intentKey(id)}::notified`, value: 1, ttl: PAID_TTL });
  if (first) {
    // do not make Stripe or the browser wait for the gateway
    Promise.resolve(deps.notifyPaid(intent)).catch((error) => console.error(`Paid callback failed: ${error.message}`));
  }
  return { intent, changed: true };
};

export const markFailed = async ({ id, reason }) => {
  const intent = await getIntent(id);
  if (intent.status !== 'pending') return { intent, changed: false };

  intent.status = 'failed';
  intent.failureReason = String(reason || 'Payment failed').slice(0, 200);
  await save(intent);
  return { intent, changed: true };
};

// Without a webhook (for example on localhost) we ask the provider directly
export const getIntentStatus = async ({ id, refresh = false, deps = defaultDeps }) => {
  let intent = await getIntent(id);

  if (refresh && intent.status !== 'paid' && intent.provider !== 'mock') {
    const payment = await deps.provider.getPayment(intent.reference);
    if (payment.paid) {
      ({ intent } = await markPaid({ id, paymentMethod: payment.paymentMethod, source: 'poll', deps }));
    }
  }
  return toPublicIntent(intent);
};

export const mockPay = async ({ id, deps = defaultDeps }) => {
  if (deps.provider.name !== 'mock') throw new UnauthorizedError({ message: 'Mock payments are only available when PAYMENT_PROVIDER is mock' });
  const { intent } = await markPaid({ id, paymentMethod: 'Mock', source: 'mock', deps });
  return toPublicIntent(intent);
};

export const attachOrder = async ({ id, orderId }) => {
  const intent = await getIntent(id);
  if (intent.orderId && intent.orderId !== String(orderId)) {
    throw new ConflictError({ message: 'This payment already belongs to another order' });
  }
  intent.orderId = String(orderId);
  await save(intent, PAID_TTL);
  return toPublicIntent(intent);
};

// ---- webhook ----

export const handleWebhook = async ({ rawBody, signature, deps = defaultDeps }) => {
  if (typeof deps.provider.verifyWebhook !== 'function') {
    throw new NotFoundError({ message: 'Webhooks are not used by this payment provider' });
  }

  const event = deps.provider.verifyWebhook({ rawBody, signature });
  const parsed = deps.provider.parseEvent(event);
  if (parsed.kind === 'ignored') return { handled: 'ignored' };

  const intentId =
    parsed.intentId || (await redisService.get(redisService.referenceKey(String(parsed.reference))));
  if (!intentId) return { handled: 'ignored' };

  if (parsed.kind === 'paid') {
    await markPaid({ id: intentId, paymentMethod: parsed.paymentMethod, source: 'webhook', deps });
    return { handled: 'paid' };
  }
  await markFailed({ id: intentId, reason: parsed.reason });
  return { handled: 'failed' };
};
