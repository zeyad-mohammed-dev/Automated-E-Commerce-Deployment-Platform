import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { PORT, NODE_ENV } from './config/config.js';
import { sequelize, connectDB } from './db/sequelize.connection.db.js';
import orderRoutes from './routes/order.routes.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (req, res) => {
    try {
      await sequelize.authenticate();
      return res.json({ status: 'ok', service: 'ordersservice' });
    } catch (error) {
      return res.status(503).json({ status: 'unavailable', service: 'ordersservice' });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use('/api/orders', orderRoutes);

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectDB();

  const httpServer = createApp().listen(PORT, () => {
    console.log(`Server is running on port ${PORT} 🚀`);
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    httpServer.close();
    await sequelize.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
