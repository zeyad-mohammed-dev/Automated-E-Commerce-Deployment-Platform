import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.connection.db.js';
import {
  OrderModel,
  OrderItemModel,
  OrderStatusHistoryModel,
  orderStatusEnum,
} from '../db/models/order.model.js';
import { createCatalogClient } from './catalog.client.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors/index.js';

const defaultCatalog = createCatalogClient();

const MAX_LIMIT = 100;

// what an admin can do next with an order
export const statusTransitions = {
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const text = (value, field, max) => {
  if (value === undefined || value === null || value === '') return undefined;
  const result = String(value).trim();
  if (result.length > max) {
    throw new ValidationError({ message: `${field} is too long` });
  }
  return result || undefined;
};

const escapeLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

// the address can come with snake_case keys (from the old contract) or camelCase
export const normalizeAddress = (address) => {
  if (!address) return undefined;
  if (typeof address !== 'object' || Array.isArray(address)) {
    throw new ValidationError({ message: 'shipping address must be an object' });
  }
  const result = {
    streetAddress: text(address.streetAddress ?? address.street_address, 'streetAddress', 255),
    city: text(address.city, 'city', 100),
    state: text(address.state, 'state', 100),
    country: text(address.country, 'country', 100),
    zipCode: text(address.zipCode ?? address.zip_code, 'zipCode', 20),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
};

const positiveInt = (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new ValidationError({ message: `${field} must be a positive integer` });
  }
  return number;
};

const money = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ValidationError({ message: `${field} must be a positive number` });
  }
  return Math.round(number * 100) / 100;
};

// POST /api/orders keeps the snake_case body that checkoutservice sends
export const normalizeCreateBody = (body = {}) => {
  const orderId = text(body.order_id ?? body.orderId, 'order_id', 64);
  if (!orderId) throw new ValidationError({ message: 'order_id and items are required' });

  const items = body.items;
  if (!Array.isArray(items) || !items.length) {
    throw new ValidationError({ message: 'order_id and items are required' });
  }

  const payment = body.payment || {};

  return {
    orderId,
    userId: text(body.user_id ?? body.userId, 'user_id', 64),
    email: text(body.email, 'email', 255)?.toLowerCase(),
    trackingId: text(body.tracking_id ?? body.trackingId, 'tracking_id', 64),
    currency: text(body.currency, 'currency', 8) || 'EGP',
    total: body.total === undefined ? 0 : money(body.total, 'total'),
    customerName: text(body.customer_name ?? body.customerName, 'customer_name', 255),
    customerPhone: text(body.customer_phone ?? body.customerPhone, 'customer_phone', 32),
    shippingAddress: normalizeAddress(body.shipping_address ?? body.shippingAddress),
    paymentProvider: text(payment.provider, 'payment.provider', 32),
    paymentReference: text(payment.reference, 'payment.reference', 128),
    paymentStatus: text(payment.status, 'payment.status', 32),
    items: items.map((item) => ({
      productId: text(item.product_id ?? item.productId, 'product_id', 64),
      quantity: positiveInt(item.quantity, 'quantity'),
      name: text(item.name, 'name', 255),
      picture: text(item.picture, 'picture', 512),
      unitPrice: item.unitPrice === undefined ? undefined : money(item.unitPrice, 'unitPrice'),
    })),
  };
};

export const serializeOrder = (order) => {
  const plain = order.toJSON();
  return {
    orderId: plain.orderId,
    userId: plain.userId,
    email: plain.email,
    trackingId: plain.trackingId,
    currency: plain.currency,
    total: plain.total,
    status: plain.status,
    customerName: plain.customerName,
    customerPhone: plain.customerPhone,
    shippingAddress: plain.shippingAddress,
    payment: {
      provider: plain.paymentProvider,
      reference: plain.paymentReference,
      status: plain.paymentStatus,
    },
    items: (plain.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      picture: item.picture,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice === null ? null : Math.round(item.unitPrice * item.quantity * 100) / 100,
    })),
    ...(plain.history && {
      history: plain.history.map((entry) => ({
        status: entry.status,
        note: entry.note,
        createdAt: entry.createdAt,
      })),
    }),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const withDetails = () => [
  { model: OrderItemModel, as: 'items' },
  { model: OrderStatusHistoryModel, as: 'history' },
];

const historyOrder = [[{ model: OrderStatusHistoryModel, as: 'history' }, 'createdAt', 'ASC']];

const findOrderOrFail = async (orderId, options = {}) => {
  const order = await OrderModel.findByPk(String(orderId), options);
  if (!order) throw new NotFoundError({ message: 'Order not found' });
  return order;
};

export const getOrder = async (orderId) => {
  const order = await findOrderOrFail(orderId, { include: withDetails(), order: historyOrder });
  return serializeOrder(order);
};

// Fills names/prices of the items and updates the stock. Runs after the response is sent,
// because checkoutservice only waits 2 seconds for us.
const finishOrder = async ({ orderId, catalog }) => {
  const items = await OrderItemModel.findAll({ where: { orderId } });

  await Promise.all(
    items
      .filter((item) => !item.name)
      .map(async (item) => {
        const snapshot = await catalog.getProductSnapshot(item.productId);
        if (snapshot) await item.update(snapshot);
      }),
  );

  await catalog.adjustStock({ items, action: 'purchase' });
};

export const createOrder = async ({ body, catalog = defaultCatalog }) => {
  const data = normalizeCreateBody(body);

  const existing = await OrderModel.findByPk(data.orderId);
  if (existing) throw new ConflictError({ message: 'Order already exists' });

  const { items, ...orderData } = data;
  await sequelize.transaction(async (transaction) => {
    await OrderModel.create(
      {
        ...orderData,
        items,
        history: [{ status: orderStatusEnum.processing, note: 'Order placed' }],
      },
      { include: withDetails(), transaction },
    );
  });

  const background = finishOrder({ orderId: data.orderId, catalog }).catch((error) => {
    console.error(`Could not finish order ${data.orderId}: ${error.message}`);
  });

  return { order: await getOrder(data.orderId), background };
};

export const getOrders = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), MAX_LIMIT);

  const where = {};
  const userId = query.userId ?? query.user_id;
  if (userId) where.userId = String(userId);

  if (query.status) {
    if (!orderStatusEnum[query.status]) throw new ValidationError({ message: 'Invalid status' });
    where.status = query.status;
  }

  if (query.q) {
    const like = `%${escapeLike(String(query.q).trim())}%`;
    where[Op.or] = [
      { orderId: { [Op.iLike]: like } },
      { email: { [Op.iLike]: like } },
      { customerName: { [Op.iLike]: like } },
      { trackingId: { [Op.iLike]: like } },
    ];
  }

  for (const [key, operator] of [['from', Op.gte], ['to', Op.lte]]) {
    if (query[key]) {
      const date = new Date(query[key]);
      if (Number.isNaN(date.getTime())) throw new ValidationError({ message: `${key} is not a valid date` });
      where.createdAt = { ...where.createdAt, [operator]: date };
    }
  }

  const { rows, count } = await OrderModel.findAndCountAll({
    where,
    include: [{ model: OrderItemModel, as: 'items' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return {
    page,
    limit,
    totalCount: count,
    totalPages: Math.ceil(count / limit),
    orders: rows.map(serializeOrder),
  };
};

// Public tracking: the email must match, and a wrong match looks the same as "not found"
export const trackOrder = async ({ orderId, trackingId, email }) => {
  if ((!orderId && !trackingId) || !email) {
    throw new ValidationError({ message: 'Order id (or tracking id) and email are required' });
  }

  const order = await OrderModel.findOne({
    where: orderId ? { orderId: String(orderId) } : { trackingId: String(trackingId) },
    include: withDetails(),
    order: historyOrder,
  });

  if (!order || order.email !== String(email).trim().toLowerCase()) {
    throw new NotFoundError({ message: 'Order not found' });
  }

  const { userId, email: ignoredEmail, payment, customerPhone, ...safe } = serializeOrder(order);
  return safe;
};

export const updateStatus = async ({ orderId, status, note, catalog = defaultCatalog }) => {
  if (!orderStatusEnum[status]) throw new ValidationError({ message: 'Invalid status' });

  const order = await findOrderOrFail(orderId, { include: [{ model: OrderItemModel, as: 'items' }] });

  if (!statusTransitions[order.status].includes(status)) {
    throw new ConflictError({ message: `Cannot change the status from ${order.status} to ${status}` });
  }

  await sequelize.transaction(async (transaction) => {
    await order.update({ status }, { transaction });
    await OrderStatusHistoryModel.create(
      { orderId: order.orderId, status, note: text(note, 'note', 500) },
      { transaction },
    );
  });

  // a cancelled order gives its items back to the stock
  const background =
    status === orderStatusEnum.cancelled
      ? catalog.adjustStock({ items: order.items, action: 'restock' })
      : Promise.resolve();

  return { order: await getOrder(orderId), background };
};

export const updateDetails = async ({ orderId, body = {} }) => {
  const order = await findOrderOrFail(orderId);

  const update = {};
  const address = normalizeAddress(body.shippingAddress);
  if (address) update.shippingAddress = address;
  if (body.customerName !== undefined) update.customerName = text(body.customerName, 'customerName', 255);
  if (body.customerPhone !== undefined) update.customerPhone = text(body.customerPhone, 'customerPhone', 32);

  const payment = body.payment || {};
  if (payment.provider !== undefined) update.paymentProvider = text(payment.provider, 'payment.provider', 32);
  if (payment.reference !== undefined) update.paymentReference = text(payment.reference, 'payment.reference', 128);
  if (payment.status !== undefined) update.paymentStatus = text(payment.status, 'payment.status', 32);

  await sequelize.transaction(async (transaction) => {
    await order.update(update, { transaction });

    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        await OrderItemModel.update(
          {
            ...(item.name !== undefined && { name: text(item.name, 'name', 255) }),
            ...(item.picture !== undefined && { picture: text(item.picture, 'picture', 512) }),
            ...(item.unitPrice !== undefined && { unitPrice: money(item.unitPrice, 'unitPrice') }),
          },
          { where: { orderId: order.orderId, productId: String(item.productId) }, transaction },
        );
      }
    }
  });

  return await getOrder(orderId);
};

const pad = (number) => String(number).padStart(2, '0');
const dayKey = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// one row per day, days without orders count as zero
export const fillDays = ({ rows, days, now = new Date() }) => {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const result = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const key = dayKey(date);
    const row = byDate.get(key);
    result.push({ date: key, orders: row?.orders || 0, revenue: row?.revenue || 0 });
  }
  return result;
};

export const getStats = async ({ days } = {}) => {
  const period = Math.min(Math.max(Number(days) || 30, 1), 365);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (period - 1)));
  const replacements = { since };

  const [totals] = await sequelize.query(
    `SELECT COUNT(*)::int AS "ordersCount",
            COALESCE(SUM(total), 0)::float AS revenue,
            COUNT(DISTINCT user_id)::int AS "customersCount"
     FROM orders WHERE created_at >= :since AND status <> 'cancelled'`,
    { replacements, type: QueryTypes.SELECT },
  );

  const statusRows = await sequelize.query(
    `SELECT status, COUNT(*)::int AS count FROM orders WHERE created_at >= :since GROUP BY status`,
    { replacements, type: QueryTypes.SELECT },
  );
  const byStatus = Object.fromEntries(Object.values(orderStatusEnum).map((status) => [status, 0]));
  for (const row of statusRows) byStatus[row.status] = row.count;

  const dailyRows = await sequelize.query(
    `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS orders,
            COALESCE(SUM(total), 0)::float AS revenue
     FROM orders WHERE created_at >= :since AND status <> 'cancelled'
     GROUP BY 1 ORDER BY 1`,
    { replacements, type: QueryTypes.SELECT },
  );

  const topProducts = await sequelize.query(
    `SELECT oi.product_id AS "productId", MAX(oi.name) AS name, MAX(oi.picture) AS picture,
            SUM(oi.quantity)::int AS quantity,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0)::float AS revenue
     FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
     WHERE o.created_at >= :since AND o.status <> 'cancelled'
     GROUP BY oi.product_id ORDER BY quantity DESC, revenue DESC LIMIT 5`,
    { replacements, type: QueryTypes.SELECT },
  );

  const recent = await OrderModel.findAll({
    include: [{ model: OrderItemModel, as: 'items' }],
    order: [['createdAt', 'DESC']],
    limit: 5,
  });

  return {
    days: period,
    ordersCount: totals.ordersCount,
    revenue: totals.revenue,
    averageOrderValue: totals.ordersCount ? Math.round((totals.revenue / totals.ordersCount) * 100) / 100 : 0,
    customersCount: totals.customersCount,
    byStatus,
    dailySales: fillDays({ rows: dailyRows, days: period, now }),
    topProducts,
    recentOrders: recent.map(serializeOrder),
  };
};
