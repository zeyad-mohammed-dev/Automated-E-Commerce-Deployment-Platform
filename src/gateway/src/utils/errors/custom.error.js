import { AppError } from './app.error.js';

export class ValidationError extends AppError {
  constructor({ message = 'Validation failed' } = {}) {
    super({ message, statusCode: 400 });
  }
}

export class UnauthorizedError extends AppError {
  constructor({ message = 'Unauthorized' } = {}) {
    super({ message, statusCode: 401 });
  }
}

export class NotFoundError extends AppError {
  constructor({ message = 'Resource not found' } = {}) {
    super({ message, statusCode: 404 });
  }
}

export class ConflictError extends AppError {
  constructor({ message = 'Resource already exists' } = {}) {
    super({ message, statusCode: 409 });
  }
}

export class BadGatewayError extends AppError {
  constructor({ message = 'A service is not available' } = {}) {
    super({ message, statusCode: 502 });
  }
}

export class ForbiddenError extends AppError {
  constructor({ message = 'Forbidden' } = {}) {
    super({ message, statusCode: 403 });
  }
}
