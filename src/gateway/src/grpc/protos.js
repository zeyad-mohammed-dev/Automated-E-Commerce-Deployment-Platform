import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoDir = path.join(__dirname, '../../proto');

const loadOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const load = (file) => {
  return grpc.loadPackageDefinition(
    protoLoader.loadSync(path.join(protoDir, file), loadOptions),
  );
};

export const hipstershop = load('demo.proto').hipstershop;
export const health = load('grpc/health/v1/health.proto').grpc.health.v1;
