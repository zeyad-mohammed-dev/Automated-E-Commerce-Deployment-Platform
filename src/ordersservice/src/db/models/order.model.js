import { DataTypes } from 'sequelize';
import { sequelize } from '../sequelize.connection.db.js';

const money = (field) => ({
  type: DataTypes.DECIMAL(12, 2),
  // pg returns DECIMAL as a string
  get() {
    const value = this.getDataValue(field);
    return value === null || value === undefined ? null : Number(value);
  },
});

export const orderStatusEnum = {
  processing: 'processing',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export const OrderModel = sequelize.define(
  'Order',
  {
    orderId: { type: DataTypes.STRING(64), primaryKey: true, field: 'order_id' },
    userId: { type: DataTypes.STRING(64), field: 'user_id' },
    email: { type: DataTypes.STRING(255) },
    trackingId: { type: DataTypes.STRING(64), field: 'tracking_id' },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'EGP' },
    total: { ...money('total'), allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM(...Object.values(orderStatusEnum)),
      allowNull: false,
      defaultValue: orderStatusEnum.processing,
    },
    customerName: { type: DataTypes.STRING(255), field: 'customer_name' },
    customerPhone: { type: DataTypes.STRING(32), field: 'customer_phone' },
    shippingAddress: { type: DataTypes.JSONB, field: 'shipping_address' },
    paymentProvider: { type: DataTypes.STRING(32), field: 'payment_provider' },
    paymentReference: { type: DataTypes.STRING(128), field: 'payment_reference' },
    paymentStatus: { type: DataTypes.STRING(32), field: 'payment_status' },
  },
  {
    tableName: 'orders',
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['tracking_id'] },
    ],
  },
);

export const OrderItemModel = sequelize.define(
  'OrderItem',
  {
    productId: { type: DataTypes.STRING(64), allowNull: false, field: 'product_id' },
    name: { type: DataTypes.STRING(255) },
    picture: { type: DataTypes.STRING(512) },
    quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    unitPrice: { ...money('unitPrice'), field: 'unit_price' },
  },
  { tableName: 'order_items', underscored: true, timestamps: false, indexes: [{ fields: ['order_id'] }] },
);

export const OrderStatusHistoryModel = sequelize.define(
  'OrderStatusHistory',
  {
    status: { type: DataTypes.STRING(16), allowNull: false },
    note: { type: DataTypes.STRING(500) },
  },
  {
    tableName: 'order_status_history',
    underscored: true,
    updatedAt: false,
    indexes: [{ fields: ['order_id'] }],
  },
);

OrderModel.hasMany(OrderItemModel, { as: 'items', foreignKey: { name: 'orderId', field: 'order_id', allowNull: false }, onDelete: 'CASCADE' });
OrderItemModel.belongsTo(OrderModel, { foreignKey: { name: 'orderId', field: 'order_id' } });

OrderModel.hasMany(OrderStatusHistoryModel, { as: 'history', foreignKey: { name: 'orderId', field: 'order_id', allowNull: false }, onDelete: 'CASCADE' });
OrderStatusHistoryModel.belongsTo(OrderModel, { foreignKey: { name: 'orderId', field: 'order_id' } });
