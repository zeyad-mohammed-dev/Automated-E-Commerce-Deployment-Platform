import { getProduct } from './catalog.client.js';
import { cartTotals, toCartLine } from './pricing.js';
import { STORE_CURRENCY } from '../config/config.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors/index.js';

const MAX_QUANTITY = 99;

const parseQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
    throw new ValidationError({ message: `Quantity must be a whole number up to ${MAX_QUANTITY}` });
  }
  return quantity;
};

export const createCartService = ({ grpc, getProductFn = getProduct }) => {
  const readLines = async (cartId) => {
    const cart = await grpc.getCart(cartId);
    return (cart.items || []).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) }));
  };

  const withProducts = async (lines) =>
    Promise.all(lines.map(async (line) => ({ line, product: await getProductFn(line.productId).catch(() => null) })));

  const replaceLines = async (cartId, lines) => {
    await grpc.emptyCart(cartId);
    for (const line of lines) await grpc.addItem(cartId, line.productId, line.quantity);
  };

  const getView = async (cartId) => {
    const rows = await withProducts(await readLines(cartId));
    return cartTotals(rows.map(toCartLine), STORE_CURRENCY);
  };

  return {
    readLines,
    withProducts,
    getView,

    addItem: async ({ cartId, productId, quantity = 1 }) => {
      const amount = parseQuantity(quantity);
      if (amount < 1) throw new ValidationError({ message: 'Quantity must be at least 1' });

      const product = await getProductFn(String(productId));
      if (!product) throw new NotFoundError({ message: 'Product not found' });

      const current = (await readLines(cartId)).find((line) => line.productId === product._id || line.productId === product.id)?.quantity || 0;
      if (current + amount > MAX_QUANTITY) throw new ConflictError({ message: `You can not have more than ${MAX_QUANTITY} of one product` });
      if (product.stockQuantity < current + amount) throw new ConflictError({ message: 'Not enough stock' });

      await grpc.addItem(cartId, String(product._id || product.id), amount);
      return await getView(cartId);
    },

    // quantity 0 removes the line. The cart service has no "set quantity", so we rebuild it
    setQuantity: async ({ cartId, productId, quantity }) => {
      const amount = parseQuantity(quantity);
      const lines = await readLines(cartId);
      if (!lines.some((line) => line.productId === productId)) throw new NotFoundError({ message: 'Item is not in the cart' });

      if (amount > 0) {
        const product = await getProductFn(productId);
        if (!product) throw new NotFoundError({ message: 'Product not found' });
        if (product.stockQuantity < amount) throw new ConflictError({ message: 'Not enough stock' });
      }

      const next = lines
        .map((line) => (line.productId === productId ? { ...line, quantity: amount } : line))
        .filter((line) => line.quantity > 0);
      await replaceLines(cartId, next);
      return await getView(cartId);
    },

    clear: async (cartId) => {
      await grpc.emptyCart(cartId);
    },

    // after login: the guest cart moves into the user cart (never above the stock)
    merge: async ({ guestCartId, userCartId }) => {
      const guestLines = await readLines(guestCartId);
      const userLines = await readLines(userCartId);

      for (const line of guestLines) {
        const product = await getProductFn(line.productId).catch(() => null);
        if (!product) continue;
        const current = userLines.find((item) => item.productId === line.productId)?.quantity || 0;
        const quantity = Math.min(line.quantity, product.stockQuantity - current, MAX_QUANTITY - current);
        if (quantity > 0) await grpc.addItem(userCartId, line.productId, quantity);
      }
      await grpc.emptyCart(guestCartId);
      return await getView(userCartId);
    },
  };
};
