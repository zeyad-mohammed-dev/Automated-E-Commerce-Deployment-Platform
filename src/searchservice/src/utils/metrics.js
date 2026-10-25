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

export const catalogEventsTotal = new client.Counter({
  name: 'search_catalog_events_total',
  help: 'Catalog events received from Redis',
  labelNames: ['type', 'result'],
  registers: [register],
});

export const syncTotal = new client.Counter({
  name: 'search_full_sync_total',
  help: 'Full syncs from the catalog service',
  labelNames: ['result'],
  registers: [register],
});

export const indexedProducts = new client.Gauge({
  name: 'search_indexed_products',
  help: 'Products in the search index',
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
