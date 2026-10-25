import * as grpc from '@grpc/grpc-js';
import { hipstershop, health } from './protos.js';
import { charge } from '../services/charge.service.js';
import { chargesTotal, grpcDuration } from '../utils/metrics.js';

export const createPaymentServer = ({ chargeFn = charge } = {}) => {
  const server = new grpc.Server();

  server.addService(hipstershop.PaymentService.service, {
    Charge: async (call, callback) => {
      const end = grpcDuration.startTimer({ method: 'Charge' });
      try {
        const result = await chargeFn({
          amount: call.request.amount,
          creditCard: call.request.credit_card,
        });
        chargesTotal.inc({ result: 'ok' });
        end({ status: 'OK' });
        callback(null, { transaction_id: result.transactionId });
      } catch (error) {
        const code = error.statusCode >= 500 || !error.statusCode ? grpc.status.INTERNAL : grpc.status.INVALID_ARGUMENT;
        chargesTotal.inc({ result: code === grpc.status.INTERNAL ? 'error' : 'rejected' });
        end({ status: grpc.status[code] });
        callback({ code, message: error.message });
      }
    },
  });

  server.addService(health.Health.service, {
    Check: (call, callback) => callback(null, { status: 'SERVING' }),
    Watch: (call) =>
      call.emit('error', { code: grpc.status.UNIMPLEMENTED, message: 'Watch is not implemented' }),
  });

  return server;
};

export const startGrpcServer = (server, port) => {
  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) return reject(error);
      resolve(boundPort);
    });
  });
};
