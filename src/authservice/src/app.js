import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import colors from 'colors';
import { PORT, NODE_ENV } from './config/config.js';
import { connectDB } from './db/mongo.connection.db.js';
import { connectRedis, redisClient } from './db/redis.connection.db.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';
import { ensureAdmin } from './services/auth.service.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    return res.status(mongoReady ? 200 : 503).json({
      status: mongoReady ? 'ok' : 'unavailable',
      service: 'authservice',
      redis: redisClient.isReady ? 'connected' : 'disconnected',
    });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectDB();
  await connectRedis();

  const admin = await ensureAdmin();
  if (admin) console.log(colors.bgMagenta(`Admin account is ready: ${admin.email}`));

  const httpServer = createApp().listen(PORT, () => {
    console.log(colors.bgBlue(`Server is running on port ${PORT} 🚀`));
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    httpServer.close();
    await mongoose.disconnect();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
