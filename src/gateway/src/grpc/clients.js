import * as grpc from '@grpc/grpc-js';
import { hipstershop } from './protos.js';
import {
  CART_SERVICE_ADDR,
  CHECKOUT_SERVICE_ADDR,
  CURRENCY_SERVICE_ADDR,
  RECOMMENDATION_SERVICE_ADDR,
  SHIPPING_SERVICE_ADDR,
} from '../config/config.js';
import { BadGatewayError, ValidationError } from '../utils/errors/index.js';

// turns "client.Method(request, callback)" into a promise with a deadline
const promisify = (client, method, request, timeoutMs) =>
  new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + timeoutMs }, (error, response) => {
      if (!error) return resolve(response);
      if (error.code === grpc.status.INVALID_ARGUMENT || error.code === grpc.status.FAILED_PRECONDITION) {
        return reject(new ValidationError({ message: error.details || error.message }));
      }
      reject(new BadGatewayError({ message: `${method} failed: ${error.details || error.message}` }));
    });
  });

const build = (Service, address) => new Service(address, grpc.credentials.createInsecure());

export const createGrpcClients = (addresses = {}) => {
  const cart = build(hipstershop.CartService, addresses.cart ?? CART_SERVICE_ADDR);
  const checkout = build(hipstershop.CheckoutService, addresses.checkout ?? CHECKOUT_SERVICE_ADDR);
  const shipping = build(hipstershop.ShippingService, addresses.shipping ?? SHIPPING_SERVICE_ADDR);
  const currency = build(hipstershop.CurrencyService, addresses.currency ?? CURRENCY_SERVICE_ADDR);
  const recommendation = build(hipstershop.RecommendationService, addresses.recommendation ?? RECOMMENDATION_SERVICE_ADDR);

  return {
    getCart: (userId) => promisify(cart, 'GetCart', { user_id: userId }, 3000),
    addItem: (userId, productId, quantity) =>
      promisify(cart, 'AddItem', { user_id: userId, item: { product_id: productId, quantity } }, 3000),
    emptyCart: (userId) => promisify(cart, 'EmptyCart', { user_id: userId }, 3000),
    getQuote: (address, items) => promisify(shipping, 'GetQuote', { address, items }, 3000),
    convert: (from, toCode) => promisify(currency, 'Convert', { from, to_code: toCode }, 3000),
    placeOrder: (request) => promisify(checkout, 'PlaceOrder', request, 30000),
    listRecommendations: (userId, productIds) =>
      promisify(recommendation, 'ListRecommendations', { user_id: userId, product_ids: productIds }, 3000),
    close: () => [cart, checkout, shipping, currency, recommendation].forEach((client) => client.close()),
  };
};
