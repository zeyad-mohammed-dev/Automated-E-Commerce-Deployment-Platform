import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ProductModel } from '../src/db/models/product.model.js';
import { toSearchDoc } from '../src/services/search-doc.js';

const validData = () => ({
  name: 'Sneakers',
  price: 1000,
  discountPercent: 20,
  category: new mongoose.Types.ObjectId(),
});

test('product validates a normal product and computes finalPrice', () => {
  const product = new ProductModel(validData());
  assert.equal(product.validateSync(), undefined);
  assert.equal(product.finalPrice, 800);
});

test('product rejects bad numbers', () => {
  const product = new ProductModel({ ...validData(), price: -1, discountPercent: 101, rating: 6 });
  const error = product.validateSync();
  assert.ok(error.errors.price);
  assert.ok(error.errors.discountPercent);
  assert.ok(error.errors.rating);
});

test('product needs a name and a category', () => {
  const error = new ProductModel({ price: 5 }).validateSync();
  assert.ok(error.errors.name);
  assert.ok(error.errors.category);
});

test('toSearchDoc builds the document sent to searchservice', () => {
  const category = { _id: new mongoose.Types.ObjectId(), name: 'Fashion', slug: 'fashion' };
  const product = new ProductModel({ ...validData(), category: undefined });
  product.category = category;

  const doc = toSearchDoc({ ...product.toJSON(), category });
  assert.equal(doc.name, 'Sneakers');
  assert.equal(doc.finalPrice, 800);
  assert.deepEqual(doc.category, {
    id: String(category._id),
    name: 'Fashion',
    slug: 'fashion',
  });
  assert.equal(typeof doc.id, 'string');
});
