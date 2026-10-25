import { createHmac, timingSafeEqual } from 'node:crypto';
import { STRIPE_API_BASE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '../../config/config.js';
import { BadGatewayError, UnauthorizedError } from '../../utils/errors/index.js';

const TOLERANCE_SECONDS = 300;

// EGP, USD, EUR ... all use 2 decimals, so the minor unit is amount x 100
export const toMinorUnits = (amount) => Math.round((amount + Number.EPSILON) * 100);

export const buildSessionForm = ({ intentId, currency, customer, items, successUrl, cancelUrl }) => {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('client_reference_id', intentId);
  form.set('metadata[intentId]', intentId);
  form.set('payment_intent_data[metadata][intentId]', intentId);
  if (customer?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    form.set('customer_email', customer.email);
  }

  // Stripe does not accept lines with a zero price (free shipping, for example)
  items
    .filter((item) => item.price > 0)
    .forEach((item, index) => {
      const prefix = `line_items[${index}]`;
      form.set(`${prefix}[price_data][currency]`, currency.toLowerCase());
      form.set(`${prefix}[price_data][product_data][name]`, item.name);
      form.set(`${prefix}[price_data][unit_amount]`, String(toMinorUnits(item.price)));
      form.set(`${prefix}[quantity]`, String(item.quantity));
    });

  return form;
};

// Stripe Checkout in test mode: https://docs.stripe.com/api/checkout/sessions
export const createStripeProvider = ({
  baseUrl = STRIPE_API_BASE,
  secretKey = STRIPE_SECRET_KEY,
  webhookSecret = STRIPE_WEBHOOK_SECRET,
  fetchFn = fetch,
} = {}) => {
  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${secretKey}`, ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new BadGatewayError({ message: `Could not reach Stripe: ${error.message}` });
    }

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      // not json
    }
    if (!response.ok) {
      const reason = body?.error?.message ? `: ${body.error.message}` : '';
      throw new BadGatewayError({ message: `Stripe refused the request${reason}` });
    }
    return body;
  };

  return {
    name: 'stripe',

    // -> { url, reference }  (reference is the Checkout Session id)
    createPayment: async ({ intentId, amount, currency, customer, items, successUrl, cancelUrl }) => {
      if (!items.some((item) => item.price > 0)) {
        throw new BadGatewayError({ message: 'Stripe needs at least one line with a price' });
      }
      const session = await request('/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': intentId },
        body: buildSessionForm({ intentId, currency, customer, items, successUrl, cancelUrl }),
      });
      if (!session?.url || !session?.id) {
        throw new BadGatewayError({ message: 'Stripe sent an unexpected answer' });
      }
      return { url: session.url, reference: session.id };
    },

    // -> { paid, paymentMethod }
    getPayment: async (reference) => {
      const session = await request(`/v1/checkout/sessions/${encodeURIComponent(reference)}`);
      return { paid: session?.payment_status === 'paid', paymentMethod: 'card' };
    },

    // Stripe-Signature: t=<time>,v1=<hex>   v1 = HMAC-SHA256(secret, "<t>.<raw body>")
    verifyWebhook: ({ rawBody, signature, now = Date.now() }) => {
      if (!webhookSecret) throw new UnauthorizedError({ message: 'Webhook secret is not configured' });
      if (!rawBody || !signature) throw new UnauthorizedError({ message: 'Invalid webhook signature' });

      const parts = String(signature).split(',').map((part) => part.trim().split('='));
      const timestamp = parts.find(([key]) => key === 't')?.[1];
      const candidates = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
      if (!timestamp || !candidates.length) throw new UnauthorizedError({ message: 'Invalid webhook signature' });

      if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
        throw new UnauthorizedError({ message: 'The webhook is too old' });
      }

      const expected = createHmac('sha256', webhookSecret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest('hex');
      const wanted = Buffer.from(expected);
      const valid = candidates.some((candidate) => {
        const received = Buffer.from(candidate);
        return received.length === wanted.length && timingSafeEqual(received, wanted);
      });
      if (!valid) throw new UnauthorizedError({ message: 'Invalid webhook signature' });

      try {
        return JSON.parse(rawBody.toString('utf8'));
      } catch (error) {
        throw new UnauthorizedError({ message: 'Invalid webhook body' });
      }
    },

    // -> { kind: 'paid' | 'failed' | 'ignored', intentId, reference, paymentMethod, reason }
    parseEvent: (event) => {
      const session = event?.data?.object || {};
      const base = {
        intentId: session.client_reference_id || session.metadata?.intentId,
        reference: session.id,
        paymentMethod: 'card',
      };

      switch (event?.type) {
        case 'checkout.session.completed':
          // with delayed payment methods the session completes before the money arrives
          return { ...base, kind: session.payment_status === 'paid' ? 'paid' : 'ignored' };
        case 'checkout.session.async_payment_succeeded':
          return { ...base, kind: 'paid' };
        case 'checkout.session.async_payment_failed':
          return { ...base, kind: 'failed', reason: 'Payment failed' };
        case 'checkout.session.expired':
          return { ...base, kind: 'failed', reason: 'The payment session expired' };
        default:
          return { kind: 'ignored' };
      }
    },
  };
};

export const signStripeWebhook = ({ secret, rawBody, timestamp = Math.floor(Date.now() / 1000) }) => {
  const digest = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return `t=${timestamp},v1=${digest}`;
};
