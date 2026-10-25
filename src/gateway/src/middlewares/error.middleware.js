export const notFoundMiddleware = (req, res) => {
  return res.status(404).json({ success: false, message: 'Route not found' });
};

export const globalErrorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong';

  if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid id';
  } else if (error.name === 'ValidationError' && error.errors) {
    statusCode = 400;
    message = Object.values(error.errors).map((item) => item.message).join(', ');
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'Resource already exists';
  } else if (error.name === 'MulterError') {
    statusCode = 400;
  }

  if (statusCode === 500) console.error(error);

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error' : message,
  });
};
