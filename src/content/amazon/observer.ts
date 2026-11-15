// Watches a review page for reviews that Amazon adds when the user clicks
// "Show 10 more" (AJAX). Never clicks or fetches anything itself.

import type { Review } from '../../types';
import { extractReviews } from './extract';
import { REVIEWS } from './selectors';

export interface ReviewWatcher {
  disconnect(): void;
}

/**
 * Calls `onReviews` once with the reviews already on the page, then again with
 * only the newly added reviews whenever the list grows. Mutations are debounced.
 */
export function watchReviews(
  doc: Document,
  url: () => string,
  onReviews: (reviews: Review[]) => void,
  debounceMs = 300,
): ReviewWatcher {
  const seen = new Set<string>();
  const emitNew = () => {
    const fresh = extractReviews(doc, url()).filter((r) => r.reviewId !== null && !seen.has(r.reviewId));
    for (const r of fresh) if (r.reviewId) seen.add(r.reviewId);
    if (fresh.length > 0) onReviews(fresh);
  };

  emitNew();

  let target: Node = doc.body;
  for (const sel of REVIEWS.list) {
    const el = doc.querySelector(sel);
    if (el) {
      // Watch the list's parent: Amazon sometimes replaces the list element itself.
      target = el.parentElement ?? el;
      break;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(emitNew, debounceMs);
  });
  observer.observe(target, { childList: true, subtree: true });

  return {
    disconnect() {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    },
  };
}
