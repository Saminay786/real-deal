// Content script entry: routes by page type.

import { debug } from '../debug';
import { ratingInterval } from '../stats/rating';
import { renderBadge } from './amazon/badge';
import { extractProduct } from './amazon/extract';
import { pageType } from './page';

export { pageType } from './page';

function runProductPage(): void {
  const snap = extractProduct(document, location.href);
  const result = ratingInterval(snap.ratingDistribution, snap.ratingCount);
  debug('rating interval', result);
  renderBadge(document, result);
}

try {
  if (pageType(location.pathname) === 'product') runProductPage();
} catch (e) {
  // Never break the page.
  debug('content script error', e);
}
