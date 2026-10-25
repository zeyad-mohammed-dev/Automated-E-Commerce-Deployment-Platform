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

export const checkoutTotal = new client.Counter({
  name: 'gateway_checkout_total',
  help: 'Checkout steps',
  labelNames: ['step', 'result'],
  registers: [register],
});

export const metricsMiddleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
};
