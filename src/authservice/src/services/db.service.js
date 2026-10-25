export const find = async ({ model, filter = {}, options = {} }) => {
  let query = model.find(filter, options.projection);
  if (options.sort) query = query.sort(options.sort);
  if (options.skip) query = query.skip(options.skip);
  if (options.limit) query = query.limit(options.limit);
  if (options.populate) query = query.populate(options.populate);
  if (options.lean) query = query.lean();
  return await query;
};

export const findOne = async ({ model, filter = {}, options = {} }) => {
  let query = model.findOne(filter, options.projection);
  if (options.populate) query = query.populate(options.populate);
  if (options.lean) query = query.lean();
  return await query;
};

export const findById = async ({ model, id, options = {} }) => {
  let query = model.findById(id, options.projection);
  if (options.populate) query = query.populate(options.populate);
  if (options.lean) query = query.lean();
  return await query;
};

export const create = async ({ model, data }) => {
  return await model.create(data);
};

export const findOneAndUpdate = async ({
  model,
  filter = {},
  update = {},
  options = {},
}) => {
  let query = model.findOneAndUpdate(filter, update, {
    new: true,
    runValidators: true,
    ...options,
  });
  if (options.populate) query = query.populate(options.populate);
  return await query;
};

export const countDocuments = async ({ model, filter = {} }) => {
  return await model.countDocuments(filter);
};

export const bulkWrite = async ({ model, operations = [] }) => {
  if (!operations.length) return null;
  return await model.bulkWrite(operations);
};

export const updateOne = async ({ model, filter = {}, update = {} }) => {
  return await model.updateOne(filter, update, { runValidators: true });
};
