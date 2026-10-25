// Needs MongoDB or a compatible server. Use TEST_DB_URI to change it.
// The relevance score and the suggestions use $add and $arrayElemAt, which some compatible servers
// (FerretDB) do not have, so they are not checked here. Real MongoDB and DocumentDB have them.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DB_URI = process.env.TEST_DB_URI || 'mongodb://127.0.0.1:27017/search_test';

const mongoose = (await import('mongoose')).default;
const { upsertProducts, deleteProduct } = await import('../src/services/sync.service.js');
const { searchProducts, buildSearchPipeline } = await import('../src/services/search.service.js');
const { SearchProductModel } = await import('../src/db/models/search-product.model.js');

const doc = (id, name, extra = {}) => ({
  id, name, description: 'd', brand: 'B', price: 100, discountPercent: 0, finalPrice: 100,
  images: ['/a.jpg'], category: { id: 'c1', name: 'Fashion', slug: 'fashion' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...extra,
});

before(async () => {
  await mongoose.connect(process.env.DB_URI);
  await SearchProductModel.deleteMany({});
  await SearchProductModel.syncIndexes();
  await upsertProducts([
    doc('1', 'Nike Air Max', { price: 1000, finalPrice: 800, discountPercent: 20, soldCount: 5 }),
    doc('2', 'Adidas Runner', { price: 500, finalPrice: 500 }),
    doc('3', 'Nike Socks', { price: 50, finalPrice: 50, category: { id: 'c2', name: 'Accessories', slug: 'accessories' } }),
  ]);
});

after(async () => {
  await SearchProductModel.deleteMany({});
  await mongoose.disconnect();
});

test('an older update is ignored and a newer one wins', async () => {
  await upsertProducts([doc('1', 'OLD NAME', { updatedAt: '2026-01-01T00:00:00Z' })]);
  assert.equal((await SearchProductModel.findOne({ productId: '1' })).name, 'Nike Air Max');

  await upsertProducts([doc('1', 'Nike Air Max 2', { price: 1000, finalPrice: 800, discountPercent: 20, soldCount: 5, updatedAt: '2026-02-01T00:00:00Z' })]);
  assert.equal((await SearchProductModel.findOne({ productId: '1' })).name, 'Nike Air Max 2');
});

test('every word must match, also parts of words', async () => {
  const count = async (q) => SearchProductModel.countDocuments(buildSearchPipeline({ q }).match);
  assert.equal(await count('nike'), 2);
  assert.equal(await count('ni'), 2);
  assert.equal(await count('air max'), 1);
  assert.equal(await count('zzz'), 0);
  assert.equal(await count('nike accessories'), 1);
});

test('filters, sort and paging without a text query', async () => {
  const onSale = await searchProducts({ onSale: 'true' });
  assert.deepEqual(onSale.results.map((r) => r.name), ['Nike Air Max 2']);
  assert.equal(onSale.totalCount, 1);

  const byCategory = await searchProducts({ category: 'accessories' });
  assert.deepEqual(byCategory.results.map((r) => r.name), ['Nike Socks']);

  const range = await searchProducts({ minPrice: '100', maxPrice: '600', sort: 'priceDesc' });
  assert.deepEqual(range.results.map((r) => r.name), ['Adidas Runner']);

  const sorted = await searchProducts({ sort: 'priceAsc' });
  assert.deepEqual(sorted.results.map((r) => r.name), ['Nike Socks', 'Adidas Runner', 'Nike Air Max 2']);
  assert.ok(sorted.results[0].id && !sorted.results[0].searchText && !sorted.results[0]._id);

  const paged = await searchProducts({ sort: 'priceAsc', limit: '2', page: '2' });
  assert.equal(paged.results.length, 1);
  assert.equal(paged.totalPages, 2);
  assert.equal(paged.totalCount, 3);
});

test('a deleted product leaves the index', async () => {
  await deleteProduct('2');
  assert.equal(await SearchProductModel.countDocuments(), 2);
});
