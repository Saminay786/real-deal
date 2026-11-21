// Content script entry: routes by page type.

import { viewFromUrl } from '../collect/views';
import { debug, setDebug } from '../debug';
import { loadSettings } from '../settings';
import { isLoadCommand, type LoadProgressMessage, type ReviewsSeenMessage } from '../messages';
import { ratingInterval } from '../stats/rating';
import { renderBadge } from './amazon/badge';
import { extractBrand, extractProduct, extractTotalReviews } from './amazon/extract';
import { countReviewsOnPage, loadView } from './amazon/loader';
import { watchReviews } from './amazon/observer';
import { asinFromPath, pageType } from './page';

export { pageType } from './page';

function runProductPage(): void {
  const snap = extractProduct(document, location.href);
  const result = ratingInterval(snap.ratingDistribution, snap.ratingCount);
  debug('rating interval', result);
  renderBadge(document, result);
}

function sendProgress(loaded: number, running: boolean, end: LoadProgressMessage['end']): void {
  const asin = asinFromPath(location.pathname);
  if (!asin) return;
  const msg: LoadProgressMessage = { type: 'rd:load-progress', asin, loaded, running, end };
  chrome.runtime.sendMessage(msg).catch(() => undefined);
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
        view: viewFromUrl(location.href),
        viewTotal: extractTotalReviews(document),
        brand: extractBrand(document),
        reviews,
      };
      debug(`sending ${reviews.length} reviews for ${asin}`);
      chrome.runtime.sendMessage(msg).catch((e: unknown) => debug('send failed', e));
    },
  );

  // "Load this view": only ever started by the user from the side panel.
  let controller: AbortController | null = null;
  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isLoadCommand(msg)) return false;
    if (msg.type === 'rd:stop-load') {
      controller?.abort();
      sendResponse({ ok: true });
      return false;
    }
    if (controller) {
      sendResponse({ ok: true, alreadyRunning: true });
      return false;
    }
    const c = new AbortController();
    controller = c;
    // Leaving or hiding the page stops loading.
    const onHide = () => {
      if (document.visibilityState === 'hidden') c.abort();
    };
    document.addEventListener('visibilitychange', onHide);
    sendProgress(countReviewsOnPage(document), true, null);
    void loadView(document, {
      signal: c.signal,
      onProgress: (p) => sendProgress(p.loaded, true, null),
    }).then((r) => {
      document.removeEventListener('visibilitychange', onHide);
      controller = null;
      debug('load finished', r);
      sendProgress(r.loaded, false, r.end);
    });
    sendResponse({ ok: true });
    return false;
  });
}

void (async () => {
  try {
    const settings = await loadSettings();
    setDebug(settings.debug);
    const type = pageType(location.pathname);
    if (type === 'product' && settings.showBadge) runProductPage();
    else if (type === 'reviews') runReviewsPage();
  } catch (e) {
    // Never break the page.
    debug('content script error', e);
  }
})();
