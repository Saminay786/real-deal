// Content script entry: routes by page type.

import { debug } from '../debug';
import type { ReviewsSeenMessage } from '../messages';
import { ratingInterval } from '../stats/rating';
import { renderBadge } from './amazon/badge';
import { extractProduct, extractTotalReviews } from './amazon/extract';
import { watchReviews } from './amazon/observer';
import { asinFromPath, pageType } from './page';

export { pageType } from './page';

function runProductPage(): void {
  const snap = extractProduct(document, location.href);
  const result = ratingInterval(snap.ratingDistribution, snap.ratingCount);
  debug('rating interval', result);
  renderBadge(document, result);
}

function runReviewsPage(): void {
  watchReviews(
    document,
    () => location.href,
    (reviews) => {
      const asin = asinFromPath(location.pathname);
      if (!asin) return;
      const msg: ReviewsSeenMessage = {
        type: 'rd:reviews-seen',
        asin,
        totalReviews: extractTotalReviews(document),
        reviews,
      };
      debug(`sending ${reviews.length} reviews for ${asin}`);
      chrome.runtime.sendMessage(msg).catch((e: unknown) => debug('send failed', e));
    },
  );
}

try {
  const type = pageType(location.pathname);
  if (type === 'product') runProductPage();
  else if (type === 'reviews') runReviewsPage();
} catch (e) {
  // Never break the page.
  debug('content script error', e);
}
