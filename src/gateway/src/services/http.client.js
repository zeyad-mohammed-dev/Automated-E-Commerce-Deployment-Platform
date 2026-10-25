import { Readable } from 'node:stream';
import { INTERNAL_API_KEY } from '../config/config.js';
import { BadGatewayError } from '../utils/errors/index.js';

const internalHeaders = () => (INTERNAL_API_KEY ? { 'x-internal-key': INTERNAL_API_KEY } : {});

// Calls another service and keeps its status code and its message.
// A 4xx from the service is the answer for the user, anything else is a bad gateway.
export const callService = async (baseUrl, path, { method = 'GET', json, headers = {}, internal = false, stream, timeoutMs = 10000 } = {}) => {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(internal ? internalHeaders() : {}),
        ...headers,
      },
      body: stream ? Readable.toWeb(stream) : json !== undefined ? JSON.stringify(json) : undefined,
      ...(stream ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new BadGatewayError({ message: `Could not reach the service: ${error.message}` });
  }
  return response;
};

export const readJson = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    // not json
  }
  return body;
};

// -> the "data" of a {success, message, data} answer, or throws with the service message
export const fetchData = async (baseUrl, path, options = {}) => {
  const response = await callService(baseUrl, path, options);
  const body = await readJson(response);

  if (!response.ok) {
    const error = new Error(body?.message || 'Request failed');
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.isOperational = true;
    throw error;
  }
  return body?.data ?? {};
};
