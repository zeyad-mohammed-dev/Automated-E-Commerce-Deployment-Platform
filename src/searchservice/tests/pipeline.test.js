import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchPipeline,
  buildSearchText,
  splitTerms,
} from '../src/services/search.service.js';

const stage = (pipeline, name) => pipeline.find((item) => name in item)?.[name];

test('splitTerms lowercases, trims and limits the words', () => {
  assert.deepEqual(splitTerms('  Nike   AIR max '), ['nike', 'air', 'max']);
  assert.deepEqual(splitTerms(''), []);
  assert.equal(splitTerms('a b c d e f g h i j').length, 8);
});

test('buildSearchText joins the useful fields in lowercase', () => {
  const text = buildSearchText({
    name: 'Nike Air Max',
    brand: 'Nike',
    category: { name: 'Fashion' },
    description: 'Comfortable',
  });
  assert.equal(text, 'nike air max nike fashion comfortable');
});

test('every word becomes a regex condition and special characters are escaped', () => {
  const { pipeline } = buildSearchPipeline({ q: 'air c++' });
  const match = stage(pipeline, '$match');
  assert.equal(match.$and.length, 2);
  assert.equal(match.$and[1].searchText.$regex, 'c\\+\\+');
});

test('with a query the default sort is relevance and a score is added', () => {
  const { pipeline, sort } = buildSearchPipeline({ q: 'shoes' });
  assert.equal(sort, 'relevance');
  assert.ok(stage(pipeline, '$addFields').score);
  assert.deepEqual(Object.keys(stage(pipeline, '$sort')), ['score', 'soldCount', 'sourceCreatedAt']);
});

test('without a query it falls back to newest and has no score', () => {
  const { pipeline, sort } = buildSearchPipeline({});
  assert.equal(sort, 'newest');
  assert.equal(stage(pipeline, '$addFields'), undefined);
  assert.deepEqual(stage(pipeline, '$match'), {});
});

test('relevance without a query is not allowed, unknown sorts are ignored', () => {
  assert.equal(buildSearchPipeline({ sort: 'relevance' }).sort, 'newest');
  assert.equal(buildSearchPipeline({ q: 'x', sort: 'hacker' }).sort, 'relevance');
  assert.equal(buildSearchPipeline({ sort: 'priceAsc' }).sort, 'priceAsc');
});

test('filters are translated to match conditions', () => {
  const { pipeline } = buildSearchPipeline({
    category: 'Fashion',
    minPrice: '100',
    maxPrice: '500',
    onSale: 'true',
    inStock: 'true',
  });
  const match = stage(pipeline, '$match');
  assert.deepEqual(match.$or, [{ 'category.slug': 'fashion' }, { 'category.id': 'Fashion' }]);
  assert.deepEqual(match.finalPrice, { $gte: 100, $lte: 500 });
  assert.deepEqual(match.discountPercent, { $gt: 0 });
  assert.deepEqual(match.stockQuantity, { $gt: 0 });
});

test('a bad price is a validation error', () => {
  assert.throws(() => buildSearchPipeline({ minPrice: 'abc' }), /minPrice must be a number/);
});

test('pagination is clamped', () => {
  const { page, limit, pipeline } = buildSearchPipeline({ page: '-3', limit: '999' });
  assert.equal(page, 1);
  assert.equal(limit, 50);
  assert.equal(stage(pipeline, '$skip'), 0);
  assert.equal(stage(pipeline, '$limit'), 50);
  assert.equal(stage(pipeline, '$facet'), undefined);

  const second = buildSearchPipeline({ page: '3', limit: '10' });
  assert.equal(stage(second.pipeline, '$skip'), 20);
  assert.equal(stage(second.pipeline, '$limit'), 10);
});
