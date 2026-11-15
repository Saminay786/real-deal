// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { countReviewsOnPage, loadView } from '../../src/content/amazon/loader';
import { loadFixture } from '../fixtures';

const instant = () => Promise.resolve();

/**
 * Makes the saved page's "Show 10 more" button behave like Amazon's: each click
 * appends the next 10 reviews from `pool` (taken from the saved 60-review page),
 * and the button disappears when the pool is empty.
 */
function wireShowMore(doc: Document, pool: Element[], perClick = 10) {
  const list = doc.querySelector('li[data-hook="review"]')?.parentElement;
  const button = doc.querySelector('a[data-hook="show-more-button"]');
  if (!list || !button) throw new Error('fixture lacks list or button');
  let clicks = 0;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    clicks++;
    for (const li of pool.splice(0, perClick)) list.appendChild(doc.importNode(li, true));
    if (pool.length === 0) button.remove();
  });
  return () => clicks;
}

function setup() {
  const { doc } = loadFixture('reviews-a-p1'); // 10 reviews
  const big = loadFixture('reviews-a-60').doc;
  const pool = [...big.querySelectorAll('li[data-hook="review"]')].slice(10); // the next 50
  return { doc, pool };
}

describe('loadView', () => {
  it('clicks until the button disappears (view fully loaded)', async () => {
    const { doc, pool } = setup();
    const clicks = wireShowMore(doc, pool);
    const progress: number[] = [];
    const r = await loadView(doc, { sleep: instant, random: () => 0.5, onProgress: (p) => progress.push(p.loaded) });
    expect(r).toEqual({ end: 'end', loaded: 60, clicks: 5 });
    expect(clicks()).toBe(5);
    expect(progress).toEqual([20, 30, 40, 50, 60]);
  });

  it("stops at Amazon's 100 cap", async () => {
    const { doc, pool } = setup();
    wireShowMore(doc, pool);
    const r = await loadView(doc, { sleep: instant, cap: 40 });
    expect(r.end).toBe('cap');
    expect(r.loaded).toBe(40);
    expect(r.clicks).toBe(3);
  });

  it('waits a human-like 2–4 s between clicks', async () => {
    const { doc, pool } = setup();
    wireShowMore(doc, pool);
    const pauses: number[] = [];
    await loadView(doc, {
      cap: 30,
      random: () => 0.25,
      pollMs: 250,
      sleep: (ms) => {
        if (ms !== 250) pauses.push(ms);
        return Promise.resolve();
      },
    });
    // 2000 + 0.25·(4000 − 2000) = 2500 ms after each click except the last
    expect(pauses).toEqual([2500]);
  });

  it('stops when the user presses Stop', async () => {
    const { doc, pool } = setup();
    wireShowMore(doc, pool);
    const c = new AbortController();
    const r = await loadView(doc, {
      sleep: instant,
      signal: c.signal,
      onProgress: (p) => {
        if (p.loaded >= 30) c.abort();
      },
    });
    expect(r.end).toBe('stopped');
    expect(r.loaded).toBe(30);
  });

  it('stops immediately on a CAPTCHA', async () => {
    const { doc, pool } = setup();
    wireShowMore(doc, pool);
    const form = doc.createElement('form');
    form.setAttribute('action', '/errors/validateCaptcha');
    doc.body.appendChild(form);
    const r = await loadView(doc, { sleep: instant });
    expect(r).toEqual({ end: 'captcha', loaded: 10, clicks: 0 });
  });

  it('gives up if clicking adds nothing twice', async () => {
    const { doc } = setup();
    // A button that stays on the page but never adds reviews (e.g. Amazon throttling).
    doc.querySelector('a[data-hook="show-more-button"]')?.addEventListener('click', (e) => e.preventDefault());
    const r = await loadView(doc, { sleep: instant, waitMs: 1000, pollMs: 250 });
    expect(r).toEqual({ end: 'stuck', loaded: 10, clicks: 2 });
    expect(countReviewsOnPage(doc)).toBe(10);
  });
});
