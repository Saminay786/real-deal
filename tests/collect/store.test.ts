// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  addReviews,
  clearProduct,
  getProductMeta,
  getReviews,
  openStore,
  updateProductMeta,
} from '../../src/collect/store';
import { extractReviews } from '../../src/content/amazon/extract';
import { loadFixture } from '../fixtures';

let dbCounter = 0;
const freshDb = () => openStore(`test-${++dbCounter}`);
const reviewsOf = (name: string) => {
  const { doc, url } = loadFixture(name);
  return extractReviews(doc, url);
};

describe('review store', () => {
  it('de-duplicates by reviewId across overlapping pages', async () => {
    const db = await freshDb();
    // The saved pages nest: page 1 (10) ⊂ page 2 (30) ⊂ the 60-review page.
    expect(await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-p1'))).toEqual({ added: 10, total: 10 });
    expect(await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-p2'))).toEqual({ added: 20, total: 30 }); // 30 − 10
    expect(await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-60'))).toEqual({ added: 30, total: 60 }); // 60 − 30
    expect(await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-p1'))).toEqual({ added: 0, total: 60 });
    expect(await getReviews(db, 'B0CCM8L54V')).toHaveLength(60);
  });

  it('keeps products separate', async () => {
    const db = await freshDb();
    await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-p1'));
    await addReviews(db, 'B0GLG5JSHK', reviewsOf('reviews-b-p1'));
    expect(await getReviews(db, 'B0CCM8L54V')).toHaveLength(10);
    expect(await getReviews(db, 'B0GLG5JSHK')).toHaveLength(10);
  });

  it('keeps firstSeenAt from the first sighting and updates other fields', async () => {
    const db = await freshDb();
    const [r] = reviewsOf('reviews-a-p1');
    if (!r) throw new Error('fixture has no reviews');
    await addReviews(db, 'B0CCM8L54V', [r], new Date('2026-11-14T10:00:00Z'));
    await addReviews(db, 'B0CCM8L54V', [{ ...r, helpfulVotes: 5 }], new Date('2026-11-20T10:00:00Z'));
    const [stored] = await getReviews(db, 'B0CCM8L54V');
    expect(stored?.firstSeenAt).toBe('2026-11-14T10:00:00.000Z');
    expect(stored?.helpfulVotes).toBe(5);
  });

  it('skips reviews without an ID', async () => {
    const db = await freshDb();
    const [r] = reviewsOf('reviews-a-p1');
    if (!r) throw new Error('fixture has no reviews');
    expect(await addReviews(db, 'B0CCM8L54V', [{ ...r, reviewId: null }])).toEqual({ added: 0, total: 0 });
  });

  it('keeps the largest review total seen (star filters show smaller totals)', async () => {
    const db = await freshDb();
    await updateProductMeta(db, 'B0CCM8L54V', 1283);
    await updateProductMeta(db, 'B0CCM8L54V', 212); // e.g. "1 star only" filter
    await updateProductMeta(db, 'B0CCM8L54V', null);
    expect((await getProductMeta(db, 'B0CCM8L54V'))?.totalReviews).toBe(1283);
  });

  it('clears one product', async () => {
    const db = await freshDb();
    await addReviews(db, 'B0CCM8L54V', reviewsOf('reviews-a-p1'));
    await addReviews(db, 'B0GLG5JSHK', reviewsOf('reviews-b-p1'));
    await updateProductMeta(db, 'B0CCM8L54V', 1283);
    await clearProduct(db, 'B0CCM8L54V');
    expect(await getReviews(db, 'B0CCM8L54V')).toHaveLength(0);
    expect(await getProductMeta(db, 'B0CCM8L54V')).toBeUndefined();
    expect(await getReviews(db, 'B0GLG5JSHK')).toHaveLength(10);
  });
});
