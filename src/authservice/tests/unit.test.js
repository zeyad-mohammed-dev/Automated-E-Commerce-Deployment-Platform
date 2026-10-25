import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  validateName,
  validatePassword,
  validatePhone,
  validateAddress,
} from '../src/utils/validators.js';
import { buildOtpEmail } from '../src/services/mail.service.js';
import { generateOtp } from '../src/services/otp.service.js';
import { authorizationMiddleware } from '../src/middlewares/auth.middleware.js';

test('email is trimmed, lowercased and checked', () => {
  assert.equal(normalizeEmail('  Sara@Example.COM '), 'sara@example.com');
  assert.throws(() => normalizeEmail('nope'), /valid email/);
  assert.throws(() => normalizeEmail(''), /valid email/);
});

test('name needs 2 to 60 characters', () => {
  assert.equal(validateName(' Ali '), 'Ali');
  assert.throws(() => validateName('A'), /between 2 and 60/);
  assert.throws(() => validateName('x'.repeat(61)), /between 2 and 60/);
});

test('password needs length, a letter and a number', () => {
  assert.equal(validatePassword('Passw0rd1'), 'Passw0rd1');
  assert.throws(() => validatePassword('short1'), /8 to 72/);
  assert.throws(() => validatePassword('onlyletters'), /letter and a number/);
  assert.throws(() => validatePassword('12345678'), /letter and a number/);
});

test('phone is optional but checked when given', () => {
  assert.equal(validatePhone(undefined), '');
  assert.equal(validatePhone('+20 100 000 0000'), '+20 100 000 0000');
  assert.throws(() => validatePhone('abc'), /valid phone/);
});

test('address keeps only known fields and checks the length', () => {
  assert.deepEqual(validateAddress({ city: ' Cairo ', hacker: 1 }), { city: 'Cairo' });
  assert.throws(() => validateAddress({ city: 'x'.repeat(101) }), /too long/);
  assert.throws(() => validateAddress('home'), /must be an object/);
});

test('otp is always 6 digits', () => {
  for (let i = 0; i < 200; i++) assert.match(generateOtp(), /^\d{6}$/);
});

test('otp email has the code and the right subject', () => {
  const mail = buildOtpEmail({ email: 'a@b.com', otp: '123456', otpType: 'resetPassword' });
  assert.equal(mail.to, 'a@b.com');
  assert.match(mail.subject, /Reset/);
  assert.match(mail.text, /123456/);
  assert.match(mail.html, /123456/);
});

test('authorization middleware only lets the listed roles pass', () => {
  const check = authorizationMiddleware(['admin']);
  let error;
  check({ user: { role: 'user' } }, {}, (e) => (error = e));
  assert.equal(error.statusCode, 403);
  error = undefined;
  check({ user: { role: 'admin' } }, {}, (e) => (error = e));
  assert.equal(error, undefined);
});
