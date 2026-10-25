import * as grpc from '@grpc/grpc-js';
import { hipstershop, health } from './protos.js';
import { toMoney, finalPriceOf } from '../utils/money.js';
import { grpcDuration } from '../utils/metrics.js';

export const toGrpcProduct = ({ product, usdRate }) => {
  const finalPrice = finalPriceOf({
    price: product.price,
    discountPercent: product.discountPercent,
  });

  return {
    id: String(product._id),
    name: product.name,
    description: product.description || '',
    picture: product.images?.[0] || '',
    price_usd: toMoney({ amount: finalPrice * usdRate, currencyCode: 'USD' }),
    categories: product.category?.slug ? [product.category.slug] : [],
  };
};

// handler(call) -> response, wrapped with status codes and metrics
const wrap = (name, handler) => async (call, callback) => {
  const end = grpcDuration.startTimer({ method: name });
  try {
    const response = await handler(call);
    end({ status: 'OK' });
    callback(null, response);
  } catch (error) {
    const code = error.grpcCode ?? grpc.status.INTERNAL;
    end({ status: grpc.status[code] });
    callback({ code, message: error.message });
  }
};

class GrpcError extends Error {
  constructor(code, message) {
    super(message);
    this.grpcCode = code;
  }
}

export const createCatalogServer = ({ productService, usdRates }) => {
  const server = new grpc.Server();

  const rateOrFail = async () => {
    try {
      return await usdRates.getUsdRate();
    } catch (error) {
      throw new GrpcError(grpc.status.UNAVAILABLE, 'currency rate is not available');
    }
  };

  server.addService(hipstershop.ProductCatalogService.service, {
    ListProducts: wrap('ListProducts', async () => {
      const [products, usdRate] = await Promise.all([
        productService.listAllProducts(),
        rateOrFail(),
      ]);
      return { products: products.map((product) => toGrpcProduct({ product, usdRate })) };
    }),

    GetProduct: wrap('GetProduct', async (call) => {
      const product = await productService.findProductForGrpc(call.request.id);
      if (!product) {
        throw new GrpcError(grpc.status.NOT_FOUND, `no product with ID ${call.request.id}`);
      }
      return toGrpcProduct({ product, usdRate: await rateOrFail() });
    }),

    SearchProducts: wrap('SearchProducts', async (call) => {
      const [products, usdRate] = await Promise.all([
        productService.searchProducts(call.request.query),
        rateOrFail(),
      ]);
      return { results: products.map((product) => toGrpcProduct({ product, usdRate })) };
    }),
  });

  server.addService(health.Health.service, {
    Check: (call, callback) => callback(null, { status: 'SERVING' }),
    Watch: (call) =>
      call.emit('error', { code: grpc.status.UNIMPLEMENTED, message: 'Watch is not implemented' }),
  });

  return server;
};

export const startGrpcServer = (server, port) => {
  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) return reject(error);
      resolve(boundPort);
    });
  });
};
