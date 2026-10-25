// Needs Redis. Use TEST_REDIS_URL to change it. Stripe and the gateway are small fake servers.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as grpc from '@grpc/grpc-js';

const fakeServer = (handler) => http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => handler(req, res, body));
});
const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

const stripeCalls = { create: [], status: [] };
let sessionPaid = 'unpaid';
const stripe = fakeServer((req, res, body) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
    stripeCalls.create.push({ auth: req.headers.authorization, form: new URLSearchParams(body) });
    const id = `cs_test_${stripeCalls.create.length}`;
    return res.end(JSON.stringify({ id, url: `https://checkout.stripe.com/c/pay/${id}` }));
  }
  if (req.method === 'GET' && req.url.startsWith('/v1/checkout/sessions/')) {
    stripeCalls.status.push(req.url);
    return res.end(JSON.stringify({ payment_status: sessionPaid }));
  }
  res.statusCode = 404;
  res.end('{}');
});

const paidCallbacks = [];
const gateway = fakeServer((req, res, body) => {
  paidCallbacks.push({ key: req.headers['x-internal-key'], body: JSON.parse(body) });
  res.end('{}');
});

const stripePort = await listen(stripe);
const gatewayPort = await listen(gateway);
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/7';
process.env.PAYMENT_PROVIDER = 'stripe';
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripePort}`;
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.PAID_CALLBACK_URL = `http://127.0.0.1:${gatewayPort}/internal/payments/paid`;
process.env.INTERNAL_API_KEY = 'k1';
process.env.FRONTEND_URL = 'http://shop.test';

const { connectRedis, redisClient } = await import('../src/db/redis.connection.db.js');
const { createApp } = await import('../src/app.js');
const { hipstershop } = await import('../src/grpc/protos.js');
const { createPaymentServer, startGrpcServer } = await import('../src/grpc/payment.grpc.js');
const { signStripeWebhook } = await import('../src/services/providers/stripe.provider.js');
const { mockProvider } = await import('../src/services/providers/index.js');
const intents = await import('../src/services/intent.service.js');

let server, base, grpcServer, grpcClient;
const key = { 'x-internal-key': 'k1' };

const call = async (path, { method = 'GET', json, headers = {} } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

const webhook = (event, { secret = 'whsec_test', signature } = {}) => {
  const rawBody = Buffer.from(JSON.stringify(event));
  return fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature ?? signStripeWebhook({ secret, rawBody }) },
    body: rawBody,
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
};

const completed = (intent, extra = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: { id: intent.reference, client_reference_id: intent.intentId, payment_status: 'paid', ...extra } },
});

const intentBody = (overrides = {}) => ({
  userId: 'user-1',
  amount: 250.5,
  currency: 'EGP',
  customer: { name: 'Sara Ali', email: 'sara@example.com' },
  items: [{ name: 'Mug', price: 100, quantity: 2 }, { name: 'Shipping', price: 50.5, quantity: 1 }],
  metadata: { address: { city: 'Cairo' } },
  ...overrides,
});
const create = async (overrides) => (await call('/api/payments/intents', { method: 'POST', headers: key, json: intentBody(overrides) })).body.data.payment;
const status = async (id, query = '') => (await call(`/api/payments/intents/${id}${query}`, { headers: key })).body.data.payment;

const money = (amount, code = 'EGP') => ({ currency_code: code, units: Math.trunc(amount), nanos: Math.round((amount % 1) * 1e9) });
const charge = (ref, amount, code) => new Promise((resolve, reject) =>
  grpcClient.Charge({ amount: money(amount, code), credit_card: { credit_card_number: ref, credit_card_cvv: 0, credit_card_expiration_year: 2099, credit_card_expiration_month: 12 } },
    (error, response) => (error ? reject(error) : resolve(response))));

const waitFor = async (check) => {
  for (let i = 0; i < 40; i++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out');
};

before(async () => {
  await connectRedis();
  await redisClient.flushDb();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  grpcServer = createPaymentServer();
  const port = await startGrpcServer(grpcServer, 0);
  grpcClient = new hipstershop.PaymentService(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
});

after(async () => {
  server.closeAllConnections?.();
  server.close(); stripe.closeAllConnections(); stripe.close(); gateway.closeAllConnections(); gateway.close();
  grpcClient.close(); grpcServer.forceShutdown();
  await redisClient.quit();
});

test('bad payments are rejected before Stripe is called', async () => {
  for (const [bad, message] of [
    [{ amount: 0 }, /greater than zero/],
    [{ amount: 999 }, /does not match/],
    [{ items: [] }, /items must be/],
    [{ userId: '' }, /userId is required/],
    [{ items: [{ name: 'x', price: 250.5, quantity: 0 }] }, /price and a quantity/],
  ]) {
    const response = await call('/api/payments/intents', { method: 'POST', headers: key, json: intentBody(bad) });
    assert.equal(response.status, 400);
    assert.match(response.body.message, message);
  }
  assert.equal((await call('/api/payments/intents', { method: 'POST', json: intentBody() })).status, 401);
  assert.equal(stripeCalls.create.length, 0);
});

let first;
test('a payment creates a Stripe Checkout session', async () => {
  first = await create();
  assert.equal(first.status, 'pending');
  assert.equal(first.provider, 'stripe');
  assert.equal(first.reference, 'cs_test_1');
  assert.equal(first.paymentUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');

  const sent = stripeCalls.create[0];
  assert.equal(sent.auth, 'Bearer sk_test_x');
  assert.equal(sent.form.get('line_items[0][price_data][unit_amount]'), '10000');
  assert.equal(sent.form.get('line_items[1][price_data][unit_amount]'), '5050');
  assert.equal(sent.form.get('client_reference_id'), first.intentId);
  assert.equal(sent.form.get('success_url'), `http://shop.test/checkout/result?intent=${first.intentId}`);
});

test('a pending payment can not be charged', async () => {
  await assert.rejects(charge(first.intentId, 250.5), (error) => error.code === grpc.status.INVALID_ARGUMENT && /not completed/.test(error.message));
});

test('refresh asks Stripe and stays pending while unpaid', async () => {
  assert.equal((await status(first.intentId)).status, 'pending');
  assert.equal(stripeCalls.status.length, 0);
  assert.equal((await status(first.intentId, '?refresh=true')).status, 'pending');
  assert.equal(stripeCalls.status.length, 1);
  assert.equal((await call('/api/payments/intents/nope', { headers: key })).status, 404);
});

test('a webhook with a wrong or missing signature is refused', async () => {
  assert.equal((await webhook(completed(first), { secret: 'wrong' })).status, 401);
  assert.equal((await webhook(completed(first), { signature: 'nope' })).status, 401);
  const noHeader = await fetch(`${base}/api/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 401);
  assert.equal((await status(first.intentId)).status, 'pending');
});

test('a signed paid event marks it paid and tells the gateway once', async () => {
  const response = await webhook(completed(first));
  assert.equal(response.status, 200);
  assert.equal(response.body.handled, 'paid');
  await webhook(completed(first));

  const payment = await status(first.intentId);
  assert.equal(payment.status, 'paid');
  assert.equal(payment.paymentMethod, 'card');

  await waitFor(() => paidCallbacks.length >= 1);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(paidCallbacks.length, 1);
  assert.deepEqual(paidCallbacks[0].body, { intentId: first.intentId, userId: 'user-1' });
  assert.equal(paidCallbacks[0].key, 'k1');
});

test('an unpaid completed session and unknown events are ignored', async () => {
  const other = await create();
  assert.equal((await webhook(completed(other, { payment_status: 'unpaid' }))).body.handled, 'ignored');
  assert.equal((await webhook({ type: 'customer.created', data: { object: {} } })).body.handled, 'ignored');
  assert.equal((await status(other.intentId)).status, 'pending');
});

test('the payment is found by the session id when the intent id is missing', async () => {
  const other = await create();
  const event = { type: 'checkout.session.completed', data: { object: { id: other.reference, payment_status: 'paid' } } };
  assert.equal((await webhook(event)).body.handled, 'paid');
  assert.equal((await status(other.intentId)).status, 'paid');
});

test('an expired session fails a pending payment but never a paid one', async () => {
  const other = await create();
  const expired = { type: 'checkout.session.expired', data: { object: { id: other.reference, client_reference_id: other.intentId } } };
  assert.equal((await webhook(expired)).body.handled, 'failed');
  assert.equal((await status(other.intentId)).status, 'failed');

  await webhook({ ...expired, data: { object: { id: first.reference, client_reference_id: first.intentId } } });
  assert.equal((await status(first.intentId)).status, 'paid');
});

test('polling marks it paid when Stripe says it is paid', async () => {
  const other = await create();
  sessionPaid = 'paid';
  const result = await status(other.intentId, '?refresh=true');
  sessionPaid = 'unpaid';
  assert.equal(result.status, 'paid');
});

test('Charge checks the payment, the amount and the currency', async () => {
  await assert.rejects(charge('nope', 250.5), /Payment not found/);
  await assert.rejects(charge('', 250.5), /reference is missing/);
  await assert.rejects(charge(first.intentId, 300), /amount does not match/);
  await assert.rejects(charge(first.intentId, 250.5, 'USD'), /currency does not match/);
});

test('Charge accepts a paid payment once and returns the Stripe session id', async () => {
  const result = await charge(first.intentId, 250.5);
  assert.equal(result.transaction_id, 'cs_test_1');
  await assert.rejects(charge(first.intentId, 250.5), /already used/);
});

test('the order can be linked to the payment, but only one order', async () => {
  const link = (orderId) => call(`/api/payments/intents/${first.intentId}/order`, { method: 'POST', headers: key, json: { orderId } });
  assert.equal((await link('order-9')).body.data.payment.orderId, 'order-9');
  assert.equal((await link('order-9')).status, 200);
  assert.equal((await link('other')).status, 409);
});

test('mock provider: a fake pay page and a pay button', async () => {
  const deps = { provider: mockProvider, notifyPaid: async () => {} };
  const created = await intents.createIntent({ body: intentBody(), deps });
  assert.equal(created.paymentUrl, `http://shop.test/checkout/mock-pay?intent=${created.intentId}`);
  assert.match(created.reference, /^mock-/);
  assert.equal(created.mock, true);

  assert.equal((await intents.getIntentStatus({ id: created.intentId, refresh: true, deps })).status, 'pending');
  assert.equal((await intents.mockPay({ id: created.intentId, deps })).status, 'paid');
  assert.equal((await charge(created.intentId, 250.5)).transaction_id, `mock-${created.intentId}`);
});

test('the mock button is closed when the provider is Stripe', async () => {
  const other = await create();
  assert.equal((await call(`/api/payments/intents/${other.intentId}/mock-pay`, { method: 'POST' })).status, 401);
});

test('webhooks are not used by the mock provider', async () => {
  await assert.rejects(
    intents.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'x', deps: { provider: mockProvider } }),
    /not used by this payment provider/,
  );
});

test('health and metrics', async () => {
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.provider, 'stripe');
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /payments_paid_total\{source="webhook"\}/);
  assert.match(metrics, /payments_charge_total\{result="ok"\} 2/);
});
