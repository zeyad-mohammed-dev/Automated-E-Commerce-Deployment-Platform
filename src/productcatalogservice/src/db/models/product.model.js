import mongoose from 'mongoose';
import { finalPriceOf } from '../../utils/money.js';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    // price and finalPrice are in STORE_CURRENCY (EGP)
    price: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    images: { type: [String], default: [] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

productSchema.virtual('finalPrice').get(function () {
  return finalPriceOf({ price: this.price, discountPercent: this.discountPercent });
});

productSchema.index({ category: 1, isDeleted: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ soldCount: -1 });

export const ProductModel = mongoose.model('Product', productSchema);
