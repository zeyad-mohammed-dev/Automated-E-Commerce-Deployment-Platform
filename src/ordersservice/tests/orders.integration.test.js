// Runs against a real PostgreSQL. Set TEST_DATABASE_URL to use another one.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://shopora:shopora@127.0.0.1:5432/orders_test';
process.env.INTERNAL_API_KEY = 'test-key';

const catalogCalls = { adjust: [], keys: [] };
const catalogServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/api/products/')) {
      const id = decodeURIComponent(req.url.split('/').pop());
      if (id === 'missing') {
        res.statusCode = 404;
        return res.end('{}');
      }
      return res.end(
        JSON.stringify({ data: { product: { name: `Product ${id}`, images: [`/img/${id}.jpg`], finalPrice: id === 'p1' ? 100 : 250.5 } } }),
      );
    }
    if (req.method === 'POST' && req.url === '/api/products/stock/adjust') {
      catalogCalls.adjust.push(JSON.parse(body));
      catalogCalls.keys.push(req.headers['x-internal-key']);
      return res.end('{}');
    }
    res.statusCode = 404;
    res.end('{}');
  });
});
await new Promise((resolve) => catalogServer.listen(0, resolve));
process.env.CATALOG_SERVICE_URL = `http://127.0.0.1:${catalogServer.address().port}`;

const { sequelize, connectDB } = await import('../src/db/sequelize.connection.db.js');
const { createApp } = await import('../src/app.js');

let server;
let base;
const auth = { 'x-internal-key': 'test-key' };
const json = { 'Content-Type': 'application/json' };

const request = async (path, { method = 'GET', body, headers = auth } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...json, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

const checkoutBody = (overrides = {}) => ({
  order_id: 'order-1',
  user_id: 'user-1',
  email: 'Sara@Example.com',
  tracking_id: 'TRACK-1',
  currency: 'EGP',
  total: 450.5,
  items: [
    { product_id: 'p1', quantity: 2 },
    { product_id: 'p2', quantity: 1 },
  ],
  ...overrides,
});

const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out');
};

before(async () => {
  await connectDB({ attempts: 1 });
  await sequelize.sync({ force: true });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  catalogServer.close();
  await sequelize.close();
});

test('checkoutservice body is stored without any header', async () => {
  const { status, body } = await request('/api/orders', { method: 'POST', body: checkoutBody(), headers: {} });
  assert.equal(status, 201);
  assert.equal(body.data.order.orderId, 'order-1');
  assert.equal(body.data.order.status, 'processing');
  assert.equal(body.data.order.email, 'sara@example.com');
  assert.equal(body.data.order.total, 450.5);
  assert.equal(body.data.order.items.length, 2);
  assert.equal(body.data.order.history[0].status, 'processing');
});

test('names, prices and stock are filled in after the response', async () => {
  const order = await waitFor(async () => {
    const { body } = await request('/api/orders/order-1');
    return body.data.order.items.every((item) => item.name) ? body.data.order : null;
  });

  const first = order.items.find((item) => item.productId === 'p1');
  assert.equal(first.name, 'Product p1');
  assert.equal(first.picture, '/img/p1.jpg');
  assert.equal(first.unitPrice, 100);
  assert.equal(first.lineTotal, 200);

  await waitFor(async () => catalogCalls.adjust.length === 1);
  assert.equal(catalogCalls.adjust[0].action, 'purchase');
  assert.deepEqual(catalogCalls.adjust[0].items.map((i) => i.quantity).sort(), [1, 2]);
  assert.equal(catalogCalls.keys[0], 'test-key');
});

test('the same order twice is a 409 and does not touch the stock again', async () => {
  const { status } = await request('/api/orders', { method: 'POST', body: checkoutBody(), headers: {} });
  assert.equal(status, 409);
  assert.equal(catalogCalls.adjust.length, 1);
});

test('bad bodies are 400', async () => {
  const empty = await request('/api/orders', { method: 'POST', body: { order_id: 'x' }, headers: {} });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.message, 'order_id and items are required');

  const response = await fetch(`${base}/api/orders`, { method: 'POST', headers: json, body: '{bad json' });
  assert.equal(response.status, 400);
});

test('an unknown product does not fail the order', async () => {
  const { status } = await request('/api/orders', {
    method: 'POST',
    body: checkoutBody({ order_id: 'order-2', user_id: 'user-2', total: 80, items: [{ product_id: 'missing', quantity: 1 }] }),
    headers: {},
  });
  assert.equal(status, 201);
  const { body } = await request('/api/orders/order-2');
  assert.equal(body.data.order.items[0].name, null);
});

test('reading orders needs the internal key', async () => {
  assert.equal((await request('/api/orders', { headers: {} })).status, 401);
  assert.equal((await request('/api/orders/order-1', { headers: { 'x-internal-key': 'nope' } })).status, 401);
});

test('list supports user, status, search and paging', async () => {
  await request('/api/orders', { method: 'POST', headers: {}, body: checkoutBody({ order_id: 'order-3', user_id: 'user-1', total: 100, tracking_id: 'TRACK-3', items: [{ product_id: 'p1', quantity: 1 }] }) });

  const all = await request('/api/orders');
  assert.equal(all.body.data.totalCount, 3);
  assert.equal(all.body.data.orders[0].orderId, 'order-3');

  const byUser = await request('/api/orders?user_id=user-1');
  assert.deepEqual(byUser.body.data.orders.map((o) => o.orderId).sort(), ['order-1', 'order-3']);

  const search = await request('/api/orders?q=SARA@');
  assert.equal(search.body.data.totalCount, 3);
  assert.equal((await request('/api/orders?q=track-3')).body.data.totalCount, 1);
  assert.equal((await request('/api/orders?q=%25')).body.data.totalCount, 0);

  const paged = await request('/api/orders?limit=2&page=2');
  assert.equal(paged.body.data.orders.length, 1);
  assert.equal(paged.body.data.totalPages, 2);

  assert.equal((await request('/api/orders?status=nope')).status, 400);
  assert.equal((await request('/api/orders?from=garbage')).status, 400);
  assert.equal((await request('/api/orders?status=shipped')).body.data.totalCount, 0);
});

test('unknown order is 404', async () => {
  assert.equal((await request('/api/orders/nope')).status, 404);
});

test('the gateway can attach address, phone and payment details', async () => {
  const { status, body } = await request('/api/orders/order-1/details', {
    method: 'PATCH',
    body: {
      customerName: 'Sara Ali',
      customerPhone: '01000000000',
      shippingAddress: { streetAddress: '1 Nile St', city: 'Cairo', country: 'Egypt', zipCode: '11511', admin: true },
      payment: { provider: 'fawaterak', reference: 'INV-77', status: 'paid' },
      items: [{ productId: 'p1', unitPrice: 99.5 }],
    },
  });
  assert.equal(status, 200);
  const order = body.data.order;
  assert.equal(order.customerName, 'Sara Ali');
  assert.deepEqual(order.shippingAddress, { streetAddress: '1 Nile St', city: 'Cairo', country: 'Egypt', zipCode: '11511' });
  assert.deepEqual(order.payment, { provider: 'fawaterak', reference: 'INV-77', status: 'paid' });
  assert.equal(order.items.find((i) => i.productId === 'p1').unitPrice, 99.5);

  assert.equal((await request('/api/orders/nope/details', { method: 'PATCH', body: {} })).status, 404);
});

test('tracking needs the right email and hides private fields', async () => {
  const ok = await request('/api/orders/track?orderId=order-1&email=SARA@example.com');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.order.orderId, 'order-1');
  assert.equal(ok.body.data.order.userId, undefined);
  assert.equal(ok.body.data.order.email, undefined);
  assert.equal(ok.body.data.order.payment, undefined);

  const byTracking = await request('/api/orders/track?trackingId=TRACK-1&email=sara@example.com');
  assert.equal(byTracking.status, 200);

  assert.equal((await request('/api/orders/track?orderId=order-1&email=other@example.com')).status, 404);
  assert.equal((await request('/api/orders/track?orderId=nope&email=sara@example.com')).status, 404);
  assert.equal((await request('/api/orders/track?orderId=order-1')).status, 400);
});

test('status follows the allowed steps and keeps a history', async () => {
  const shipped = await request('/api/orders/order-1/status', { method: 'PATCH', body: { status: 'shipped', note: 'Left the warehouse' } });
  assert.equal(shipped.status, 200);
  assert.equal(shipped.body.data.order.status, 'shipped');
  assert.deepEqual(shipped.body.data.order.history.map((h) => h.status), ['processing', 'shipped']);
  assert.equal(shipped.body.data.order.history[1].note, 'Left the warehouse');

  assert.equal((await request('/api/orders/order-1/status', { method: 'PATCH', body: { status: 'processing' } })).status, 409);
  assert.equal((await request('/api/orders/order-1/status', { method: 'PATCH', body: { status: 'flying' } })).status, 400);
  assert.equal((await request('/api/orders/nope/status', { method: 'PATCH', body: { status: 'shipped' } })).status, 404);

  const delivered = await request('/api/orders/order-1/status', { method: 'PATCH', body: { status: 'delivered' } });
  assert.equal(delivered.body.data.order.status, 'delivered');
  assert.equal((await request('/api/orders/order-1/status', { method: 'PATCH', body: { status: 'cancelled' } })).status, 409);
});

test('cancelling gives the stock back', async () => {
  const before = catalogCalls.adjust.length;
  const { status, body } = await request('/api/orders/order-3/status', { method: 'PATCH', body: { status: 'cancelled' } });
  assert.equal(status, 200);
  assert.equal(body.data.order.status, 'cancelled');

  await waitFor(async () => catalogCalls.adjust.length > before);
  const last = catalogCalls.adjust.at(-1);
  assert.equal(last.action, 'restock');
  assert.deepEqual(last.items, [{ productId: 'p1', quantity: 1 }]);
});

test('stats leave cancelled orders out of the sales', async () => {
  const { status, body } = await request('/api/orders/stats?days=7');
  assert.equal(status, 200);

  const stats = body.data.stats;
  // order-1 (450.5, delivered) and order-2 (80, processing); order-3 is cancelled
  assert.equal(stats.ordersCount, 2);
  assert.equal(stats.revenue, 530.5);
  assert.equal(stats.averageOrderValue, 265.25);
  assert.equal(stats.customersCount, 2);
  assert.deepEqual(stats.byStatus, { processing: 1, shipped: 0, delivered: 1, cancelled: 1 });

  assert.equal(stats.dailySales.length, 7);
  assert.equal(stats.dailySales.at(-1).orders, 2);
  assert.equal(stats.dailySales.at(-1).revenue, 530.5);
  assert.equal(stats.dailySales[0].orders, 0);

  assert.equal(stats.topProducts[0].productId, 'p1');
  assert.equal(stats.topProducts[0].quantity, 2);
  assert.equal(stats.recentOrders.length, 3);
});

test('health and metrics', async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'ordersservice');

  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /orders_created_total\{result="created"\} 3/);
  assert.match(metrics, /orders_created_total\{result="duplicate"\} 1/);
  assert.match(metrics, /orders_status_changes_total/);
});
