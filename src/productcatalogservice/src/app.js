import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import colors from 'colors';
import {
  PORT,
  HTTP_PORT,
  NODE_ENV,
  STORAGE_DRIVER,
  UPLOAD_DIR,
} from './config/config.js';
import { connectDB } from './db/mongo.connection.db.js';
import { connectRedis, redisClient } from './db/redis.connection.db.js';
import productRoutes from './routes/product.routes.js';
import categoryRoutes from './routes/category.routes.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';
import { createCatalogServer, startGrpcServer } from './grpc/catalog.grpc.js';
import { createCurrencyClient, createUsdRates } from './services/currency.client.js';
import * as productService from './services/product.service.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(UPLOAD_DIR));
  }

  app.get('/health', (req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    return res.status(mongoReady ? 200 : 503).json({
      status: mongoReady ? 'ok' : 'unavailable',
      service: 'productcatalogservice',
    });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectDB();
  await connectRedis();

  const currencyClient = createCurrencyClient();
  const usdRates = createUsdRates({ currencyClient });

  const grpcServer = createCatalogServer({ productService, usdRates });
  await startGrpcServer(grpcServer, PORT);
  console.log(colors.bgBlue(`gRPC server is running on port ${PORT} 🚀`));

  const httpServer = createApp().listen(HTTP_PORT, () => {
    console.log(colors.bgBlue(`REST server is running on port ${HTTP_PORT} 🚀`));
  });

  // let in-flight requests finish before the pod stops
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    httpServer.close();
    grpcServer.tryShutdown(() => {});
    currencyClient.close();
    await mongoose.disconnect();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
