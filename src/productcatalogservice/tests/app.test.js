import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApp } from '../src/app.js';
import { internalAuthMiddleware } from '../src/middlewares/internal-auth.middleware.js';
import { globalErrorHandler } from '../src/middlewares/error.middleware.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('health reports unavailable while MongoDB is not connected', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).service, 'productcatalogservice');
});

test('metrics are exposed in Prometheus format', async () => {
  await fetch(`${base}/health`);
  const response = await fetch(`${base}/metrics`);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /http_request_duration_seconds/);
  assert.match(text, /process_cpu_user_seconds_total/);
});

test('unknown routes return 404 json', async () => {
  const response = await fetch(`${base}/nothing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).success, false);
});

test('an invalid product id is a 404, not a crash', async () => {
  const response = await fetch(`${base}/api/products/not-an-id`);
  assert.equal(response.status, 404);
});

test('internal key middleware blocks and allows', async () => {
  const app = express();
  app.get('/secret', internalAuthMiddleware('abc123'), (req, res) => res.json({ ok: true }));
  app.use(globalErrorHandler);
  const secured = app.listen(0);
  await new Promise((resolve) => secured.once('listening', resolve));
  const url = `http://127.0.0.1:${secured.address().port}/secret`;

  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { 'x-internal-key': 'wrong!' } })).status, 401);
  assert.equal((await fetch(url, { headers: { 'x-internal-key': 'abc123' } })).status, 200);
  secured.close();
});

test('without a configured key the middleware lets requests through', async () => {
  let called = false;
  internalAuthMiddleware('')({ headers: {} }, {}, () => {
    called = true;
  });
  assert.equal(called, true);
});
