import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import colors from 'colors';
import { PORT, NODE_ENV } from './config/config.js';
import { connectRedis, redisClient } from './db/redis.connection.db.js';
import { createGrpcClients } from './grpc/clients.js';
import { createCartService } from './services/cart.service.js';
import { createCheckoutService } from './services/checkout.service.js';
import { createRoutes } from './routes/index.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';

export const createApp = ({ grpc = createGrpcClients() } = {}) => {
  const app = express();
  const cartService = createCartService({ grpc });
  const checkoutService = createCheckoutService({ grpc, cartService });

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    const ready = redisClient.isReady;
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', service: 'gateway' });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use(createRoutes({ grpc, cartService, checkoutService }));

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectRedis();

  const grpc = createGrpcClients();
  const httpServer = createApp({ grpc }).listen(PORT, () => {
    console.log(colors.bgBlue(`Server is running on port ${PORT} 🚀`));
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    httpServer.close();
    grpc.close();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
