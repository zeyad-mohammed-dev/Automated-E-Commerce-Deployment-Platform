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

export const intentsTotal = new client.Counter({
  name: 'payments_intents_total',
  help: 'Payment intents created',
  labelNames: ['result'],
  registers: [register],
});

export const paymentsPaidTotal = new client.Counter({
  name: 'payments_paid_total',
  help: 'Payments confirmed as paid',
  labelNames: ['source'],
  registers: [register],
});

export const chargesTotal = new client.Counter({
  name: 'payments_charge_total',
  help: 'Charge calls from checkoutservice',
  labelNames: ['result'],
  registers: [register],
});

export const grpcDuration = new client.Histogram({
  name: 'grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
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
