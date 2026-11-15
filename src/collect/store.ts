// IndexedDB storage for collected reviews, keyed by review ID (so duplicates
// are impossible) and indexed by ASIN. Runs in the extension's own origin
// (service worker / side panel), never in the amazon.in page.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProductMeta, Review } from '../types';
import { viewKey, type ReviewView, type ViewProgress } from './views';

export interface StoredReview extends Review {
  reviewId: string;
  asin: string;
  /** When this extension first saw the review. */
  firstSeenAt: string;
}

/** Which reviews were captured in one sort/filter view of a product. */
export interface StoredView {
  asin: string;
  key: string;
  view: ReviewView;
  reviewIds: string[];
  /** Reviews Amazon said matched this view, if shown. */
  total: number | null;
  updatedAt: string;
}

interface RealDealDB extends DBSchema {
  reviews: { key: string; value: StoredReview; indexes: { asin: string } };
  products: { key: string; value: ProductMeta };
  views: { key: [string, string]; value: StoredView; indexes: { asin: string } };
}

export const DB_NAME = 'real-deal';
const DB_VERSION = 2;

export type Db = IDBPDatabase<RealDealDB>;

export function openStore(name: string = DB_NAME): Promise<Db> {
  return openDB<RealDealDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const reviews = db.createObjectStore('reviews', { keyPath: 'reviewId' });
        reviews.createIndex('asin', 'asin');
        db.createObjectStore('products', { keyPath: 'asin' });
      }
      if (oldVersion < 2) {
        const views = db.createObjectStore('views', { keyPath: ['asin', 'key'] });
        views.createIndex('asin', 'asin');
      }
    },
  });
}

/** Records reviews captured while `view` was open; IDs are merged without duplicates. */
export async function recordView(
  db: Db,
  asin: string,
  view: ReviewView,
  reviewIds: readonly string[],
  total: number | null,
  now: Date = new Date(),
): Promise<StoredView> {
  const key = viewKey(view);
  const prev = await db.get('views', [asin, key]);
  const ids = new Set(prev?.reviewIds ?? []);
  for (const id of reviewIds) ids.add(id);
  const rec: StoredView = {
    asin,
    key,
    view,
    reviewIds: [...ids],
    total: total ?? prev?.total ?? null,
    updatedAt: now.toISOString(),
  };
  await db.put('views', rec);
  return rec;
}

/** Progress per view key for one product. */
export async function getViewProgress(db: Db, asin: string): Promise<Map<string, ViewProgress>> {
  const rows = await db.getAllFromIndex('views', 'asin', asin);
  return new Map(rows.map((r) => [r.key, { seen: r.reviewIds.length, total: r.total }]));
}

/**
 * Saves reviews for `asin`. A review already stored (same reviewId) is updated
 * in place (e.g. its helpful-vote count) and not counted as new.
 * Reviews without an ID are skipped. Returns how many were new.
 */
export async function addReviews(
  db: Db,
  asin: string,
  reviews: readonly Review[],
  now: Date = new Date(),
): Promise<{ added: number; total: number }> {
  const tx = db.transaction('reviews', 'readwrite');
  let added = 0;
  for (const r of reviews) {
    if (!r.reviewId) continue;
    const prev = await tx.store.get(r.reviewId);
    if (!prev) added++;
    await tx.store.put({
      ...r,
      reviewId: r.reviewId,
      asin,
      firstSeenAt: prev?.firstSeenAt ?? now.toISOString(),
    });
  }
  const total = await tx.store.index('asin').count(asin);
  await tx.done;
  return { added, total };
}

export function getReviews(db: Db, asin: string): Promise<StoredReview[]> {
  return db.getAllFromIndex('reviews', 'asin', asin);
}

/** Records Amazon's written-review total, keeping the largest seen (star filters show smaller counts). */
export async function updateProductMeta(
  db: Db,
  asin: string,
  totalReviews: number | null,
  now: Date = new Date(),
): Promise<ProductMeta> {
  const prev = await db.get('products', asin);
  const best =
    totalReviews === null ? (prev?.totalReviews ?? null) : Math.max(totalReviews, prev?.totalReviews ?? 0);
  const meta: ProductMeta = { asin, totalReviews: best, updatedAt: now.toISOString() };
  await db.put('products', meta);
  return meta;
}

export function getProductMeta(db: Db, asin: string): Promise<ProductMeta | undefined> {
  return db.get('products', asin);
}

/** Deletes everything stored for one product. */
export async function clearProduct(db: Db, asin: string): Promise<void> {
  const tx = db.transaction(['reviews', 'products', 'views'], 'readwrite');
  const reviews = tx.objectStore('reviews');
  for (const key of await reviews.index('asin').getAllKeys(asin)) await reviews.delete(key);
  await tx.objectStore('products').delete(asin);
  const views = tx.objectStore('views');
  for (const key of await views.index('asin').getAllKeys(asin)) await views.delete(key);
  await tx.done;
}
