import { Readable } from 'node:stream';
import { callService } from './http.client.js';

// Sends the request to another service and returns its answer as it is.
// A json body is sent again, a file upload (multipart) is streamed without being read.
export const proxyTo = (baseUrl, { internal = false, rewrite = (path) => path, forwardAuth = true } = {}) => {
  return async (req, res, next) => {
    try {
      const headers = {};
      if (forwardAuth && req.headers.authorization) headers.Authorization = req.headers.authorization;

      const isJson = req.is('application/json');
      const hasStream = !isJson && ['POST', 'PUT', 'PATCH'].includes(req.method) && Number(req.headers['content-length'] || 0) > 0;
      if (hasStream && req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

      const response = await callService(baseUrl, rewrite(req.originalUrl), {
        method: req.method,
        headers,
        internal,
        json: isJson && req.body !== undefined && req.method !== 'GET' ? req.body : undefined,
        stream: hasStream ? req : undefined,
        timeoutMs: 30000,
      });

      res.status(response.status);
      const type = response.headers.get('content-type');
      if (type) res.set('Content-Type', type);
      const cache = response.headers.get('cache-control');
      if (cache) res.set('Cache-Control', cache);
      Readable.fromWeb(response.body).pipe(res);
    } catch (error) {
      next(error);
    }
  };
};
