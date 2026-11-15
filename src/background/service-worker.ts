// Message routing and side panel enablement.

import { addReviews, openStore, updateProductMeta, type Db } from '../collect/store';
import { debug } from '../debug';
import { isMessage, type CollectionUpdatedMessage } from '../messages';

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
  if (!isMessage(msg) || msg.type !== 'rd:reviews-seen') return false;
  void (async () => {
    try {
      const d = await db();
      const { added, total } = await addReviews(d, msg.asin, msg.reviews);
      await updateProductMeta(d, msg.asin, msg.totalReviews);
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
