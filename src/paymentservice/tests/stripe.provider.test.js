import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionForm,
  createStripeProvider,
  signStripeWebhook,
  toMinorUnits,
} from '../src/services/providers/stripe.provider.js';

const provider = (overrides = {}) =>
  createStripeProvider({ baseUrl: 'http://stripe.test', secretKey: 'sk_test_1', webhookSecret: 'whsec_1', ...overrides });

test('amounts are sent in minor units without float errors', () => {
  assert.equal(toMinorUnits(250.5), 25050);
  assert.equal(toMinorUnits(19.99), 1999);
  assert.equal(toMinorUnits(0.29), 29);
  assert.equal(toMinorUnits(1.005), 101);
});

test('the checkout form has the lines, the urls and the intent id', () => {
  const form = buildSessionForm({
    intentId: 'i-1',
    currency: 'EGP',
    customer: { email: 'sara@example.com' },
    items: [{ name: 'Mug', price: 100, quantity: 2 }, { name: 'Free shipping', price: 0, quantity: 1 }, { name: 'Cap', price: 49.5, quantity: 1 }],
    successUrl: 'http://shop/ok',
    cancelUrl: 'http://shop/no',
  });
  assert.equal(form.get('mode'), 'payment');
  assert.equal(form.get('client_reference_id'), 'i-1');
  assert.equal(form.get('metadata[intentId]'), 'i-1');
  assert.equal(form.get('customer_email'), 'sara@example.com');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'egp');
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '10000');
  assert.equal(form.get('line_items[0][quantity]'), '2');
  // the free line is skipped and the next one takes its place
  assert.equal(form.get('line_items[1][price_data][product_data][name]'), 'Cap');
  assert.equal(form.get('line_items[1][price_data][unit_amount]'), '4950');
  assert.equal(form.get('line_items[2][quantity]'), null);
});

test('a bad email is not sent to Stripe', () => {
  const form = buildSessionForm({ intentId: 'i', currency: 'EGP', customer: { email: 'nope' }, items: [{ name: 'a', price: 1, quantity: 1 }], successUrl: 'u', cancelUrl: 'u' });
  assert.equal(form.get('customer_email'), null);
});

test('createPayment posts a form with the key and returns the session', async () => {
  let seen;
  const stripe = provider({
    fetchFn: async (url, options) => {
      seen = { url, options };
      return { ok: true, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) };
    },
  });
  const result = await stripe.createPayment({ intentId: 'i-1', amount: 10, currency: 'EGP', customer: {}, items: [{ name: 'a', price: 10, quantity: 1 }], successUrl: 's', cancelUrl: 'c' });

  assert.deepEqual(result, { url: 'https://checkout.stripe.com/c/pay/cs_test_1', reference: 'cs_test_1' });
  assert.equal(seen.url, 'http://stripe.test/v1/checkout/sessions');
  assert.equal(seen.options.headers.Authorization, 'Bearer sk_test_1');
  assert.equal(seen.options.headers['Idempotency-Key'], 'i-1');
  assert.match(seen.options.body.toString(), /mode=payment/);
});

test('Stripe errors become a 502 with the reason', async () => {
  const stripe = provider({ fetchFn: async () => ({ ok: false, json: async () => ({ error: { message: 'Invalid currency: egp' } }) }) });
  await assert.rejects(
    stripe.createPayment({ intentId: 'i', amount: 1, currency: 'EGP', customer: {}, items: [{ name: 'a', price: 1, quantity: 1 }], successUrl: 's', cancelUrl: 'c' }),
    (error) => error.statusCode === 502 && /Invalid currency/.test(error.message),
  );
  await assert.rejects(
    provider({ fetchFn: async () => { throw new Error('offline'); } }).getPayment('cs_1'),
    /Could not reach Stripe/,
  );
  await assert.rejects(
    provider().createPayment({ intentId: 'i', amount: 0, currency: 'EGP', customer: {}, items: [{ name: 'a', price: 0, quantity: 1 }], successUrl: 's', cancelUrl: 'c' }),
    /at least one line/,
  );
});

test('getPayment reads the payment status', async () => {
  const paid = provider({ fetchFn: async () => ({ ok: true, json: async () => ({ payment_status: 'paid' }) }) });
  const unpaid = provider({ fetchFn: async () => ({ ok: true, json: async () => ({ payment_status: 'unpaid' }) }) });
  assert.equal((await paid.getPayment('cs_1')).paid, true);
  assert.equal((await unpaid.getPayment('cs_1')).paid, false);
});

test('a webhook with a good signature is accepted', () => {
  const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } }));
  const signature = signStripeWebhook({ secret: 'whsec_1', rawBody });
  assert.equal(provider().verifyWebhook({ rawBody, signature }).type, 'checkout.session.completed');
});

test('a webhook is refused for a wrong secret, a changed body, an old time or a missing header', () => {
  const rawBody = Buffer.from('{"type":"x"}');
  const good = signStripeWebhook({ secret: 'whsec_1', rawBody });

  assert.throws(() => provider().verifyWebhook({ rawBody, signature: signStripeWebhook({ secret: 'other', rawBody }) }), /Invalid webhook signature/);
  assert.throws(() => provider().verifyWebhook({ rawBody: Buffer.from('{"type":"y"}'), signature: good }), /Invalid webhook signature/);
  const old = signStripeWebhook({ secret: 'whsec_1', rawBody, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.throws(() => provider().verifyWebhook({ rawBody, signature: old }), /too old/);
  assert.throws(() => provider().verifyWebhook({ rawBody, signature: undefined }), /Invalid webhook signature/);
  assert.throws(() => provider().verifyWebhook({ rawBody, signature: 'garbage' }), /Invalid webhook signature/);
  assert.throws(() => provider({ webhookSecret: '' }).verifyWebhook({ rawBody, signature: good }), /not configured/);
});

test('a second v1 value (secret rotation) can match', () => {
  const rawBody = Buffer.from('{"type":"x"}');
  const good = signStripeWebhook({ secret: 'whsec_1', rawBody });
  const rotated = good.replace('v1=', 'v1=deadbeef,v1=');
  assert.equal(provider().verifyWebhook({ rawBody, signature: rotated }).type, 'x');
});

test('events are mapped to paid, failed or ignored', () => {
  const stripe = provider();
  const session = (extra) => ({ data: { object: { id: 'cs_1', client_reference_id: 'i-1', ...extra } } });

  assert.deepEqual(stripe.parseEvent({ type: 'checkout.session.completed', ...session({ payment_status: 'paid' }) }), { kind: 'paid', intentId: 'i-1', reference: 'cs_1', paymentMethod: 'card' });
  assert.equal(stripe.parseEvent({ type: 'checkout.session.completed', ...session({ payment_status: 'unpaid' }) }).kind, 'ignored');
  assert.equal(stripe.parseEvent({ type: 'checkout.session.async_payment_succeeded', ...session({}) }).kind, 'paid');
  assert.equal(stripe.parseEvent({ type: 'checkout.session.async_payment_failed', ...session({}) }).kind, 'failed');
  assert.equal(stripe.parseEvent({ type: 'checkout.session.expired', ...session({}) }).kind, 'failed');
  assert.equal(stripe.parseEvent({ type: 'customer.created' }).kind, 'ignored');
  assert.equal(stripe.parseEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_2', payment_status: 'paid', metadata: { intentId: 'i-9' } } } }).intentId, 'i-9');
});
