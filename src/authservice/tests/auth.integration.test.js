// Needs MongoDB (or a compatible server) and Redis. Use TEST_DB_URI and TEST_REDIS_URL to change them.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DB_URI = process.env.TEST_DB_URI || 'mongodb://127.0.0.1:27017/auth_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/5';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'boss@shopora.com';
process.env.ADMIN_PASSWORD = 'AdminPass123';

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../src/db/mongo.connection.db.js');
const { connectRedis, redisClient } = await import('../src/db/redis.connection.db.js');
const { createApp } = await import('../src/app.js');
const { ensureAdmin } = await import('../src/services/auth.service.js');
const { setMailSender } = await import('../src/services/mail.service.js');

let server;
let base;
const mails = [];
setMailSender(async (message) => {
  mails.push(message);
});
const lastCode = () => mails.at(-1).text.match(/(\d{6})/)[1];

const call = async (path, { method = 'GET', body, token } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

const sara = { name: 'Sara Ali', email: 'Sara@Example.com', password: 'Passw0rd1', phone: '01000000000' };
let saraToken;
let saraId;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes?.();
  await connectRedis();
  await redisClient.flushDb();
  await ensureAdmin();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  await redisClient.quit();
});

test('bad registration data is rejected', async () => {
  assert.equal((await call('/api/auth/register', { method: 'POST', body: { ...sara, email: 'bad' } })).status, 400);
  assert.equal((await call('/api/auth/register', { method: 'POST', body: { ...sara, password: '123' } })).status, 400);
  assert.equal(mails.length, 0);
});

test('register sends a code and the account can not log in before confirming', async () => {
  const { status, body } = await call('/api/auth/register', { method: 'POST', body: sara });
  assert.equal(status, 201);
  assert.equal(body.data.email, 'sara@example.com');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'sara@example.com');

  const login = await call('/api/auth/login', { method: 'POST', body: sara });
  assert.equal(login.status, 403);
});

test('a wrong code is refused and the right one confirms and logs in', async () => {
  const wrong = await call('/api/auth/confirm-email', { method: 'POST', body: { email: sara.email, otp: '000000' } });
  assert.equal(wrong.status, 400);

  const { status, body } = await call('/api/auth/confirm-email', { method: 'POST', body: { email: sara.email, otp: lastCode() } });
  assert.equal(status, 200);
  assert.ok(body.data.token);
  assert.equal(body.data.user.isConfirmed, true);
  assert.equal(body.data.user.role, 'user');
  assert.equal(body.data.user.password, undefined);
  saraToken = body.data.token;
  saraId = body.data.user.id;

  // the code works only once
  const again = await call('/api/auth/confirm-email', { method: 'POST', body: { email: sara.email, otp: '123456' } });
  assert.equal(again.status, 400);
});

test('registering a confirmed email again is a 409', async () => {
  assert.equal((await call('/api/auth/register', { method: 'POST', body: sara })).status, 409);
});

test('login works and the errors do not tell which part was wrong', async () => {
  const ok = await call('/api/auth/login', { method: 'POST', body: { email: 'SARA@example.com', password: sara.password } });
  assert.equal(ok.status, 200);

  const wrongPassword = await call('/api/auth/login', { method: 'POST', body: { email: sara.email, password: 'Wrong1234' } });
  const noUser = await call('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: 'Wrong1234' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPassword.body.message, noUser.body.message);
});

test('profile needs a token and can be updated', async () => {
  assert.equal((await call('/api/users/me')).status, 401);
  assert.equal((await call('/api/users/me', { token: 'garbage' })).status, 401);

  const me = await call('/api/users/me', { token: saraToken });
  assert.equal(me.body.data.user.email, 'sara@example.com');

  const updated = await call('/api/users/me', {
    method: 'PATCH',
    token: saraToken,
    body: { name: 'Sara A.', address: { streetAddress: '1 Nile St', city: 'Cairo', zipCode: '11511' } },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.user.name, 'Sara A.');
  assert.equal(updated.body.data.user.address.city, 'Cairo');
  assert.equal(updated.body.data.user.address.country, 'Egypt');
});

test('wishlist add, no duplicates, remove', async () => {
  await call('/api/users/me/wishlist/p1', { method: 'PUT', token: saraToken });
  await call('/api/users/me/wishlist/p2', { method: 'PUT', token: saraToken });
  const again = await call('/api/users/me/wishlist/p1', { method: 'PUT', token: saraToken });
  assert.deepEqual(again.body.data.wishlist, ['p1', 'p2']);

  const removed = await call('/api/users/me/wishlist/p1', { method: 'DELETE', token: saraToken });
  assert.deepEqual(removed.body.data.wishlist, ['p2']);
  assert.deepEqual((await call('/api/users/me/wishlist', { token: saraToken })).body.data.wishlist, ['p2']);
});

test('only an admin can see the users', async () => {
  assert.equal((await call('/api/users', { token: saraToken })).status, 403);
  assert.equal((await call('/api/users/stats', { token: saraToken })).status, 403);
});

test('the first admin exists from env and can manage users', async () => {
  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'boss@shopora.com', password: 'AdminPass123' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.role, 'admin');
  const admin = login.body.data.token;

  const list = await call('/api/users?q=sara', { token: admin });
  assert.equal(list.body.data.totalCount, 1);
  assert.equal(list.body.data.users[0].email, 'sara@example.com');

  const stats = await call('/api/users/stats', { token: admin });
  assert.equal(stats.body.data.stats.total, 2);
  assert.equal(stats.body.data.stats.admins, 1);

  const adminId = login.body.data.user.id;
  assert.equal((await call(`/api/users/${adminId}/ban`, { method: 'PATCH', token: admin, body: { isBanned: true } })).status, 409);
  assert.equal((await call(`/api/users/${saraId}/ban`, { method: 'PATCH', token: admin, body: { isBanned: 'yes' } })).status, 400);

  // banning kills the live token at once and blocks the next login
  const banned = await call(`/api/users/${saraId}/ban`, { method: 'PATCH', token: admin, body: { isBanned: true } });
  assert.equal(banned.body.data.user.isBanned, true);
  assert.equal((await call('/api/users/me', { token: saraToken })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: sara })).status, 403);

  await call(`/api/users/${saraId}/ban`, { method: 'PATCH', token: admin, body: { isBanned: false } });
  const back = await call('/api/auth/login', { method: 'POST', body: sara });
  assert.equal(back.status, 200);
  saraToken = back.body.data.token;
});

test('logout revokes only that token', async () => {
  const other = (await call('/api/auth/login', { method: 'POST', body: sara })).body.data.token;

  assert.equal((await call('/api/auth/logout', { method: 'POST', token: saraToken })).status, 200);
  assert.equal((await call('/api/users/me', { token: saraToken })).status, 401);
  assert.equal((await call('/api/users/me', { token: other })).status, 200);
  saraToken = other;
});

test('changing the password revokes the old tokens and gives a new one', async () => {
  const wrong = await call('/api/users/me/password', { method: 'PATCH', token: saraToken, body: { oldPassword: 'nope1234', newPassword: 'NewPassw0rd2' } });
  assert.equal(wrong.status, 401);

  const changed = await call('/api/users/me/password', { method: 'PATCH', token: saraToken, body: { oldPassword: sara.password, newPassword: 'NewPassw0rd2' } });
  assert.equal(changed.status, 200);

  assert.equal((await call('/api/users/me', { token: saraToken })).status, 401);
  assert.equal((await call('/api/users/me', { token: changed.body.data.token })).status, 200);

  assert.equal((await call('/api/auth/login', { method: 'POST', body: sara })).status, 401);
  sara.password = 'NewPassw0rd2';
  const login = await call('/api/auth/login', { method: 'POST', body: sara });
  assert.equal(login.status, 200);
  saraToken = login.body.data.token;
});

test('forgot and reset password', async () => {
  const before = mails.length;
  const ghost = await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'ghost@example.com' } });
  assert.equal(ghost.status, 200);
  assert.equal(mails.length, before);

  const known = await call('/api/auth/forgot-password', { method: 'POST', body: { email: sara.email } });
  assert.equal(known.status, 200);
  assert.equal(mails.length, before + 1);
  assert.match(mails.at(-1).subject, /Reset/);

  const weak = await call('/api/auth/reset-password', { method: 'POST', body: { email: sara.email, otp: lastCode(), newPassword: 'weak' } });
  assert.equal(weak.status, 400);

  const done = await call('/api/auth/reset-password', { method: 'POST', body: { email: sara.email, otp: lastCode(), newPassword: 'ResetPassw0rd3' } });
  assert.equal(done.status, 200);

  // the old token is dead and the new password works
  assert.equal((await call('/api/users/me', { token: saraToken })).status, 401);
  const login = await call('/api/auth/login', { method: 'POST', body: { email: sara.email, password: 'ResetPassw0rd3' } });
  assert.equal(login.status, 200);
});

test('too many wrong codes burn the code', async () => {
  await call('/api/auth/register', { method: 'POST', body: { name: 'Omar', email: 'omar@example.com', password: 'Passw0rd1' } });
  const real = lastCode();
  for (let i = 0; i < 5; i++) {
    const wrong = await call('/api/auth/confirm-email', { method: 'POST', body: { email: 'omar@example.com', otp: '999999' } });
    assert.equal(wrong.status, 400);
  }
  const burned = await call('/api/auth/confirm-email', { method: 'POST', body: { email: 'omar@example.com', otp: real } });
  assert.equal(burned.status, 400);
  assert.match(burned.body.message, /Too many wrong codes|invalid or expired/);
});

test('asking for too many codes freezes the requests', async () => {
  const email = 'flood@example.com';
  let last;
  for (let i = 0; i < 7; i++) {
    last = await call('/api/auth/register', { method: 'POST', body: { name: 'Flood', email, password: 'Passw0rd1' } });
  }
  assert.equal(last.status, 429);
  assert.match(last.body.message, /Too many requests/);
});

test('health and metrics', async () => {
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.redis, 'connected');
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /auth_events_total\{event="login",result="ok"\}/);
});
