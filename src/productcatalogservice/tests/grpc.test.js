import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as grpc from '@grpc/grpc-js';
import { hipstershop, health } from '../src/grpc/protos.js';
import { createCatalogServer, startGrpcServer } from '../src/grpc/catalog.grpc.js';

const sneakers = {
  _id: '65f000000000000000000001',
  name: 'Sneakers',
  description: 'Light shoes',
  price: 1000,
  discountPercent: 20,
  images: ['/uploads/products/a.jpg', '/uploads/products/b.jpg'],
  category: { slug: 'fashion' },
};

let server;
let catalogClient;
let healthClient;
let rateFails = false;

const productService = {
  listAllProducts: async () => [sneakers],
  findProductForGrpc: async (id) => (id === sneakers._id ? sneakers : null),
  searchProducts: async (text) => (text === 'shoe' ? [sneakers] : []),
};
const usdRates = {
  getUsdRate: async () => {
    if (rateFails) throw new Error('no rate');
    return 0.02;
  },
};

const call = (client, method, request) =>
  new Promise((resolve, reject) => {
    client[method](request, (error, response) => (error ? reject(error) : resolve(response)));
  });

before(async () => {
  server = createCatalogServer({ productService, usdRates });
  const port = await startGrpcServer(server, 0);
  const address = `127.0.0.1:${port}`;
  catalogClient = new hipstershop.ProductCatalogService(address, grpc.credentials.createInsecure());
  healthClient = new health.Health(address, grpc.credentials.createInsecure());
});

after(() => {
  catalogClient.close();
  healthClient.close();
  server.forceShutdown();
});

test('ListProducts returns products in the original contract shape', async () => {
  const { products } = await call(catalogClient, 'ListProducts', {});
  assert.equal(products.length, 1);

  const [product] = products;
  assert.equal(product.id, sneakers._id);
  assert.equal(product.picture, '/uploads/products/a.jpg');
  assert.deepEqual(product.categories, ['fashion']);
  // 1000 EGP with 20% off = 800 EGP, at 0.02 = 16 USD
  assert.equal(product.price_usd.currency_code, 'USD');
  assert.equal(Number(product.price_usd.units), 16);
  assert.equal(product.price_usd.nanos, 0);
});

test('GetProduct returns one product', async () => {
  const product = await call(catalogClient, 'GetProduct', { id: sneakers._id });
  assert.equal(product.name, 'Sneakers');
});

test('GetProduct returns NOT_FOUND for an unknown id', async () => {
  await assert.rejects(call(catalogClient, 'GetProduct', { id: 'nope' }), (error) => {
    assert.equal(error.code, grpc.status.NOT_FOUND);
    return true;
  });
});

test('SearchProducts returns results', async () => {
  const found = await call(catalogClient, 'SearchProducts', { query: 'shoe' });
  assert.equal(found.results.length, 1);
  const none = await call(catalogClient, 'SearchProducts', { query: 'zzz' });
  assert.equal(none.results.length, 0);
});

test('it returns UNAVAILABLE when the currency rate is missing', async () => {
  rateFails = true;
  await assert.rejects(call(catalogClient, 'ListProducts', {}), (error) => {
    assert.equal(error.code, grpc.status.UNAVAILABLE);
    return true;
  });
  rateFails = false;
});

test('health check says SERVING', async () => {
  const response = await call(healthClient, 'Check', { service: '' });
  assert.equal(response.status, 'SERVING');
});
