import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import colors from 'colors';
import { PORT, NODE_ENV } from './config/config.js';
import { connectDB } from './db/mongo.connection.db.js';
import { connectRedis, redisSubscriber } from './db/redis.connection.db.js';
import searchRoutes from './routes/search.routes.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';
import { startSync, syncState } from './services/sync.service.js';
import { countIndexed } from './services/search.service.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    const body = {
      status: mongoReady ? 'ok' : 'unavailable',
      service: 'searchservice',
      redis: redisSubscriber.isReady ? 'connected' : 'disconnected',
      lastSyncAt: syncState.lastSyncAt,
      lastSyncOk: syncState.lastSyncOk,
    };
    if (mongoReady) body.products = await countIndexed();
    return res.status(mongoReady ? 200 : 503).json(body);
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use('/api/search', searchRoutes);

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectDB();
  await connectRedis();

  const httpServer = createApp().listen(PORT, () => {
    console.log(colors.bgBlue(`Server is running on port ${PORT} 🚀`));
  });

  const syncTimer = await startSync();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    if (syncTimer) clearInterval(syncTimer);
    httpServer.close();
    await mongoose.disconnect();
    if (redisSubscriber.isOpen) await redisSubscriber.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
