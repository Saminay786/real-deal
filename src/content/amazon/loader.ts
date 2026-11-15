// "Load this view": clicks Amazon's own "Show 10 more reviews" button in the
// user's tab, at a human pace, only after the user presses the button in the
// side panel. Never fetches anything; the observer picks up the new reviews.

import { VIEW_CAP } from '../../collect/views';
import { REVIEWS } from './selectors';

export type LoadEnd =
  | 'cap' // Amazon's 100-per-view limit reached
  | 'end' // no "Show more" button: the view is fully loaded
  | 'stopped' // user pressed Stop or left the page
  | 'captcha' // Amazon asked for a robot check
  | 'stuck'; // clicked but nothing new appeared

export interface LoadProgress {
  loaded: number;
  clicks: number;
}

export interface LoaderOptions {
  cap?: number;
  /** Pause between clicks, chosen uniformly in [minDelayMs, maxDelayMs]. */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** How long to wait for new reviews after a click. */
  waitMs?: number;
  /** Polling interval while waiting. */
  pollMs?: number;
  signal?: AbortSignal;
  onProgress?: (p: LoadProgress) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function firstMatch(doc: Document, selectors: readonly string[]): Element | null {
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function countReviewsOnPage(doc: Document): number {
  for (const s of REVIEWS.review) {
    const n = doc.querySelectorAll(s).length;
    if (n > 0) return n;
  }
  return 0;
}

export async function loadView(doc: Document, opts: LoaderOptions = {}): Promise<{ end: LoadEnd } & LoadProgress> {
  const cap = opts.cap ?? VIEW_CAP;
  const minDelay = opts.minDelayMs ?? 2000;
  const maxDelay = opts.maxDelayMs ?? 4000;
  const waitMs = opts.waitMs ?? 10_000;
  const pollMs = opts.pollMs ?? 250;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let loaded = countReviewsOnPage(doc);
  let clicks = 0;
  let failures = 0;
  const done = (end: LoadEnd) => ({ end, loaded, clicks });

  while (loaded < cap) {
    if (opts.signal?.aborted) return done('stopped');
    if (firstMatch(doc, REVIEWS.captcha)) return done('captcha');
    const button = firstMatch(doc, REVIEWS.showMore) as HTMLElement | null;
    if (!button) return done('end');

    button.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    button.click();
    clicks++;

    // Wait for Amazon to append reviews.
    const before = loaded;
    for (let waited = 0; waited < waitMs; waited += pollMs) {
      await sleep(pollMs);
      if (opts.signal?.aborted) return done('stopped');
      loaded = countReviewsOnPage(doc);
      if (loaded > before) break;
    }
    if (loaded <= before) {
      if (firstMatch(doc, REVIEWS.captcha)) return done('captcha');
      if (++failures >= 2) return done('stuck');
    } else failures = 0;

    opts.onProgress?.({ loaded, clicks });
    if (loaded >= cap) break;
    await sleep(minDelay + random() * (maxDelay - minDelay));
  }
  return done('cap');
}
