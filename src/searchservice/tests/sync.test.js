import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toIndexDoc,
  upsertProducts,
  handleCatalogEvent,
  fullSync,
  syncWithRetry,
  fetchCatalogExport,
  syncState,
} from '../src/services/sync.service.js';

const doc = (overrides = {}) => ({
  id: 'p1',
  name: 'Nike Air Max',
  description: 'Shoes',
  brand: 'Nike',
  price: 1000,
  discountPercent: 10,
  finalPrice: 900,
  images: ['/a.jpg'],
  category: { id: 'c1', name: 'Fashion', slug: 'fashion' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const fakeStore = () => {
  const calls = { bulkWrite: [], deleteMany: [] };
  return {
    calls,
    failWith: null,
    bulkWrite: async (args) => {
      calls.bulkWrite.push(args);
      if (calls.failWith) throw calls.failWith;
    },
    deleteMany: async (args) => {
      calls.deleteMany.push(args);
    },
  };
};

test('toIndexDoc maps the catalog document and builds searchText', () => {
  const result = toIndexDoc(doc());
  assert.equal(result.productId, 'p1');
  assert.equal(result.searchText, 'nike air max nike fashion shoes');
  assert.equal(result.sourceUpdatedAt.toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(result.stockQuantity, 0);
});

test('upsert only overwrites when the update is not older', async () => {
  const store = fakeStore();
  await upsertProducts([doc()], store);

  const [{ operations, options }] = store.calls.bulkWrite;
  assert.equal(options.ordered, false);
  assert.equal(operations[0].updateOne.upsert, true);
  assert.equal(operations[0].updateOne.filter.productId, 'p1');
  assert.ok(operations[0].updateOne.filter.sourceUpdatedAt.$lte instanceof Date);
});

test('a stale update (duplicate key only) is ignored, other errors are not', async () => {
  const store = fakeStore();

  store.calls.failWith = { writeErrors: [{ code: 11000 }] };
  await upsertProducts([doc()], store);

  store.calls.failWith = { writeErrors: [{ code: 11000 }, { code: 121 }] };
  await assert.rejects(upsertProducts([doc()], store));

  store.calls.failWith = new Error('connection lost');
  await assert.rejects(upsertProducts([doc()], store), /connection lost/);
});

test('upserted event updates the index', async () => {
  const store = fakeStore();
  await handleCatalogEvent(JSON.stringify({ type: 'product.upserted', data: doc() }), store);
  assert.equal(store.calls.bulkWrite.length, 1);
});

test('deleted event removes the product', async () => {
  const store = fakeStore();
  await handleCatalogEvent(JSON.stringify({ type: 'product.deleted', data: { id: 'p9' } }), store);
  assert.deepEqual(store.calls.deleteMany[0].filter, { productId: 'p9' });
});

test('bad or unknown messages do nothing and never throw', async () => {
  const store = fakeStore();
  await handleCatalogEvent('not json', store);
  await handleCatalogEvent(JSON.stringify({ type: 'something.else', data: {} }), store);
  assert.equal(store.calls.bulkWrite.length, 0);
  assert.equal(store.calls.deleteMany.length, 0);

  store.calls.failWith = new Error('db down');
  await handleCatalogEvent(JSON.stringify({ type: 'product.upserted', data: doc() }), store);
});

test('fullSync upserts the export and deletes products that are gone', async () => {
  const store = fakeStore();
  const count = await fullSync({
    store,
    fetchExport: async () => [doc({ id: 'p1' }), doc({ id: 'p2' })],
  });

  assert.equal(count, 2);
  assert.equal(store.calls.bulkWrite[0].operations.length, 2);
  assert.deepEqual(store.calls.deleteMany[0].filter, { productId: { $nin: ['p1', 'p2'] } });
  assert.equal(syncState.lastSyncOk, true);
});

test('fullSync does not delete anything when the export fails', async () => {
  const store = fakeStore();
  await assert.rejects(
    fullSync({ store, fetchExport: async () => { throw new Error('catalog down'); } }),
    /catalog down/,
  );
  assert.equal(store.calls.deleteMany.length, 0);
  assert.equal(syncState.lastSyncOk, false);
});

test('an empty catalog clears the index', async () => {
  const store = fakeStore();
  await fullSync({ store, fetchExport: async () => [] });
  assert.deepEqual(store.calls.deleteMany[0].filter, { productId: { $nin: [] } });
  assert.equal(store.calls.bulkWrite[0]?.operations.length ?? 0, 0);
});

test('syncWithRetry retries and then succeeds', async () => {
  let attempts = 0;
  const ok = await syncWithRetry({
    attempts: 5,
    firstDelayMs: 1,
    sync: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('not ready');
      return 4;
    },
  });
  assert.equal(ok, true);
  assert.equal(attempts, 3);
});

test('syncWithRetry gives up after the last attempt', async () => {
  let attempts = 0;
  const ok = await syncWithRetry({
    attempts: 2,
    firstDelayMs: 1,
    sync: async () => {
      attempts += 1;
      throw new Error('never');
    },
  });
  assert.equal(ok, false);
  assert.equal(attempts, 2);
});

test('fetchCatalogExport sends the internal key and reads the products', async () => {
  let seen;
  const products = await fetchCatalogExport({
    baseUrl: 'http://catalog:8080',
    key: 'secret',
    fetchFn: async (url, options) => {
      seen = { url, headers: options.headers };
      return { ok: true, json: async () => ({ data: { products: [doc()] } }) };
    },
  });

  assert.equal(seen.url, 'http://catalog:8080/api/products/export');
  assert.equal(seen.headers['x-internal-key'], 'secret');
  assert.equal(products.length, 1);
});

test('fetchCatalogExport throws on a bad status', async () => {
  await assert.rejects(
    fetchCatalogExport({ baseUrl: 'http://x', fetchFn: async () => ({ ok: false, status: 401 }) }),
    /status 401/,
  );
});
