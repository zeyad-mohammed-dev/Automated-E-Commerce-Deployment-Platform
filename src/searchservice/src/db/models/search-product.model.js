import mongoose from 'mongoose';

const searchProductSchema = new mongoose.Schema(
  {
    // id of the product in productcatalogservice
    productId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    brand: { type: String, default: '' },
    price: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true },
    images: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    stockQuantity: { type: Number, default: 0 },
    category: {
      id: { type: String },
      name: { type: String },
      slug: { type: String },
    },
    // lowercase name + brand + category + description, used for matching
    searchText: { type: String, default: '' },
    sourceUpdatedAt: { type: Date },
    sourceCreatedAt: { type: Date },
  },
  { timestamps: true },
);

searchProductSchema.index({ 'category.slug': 1 });
searchProductSchema.index({ finalPrice: 1 });
searchProductSchema.index({ soldCount: -1 });
searchProductSchema.index({ sourceCreatedAt: -1 });

export const SearchProductModel = mongoose.model('SearchProduct', searchProductSchema);
