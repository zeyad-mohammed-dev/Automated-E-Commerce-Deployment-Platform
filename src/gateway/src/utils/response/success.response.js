export const successResponse = ({
  res,
  message = 'Done',
  data = {},
  statusCode = 200,
}) => {
  return res.status(statusCode).json({ success: true, message, data });
};
