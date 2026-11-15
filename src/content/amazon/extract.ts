// Page -> data. Never throws: anything not found is null.
// Selectors come only from selectors.ts.

import { debug } from '../../debug';
import type { ProductSnapshot, Review, Stars } from '../../types';
import { asinFromPath } from '../page';
import { PRODUCT, REVIEWS } from './selectors';

const ASIN_RE = /^[A-Z0-9]{10}$/;

function first(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      debug('bad selector', sel);
    }
  }
  return null;
}

function text(el: Element | null): string | null {
  const t = el?.textContent?.replace(/\s+/g, ' ').trim();
  return t ? t : null;
}

/** "(11,413)" / "11,413 ratings" / "1,23,456" -> 11413 / 123456. */
export function parseCount(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\d[\d,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "4.0 out of 5 stars" -> 4.0. */
export function parseRating(s: string | null): number | null {
  const m = s?.match(/(\d(?:\.\d)?)\s*out of\s*5/i);
  if (!m?.[1]) return null;
  const r = Number(m[1]);
  return r >= 1 && r <= 5 ? r : null;
}

function extractAsin(doc: Document, url: string): string | null {
  const input = first(doc, PRODUCT.asinInput);
  const fromInput = input?.getAttribute('value')?.trim();
  if (fromInput && ASIN_RE.test(fromInput)) return fromInput;
  const attr = first(doc, PRODUCT.asinAttr)?.getAttribute('data-asin')?.trim();
  if (attr && ASIN_RE.test(attr)) return attr;
  const fromUrl = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1];
  return fromUrl ?? null;
}

function extractRating(doc: Document): number | null {
  const fromAttr = parseRating(first(doc, PRODUCT.ratingTitleAttr)?.getAttribute('title') ?? null);
  return fromAttr ?? parseRating(text(first(doc, PRODUCT.ratingText)));
}

/** Reads "5 stars represent 54% of ratings" labels inside the product's own histogram. */
function extractDistribution(doc: Document): Record<Stars, number> | null {
  for (const rootSel of PRODUCT.histogramRoots) {
    const root = doc.querySelector(rootSel);
    if (!root) continue;
    const found: Partial<Record<Stars, number>> = {};
    for (const rowSel of PRODUCT.histogramRowLabel) {
      for (const el of root.querySelectorAll(rowSel)) {
        const m = el.getAttribute('aria-label')?.match(/([1-5])\s*stars?\s*represents?\s*(\d{1,3})\s*%/i);
        if (!m?.[1] || !m[2]) continue;
        const star = Number(m[1]) as Stars;
        if (found[star] === undefined) found[star] = Number(m[2]);
      }
    }
    const d = found;
    if (d[1] !== undefined && d[2] !== undefined && d[3] !== undefined && d[4] !== undefined && d[5] !== undefined) {
      return { 1: d[1], 2: d[2], 3: d[3], 4: d[4], 5: d[5] };
    }
  }
  return null;
}

export function extractProduct(doc: Document, url: string, now: Date = new Date()): ProductSnapshot {
  const safe = <T>(f: () => T): T | null => {
    try {
      return f();
    } catch (e) {
      debug('extract error', e);
      return null;
    }
  };
  const snapshot: ProductSnapshot = {
    asin: safe(() => extractAsin(doc, url)),
    title: safe(() => text(first(doc, PRODUCT.title))),
    url,
    rating: safe(() => extractRating(doc)),
    ratingCount: safe(() => parseCount(text(first(doc, PRODUCT.ratingCount)))),
    ratingDistribution: safe(() => extractDistribution(doc)),
    capturedAt: now.toISOString(),
  };
  debug('product snapshot', snapshot);
  return snapshot;
}

// ---------------------------------------------------------------- reviews

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * "Reviewed in India on 12 March 2026" -> { country: "India", date: "2026-03-12" }.
 * Also handles the US style "Reviewed in the United States on March 12, 2026".
 */
export function parseReviewDate(s: string | null): { country: string | null; date: string | null } {
  const m = s?.match(/Reviewed in (.+?) on (.+)$/i);
  if (!m?.[1] || !m[2]) return { country: null, date: null };
  const country = m[1].replace(/^the\s+/i, '').trim();
  const when = m[2].trim();
  const dmy = when.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  const mdy = when.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  let date: string | null = null;
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const mon = MONTHS[dmy[2].toLowerCase()];
    if (mon) date = isoDate(Number(dmy[3]), mon, Number(dmy[1]));
  } else if (mdy?.[1] && mdy[2] && mdy[3]) {
    const mon = MONTHS[mdy[1].toLowerCase()];
    if (mon) date = isoDate(Number(mdy[3]), mon, Number(mdy[2]));
  }
  return { country, date };
}

/** "One person found this helpful" -> 1, "1,204 people found this helpful" -> 1204, missing -> 0. */
export function parseHelpful(s: string | null): number {
  if (!s) return 0;
  if (/^\s*one person/i.test(s)) return 1;
  return parseCount(s) ?? 0;
}

/** Text with <br> kept as newlines and other whitespace collapsed. */
function multilineText(el: Element | null): string | null {
  if (!el) return null;
  const clone = el.cloneNode(true) as Element;
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
  const t = (clone.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return t || null;
}

function variantText(el: Element | null): string | null {
  if (!el) return null;
  const clone = el.cloneNode(true) as Element;
  for (const sel of REVIEWS.variantSeparator) {
    for (const sep of clone.querySelectorAll(sel)) sep.replaceWith(' | ');
  }
  return text(clone);
}

function extractOneReview(el: Element, asin: string | null): Review | null {
  const reviewId = /^R[A-Z0-9]{6,}$/.test(el.id) ? el.id : null;
  if (!reviewId) return null; // without a stable ID we cannot de-duplicate
  const ratingEl = first(el, REVIEWS.rating);
  const rating = parseRating(text(ratingEl));
  const rawTitle = text(first(el, REVIEWS.title));
  const title = rawTitle?.replace(/^\d(?:\.\d)?\s*out of\s*5\s*stars\s*/i, '').trim() || null;
  const { country, date } = parseReviewDate(text(first(el, REVIEWS.date)));
  return {
    reviewId,
    asin,
    rating,
    title,
    body: multilineText(first(el, REVIEWS.body)),
    date,
    verified: first(el, REVIEWS.verified) !== null,
    helpfulVotes: parseHelpful(text(first(el, REVIEWS.helpful))),
    variant: variantText(first(el, REVIEWS.variant)),
    country,
  };
}

/** All reviews currently in the document (or under `root`). Never throws. */
export function extractReviews(root: ParentNode, url: string): Review[] {
  let asin: string | null = null;
  try {
    asin = asinFromPath(new URL(url).pathname);
  } catch {
    asin = null;
  }
  const out: Review[] = [];
  const seen = new Set<string>();
  for (const sel of REVIEWS.review) {
    let els: Element[] = [];
    try {
      els = [...root.querySelectorAll(sel)];
    } catch {
      continue;
    }
    if (els.length === 0) continue;
    for (const el of els) {
      try {
        const r = extractOneReview(el, asin);
        if (r?.reviewId && !seen.has(r.reviewId)) {
          seen.add(r.reviewId);
          out.push(r);
        }
      } catch (e) {
        debug('review extract error', e);
      }
    }
    break; // first selector that matches wins
  }
  return out;
}

/** "1,283 customer reviews" on a review page, or null. */
export function extractTotalReviews(doc: Document): number | null {
  try {
    const t = text(first(doc, REVIEWS.totalReviews));
    return t && /review/i.test(t) ? parseCount(t) : null;
  } catch {
    return null;
  }
}
