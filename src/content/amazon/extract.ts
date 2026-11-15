// Page -> data. Never throws: anything not found is null.
// Selectors come only from selectors.ts.

import { debug } from '../../debug';
import type { ProductSnapshot, Stars } from '../../types';
import { PRODUCT } from './selectors';

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
