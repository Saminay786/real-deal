// k-means on L2-normalised sentence embeddings (cosine), k chosen by silhouette.
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#themes

import type { StatResult } from '../types';
import { DEFAULT_SEED, mulberry32, type Rng } from '../stats/rng';

export type Vec = ArrayLike<number>;

export const K_MIN = 3;
export const K_MAX = 8;
export const RESTARTS = 10;
export const MAX_ITER = 100;
/** Silhouette is computed on at most this many sampled points (seeded). */
export const SILHOUETTE_SAMPLE = 500;
export const MIN_SENTENCES = 30;

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Cosine distance 1 − cos(a, b) for unit vectors. */
export function cosDist(a: Vec, b: Vec): number {
  return 1 - dot(a, b);
}

function normalize(v: Float64Array): Float64Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += (v[i] ?? 0) ** 2;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / n;
  return v;
}

/** k-means++ seeding: next centre chosen with probability ∝ D(x)² (cosine distance). */
function seedCentres(X: readonly Vec[], k: number, rng: Rng): Float64Array[] {
  const n = X.length;
  const first = X[Math.floor(rng() * n)] as Vec;
  const centres = [Float64Array.from(first)];
  const d2 = X.map((x) => cosDist(x, first) ** 2);
  while (centres.length < k) {
    const total = d2.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let idx = 0;
    if (total > 0) {
      for (; idx < n - 1; idx++) {
        r -= d2[idx] ?? 0;
        if (r <= 0) break;
      }
    } else idx = Math.floor(rng() * n);
    const c = Float64Array.from(X[idx] as Vec);
    centres.push(c);
    for (let i = 0; i < n; i++) d2[i] = Math.min(d2[i] ?? 0, cosDist(X[i] as Vec, c) ** 2);
  }
  return centres;
}

export interface KMeansResult {
  labels: Int32Array;
  centroids: Float64Array[];
  /** Σ cosine distance to the assigned centroid. */
  inertia: number;
}

/** Spherical k-means: assign by maximum cosine, centroid = normalised mean. */
export function kmeans(X: readonly Vec[], k: number, rng: Rng, maxIter: number = MAX_ITER): KMeansResult {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  let centroids = seedCentres(X, k, rng);
  const labels = new Int32Array(n).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = -Infinity;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        const s = dot(X[i] as Vec, centroids[c] as Float64Array);
        if (s > best) {
          best = s;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        labels[i] = bestC;
        changed = true;
      }
    }
    const sums = Array.from({ length: k }, () => new Float64Array(d));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = labels[i] ?? 0;
      counts[c] = (counts[c] ?? 0) + 1;
      const s = sums[c] as Float64Array;
      const x = X[i] as Vec;
      for (let j = 0; j < d; j++) s[j] = (s[j] ?? 0) + (x[j] ?? 0);
    }
    centroids = sums.map((s, c) => ((counts[c] ?? 0) > 0 ? normalize(s) : (centroids[c] as Float64Array)));
    if (!changed && iter > 0) break;
  }
  let inertia = 0;
  for (let i = 0; i < n; i++) inertia += cosDist(X[i] as Vec, centroids[labels[i] ?? 0] as Float64Array);
  return { labels, centroids, inertia };
}

/**
 * Mean silhouette over `sample` points (all if omitted), cosine distance:
 *   a(i) = mean distance to its own cluster, b(i) = smallest mean distance to another cluster,
 *   s(i) = (b − a) / max(a, b); s(i) = 0 for singletons.
 */
export function silhouette(X: readonly Vec[], labels: ArrayLike<number>, k: number, sample?: readonly number[]): number {
  const idx = sample ?? X.map((_, i) => i);
  let total = 0;
  for (const i of idx) {
    const sum = new Float64Array(k);
    const cnt = new Int32Array(k);
    for (let j = 0; j < X.length; j++) {
      if (j === i) continue;
      const c = labels[j] ?? 0;
      sum[c] = (sum[c] ?? 0) + cosDist(X[i] as Vec, X[j] as Vec);
      cnt[c] = (cnt[c] ?? 0) + 1;
    }
    const own = labels[i] ?? 0;
    if ((cnt[own] ?? 0) === 0) continue; // singleton: s = 0
    const a = (sum[own] ?? 0) / (cnt[own] ?? 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && (cnt[c] ?? 0) > 0) b = Math.min(b, (sum[c] ?? 0) / (cnt[c] ?? 1));
    if (!Number.isFinite(b)) continue;
    const m = Math.max(a, b);
    total += m > 0 ? (b - a) / m : 0;
  }
  return idx.length > 0 ? total / idx.length : 0;
}

export interface Clustering {
  k: number;
  labels: Int32Array;
  centroids: Float64Array[];
  silhouette: number;
  /** Silhouette for every k tried. */
  scores: { k: number; silhouette: number }[];
}

export interface ClusterOptions {
  kMin?: number;
  kMax?: number;
  restarts?: number;
  seed?: number;
}

/** Best of `restarts` k-means runs (lowest inertia) for each k; k with the highest silhouette wins. */
export function clusterSentences(X: readonly Vec[], opts: ClusterOptions = {}): StatResult<Clustering> {
  const kMin = opts.kMin ?? K_MIN;
  const kMax = Math.min(opts.kMax ?? K_MAX, X.length - 1);
  const restarts = opts.restarts ?? RESTARTS;
  if (X.length < MIN_SENTENCES || kMax < kMin) {
    return {
      value: null,
      dataSufficiency: 'insufficient',
      explanation: `Need at least ${MIN_SENTENCES} English sentences to find themes; have ${X.length}.`,
    };
  }
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  // Fixed silhouette sample, shared by all k so scores are comparable.
  const order = X.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const sample = order.slice(0, Math.min(SILHOUETTE_SAMPLE, X.length));

  let best: Clustering | null = null;
  const scores: { k: number; silhouette: number }[] = [];
  for (let k = kMin; k <= kMax; k++) {
    let bestRun: KMeansResult | null = null;
    for (let r = 0; r < restarts; r++) {
      const run = kmeans(X, k, rng);
      if (!bestRun || run.inertia < bestRun.inertia) bestRun = run;
    }
    if (!bestRun) continue;
    const s = silhouette(X, bestRun.labels, k, sample);
    scores.push({ k, silhouette: s });
    if (!best || s > best.silhouette) best = { k, labels: bestRun.labels, centroids: bestRun.centroids, silhouette: s, scores };
  }
  if (!best) return { value: null, dataSufficiency: 'insufficient', explanation: 'Clustering failed.' };
  best.scores = scores;
  return {
    value: best,
    dataSufficiency: best.silhouette < 0.05 ? 'low' : 'ok',
    explanation: `${best.k} themes (silhouette ${best.silhouette.toFixed(2)}; tried k = ${kMin}–${kMax}).`,
  };
}
