// Needs Redis. Every other service is a small fake (HTTP or gRPC) inside this file.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as grpc from '@grpc/grpc-js';
import jwt from 'jsonwebtoken';

// ---------- fake REST services ----------
const calls = { auth: [], catalog: [], search: [], orders: [], payment: [] };
const handlers = { auth: null, catalog: null, search: null, orders: null, payment: null };

const fakeHttp = (name) => http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const record = { method: req.method, url: req.url, headers: req.headers, raw, body: safeJson(raw) };
    calls[name].push(record);
    const reply = handlers[name]?.(record) ?? { status: 404, json: { success: false, message: 'not found' } };
    res.statusCode = reply.status ?? 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reply.json ?? {}));
  });
});
const safeJson = (raw) => { try { return JSON.parse(raw.toString()); } catch (error) { return undefined; } };
const ok = (data = {}) => ({ status: 200, json: { success: true, message: 'ok', data } });
const fail = (status, message) => ({ status, json: { success: false, message } });
const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

const servers = Object.fromEntries(['auth', 'catalog', 'search', 'orders', 'payment'].map((name) => [name, fakeHttp(name)]));
const ports = {};
for (const [name, server] of Object.entries(servers)) ports[name] = await listen(server);

// ---------- fake gRPC services ----------
const carts = new Map();
const grpcSeen = { placeOrder: [], quote: [] };
let placeOrderImpl = null;
const { hipstershop } = await import('../src/grpc/protos.js');

const serve = (service, impl) => {
  const server = new grpc.Server();
  server.addService(service, impl);
  return new Promise((resolve) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (e, port) => resolve({ server, port })));
};
const grpcServers = {
  cart: await serve(hipstershop.CartService.service, {
    GetCart: (call, cb) => cb(null, { user_id: call.request.user_id, items: carts.get(call.request.user_id) || [] }),
    AddItem: (call, cb) => {
      const items = carts.get(call.request.user_id) || [];
      const found = items.find((item) => item.product_id === call.request.item.product_id);
      if (found) found.quantity += call.request.item.quantity;
      else items.push({ product_id: call.request.item.product_id, quantity: call.request.item.quantity });
      carts.set(call.request.user_id, items);
      cb(null, {});
    },
    EmptyCart: (call, cb) => { carts.delete(call.request.user_id); cb(null, {}); },
  }),
  shipping: await serve(hipstershop.ShippingService.service, {
    GetQuote: (call, cb) => { grpcSeen.quote.push(call.request); cb(null, { cost_usd: { currency_code: 'USD', units: 8, nanos: 990000000 } }); },
    ShipOrder: (call, cb) => cb(null, { tracking_id: 'TRK' }),
  }),
  currency: await serve(hipstershop.CurrencyService.service, {
    // 1 USD = 50 EGP
    Convert: (call, cb) => {
      const value = Number(call.request.from.units) + call.request.from.nanos / 1e9;
      const result = value * 50;
      cb(null, { currency_code: call.request.to_code, units: Math.trunc(result), nanos: Math.round((result % 1) * 1e9) });
    },
    GetSupportedCurrencies: (call, cb) => cb(null, { currency_codes: ['EGP', 'USD'] }),
  }),
  recommendation: await serve(hipstershop.RecommendationService.service, {
    ListRecommendations: (call, cb) => cb(null, { product_ids: ['p2', 'p3', 'missing'] }),
  }),
  checkout: await serve(hipstershop.CheckoutService.service, {
    PlaceOrder: (call, cb) => {
      grpcSeen.placeOrder.push(call.request);
      if (placeOrderImpl) return placeOrderImpl(call, cb);
      cb(null, {
        order: {
          order_id: 'order-100',
          shipping_tracking_id: 'TRK-100',
          shipping_cost: { currency_code: 'EGP', units: 449, nanos: 500000000 },
          shipping_address: call.request.address,
          items: [{ item: { product_id: 'p1', quantity: 2 }, cost: { currency_code: 'EGP', units: 100, nanos: 0 } }],
        },
      });
    },
  }),
};

const env = {
  NODE_ENV: 'test',
  REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/8',
  JWT_SECRET: 'gw-secret',
  INTERNAL_API_KEY: 'ik',
  AUTH_SERVICE_URL: `http://127.0.0.1:${ports.auth}`,
  CATALOG_SERVICE_URL: `http://127.0.0.1:${ports.catalog}`,
  SEARCH_SERVICE_URL: `http://127.0.0.1:${ports.search}`,
  ORDERS_SERVICE_URL: `http://127.0.0.1:${ports.orders}`,
  PAYMENT_SERVICE_URL: `http://127.0.0.1:${ports.payment}`,
  STORE_CURRENCY: 'EGP',
};
Object.assign(process.env, env);

const { connectRedis, redisClient } = await import('../src/db/redis.connection.db.js');
const { createApp } = await import('../src/app.js');
const { createGrpcClients } = await import('../src/grpc/clients.js');

let server, base, grpcClients;

const sign = ({ id = 'u1', role = 'user', jti = `j-${Math.random()}`, iatMs = Date.now() } = {}) =>
  jwt.sign({ sub: id, role, iatMs }, 'gw-secret', { expiresIn: 3600, jwtid: jti });
const userToken = sign({ id: 'u1', jti: 'user-jti' });
const adminToken = sign({ id: 'admin1', role: 'admin' });

const call = async (path, { method = 'GET', json, token, guest, headers = {}, body, contentType } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(guest ? { 'x-guest-id': guest } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const product = (id, extra = {}) => ({ _id: id, id, name: `Product ${id}`, images: [`/uploads/products/${id}.jpg`], price: 100, discountPercent: 0, finalPrice: 100, stockQuantity: 10, ...extra });
const products = { p1: product('p1', { price: 250, discountPercent: 20, finalPrice: 200 }), p2: product('p2'), p3: product('p3', { stockQuantity: 1 }) };

const resetCalls = () => Object.values(calls).forEach((list) => (list.length = 0));

before(async () => {
  await connectRedis();
  await redisClient.flushDb();
  grpcClients = createGrpcClients({
    cart: `127.0.0.1:${grpcServers.cart.port}`,
    checkout: `127.0.0.1:${grpcServers.checkout.port}`,
    shipping: `127.0.0.1:${grpcServers.shipping.port}`,
    currency: `127.0.0.1:${grpcServers.currency.port}`,
    recommendation: `127.0.0.1:${grpcServers.recommendation.port}`,
  });
  server = createApp({ grpc: grpcClients }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  handlers.catalog = ({ method, url }) => {
    const match = url.match(/^\/api\/products\/([^/?]+)$/);
    if (method === 'GET' && match) return products[match[1]] ? ok({ product: products[match[1]] }) : fail(404, 'Product not found');
    if (method === 'GET' && url.startsWith('/api/products')) return ok({ page: 1, limit: 12, totalCount: 3, totalPages: 1, products: Object.values(products) });
    if (method === 'GET' && url.startsWith('/api/categories')) return ok({ categories: [{ _id: 'c1', name: 'Fashion' }] });
    return ok({ forwarded: true });
  };
  handlers.auth = ({ method, url, headers, body }) => {
    if (url === '/api/auth/login') return body.password === 'right' ? ok({ token: 't', user: { id: 'u1' } }) : fail(401, 'Invalid email or password');
    if (url === '/api/users/me' && method === 'GET') return ok({ user: { id: 'u1', email: 'sara@example.com', name: 'Sara' } });
    if (url === '/api/users/me/wishlist' && method === 'GET') return ok({ wishlist: ['p1', 'p2', 'gone'] });
    if (url.startsWith('/api/users/me/wishlist/')) return ok({ wishlist: ['p1'] });
    if (url === '/api/users/stats') return ok({ stats: { total: 5, admins: 1, banned: 0, newLast30Days: 2 } });
    if (url.startsWith('/api/users')) return ok({ users: [], via: 'auth', authorization: headers.authorization });
    return ok({ forwarded: url });
  };
  handlers.search = ({ url }) => ok({ query: 'x', results: [], url });
  handlers.orders = ({ method, url, body }) => {
    if (url.startsWith('/api/orders/stats')) return ok({ stats: { ordersCount: 3, revenue: 900 } });
    if (url.startsWith('/api/orders/track')) return ok({ order: { orderId: 'order-100', status: 'shipped' }, url });
    if (method === 'GET' && url === '/api/orders/order-100') return ok({ order: { orderId: 'order-100', userId: 'u1', status: 'processing' } });
    if (method === 'GET' && url === '/api/orders/order-other') return ok({ order: { orderId: 'order-other', userId: 'someone-else' } });
    if (method === 'GET' && url.startsWith('/api/orders?')) return ok({ page: 1, orders: [{ orderId: 'order-100' }], url });
    if (method === 'PATCH' && url.endsWith('/details')) return ok({ order: {} });
    if (method === 'POST' && url === '/api/orders') return ok({ order: body });
    return ok({ forwarded: url });
  };
  const intents = new Map();
  handlers.payment = ({ method, url, body }) => {
    if (method === 'POST' && url === '/api/payments/intents') {
      const intent = { intentId: 'int-1', status: 'pending', amount: body.amount, currency: body.currency, provider: 'mock', reference: 'mock-int-1', mock: true, userId: body.userId, metadata: body.metadata, paymentUrl: 'http://shop/checkout/mock-pay?intent=int-1', orderId: null };
      intents.set('int-1', intent);
      return ok({ payment: intent });
    }
    const getMatch = url.match(/^\/api\/payments\/intents\/([^/?]+)(\?refresh=true)?$/);
    if (method === 'GET' && getMatch) return intents.has(getMatch[1]) ? ok({ payment: intents.get(getMatch[1]) }) : fail(404, 'Payment not found');
    const orderMatch = url.match(/^\/api\/payments\/intents\/([^/]+)\/order$/);
    if (method === 'POST' && orderMatch) { intents.get(orderMatch[1]).orderId = body.orderId; return ok({ payment: intents.get(orderMatch[1]) }); }
    if (method === 'POST' && url.endsWith('/mock-pay')) { intents.get('int-1').status = 'paid'; return ok({ payment: { status: 'paid' } }); }
    return fail(404, 'not found');
  };
  handlers.payment.intents = intents;
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  grpcClients.close();
  for (const s of Object.values(servers)) { s.closeAllConnections(); s.close(); }
  for (const { server: s } of Object.values(grpcServers)) s.forceShutdown();
  await redisClient.quit();
});

const address = { streetAddress: '1 Nile St', city: 'Cairo', state: 'Cairo', country: 'Egypt', zipCode: '11511' };

test('health and metrics', async () => {
  assert.equal((await call('/health')).status, 200);
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /http_request_duration_seconds/);
  assert.equal((await call('/nothing')).status, 404);
});

test('products and categories are forwarded with the query', async () => {
  resetCalls();
  const list = await call('/api/products?category=fashion&sort=priceAsc&page=2');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.totalCount, 3);
  assert.equal(calls.catalog[0].url, '/api/products?category=fashion&sort=priceAsc&page=2');
  assert.equal((await call('/api/categories')).body.data.categories[0].name, 'Fashion');
});

test('a product comes with recommendations and missing ones are dropped', async () => {
  const { status, body } = await call('/api/products/p1');
  assert.equal(status, 200);
  assert.equal(body.data.product.name, 'Product p1');
  assert.deepEqual(body.data.related.map((item) => item.id), ['p2', 'p3']);
  assert.equal((await call('/api/products/none')).status, 404);
});

test('search and suggestions go to searchservice', async () => {
  resetCalls();
  await call('/api/search?q=nike&sort=priceAsc');
  await call('/api/search/suggestions?q=ni');
  assert.deepEqual(calls.search.map((c) => c.url), ['/api/search?q=nike&sort=priceAsc', '/api/search/suggestions?q=ni']);
});

test('auth routes keep the status and the message of authservice', async () => {
  const wrong = await call('/api/auth/login', { method: 'POST', json: { email: 'a@b.com', password: 'bad' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.message, 'Invalid email or password');
  const right = await call('/api/auth/login', { method: 'POST', json: { email: 'a@b.com', password: 'right' } });
  assert.equal(right.body.data.token, 't');
});

test('the profile needs a token and the token is passed on', async () => {
  assert.equal((await call('/api/users/me')).status, 401);
  resetCalls();
  const me = await call('/api/users/me', { token: userToken });
  assert.equal(me.body.data.user.email, 'sara@example.com');
  assert.equal(calls.auth[0].headers.authorization, `Bearer ${userToken}`);
});

test('bad, revoked and old tokens are refused', async () => {
  assert.equal((await call('/api/cart', { token: 'garbage' })).status, 401);
  assert.equal((await call('/api/cart', { token: jwt.sign({ sub: 'u1' }, 'other-secret') })).status, 401);

  const revoked = sign({ id: 'u9', jti: 'dead' });
  await redisClient.set('RevokeToken::u9::dead', '1');
  assert.equal((await call('/api/users/me', { token: revoked })).status, 401);

  const old = sign({ id: 'u8', iatMs: Date.now() - 5000 });
  await redisClient.set('RevokeToken::u8', String(Date.now()));
  assert.equal((await call('/api/users/me', { token: old })).status, 401);
  assert.equal((await call('/api/users/me', { token: sign({ id: 'u8', iatMs: Date.now() + 5 }) })).status, 200);
});

test('a guest cart needs a guest id and keeps the stock rules', async () => {
  assert.equal((await call('/api/cart')).status, 400);

  const guest = 'guest-browser-1';
  assert.deepEqual((await call('/api/cart', { guest })).body.data.cart.items, []);

  const added = await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'p1', quantity: 2 } });
  assert.equal(added.status, 200);
  assert.equal(added.body.data.cart.itemsCount, 2);
  assert.equal(added.body.data.cart.subtotal, 400);
  assert.equal(added.body.data.cart.items[0].name, 'Product p1');
  assert.equal(added.body.data.cart.items[0].lineTotal, 400);
  assert.equal(added.body.data.cart.currency, 'EGP');

  assert.equal((await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'none' } })).status, 404);
  assert.equal((await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'p3', quantity: 2 } })).status, 409);
  assert.equal((await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'p2', quantity: 0 } })).status, 400);
  assert.equal((await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'p2', quantity: 'x' } })).status, 400);

  await call('/api/cart/items', { method: 'POST', guest, json: { productId: 'p2' } });
  const changed = await call('/api/cart/items/p1', { method: 'PATCH', guest, json: { quantity: 5 } });
  assert.equal(changed.body.data.cart.items.find((i) => i.productId === 'p1').quantity, 5);
  assert.equal((await call('/api/cart/items/p1', { method: 'PATCH', guest, json: { quantity: 11 } })).status, 409);
  assert.equal((await call('/api/cart/items/zzz', { method: 'PATCH', guest, json: { quantity: 1 } })).status, 404);

  const removed = await call('/api/cart/items/p1', { method: 'DELETE', guest });
  assert.deepEqual(removed.body.data.cart.items.map((i) => i.productId), ['p2']);
  assert.equal((await call('/api/cart', { method: 'DELETE', guest })).status, 200);
  assert.deepEqual((await call('/api/cart', { guest })).body.data.cart.items, []);
});

test('a deleted product shows as unavailable and is not counted', async () => {
  carts.set('guest-browser-2', [{ product_id: 'p2', quantity: 1 }, { product_id: 'gone', quantity: 3 }]);
  const cart = (await call('/api/cart', { guest: 'browser-2' })).body.data.cart;
  assert.equal(cart.items.find((i) => i.productId === 'gone').available, false);
  assert.equal(cart.subtotal, 100);
});

test('after login the guest cart moves into the user cart without passing the stock', async () => {
  carts.set('guest-merge-me-1', [{ product_id: 'p2', quantity: 3 }, { product_id: 'p3', quantity: 5 }]);
  carts.set('u1', [{ product_id: 'p3', quantity: 1 }]);

  const merged = await call('/api/cart/merge', { method: 'POST', token: userToken, json: { guestId: 'merge-me-1' } });
  assert.equal(merged.status, 200);
  const byId = Object.fromEntries(merged.body.data.cart.items.map((i) => [i.productId, i.quantity]));
  assert.deepEqual(byId, { p3: 1, p2: 3 });
  assert.equal(carts.has('guest-merge-me-1'), false);
  assert.equal((await call('/api/cart/merge', { method: 'POST', token: userToken, json: { guestId: 'x' } })).status, 400);
  assert.equal((await call('/api/cart/merge', { method: 'POST', json: { guestId: 'merge-me-1' } })).status, 401);
});

test('the quote adds the shipping, converted to EGP', async () => {
  carts.set('u1', [{ product_id: 'p1', quantity: 2 }]);
  const { status, body } = await call('/api/checkout/quote', { method: 'POST', token: userToken, json: { shippingAddress: address } });
  assert.equal(status, 200);
  // 2 x 200 = 400, shipping 8.99 USD x 50 = 449.5
  assert.deepEqual(body.data.quote, { subtotal: 400, shipping: 449.5, total: 849.5, currency: 'EGP' });
  assert.equal(grpcSeen.quote.at(-1).address.zip_code, 11511);
  assert.equal(grpcSeen.quote.at(-1).items[0].quantity, 2);

  assert.equal((await call('/api/checkout/quote', { method: 'POST', token: userToken, json: { shippingAddress: { city: 'x' } } })).status, 400);
  assert.equal((await call('/api/checkout/quote', { method: 'POST', json: { shippingAddress: address } })).status, 401);
});

test('start refuses an empty cart, a bad phone and a sold out product', async () => {
  const start = (json) => call('/api/checkout/start', { method: 'POST', token: userToken, json });
  const good = { shippingAddress: address, customerName: 'Sara Ali', customerPhone: '01000000000' };

  carts.delete('u1');
  assert.equal((await start(good)).body.message, 'Your cart is empty');

  carts.set('u1', [{ product_id: 'p1', quantity: 2 }]);
  assert.match((await start({ ...good, customerPhone: 'abc' })).body.message, /valid phone/);
  assert.match((await start({ ...good, customerName: '' })).body.message, /Name is required/);

  carts.set('u1', [{ product_id: 'p3', quantity: 2 }]);
  const soldOut = await start(good);
  assert.equal(soldOut.status, 409);
  assert.match(soldOut.body.message, /out of stock/);
});

let intentId;
test('start creates the payment with the cart lines, the shipping and the details', async () => {
  carts.set('u1', [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }]);
  resetCalls();
  const { status, body } = await call('/api/checkout/start', { method: 'POST', token: userToken, json: { shippingAddress: address, customerName: 'Sara Ali', customerPhone: '01000000000' } });
  assert.equal(status, 201);

  const sent = calls.payment[0];
  assert.equal(sent.headers['x-internal-key'], 'ik');
  assert.equal(sent.body.userId, 'u1');
  assert.equal(sent.body.amount, 949.5);
  assert.equal(sent.body.currency, 'EGP');
  assert.deepEqual(sent.body.items.map((i) => [i.name, i.price, i.quantity]), [['Product p1', 200, 2], ['Product p2', 100, 1], ['Shipping', 449.5, 1]]);
  assert.equal(sent.body.customer.email, 'sara@example.com');
  assert.equal(sent.body.metadata.shippingAddress.city, 'Cairo');

  intentId = body.data.payment.intentId;
  assert.equal(body.data.payment.paymentUrl, 'http://shop/checkout/mock-pay?intent=int-1');
  assert.equal(body.data.payment.shipping, 449.5);
});

test('another user can not see or confirm this payment', async () => {
  const other = sign({ id: 'u2' });
  assert.equal((await call(`/api/checkout/intent/${intentId}`, { token: other })).status, 403);
  assert.equal((await call('/api/checkout/confirm', { method: 'POST', token: other, json: { intentId } })).status, 403);
  assert.equal((await call('/api/checkout/mock-pay/' + intentId, { method: 'POST', token: other })).status, 403);
  const mine = await call(`/api/checkout/intent/${intentId}`, { token: userToken });
  assert.equal(mine.body.data.payment.status, 'pending');
  assert.equal(mine.body.data.payment.metadata, undefined);
});

test('confirm says pending until the payment is paid', async () => {
  const result = await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId } });
  assert.equal(result.body.data.status, 'pending');
  assert.equal(grpcSeen.placeOrder.length, 0);
  assert.equal((await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: {} })).status, 400);
});

test('the mock pay button marks it paid, then confirm creates the order once', async () => {
  assert.equal((await call(`/api/checkout/mock-pay/${intentId}`, { method: 'POST', token: userToken })).status, 200);
  resetCalls();

  // two calls at the same time (browser and callback): one order
  const [a, b] = await Promise.all([
    call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId } }),
    call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId } }),
  ]);
  const statuses = [a.body.data.status, b.body.data.status].sort();
  assert.ok(statuses.includes('completed'));
  assert.equal(grpcSeen.placeOrder.length, 1);

  const request = grpcSeen.placeOrder[0];
  assert.equal(request.user_id, 'u1');
  assert.equal(request.user_currency, 'EGP');
  assert.equal(request.email, 'sara@example.com');
  assert.equal(request.address.street_address, '1 Nile St');
  assert.equal(request.address.zip_code, 11511);
  assert.equal(request.credit_card.credit_card_number, intentId);

  const details = calls.orders.find((c) => c.url.endsWith('/details'));
  assert.equal(details.method, 'PATCH');
  assert.equal(details.url, '/api/orders/order-100/details');
  assert.equal(details.headers['x-internal-key'], 'ik');
  assert.equal(details.body.customerName, 'Sara Ali');
  assert.deepEqual(details.body.payment, { provider: 'mock', reference: 'mock-int-1', status: 'paid' });
  assert.equal(handlers.payment.intents.get('int-1').orderId, 'order-100');

  const done = [a, b].find((item) => item.body.data.status === 'completed');
  assert.equal(done.body.data.orderId, 'order-100');
  assert.equal(done.body.data.order.orderId, 'order-100');

  // later calls give the same order and do not create another
  const again = await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId } });
  assert.equal(again.body.data.status, 'completed');
  assert.equal(grpcSeen.placeOrder.length, 1);
});

test('the paid callback needs the internal key and is safe to repeat', async () => {
  assert.equal((await call('/internal/payments/paid', { method: 'POST', json: { intentId } })).status, 401);
  const done = await call('/internal/payments/paid', { method: 'POST', headers: { 'x-internal-key': 'ik' }, json: { intentId } });
  assert.equal(done.body.data.status, 'completed');
  assert.equal(grpcSeen.placeOrder.length, 1);
});

test('if checkoutservice fails the customer can try again', async () => {
  const intents = handlers.payment.intents;
  intents.set('int-2', { intentId: 'int-2', status: 'paid', amount: 100, currency: 'EGP', provider: 'mock', reference: 'mock-int-2', userId: 'u1', metadata: { shippingAddress: address, customerName: 'Sara', customerPhone: '0100000000', email: 'sara@example.com' }, orderId: null });
  const before = grpcSeen.placeOrder.length;

  placeOrderImpl = (call, cb) => cb({ code: grpc.status.INTERNAL, message: 'shipping is down' });
  const failed = await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId: 'int-2' } });
  assert.equal(failed.body.data.status, 'error');
  assert.match(failed.body.data.message, /shipping is down/);

  placeOrderImpl = null;
  const retry = await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId: 'int-2' } });
  assert.equal(retry.body.data.status, 'completed');
  assert.equal(grpcSeen.placeOrder.length, before + 2);
});

test('if the order was not recorded by checkoutservice the gateway creates it', async () => {
  handlers.payment.intents.set('int-3', { intentId: 'int-3', status: 'paid', amount: 100, currency: 'EGP', provider: 'mock', reference: 'mock-int-3', userId: 'u1', metadata: { shippingAddress: address, customerName: 'Sara', customerPhone: '0100000000', email: 'sara@example.com' }, orderId: null });
  const original = handlers.orders;
  handlers.orders = (record) => (record.method === 'PATCH' && record.url.endsWith('/details') ? fail(404, 'Order not found') : original(record));
  resetCalls();

  const result = await call('/api/checkout/confirm', { method: 'POST', token: userToken, json: { intentId: 'int-3' } });
  handlers.orders = original;
  assert.equal(result.body.data.status, 'completed');

  const created = calls.orders.find((c) => c.method === 'POST' && c.url === '/api/orders');
  assert.equal(created.body.order_id, 'order-100');
  assert.equal(created.body.user_id, 'u1');
  assert.equal(created.body.total, 649.5);
  assert.deepEqual(created.body.items, [{ product_id: 'p1', quantity: 2 }]);
  assert.equal(created.body.shippingAddress.city, 'Cairo');
});

test('my orders are filtered by my id and other people orders are hidden', async () => {
  resetCalls();
  const list = await call('/api/orders?page=2&status=shipped&userId=hacker', { token: userToken });
  assert.equal(list.status, 200);
  assert.match(calls.orders[0].url, /userId=u1/);
  assert.doesNotMatch(calls.orders[0].url, /hacker/);
  assert.equal(calls.orders[0].headers['x-internal-key'], 'ik');

  assert.equal((await call('/api/orders/order-100', { token: userToken })).status, 200);
  assert.equal((await call('/api/orders/order-other', { token: userToken })).status, 404);
  assert.equal((await call('/api/orders')).status, 401);
});

test('tracking needs the order and the email', async () => {
  assert.equal((await call('/api/track?orderId=order-100')).status, 400);
  resetCalls();
  const tracked = await call('/api/track?orderId=order-100&email=sara@example.com');
  assert.equal(tracked.body.data.order.status, 'shipped');
  assert.match(calls.orders[0].url, /email=sara%40example\.com/);
});

test('the wishlist shows the products that still exist', async () => {
  const list = await call('/api/wishlist', { token: userToken });
  assert.deepEqual(list.body.data.wishlist.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual((await call('/api/wishlist/p1', { method: 'PUT', token: userToken })).body.data.ids, ['p1']);
  assert.equal((await call('/api/wishlist')).status, 401);
});

test('admin routes need an admin', async () => {
  assert.equal((await call('/api/admin/stats')).status, 401);
  assert.equal((await call('/api/admin/stats', { token: userToken })).status, 403);
  assert.equal((await call('/api/admin/products', { method: 'POST', token: userToken, json: {} })).status, 403);
});

test('the dashboard stats come from three services', async () => {
  const { status, body } = await call('/api/admin/stats?days=7', { token: adminToken });
  assert.equal(status, 200);
  assert.equal(body.data.orders.ordersCount, 3);
  assert.equal(body.data.users.total, 5);
  assert.equal(body.data.products.total, 3);
});

test('a product upload is streamed to the catalog with the internal key', async () => {
  resetCalls();
  const form = new FormData();
  form.append('name', 'Mug');
  form.append('images', new Blob(['binary-image'], { type: 'image/png' }), 'mug.png');
  const request = new Request('http://x', { method: 'POST', body: form });
  const buffer = Buffer.from(await request.arrayBuffer());

  const { status } = await call('/api/admin/products', { method: 'POST', token: adminToken, body: buffer, contentType: request.headers.get('content-type') });
  assert.equal(status, 200);

  const forwarded = calls.catalog[0];
  assert.equal(forwarded.url, '/api/products');
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.headers['x-internal-key'], 'ik');
  assert.match(forwarded.headers['content-type'], /multipart\/form-data/);
  assert.match(forwarded.raw.toString(), /binary-image/);
  assert.match(forwarded.raw.toString(), /name="name"/);
});

test('admin orders and users are forwarded', async () => {
  resetCalls();
  await call('/api/admin/orders?status=processing', { token: adminToken });
  await call('/api/admin/orders/order-100/status', { method: 'PATCH', token: adminToken, json: { status: 'shipped' } });
  assert.equal(calls.orders[0].url, '/api/orders?status=processing');
  assert.equal(calls.orders[0].headers['x-internal-key'], 'ik');
  assert.equal(calls.orders[1].url, '/api/orders/order-100/status');
  assert.deepEqual(calls.orders[1].body, { status: 'shipped' });

  const users = await call('/api/admin/users?q=sara', { token: adminToken });
  assert.equal(users.body.data.via, 'auth');
  assert.equal(users.body.data.authorization, `Bearer ${adminToken}`);
  assert.equal(calls.auth.at(-1).url, '/api/users?q=sara');
});

test('uploads are served from the catalog without needing a login', async () => {
  resetCalls();
  const response = await fetch(`${base}/uploads/products/a.png`);
  assert.equal(response.status, 200);
  assert.equal(calls.catalog[0].url, '/uploads/products/a.png');
  assert.equal(calls.catalog[0].headers.authorization, undefined);
});

test('a service that is down becomes a 502', async () => {
  const original = handlers.search;
  servers.search.closeAllConnections();
  await new Promise((resolve) => servers.search.close(resolve));
  const response = await call('/api/search?q=x');
  assert.equal(response.status, 502);
  handlers.search = original;
});
