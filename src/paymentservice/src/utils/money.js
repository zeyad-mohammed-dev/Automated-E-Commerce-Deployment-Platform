// Money in the proto: { currency_code, units (int64), nanos (int32) }

export const toMoney = ({ amount, currencyCode }) => {
  let units = Math.trunc(amount);
  let nanos = Math.round((amount - units) * 1e9);

  if (nanos === 1e9) {
    units += 1;
    nanos = 0;
  }

  return { currency_code: currencyCode, units, nanos };
};

export const fromMoney = ({ units, nanos }) => {
  return Number(units) + Number(nanos) / 1e9;
};

export const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const finalPriceOf = ({ price, discountPercent = 0 }) => {
  return round2(price * (1 - discountPercent / 100));
};
