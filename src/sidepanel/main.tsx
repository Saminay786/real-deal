import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { getProductMeta, getReviews, getViewProgress, openStore, type Db } from '../collect/store';
import { summarizeCollection, type CollectionSummary } from '../collect/summary';
import { viewFromUrl, viewUrl, type ReviewView, type ViewProgress } from '../collect/views';
import { asinFromPath, pageType, type PageType } from '../content/page';
import { isCollectionUpdated, isLoadProgress, type LoadViewCommand } from '../messages';
import { CollectionCard } from './CollectionCard';
import { FixtureSaver } from './FixtureSaver';
import { PlannerCard, type LoadState } from './PlannerCard';
import './style.css';

interface TabInfo {
  tabId: number | null;
  url: string | null;
  asin: string | null;
  type: PageType;
}

const NO_TAB: TabInfo = { tabId: null, url: null, asin: null, type: 'other' };
const IDLE: LoadState = { running: false, loaded: 0, end: null, error: null };

async function activeTabInfo(): Promise<TabInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://www.amazon.in/') || tab.id === undefined) return NO_TAB;
  const path = new URL(tab.url).pathname;
  return { tabId: tab.id, url: tab.url, asin: asinFromPath(path), type: pageType(path) };
}

let dbPromise: Promise<Db> | null = null;
const db = () => (dbPromise ??= openStore());

function App() {
  const [tab, setTab] = useState<TabInfo>(NO_TAB);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [progress, setProgress] = useState<Map<string, ViewProgress>>(new Map());
  const [load, setLoad] = useState<LoadState>(IDLE);

  const refresh = useCallback(async () => {
    const info = await activeTabInfo();
    setTab((prev) => {
      if (prev.url !== info.url) setLoad(IDLE);
      return info;
    });
    if (!info.asin) {
      setSummary(null);
      return;
    }
    const d = await db();
    const [reviews, meta, views] = await Promise.all([
      getReviews(d, info.asin),
      getProductMeta(d, info.asin),
      getViewProgress(d, info.asin),
    ]);
    setSummary(summarizeCollection(reviews, meta?.totalReviews ?? null));
    setProgress(views);
  }, []);

  useEffect(() => {
    void refresh();
    const onMsg = (m: unknown) => {
      if (isCollectionUpdated(m)) void refresh();
      if (isLoadProgress(m)) setLoad({ running: m.running, loaded: m.loaded, end: m.end, error: null });
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

  const send = async (type: LoadViewCommand['type']) => {
    if (tab.tabId === null) return;
    try {
      const cmd: LoadViewCommand = { type };
      await chrome.tabs.sendMessage(tab.tabId, cmd);
    } catch {
      setLoad({ ...IDLE, error: 'This tab was opened before Real Deal was updated. Press F5 on it and try again.' });
    }
  };

  const open = (v: ReviewView) => {
    if (tab.tabId === null || !tab.asin) return;
    void chrome.tabs.update(tab.tabId, { url: viewUrl(tab.asin, v, tab.url ?? undefined) });
  };

  const current = tab.type === 'reviews' && tab.url ? viewFromUrl(tab.url) : null;

  return (
    <main>
      <h1>Real Deal</h1>
      {tab.asin && summary ? (
        <>
          <CollectionCard s={summary} onReviewsPage={tab.type === 'reviews'} />
          <PlannerCard
            current={current}
            progress={progress}
            load={load}
            onLoad={() => void send('rd:load-view')}
            onStop={() => void send('rd:stop-load')}
            onOpen={open}
            allCollected={summary.totalOnAmazon !== null && summary.captured >= summary.totalOnAmazon}
          />
        </>
      ) : (
        <p class="muted">Open an amazon.in product or review page.</p>
      )}
      {import.meta.env.MODE === 'fixtures' && <FixtureSaver />}
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<App />, root);
