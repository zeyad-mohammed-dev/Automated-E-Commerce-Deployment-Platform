import test from 'node:test';
import assert from 'node:assert/strict';
import { toMoney, fromMoney, finalPriceOf, round2 } from '../src/utils/money.js';

test('toMoney splits units and nanos', () => {
  assert.deepEqual(toMoney({ amount: 12.5, currencyCode: 'USD' }), {
    currency_code: 'USD',
    units: 12,
    nanos: 500000000,
  });
});

test('toMoney carries nanos that round up to a full unit', () => {
  const money = toMoney({ amount: 0.9999999999, currencyCode: 'USD' });
  assert.equal(money.units, 1);
  assert.equal(money.nanos, 0);
});

test('fromMoney accepts string units from proto-loader', () => {
  assert.equal(fromMoney({ units: '3', nanos: 250000000 }), 3.25);
});

test('finalPriceOf applies the discount and rounds to 2 decimals', () => {
  assert.equal(finalPriceOf({ price: 849, discountPercent: 15 }), 721.65);
  assert.equal(finalPriceOf({ price: 100 }), 100);
  assert.equal(round2(1.005), 1.01);
});
