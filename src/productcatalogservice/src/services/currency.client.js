import * as grpc from '@grpc/grpc-js';
import { hipstershop } from '../grpc/protos.js';
import {
  CURRENCY_SERVICE_ADDR,
  CURRENCY_RATE_TTL,
  STORE_CURRENCY,
} from '../config/config.js';
import { fromMoney } from '../utils/money.js';

export const createCurrencyClient = (address = CURRENCY_SERVICE_ADDR) => {
  const client = new hipstershop.CurrencyService(address, grpc.credentials.createInsecure());

  return {
    convert: ({ from, toCode }) =>
      new Promise((resolve, reject) => {
        client.Convert({ from, to_code: toCode }, { deadline: Date.now() + 3000 }, (error, money) => {
          if (error) return reject(error);
          resolve(money);
        });
      }),
    close: () => client.close(),
  };
};

// Prices are saved in the store currency, the gRPC contract returns USD.
// The rate comes from currencyservice, so there is one source of truth.
export const createUsdRates = ({
  currencyClient,
  storeCurrency = STORE_CURRENCY,
  ttlSeconds = CURRENCY_RATE_TTL,
} = {}) => {
  let cached = null;

  const getUsdRate = async () => {
    if (storeCurrency === 'USD') return 1;

    const isFresh = cached && Date.now() - cached.at < ttlSeconds * 1000;
    if (isFresh) return cached.rate;

    try {
      // converting 1000 units keeps the nanos precision good enough
      const money = await currencyClient.convert({
        from: { currency_code: storeCurrency, units: 1000, nanos: 0 },
        toCode: 'USD',
      });
      const rate = fromMoney(money) / 1000;
      cached = { rate, at: Date.now() };
      return rate;
    } catch (error) {
      if (cached) return cached.rate;
      throw error;
    }
  };

  return { getUsdRate };
};
