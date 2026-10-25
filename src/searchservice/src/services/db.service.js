export const aggregate = async ({ model, pipeline }) => {
  return await model.aggregate(pipeline);
};

export const countDocuments = async ({ model, filter = {} }) => {
  return await model.countDocuments(filter);
};

export const bulkWrite = async ({ model, operations = [], options = {} }) => {
  if (!operations.length) return null;
  return await model.bulkWrite(operations, options);
};

export const deleteMany = async ({ model, filter = {} }) => {
  return await model.deleteMany(filter);
};

export const find = async ({ model, filter = {}, options = {} }) => {
  let query = model.find(filter, options.projection);
  if (options.sort) query = query.sort(options.sort);
  if (options.limit) query = query.limit(options.limit);
  if (options.lean) query = query.lean();
  return await query;
};
