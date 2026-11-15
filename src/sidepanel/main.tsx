import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { getProductMeta, getReviews, openStore, type Db } from '../collect/store';
import { summarizeCollection, type CollectionSummary } from '../collect/summary';
import { asinFromPath, pageType, type PageType } from '../content/page';
import { isMessage } from '../messages';
import { CollectionCard } from './CollectionCard';
import { FixtureSaver } from './FixtureSaver';
import './style.css';

interface TabInfo {
  asin: string | null;
  type: PageType;
}

async function activeTabInfo(): Promise<TabInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://www.amazon.in/')) return { asin: null, type: 'other' };
  const path = new URL(tab.url).pathname;
  return { asin: asinFromPath(path), type: pageType(path) };
}

let dbPromise: Promise<Db> | null = null;
const db = () => (dbPromise ??= openStore());

function App() {
  const [tab, setTab] = useState<TabInfo>({ asin: null, type: 'other' });
  const [summary, setSummary] = useState<CollectionSummary | null>(null);

  const refresh = useCallback(async () => {
    const info = await activeTabInfo();
    setTab(info);
    if (!info.asin) {
      setSummary(null);
      return;
    }
    const d = await db();
    const [reviews, meta] = await Promise.all([getReviews(d, info.asin), getProductMeta(d, info.asin)]);
    setSummary(summarizeCollection(reviews, meta?.totalReviews ?? null));
  }, []);

  useEffect(() => {
    void refresh();
    const onMsg = (m: unknown) => {
      if (isMessage(m) && m.type === 'rd:collection-updated') void refresh();
    };
    const onTab = () => void refresh();
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.tabs.onActivated.addListener(onTab);
    chrome.tabs.onUpdated.addListener(onTab);
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      chrome.tabs.onActivated.removeListener(onTab);
      chrome.tabs.onUpdated.removeListener(onTab);
    };
  }, [refresh]);

  return (
    <main>
      <h1>Real Deal</h1>
      {tab.asin && summary ? (
        <CollectionCard s={summary} onReviewsPage={tab.type === 'reviews'} />
      ) : (
        <p class="muted">Open an amazon.in product or review page.</p>
      )}
      {import.meta.env.MODE === 'fixtures' && <FixtureSaver />}
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<App />, root);
