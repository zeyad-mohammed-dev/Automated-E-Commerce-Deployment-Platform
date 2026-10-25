import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import colors from 'colors';
import { PORT, HTTP_PORT, NODE_ENV, PAYMENT_PROVIDER } from './config/config.js';
import { connectRedis, redisClient } from './db/redis.connection.db.js';
import paymentRoutes from './routes/payment.routes.js';
import { globalErrorHandler, notFoundMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware, register } from './utils/metrics.js';
import { createPaymentServer, startGrpcServer } from './grpc/payment.grpc.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(metricsMiddleware);
  if (NODE_ENV !== 'test') app.use(morgan('dev'));
  // the webhook signature is checked against the exact bytes Stripe sent
  app.use(express.json({ limit: '100kb', verify: (req, res, buffer) => { req.rawBody = buffer; } }));

  app.get('/health', (req, res) => {
    const ready = redisClient.isReady;
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      service: 'paymentservice',
      provider: PAYMENT_PROVIDER,
    });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    return res.send(await register.metrics());
  });

  app.use('/api/payments', paymentRoutes);

  app.all('{*path}', notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
};

export const bootstrap = async () => {
  await connectRedis();
  console.log(colors.bgYellow(`Payment provider: ${PAYMENT_PROVIDER}`));

  const grpcServer = createPaymentServer();
  await startGrpcServer(grpcServer, PORT);
  console.log(colors.bgBlue(`gRPC server is running on port ${PORT} 🚀`));

  const httpServer = createApp().listen(HTTP_PORT, () => {
    console.log(colors.bgBlue(`REST server is running on port ${HTTP_PORT} 🚀`));
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    httpServer.close();
    grpcServer.tryShutdown(() => {});
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
