import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const ordersCreatedTotal = new client.Counter({
  name: 'orders_created_total',
  help: 'Orders received from checkoutservice',
  labelNames: ['result'],
  registers: [register],
});

export const orderStatusChangesTotal = new client.Counter({
  name: 'orders_status_changes_total',
  help: 'Order status changes made from the dashboard',
  labelNames: ['status'],
  registers: [register],
});

export const metricsMiddleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
};
