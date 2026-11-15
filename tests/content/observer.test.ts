// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { watchReviews } from '../../src/content/amazon/observer';
import type { Review } from '../../src/types';
import { loadFixture } from '../fixtures';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('watchReviews', () => {
  it('reports existing reviews, then only reviews added by "Show 10 more"', async () => {
    const { doc, url } = loadFixture('reviews-a-p1');
    const page2 = loadFixture('reviews-a-p2').doc;
    const batches: Review[][] = [];
    const w = watchReviews(doc, () => url, (r) => batches.push(r), 10);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(10);

    // Simulate Amazon appending the next 20 reviews (taken from the saved page 2).
    const list = doc.querySelector('li[data-hook="review"]')?.parentElement;
    expect(list).toBeTruthy();
    const extra = [...page2.querySelectorAll('li[data-hook="review"]')].slice(10);
    expect(extra).toHaveLength(20);
    for (const li of extra) list?.appendChild(doc.importNode(li, true));
    await wait(50);

    expect(batches).toHaveLength(2);
    expect(batches[1]).toHaveLength(20);
    const all = batches.flat().map((r) => r.reviewId);
    expect(new Set(all).size).toBe(30);

    // Re-adding a review already seen produces no new batch.
    const dup = doc.querySelector('li[data-hook="review"]');
    if (dup) list?.appendChild(dup.cloneNode(true));
    await wait(50);
    expect(batches).toHaveLength(2);

    w.disconnect();
  });
});
