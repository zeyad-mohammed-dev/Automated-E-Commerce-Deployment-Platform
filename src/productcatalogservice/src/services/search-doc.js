// The shape sent to searchservice (and returned by the export endpoint)
export const toSearchDoc = (product) => {
  const plain = typeof product.toJSON === 'function' ? product.toJSON() : product;
  const category = plain.category && plain.category._id ? plain.category : null;

  return {
    id: String(plain._id),
    name: plain.name,
    description: plain.description || '',
    brand: plain.brand || '',
    price: plain.price,
    discountPercent: plain.discountPercent || 0,
    finalPrice: plain.finalPrice,
    images: plain.images || [],
    rating: plain.rating || 0,
    reviewCount: plain.reviewCount || 0,
    soldCount: plain.soldCount || 0,
    stockQuantity: plain.stockQuantity || 0,
    category: category
      ? { id: String(category._id), name: category.name, slug: category.slug }
      : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};
