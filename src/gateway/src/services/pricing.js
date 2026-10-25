import { fromMoney, round2 } from '../utils/money.js';

export const toGrpcAddress = (address) => ({
  street_address: address.streetAddress,
  city: address.city,
  state: address.state || '',
  country: address.country,
  zip_code: Number(address.zipCode) || 0,
});

// what the customer sees for one cart line
export const toCartLine = ({ line, product }) => {
  if (!product) {
    return { productId: line.productId, quantity: line.quantity, available: false, inStock: false, lineTotal: 0 };
  }
  const inStock = product.stockQuantity >= line.quantity;
  return {
    productId: line.productId,
    quantity: line.quantity,
    name: product.name,
    image: product.images?.[0] || null,
    price: product.price,
    discountPercent: product.discountPercent,
    finalPrice: product.finalPrice,
    stockQuantity: product.stockQuantity,
    available: true,
    inStock,
    lineTotal: round2(product.finalPrice * line.quantity),
  };
};

export const cartTotals = (items, currency) => ({
  items,
  itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
  subtotal: round2(items.filter((item) => item.available).reduce((sum, item) => sum + item.lineTotal, 0)),
  currency,
});

export const shippingInStoreCurrency = async ({ grpc, address, lines, currency }) => {
  const quote = await grpc.getQuote(
    toGrpcAddress(address),
    lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
  );
  const converted = await grpc.convert(quote.cost_usd, currency);
  return round2(fromMoney(converted));
};
