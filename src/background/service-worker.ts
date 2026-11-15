// Message routing and side panel enablement.

import { addReviews, openStore, recordView, updateProductMeta, type Db } from '../collect/store';
import { debug } from '../debug';
import { isReviewsSeen, type CollectionUpdatedMessage } from '../messages';

const AMAZON_IN = /^https:\/\/www\.amazon\.in\//;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Enable the side panel only on amazon.in tabs.
chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  const enabled = tab.url !== undefined && AMAZON_IN.test(tab.url);
  void chrome.sidePanel.setOptions({ tabId, path: 'src/sidepanel/index.html', enabled });
});

let dbPromise: Promise<Db> | null = null;
const db = () => (dbPromise ??= openStore());

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isReviewsSeen(msg)) return false;
  void (async () => {
    try {
      const d = await db();
      const { added, total } = await addReviews(d, msg.asin, msg.reviews);
      const ids = msg.reviews.flatMap((r) => (r.reviewId ? [r.reviewId] : []));
      await recordView(d, msg.asin, msg.view, ids, msg.viewTotal);
      // Only the unfiltered count is the product's total (filters show smaller numbers).
      const unfiltered = msg.view.star === 'all' && msg.view.reviewer === 'all';
      await updateProductMeta(d, msg.asin, unfiltered ? msg.viewTotal : null);
      debug(`stored ${added} new reviews for ${msg.asin} (total ${total})`);
      const update: CollectionUpdatedMessage = { type: 'rd:collection-updated', asin: msg.asin };
      // The side panel may be closed; that's fine.
      chrome.runtime.sendMessage(update).catch(() => undefined);
      sendResponse({ ok: true, added, total });
    } catch (e) {
      debug('store error', e);
      sendResponse({ ok: false });
    }
  })();
  return true; // keep the channel open for the async response
});
