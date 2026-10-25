import { fetchData } from './http.client.js';
import { cartTotals, shippingInStoreCurrency, toCartLine } from './pricing.js';
import * as redisService from './redis.service.js';
import {
  AUTH_SERVICE_URL,
  ORDERS_SERVICE_URL,
  PAYMENT_SERVICE_URL,
  STORE_CURRENCY,
} from '../config/config.js';
import { ConflictError, ForbiddenError, ValidationError } from '../utils/errors/index.js';
import { fromMoney, round2 } from '../utils/money.js';
import { checkoutTotal } from '../utils/metrics.js';

const LOCK_TTL = 60;

const required = (value, field, max = 255) => {
  const text = String(value ?? '').trim();
  if (!text) throw new ValidationError({ message: `${field} is required` });
  if (text.length > max) throw new ValidationError({ message: `${field} is too long` });
  return text;
};

export const validateAddress = (address) => {
  if (!address || typeof address !== 'object') throw new ValidationError({ message: 'Shipping address is required' });
  return {
    streetAddress: required(address.streetAddress, 'Street address'),
    city: required(address.city, 'City', 100),
    state: String(address.state ?? '').trim().slice(0, 100),
    country: required(address.country, 'Country', 100),
    zipCode: String(address.zipCode ?? '').trim().slice(0, 20),
  };
};

export const validatePhone = (phone) => {
  const value = String(phone ?? '').trim();
  if (!/^[0-9+\-\s]{8,16}$/.test(value)) throw new ValidationError({ message: 'Please enter a valid phone number' });
  return value;
};

const internal = { internal: true };

export const createCheckoutService = ({ grpc, cartService }) => {
  // the cart as a priced order: lines + shipping + total, all in the store currency
  const priceCart = async ({ cartId, address }) => {
    const rows = await cartService.withProducts(await cartService.readLines(cartId));
    const items = rows.map(toCartLine).filter((item) => item.available);

    if (!items.length) throw new ValidationError({ message: 'Your cart is empty' });
    const soldOut = items.find((item) => !item.inStock);
    if (soldOut) throw new ConflictError({ message: `${soldOut.name} is out of stock or has less stock than your quantity` });

    const totals = cartTotals(items, STORE_CURRENCY);
    const shipping = await shippingInStoreCurrency({ grpc, address, lines: items, currency: STORE_CURRENCY });
    return { items, subtotal: totals.subtotal, shipping, total: round2(totals.subtotal + shipping), currency: STORE_CURRENCY };
  };

  const quote = async ({ cartId, address }) => {
    const { items, ...prices } = await priceCart({ cartId, address: validateAddress(address) });
    return prices;
  };

  const start = async ({ auth, body }) => {
    const shippingAddress = validateAddress(body.shippingAddress);
    const customerName = required(body.customerName, 'Name', 120);
    const customerPhone = validatePhone(body.customerPhone);

    const { user } = await fetchData(AUTH_SERVICE_URL, '/api/users/me', {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const priced = await priceCart({ cartId: auth.id, address: shippingAddress });

    const lines = priced.items.map((item) => ({ name: item.name, price: item.finalPrice, quantity: item.quantity }));
    if (priced.shipping > 0) lines.push({ name: 'Shipping', price: priced.shipping, quantity: 1 });

    const { payment } = await fetchData(PAYMENT_SERVICE_URL, '/api/payments/intents', {
      ...internal,
      method: 'POST',
      json: {
        userId: auth.id,
        amount: round2(lines.reduce((sum, line) => sum + line.price * line.quantity, 0)),
        currency: priced.currency,
        items: lines,
        customer: {
          name: customerName,
          email: user.email,
          phone: customerPhone,
          address: `${shippingAddress.streetAddress}, ${shippingAddress.city}`,
        },
        metadata: { shippingAddress, customerName, customerPhone, email: user.email },
      },
    });

    checkoutTotal.inc({ step: 'start', result: 'ok' });
    return {
      intentId: payment.intentId,
      paymentUrl: payment.paymentUrl,
      amount: payment.amount,
      currency: payment.currency,
      mock: payment.mock,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
    };
  };

  const getIntent = async ({ intentId, refresh = false }) => {
    const { payment } = await fetchData(PAYMENT_SERVICE_URL, `/api/payments/intents/${encodeURIComponent(intentId)}${refresh ? '?refresh=true' : ''}`, internal);
    return payment;
  };

  const loadOrder = async (orderId) => {
    const { order } = await fetchData(ORDERS_SERVICE_URL, `/api/orders/${encodeURIComponent(orderId)}`, internal);
    return order;
  };

  // Writes the address and the payment into the order that checkoutservice recorded.
  // If checkoutservice could not record it (it only tries once), we create it here.
  const saveOrderDetails = async ({ result, intent, payment }) => {
    const details = {
      customerName: intent.metadata.customerName,
      customerPhone: intent.metadata.customerPhone,
      shippingAddress: intent.metadata.shippingAddress,
      payment: { provider: intent.provider, reference: intent.reference, status: 'paid' },
    };

    try {
      await fetchData(ORDERS_SERVICE_URL, `/api/orders/${encodeURIComponent(result.order.order_id)}/details`, { ...internal, method: 'PATCH', json: details });
    } catch (error) {
      if (error.statusCode !== 404) throw error;
      const order = result.order;
      const itemsTotal = (order.items || []).reduce((sum, item) => sum + fromMoney(item.cost) * Number(item.item.quantity), 0);
      await fetchData(ORDERS_SERVICE_URL, '/api/orders', {
        method: 'POST',
        json: {
          order_id: order.order_id,
          user_id: intent.userId,
          email: intent.metadata.email,
          tracking_id: order.shipping_tracking_id,
          currency: payment.currency,
          total: round2(itemsTotal + fromMoney(order.shipping_cost)),
          items: (order.items || []).map((item) => ({ product_id: item.item.product_id, quantity: Number(item.item.quantity) })),
          customerName: details.customerName,
          customerPhone: details.customerPhone,
          shippingAddress: details.shippingAddress,
          payment: details.payment,
        },
      });
    }
  };

  // Called by the browser (polling) and by paymentservice (when the payment is confirmed).
  // It is safe to call many times: one payment creates one order.
  const processPayment = async ({ intentId, userId, refresh = false }) => {
    let payment = await getIntent({ intentId, refresh });
    if (userId && payment.userId !== userId) throw new ForbiddenError({ message: 'This payment is not yours' });

    if (payment.orderId) return { status: 'completed', orderId: payment.orderId, order: await loadOrder(payment.orderId) };
    if (payment.status === 'failed') return { status: 'failed', message: 'The payment failed' };
    if (payment.status !== 'paid') return { status: 'pending' };

    const lockKey = `checkout::lock::${intentId}`;
    if (!(await redisService.setIfAbsent({ key: lockKey, ttl: LOCK_TTL }))) return { status: 'processing' };

    try {
      // the order may have been created by another caller while we waited for the lock
      payment = await getIntent({ intentId });
      if (payment.orderId) return { status: 'completed', orderId: payment.orderId, order: await loadOrder(payment.orderId) };

      const { shippingAddress, email } = payment.metadata;
      const response = await grpc.placeOrder({
        user_id: payment.userId,
        user_currency: payment.currency,
        address: {
          street_address: shippingAddress.streetAddress,
          city: shippingAddress.city,
          state: shippingAddress.state || '',
          country: shippingAddress.country,
          zip_code: Number(shippingAddress.zipCode) || 0,
        },
        email,
        // checkoutservice still sends a "credit card" to paymentservice.
        // The number is our payment id, and paymentservice only checks that it was paid.
        credit_card: {
          credit_card_number: intentId,
          credit_card_cvv: 0,
          credit_card_expiration_year: 2099,
          credit_card_expiration_month: 12,
        },
      });

      const orderId = response.order.order_id;
      await saveOrderDetails({ result: response, intent: payment, payment });
      await fetchData(PAYMENT_SERVICE_URL, `/api/payments/intents/${encodeURIComponent(intentId)}/order`, { ...internal, method: 'POST', json: { orderId } });

      checkoutTotal.inc({ step: 'order', result: 'ok' });
      return { status: 'completed', orderId, order: await loadOrder(orderId) };
    } catch (error) {
      checkoutTotal.inc({ step: 'order', result: 'error' });
      await redisService.deleteKey(lockKey);
      console.error(`Could not create the order for payment ${intentId}: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  };

  return { priceCart, quote, start, getIntent, processPayment };
};
