// Web Worker: runs the whole theme analysis off the side panel's main thread.
// Loads reviews from IndexedDB, embeds new sentences with the bundled MiniLM
// model (cached per review), clusters, tests, and posts the result back.
// Zero network: model and ONNX runtime are served from the extension package.

import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
// The ONNX runtime bundled into this worker is the "asyncify" build; Vite emits its
// .wasm into dist/assets and gives us its extension-local URL.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import {
  getEmbeddings,
  getReviews,
  getViewProgress,
  openStore,
  putEmbeddings,
  type StoredEmbedding,
} from '../collect/store';
import { ANALYSED_COUNTRY } from '../collect/summary';
import { analyzeThemes, type ThemeAnalysis } from './analyze';
import { reviewSentences, type Sentence } from './sentences';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 32;

export type WorkerRequest = { type: 'analyze'; asin: string };
export type WorkerResponse =
  | { type: 'progress'; stage: 'loading-model' | 'embedding' | 'clustering'; done: number; total: number }
  | { type: 'result'; analysis: ThemeAnalysis }
  | { type: 'error'; message: string };

// --- offline configuration -------------------------------------------------
const origin = self.location.origin;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${origin}/models/`;
env.useBrowserCache = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  // Only `wasm` is set: the JS glue is already bundled in, and transformers.js would
  // otherwise point both at cdn.jsdelivr.net.
  wasm.wasmPaths = { wasm: new URL(ortWasmUrl, self.location.href).href };
  wasm.numThreads = 1; // extension pages are not cross-origin isolated
  wasm.proxy = false;
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;
const getExtractor = () =>
  (extractor ??= pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'wasm' }) as Promise<FeatureExtractionPipeline>);

const post = (m: WorkerResponse) => self.postMessage(m);

async function embed(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor();
  const out = await ext(texts, { pooling: 'mean', normalize: true });
  const dim = out.dims[out.dims.length - 1] ?? 384;
  const data = out.data as Float32Array;
  return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
}

async function analyze(asin: string): Promise<ThemeAnalysis> {
  const db = await openStore();
  const reviews = (await getReviews(db, asin)).filter((r) => r.country === ANALYSED_COUNTRY && r.date);
  const { sentences, nonEnglish } = reviewSentences(reviews);

  // Group sentences per review; reuse cached vectors when the sentences are unchanged.
  const perReview = new Map<string, Sentence[]>();
  for (const s of sentences) perReview.set(s.reviewId, [...(perReview.get(s.reviewId) ?? []), s]);
  const cached = await getEmbeddings(db, [...perReview.keys()]);
  const vectors = new Map<string, Float32Array[]>();
  const todo: { reviewId: string; texts: string[] }[] = [];
  for (const [id, ss] of perReview) {
    const texts = ss.map((s) => s.text);
    const c = cached.get(id);
    if (c && c.model === MODEL_ID && c.sentences.length === texts.length && c.sentences.every((t, i) => t === texts[i])) {
      vectors.set(id, c.vectors);
    } else todo.push({ reviewId: id, texts });
  }

  const totalNew = todo.reduce((a, t) => a + t.texts.length, 0);
  if (totalNew > 0) {
    post({ type: 'progress', stage: 'loading-model', done: 0, total: 1 });
    await getExtractor();
    let done = 0;
    const flat = todo.flatMap((t) => t.texts.map((text) => ({ id: t.reviewId, text })));
    const fresh = new Map<string, Float32Array[]>();
    for (let i = 0; i < flat.length; i += BATCH) {
      const batch = flat.slice(i, i + BATCH);
      const vs = await embed(batch.map((b) => b.text));
      batch.forEach((b, j) => fresh.set(b.id, [...(fresh.get(b.id) ?? []), vs[j] as Float32Array]));
      done += batch.length;
      post({ type: 'progress', stage: 'embedding', done, total: totalNew });
    }
    const rows: StoredEmbedding[] = todo.map((t) => ({
      reviewId: t.reviewId,
      model: MODEL_ID,
      sentences: t.texts,
      vectors: fresh.get(t.reviewId) ?? [],
    }));
    await putEmbeddings(db, rows);
    for (const r of rows) vectors.set(r.reviewId, r.vectors);
  }

  post({ type: 'progress', stage: 'clustering', done: 0, total: 1 });
  const ordered = sentences.map((s) => vectors.get(s.reviewId)?.[s.index] ?? new Float32Array(384));
  // Star-filtered views distort the star mix over time → compare within star levels.
  const views = await getViewProgress(db, asin);
  const stratify = [...views.entries()].some(([key, p]) => key.split('|')[1] !== 'all' && p.seen > 0);
  return analyzeThemes(reviews, sentences, ordered, nonEnglish, { stratify });
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data?.type !== 'analyze') return;
  analyze(e.data.asin).then(
    (analysis) => post({ type: 'result', analysis }),
    (err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
};
