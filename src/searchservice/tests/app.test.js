import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

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
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.service, 'searchservice');
  assert.equal(body.redis, 'disconnected');
});

test('metrics include the search metrics', async () => {
  const response = await fetch(`${base}/metrics`);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /search_catalog_events_total/);
  assert.match(text, /search_indexed_products/);
});

test('a bad price filter returns 400 before touching the database', async () => {
  const response = await fetch(`${base}/api/search?minPrice=abc`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /minPrice/);
});

test('unknown routes return 404 json', async () => {
  const response = await fetch(`${base}/api/nothing`);
  assert.equal(response.status, 404);
});
