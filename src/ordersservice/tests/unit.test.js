import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/none';
const { normalizeCreateBody, normalizeAddress, fillDays, statusTransitions } = await import(
  '../src/services/order.service.js'
);

const legacyBody = () => ({
  order_id: 'o-1',
  user_id: 'u-1',
  email: 'Ahmed@Example.com',
  tracking_id: 'TRK1',
  currency: 'EGP',
  total: 1234.567,
  items: [{ product_id: 'p1', quantity: 2 }],
});

test('the legacy checkoutservice body is accepted', () => {
  const data = normalizeCreateBody(legacyBody());
  assert.equal(data.orderId, 'o-1');
  assert.equal(data.userId, 'u-1');
  assert.equal(data.email, 'ahmed@example.com');
  assert.equal(data.trackingId, 'TRK1');
  assert.equal(data.total, 1234.57);
  assert.deepEqual(data.items[0].productId, 'p1');
});

test('currency defaults to EGP and total to 0', () => {
  const data = normalizeCreateBody({ order_id: 'a', items: [{ product_id: 'p', quantity: 1 }] });
  assert.equal(data.currency, 'EGP');
  assert.equal(data.total, 0);
});

test('missing order_id or items is rejected', () => {
  assert.throws(() => normalizeCreateBody({ items: [{ product_id: 'p', quantity: 1 }] }), /order_id and items/);
  assert.throws(() => normalizeCreateBody({ order_id: 'a' }), /order_id and items/);
  assert.throws(() => normalizeCreateBody({ order_id: 'a', items: [] }), /order_id and items/);
});

test('bad quantity or total is rejected', () => {
  assert.throws(
    () => normalizeCreateBody({ order_id: 'a', items: [{ product_id: 'p', quantity: 0 }] }),
    /quantity must be a positive integer/,
  );
  assert.throws(
    () => normalizeCreateBody({ order_id: 'a', total: -5, items: [{ product_id: 'p', quantity: 1 }] }),
    /total must be a positive number/,
  );
});

test('address accepts both key styles and drops unknown keys', () => {
  assert.deepEqual(
    normalizeAddress({ street_address: '1 Nile St', city: 'Cairo', country: 'Egypt', zip_code: 11511, hacker: 'x' }),
    { streetAddress: '1 Nile St', city: 'Cairo', country: 'Egypt', zipCode: '11511' },
  );
  assert.equal(normalizeAddress(undefined), undefined);
  assert.throws(() => normalizeAddress('home'), /must be an object/);
});

test('fillDays returns one row per day and keeps the real rows', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const rows = [{ date: '2026-10-18', orders: 2, revenue: 500 }];
  const result = fillDays({ rows, days: 3, now });
  assert.deepEqual(result, [
    { date: '2026-10-17', orders: 0, revenue: 0 },
    { date: '2026-10-18', orders: 2, revenue: 500 },
    { date: '2026-10-19', orders: 0, revenue: 0 },
  ]);
});

test('a finished order can not change status', () => {
  assert.deepEqual(statusTransitions.delivered, []);
  assert.deepEqual(statusTransitions.cancelled, []);
  assert.ok(statusTransitions.processing.includes('shipped'));
});
