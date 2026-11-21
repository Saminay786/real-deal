import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { getProductMeta, getReviews, getViewProgress, openStore, type Db } from '../collect/store';
import { summarizeCollection, type CollectionSummary } from '../collect/summary';
import { viewFromUrl, viewUrl, type ReviewView, type ViewProgress } from '../collect/views';
import { asinFromPath, pageType, type PageType } from '../content/page';
import { isCollectionUpdated, isLoadProgress, type LoadViewCommand } from '../messages';
import { CollectionCard } from './CollectionCard';
import { FixtureSaver } from './FixtureSaver';
import type { WorkerRequest, WorkerResponse } from '../themes/embed.worker';
import type { ThemeAnalysis } from '../themes/analyze';
import { createNanoSession, enrichWithNano, nanoAvailability, withoutNano, type AiResult } from '../ai/label';
import { PlannerCard, type LoadState } from './PlannerCard';
import { SummaryCard, type AiState } from './SummaryCard';
import { ThemesCard, type ThemesState } from './ThemesCard';
import './style.css';

/** Runs the theme analysis in a Web Worker; the worker is discarded afterwards to free memory. */
function runThemes(asin: string, onState: (s: ThemesState) => void): void {
  const worker = new Worker(new URL('../themes/embed.worker.ts', import.meta.url), { type: 'module' });
  onState({ kind: 'running', stage: 'loading-model', done: 0, total: 1 });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.type === 'progress') onState({ kind: 'running', stage: m.stage, done: m.done, total: m.total });
    else {
      onState(m.type === 'result' ? { kind: 'done', analysis: m.analysis } : { kind: 'error', message: m.message });
      worker.terminate();
    }
  };
  worker.onerror = (e) => {
    onState({ kind: 'error', message: e.message || 'worker failed to start' });
    worker.terminate();
  };
  const req: WorkerRequest = { type: 'analyze', asin };
  worker.postMessage(req);
}

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
  const [themes, setThemes] = useState<{ asin: string; state: ThemesState } | null>(null);
  const [ai, setAi] = useState<{ asin: string; result: AiResult; state: AiState } | null>(null);

  /** Labels + summary with Gemini Nano. Must run from a click if the model still needs downloading. */
  const runNano = async (asin: string, analysis: ThemeAnalysis) => {
    const update = (state: AiState) => setAi((p) => (p && p.asin === asin ? { ...p, state } : p));
    try {
      // The first session triggers (and reports) the model download if needed.
      const first = await createNanoSession((loaded) => update({ kind: 'downloading', progress: loaded }));
      update({ kind: 'running' });
      let spare: typeof first | null = first;
      const makeSession = () => {
        const s = spare;
        spare = null;
        return s ? Promise.resolve(s) : createNanoSession();
      };
      const result = await enrichWithNano(analysis, makeSession);
      setAi({ asin, result, state: { kind: 'done' } });
    } catch {
      update({ kind: 'off', reason: 'error' });
    }
  };

  /** Shows the template summary at once, then upgrades it with on-device AI if available. */
  const startAi = async (asin: string, analysis: ThemeAnalysis) => {
    setAi({ asin, result: withoutNano(analysis), state: { kind: 'checking' } });
    const availability = await nanoAvailability();
    if (availability === 'available') await runNano(asin, analysis);
    else if (availability === 'downloadable' || availability === 'downloading') {
      setAi((p) => (p && p.asin === asin ? { ...p, state: { kind: 'offer-download' } } : p));
    } else setAi((p) => (p && p.asin === asin ? { ...p, state: { kind: 'off', reason: availability } } : p));
  };

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
          {ai && ai.asin === tab.asin && themes?.state.kind === 'done' && (
            <SummaryCard
              result={ai.result}
              ai={ai.state}
              onDownload={() => {
                const s = themes.state;
                if (s.kind === 'done') void runNano(ai.asin, s.analysis);
              }}
            />
          )}
          <ThemesCard
            state={themes && themes.asin === tab.asin ? themes.state : { kind: 'idle' }}
            aiThemes={ai && ai.asin === tab.asin ? ai.result.themes : null}
            canRun={summary.minimumMet && !(themes?.asin === tab.asin && themes.state.kind === 'running')}
            onRun={() => {
              const asin = tab.asin;
              if (!asin) return;
              setAi(null);
              runThemes(asin, (state) => {
                setThemes({ asin, state });
                if (state.kind === 'done') void startAi(asin, state.analysis);
              });
            }}
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
