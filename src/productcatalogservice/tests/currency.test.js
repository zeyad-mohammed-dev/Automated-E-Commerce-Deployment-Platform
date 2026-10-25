import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsdRates } from '../src/services/currency.client.js';

const fakeClient = (responses) => {
  const calls = [];
  return {
    calls,
    convert: async (args) => {
      calls.push(args);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
};

test('rate is 1 when the store currency is USD', async () => {
  const rates = createUsdRates({ currencyClient: fakeClient([]), storeCurrency: 'USD' });
  assert.equal(await rates.getUsdRate(), 1);
});

test('rate is read from currencyservice and cached', async () => {
  const client = fakeClient([{ currency_code: 'USD', units: '20', nanos: 0 }]);
  const rates = createUsdRates({ currencyClient: client, storeCurrency: 'EGP', ttlSeconds: 60 });

  assert.equal(await rates.getUsdRate(), 0.02);
  assert.equal(await rates.getUsdRate(), 0.02);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].from.currency_code, 'EGP');
  assert.equal(client.calls[0].toCode, 'USD');
});

test('last known rate is used if currencyservice fails later', async () => {
  const client = fakeClient([
    { currency_code: 'USD', units: '20', nanos: 0 },
    new Error('down'),
  ]);
  const rates = createUsdRates({ currencyClient: client, storeCurrency: 'EGP', ttlSeconds: 0 });

  assert.equal(await rates.getUsdRate(), 0.02);
  assert.equal(await rates.getUsdRate(), 0.02);
});

test('it throws when there is no cached rate and currencyservice fails', async () => {
  const client = fakeClient([new Error('down')]);
  const rates = createUsdRates({ currencyClient: client, storeCurrency: 'EGP' });
  await assert.rejects(rates.getUsdRate(), /down/);
});
