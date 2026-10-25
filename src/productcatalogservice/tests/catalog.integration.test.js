// Needs MongoDB (or a compatible server) and Redis. Use TEST_DB_URI and TEST_REDIS_URL to change them.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import { createClient } from 'redis';

const uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-int-'));
process.env.NODE_ENV = 'test';
process.env.DB_URI = process.env.TEST_DB_URI || 'mongodb://127.0.0.1:27017/catalog_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/6';
process.env.UPLOAD_DIR = uploads;
process.env.STORAGE_DRIVER = 'local';
process.env.INTERNAL_API_KEY = 'k1';

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../src/db/mongo.connection.db.js');
const { connectRedis, redisClient } = await import('../src/db/redis.connection.db.js');
const { createApp } = await import('../src/app.js');
const { hipstershop } = await import('../src/grpc/protos.js');
const { createCatalogServer, startGrpcServer } = await import('../src/grpc/catalog.grpc.js');
const productService = await import('../src/services/product.service.js');
const { ProductModel } = await import('../src/db/models/product.model.js');

let server, base, grpcServer, grpcClient, subscriber;
const events = [];
const key = { 'x-internal-key': 'k1' };

const call = async (urlPath, { method = 'GET', json, form, headers = {} } = {}) => {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json ? JSON.stringify(json) : form,
  });
  return { status: response.status, body: await response.json() };
};

const productForm = (fields, files = 0) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, String(value));
  for (let i = 0; i < files; i++) {
    form.append('images', new Blob([Buffer.from(`img${i}`)], { type: 'image/png' }), `p${i}.png`);
  }
  return form;
};

const grpcCall = (method, request) =>
  new Promise((resolve, reject) => grpcClient[method](request, (e, r) => (e ? reject(e) : resolve(r))));

const waitFor = async (check) => {
  for (let i = 0; i < 40; i++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out');
};

let fashion, shoes, p1, p2;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await connectRedis();
  await redisClient.flushDb();

  subscriber = createClient({ url: process.env.REDIS_URL });
  await subscriber.connect();
  await subscriber.subscribe('catalog.events', (message) => events.push(JSON.parse(message)));

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  grpcServer = createCatalogServer({ productService, usdRates: { getUsdRate: async () => 0.02 } });
  const port = await startGrpcServer(grpcServer, 0);
  grpcClient = new hipstershop.ProductCatalogService(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
});

after(async () => {
  server.close();
  grpcClient.close();
  grpcServer.forceShutdown();
  await subscriber.quit();
  await mongoose.disconnect();
  await redisClient.quit();
  await fs.rm(uploads, { recursive: true, force: true });
});

test('the catalog starts empty', async () => {
  assert.equal((await call('/api/products')).body.data.totalCount, 0);
  assert.deepEqual((await call('/api/categories')).body.data.categories, []);
  assert.deepEqual((await grpcCall('ListProducts', {})).products, []);
});

test('writing needs the internal key', async () => {
  const form = new FormData();
  form.append('name', 'Fashion');
  assert.equal((await call('/api/categories', { method: 'POST', form })).status, 401);
});

test('categories: create, duplicate, update, list', async () => {
  const form = new FormData();
  form.append('name', 'Fashion');
  const created = await call('/api/categories', { method: 'POST', form, headers: key });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.category.slug, 'fashion');
  fashion = created.body.data.category;

  const dup = new FormData();
  dup.append('name', 'fashion');
  assert.equal((await call('/api/categories', { method: 'POST', form: dup, headers: key })).status, 409);

  const other = new FormData();
  other.append('name', 'Home & Living');
  other.append('image', new Blob(['x'], { type: 'image/png' }), 'c.png');
  const second = await call('/api/categories', { method: 'POST', form: other, headers: key });
  assert.equal(second.body.data.category.slug, 'home-living');
  assert.match(second.body.data.category.image, /^\/uploads\/categories\/.+\.png$/);
  shoes = second.body.data.category;

  const list = await call('/api/categories');
  assert.deepEqual(list.body.data.categories.map((c) => c.name), ['Fashion', 'Home & Living']);
});

test('products: validation', async () => {
  const noName = await call('/api/products', { method: 'POST', form: productForm({ price: 10, category: fashion._id }), headers: key });
  assert.equal(noName.status, 400);
  const badCategory = await call('/api/products', { method: 'POST', form: productForm({ name: 'X', price: 10, category: '123' }), headers: key });
  assert.equal(badCategory.status, 400);
  const badPrice = await call('/api/products', { method: 'POST', form: productForm({ name: 'X', price: -5, category: fashion._id }), headers: key });
  assert.equal(badPrice.status, 400);
  const textFile = new FormData();
  textFile.append('name', 'X'); textFile.append('price', '5'); textFile.append('category', fashion._id);
  textFile.append('images', new Blob(['hi'], { type: 'text/html' }), 'x.html');
  assert.equal((await call('/api/products', { method: 'POST', form: textFile, headers: key })).status, 400);
});

test('products: create with images and publish an event', async () => {
  const created = await call('/api/products', {
    method: 'POST',
    headers: key,
    form: productForm({ name: 'Nike Air Max', brand: 'Nike', description: 'Shoes', price: 1000, discountPercent: 20, stockQuantity: 5, category: fashion._id }, 2),
  });
  assert.equal(created.status, 201);
  p1 = created.body.data.product;
  assert.equal(p1.finalPrice, 800);
  assert.equal(p1.images.length, 2);
  assert.equal(p1.category.slug, 'fashion');

  const saved = await fs.readFile(path.join(uploads, p1.images[0].replace('/uploads/', '')));
  assert.equal(saved.toString(), 'img0');
  const served = await fetch(`${base}${p1.images[0]}`);
  assert.equal(served.status, 200);

  await waitFor(() => events.length >= 1);
  assert.equal(events[0].type, 'product.upserted');
  assert.equal(events[0].data.id, p1.id ?? p1._id);
  assert.equal(events[0].data.category.name, 'Fashion');

  const second = await call('/api/products', { method: 'POST', headers: key, form: productForm({ name: 'Mug', price: 50, stockQuantity: 100, category: shoes._id }) });
  p2 = second.body.data.product;
});

test('products: list, filters, sort, paging, detail', async () => {
  const all = await call('/api/products');
  assert.equal(all.body.data.totalCount, 2);
  assert.equal(all.body.data.products[0].name, 'Mug');

  assert.equal((await call('/api/products?q=NIKE')).body.data.totalCount, 1);
  assert.equal((await call('/api/products?category=fashion')).body.data.totalCount, 1);
  assert.equal((await call(`/api/products?category=${shoes._id}`)).body.data.products[0].name, 'Mug');
  assert.equal((await call('/api/products?category=nothing')).body.data.totalCount, 0);
  assert.equal((await call('/api/products?onSale=true')).body.data.products[0].name, 'Nike Air Max');
  assert.equal((await call('/api/products?minPrice=100')).body.data.totalCount, 1);
  assert.equal((await call('/api/products?sort=priceAsc')).body.data.products[0].name, 'Mug');
  const paged = await call('/api/products?limit=1&page=2');
  assert.equal(paged.body.data.products.length, 1);
  assert.equal(paged.body.data.totalPages, 2);

  const detail = await call(`/api/products/${p1._id ?? p1.id}`);
  assert.equal(detail.body.data.product.name, 'Nike Air Max');
  assert.equal((await call('/api/products/65f000000000000000000000')).status, 404);
});

test('products: update fields, add and remove images, change category', async () => {
  const id = p1._id ?? p1.id;
  const removed = p1.images[0];
  const updated = await call(`/api/products/${id}`, {
    method: 'PATCH',
    headers: key,
    form: (() => {
      const form = productForm({ price: 1200, discountPercent: 50, category: shoes._id, removeImages: JSON.stringify([removed]) }, 1);
      return form;
    })(),
  });
  assert.equal(updated.status, 200);
  const product = updated.body.data.product;
  assert.equal(product.price, 1200);
  assert.equal(product.finalPrice, 600);
  assert.equal(product.images.length, 2);
  assert.ok(!product.images.includes(removed));
  assert.equal(product.category.slug, 'home-living');
  p1 = product;
});

test('categories with products can not be deleted, empty ones can', async () => {
  assert.equal((await call(`/api/categories/${shoes._id}`, { method: 'DELETE', headers: key })).status, 409);
  assert.equal((await call(`/api/categories/${fashion._id}`, { method: 'DELETE', headers: key })).status, 200);
  assert.equal((await call('/api/categories')).body.data.categories.length, 1);
});

test('category rename republishes its products', async () => {
  const before = events.length;
  const form = new FormData();
  form.append('name', 'Home');
  const renamed = await call(`/api/categories/${shoes._id}`, { method: 'PATCH', form, headers: key });
  assert.equal(renamed.body.data.category.slug, 'home');
  await waitFor(() => events.length >= before + 2);
  assert.ok(events.slice(before).every((event) => event.data.category.slug === 'home'));
});

test('stock: purchase stops at zero, restock gives back', async () => {
  const id = p1._id ?? p1.id;
  const stock = async () => (await ProductModel.findById(id).lean());

  await productService.adjustStock({ items: [{ productId: id, quantity: 2 }], action: 'purchase' });
  let doc = await stock();
  assert.equal(doc.stockQuantity, 3);
  assert.equal(doc.soldCount, 2);

  await productService.adjustStock({ items: [{ productId: id, quantity: 10 }], action: 'purchase' });
  doc = await stock();
  assert.equal(doc.stockQuantity, 0);
  assert.equal(doc.soldCount, 12);

  await productService.adjustStock({ items: [{ productId: id, quantity: 4 }], action: 'restock' });
  doc = await stock();
  assert.equal(doc.stockQuantity, 4);
  assert.equal(doc.soldCount, 8);

  await productService.adjustStock({ items: [{ productId: id, quantity: 50 }], action: 'restock' });
  doc = await stock();
  assert.equal(doc.soldCount, 0);

  const viaHttp = await call('/api/products/stock/adjust', { method: 'POST', headers: key, json: { items: [{ productId: id, quantity: 1 }], action: 'purchase' } });
  assert.equal(viaHttp.status, 200);
  assert.equal((await call('/api/products/stock/adjust', { method: 'POST', headers: key, json: { items: [{ productId: 'bad', quantity: 1 }] } })).status, 400);
  assert.equal((await call('/api/products/stock/adjust', { method: 'POST', json: { items: [] } })).status, 401);
});

test('export gives search documents and needs the key', async () => {
  assert.equal((await call('/api/products/export')).status, 401);
  const exported = await call('/api/products/export', { headers: key });
  assert.equal(exported.body.data.products.length, 2);
  assert.ok(exported.body.data.products.every((doc) => doc.id && doc.category?.slug === 'home' && doc.updatedAt));
});

test('gRPC keeps the original contract', async () => {
  const { products } = await grpcCall('ListProducts', {});
  assert.equal(products.length, 2);
  const nike = products.find((product) => product.name === 'Nike Air Max');
  assert.deepEqual(nike.categories, ['home']);
  // 1200 EGP with 50% off = 600 EGP, at 0.02 = 12 USD
  assert.equal(nike.price_usd.currency_code, 'USD');
  assert.equal(Number(nike.price_usd.units), 12);
  assert.match(nike.picture, /^\/uploads\/products\//);

  const one = await grpcCall('GetProduct', { id: nike.id });
  assert.equal(one.name, 'Nike Air Max');
  await assert.rejects(grpcCall('GetProduct', { id: 'bad' }), (error) => error.code === grpc.status.NOT_FOUND);

  const found = await grpcCall('SearchProducts', { query: 'mug' });
  assert.equal(found.results.length, 1);
});

test('deleting a product hides it everywhere and publishes a delete event', async () => {
  const id = p2._id ?? p2.id;
  const before = events.length;
  assert.equal((await call(`/api/products/${id}`, { method: 'DELETE', headers: key })).status, 200);
  assert.equal((await call(`/api/products/${id}`)).status, 404);
  assert.equal((await call('/api/products')).body.data.totalCount, 1);
  assert.equal((await grpcCall('ListProducts', {})).products.length, 1);

  await waitFor(() => events.length > before);
  assert.equal(events.at(-1).type, 'product.deleted');
  assert.equal(events.at(-1).data.id, id);
});

test('health reports ready with MongoDB connected', async () => {
  const health = await call('/health');
  assert.equal(health.status, 200);
});
