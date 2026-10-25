import { SearchProductModel } from '../db/models/search-product.model.js';
import * as DBService from './db.service.js';
import { buildSearchText } from './search.service.js';
import { redisSubscriber } from '../db/redis.connection.db.js';
import {
  CATALOG_EVENTS_CHANNEL,
  CATALOG_SERVICE_URL,
  INTERNAL_API_KEY,
  SYNC_INTERVAL_SECONDS,
} from '../config/config.js';
import { catalogEventsTotal, indexedProducts, syncTotal } from '../utils/metrics.js';

export const syncState = { lastSyncAt: null, lastSyncOk: null };

// catalog search document -> what we save
export const toIndexDoc = (doc) => ({
  productId: doc.id,
  name: doc.name,
  description: doc.description || '',
  brand: doc.brand || '',
  price: doc.price,
  discountPercent: doc.discountPercent || 0,
  finalPrice: doc.finalPrice,
  images: doc.images || [],
  rating: doc.rating || 0,
  reviewCount: doc.reviewCount || 0,
  soldCount: doc.soldCount || 0,
  stockQuantity: doc.stockQuantity || 0,
  category: doc.category || undefined,
  searchText: buildSearchText(doc),
  sourceCreatedAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
  sourceUpdatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(0),
});

const isDuplicateOnly = (error) => {
  const errors = error?.writeErrors;
  return Array.isArray(errors) && errors.length > 0 && errors.every((e) => (e.code ?? e.err?.code) === 11000);
};

// A stale update (older than what we already have) fails the filter, tries to insert
// and hits the unique index. That is expected, so we ignore it.
export const upsertProducts = async (docs, store = DBService) => {
  const operations = docs.map((doc) => {
    const indexDoc = toIndexDoc(doc);
    return {
      updateOne: {
        filter: { productId: indexDoc.productId, sourceUpdatedAt: { $lte: indexDoc.sourceUpdatedAt } },
        update: { $set: indexDoc },
        upsert: true,
      },
    };
  });

  try {
    await store.bulkWrite({ model: SearchProductModel, operations, options: { ordered: false } });
  } catch (error) {
    if (!isDuplicateOnly(error)) throw error;
  }
};

export const deleteProduct = async (productId, store = DBService) => {
  await store.deleteMany({ model: SearchProductModel, filter: { productId } });
};

export const handleCatalogEvent = async (message, store = DBService) => {
  let event;
  try {
    event = JSON.parse(message);
  } catch (error) {
    catalogEventsTotal.inc({ type: 'invalid', result: 'ignored' });
    return;
  }

  try {
    if (event.type === 'product.upserted') {
      await upsertProducts([event.data], store);
    } else if (event.type === 'product.deleted') {
      await deleteProduct(event.data.id, store);
    } else {
      catalogEventsTotal.inc({ type: String(event.type), result: 'ignored' });
      return;
    }
    catalogEventsTotal.inc({ type: event.type, result: 'ok' });
  } catch (error) {
    console.error(`Failed to handle catalog event ${event.type}: ${error.message}`);
    catalogEventsTotal.inc({ type: String(event.type), result: 'error' });
  }
};

export const fetchCatalogExport = async ({
  baseUrl = CATALOG_SERVICE_URL,
  key = INTERNAL_API_KEY,
  fetchFn = fetch,
} = {}) => {
  const response = await fetchFn(`${baseUrl}/api/products/export`, {
    headers: key ? { 'x-internal-key': key } : {},
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`catalog export failed with status ${response.status}`);

  const body = await response.json();
  return body.data.products;
};

// Makes the index match the catalog: upsert everything, remove what no longer exists
export const fullSync = async ({ store = DBService, fetchExport = fetchCatalogExport } = {}) => {
  try {
    const products = await fetchExport();

    await upsertProducts(products, store);
    await store.deleteMany({
      model: SearchProductModel,
      filter: { productId: { $nin: products.map((product) => product.id) } },
    });

    syncState.lastSyncAt = new Date();
    syncState.lastSyncOk = true;
    syncTotal.inc({ result: 'ok' });
    indexedProducts.set(products.length);
    return products.length;
  } catch (error) {
    syncState.lastSyncOk = false;
    syncTotal.inc({ result: 'error' });
    throw error;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the catalog may start after us, so retry with a growing delay
export const syncWithRetry = async ({ attempts = 10, firstDelayMs = 2000, sync = fullSync } = {}) => {
  let delay = firstDelayMs;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const count = await sync();
      console.log(`Search index synced from catalog (${count} products)`);
      return true;
    } catch (error) {
      console.error(`Catalog sync failed (attempt ${attempt}/${attempts}): ${error.message}`);
      if (attempt < attempts) await sleep(delay);
      delay = Math.min(delay * 2, 30000);
    }
  }
  return false;
};

export const startSync = async () => {
  if (redisSubscriber.isOpen) {
    await redisSubscriber.subscribe(CATALOG_EVENTS_CHANNEL, (message) => handleCatalogEvent(message));
  }

  // do not block the server start, health stays up while we wait for the catalog
  syncWithRetry();

  if (SYNC_INTERVAL_SECONDS > 0) {
    const timer = setInterval(() => {
      fullSync().catch((error) => console.error(`Periodic sync failed: ${error.message}`));
    }, SYNC_INTERVAL_SECONDS * 1000);
    timer.unref();
    return timer;
  }
  return null;
};
