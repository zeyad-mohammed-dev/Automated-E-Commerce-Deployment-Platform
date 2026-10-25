export const notFoundMiddleware = (req, res) => {
  return res.status(404).json({ success: false, message: 'Route not found' });
};

export const globalErrorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong';

  if (error.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    message = 'Resource already exists';
  } else if (error.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = error.errors.map((item) => item.message).join(', ');
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON body';
  }

  if (statusCode === 500) console.error(error);

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error' : message,
  });
};
