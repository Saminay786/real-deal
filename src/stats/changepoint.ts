// Single change-point test for a theme's share over time, stratified by star rating.
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#change-point-test

import type { StatResult } from '../types';
import type { Bucketed } from './bucket';
import type { StratumCounts } from './intervals';
import { DEFAULT_SEED, mulberry32, type Rng } from './rng';

export const PERMUTATIONS = 999;
export const MIN_SIDE = 30;

/** ℓ(k, n) = k·log(k/n) + (n−k)·log(1 − k/n), with 0·log 0 = 0. Binomial log-likelihood at the MLE. */
export function logLik(k: number, n: number): number {
  if (n <= 0) return 0;
  let s = 0;
  if (k > 0) s += k * Math.log(k / n);
  if (n - k > 0) s += (n - k) * Math.log((n - k) / n);
  return s;
}

interface Prepared {
  /** Stratum index 0..S−1 per observation. */
  strat: Int32Array;
  S: number;
  /** Total n and k per stratum. */
  nTot: Float64Array;
  kTot: Float64Array;
  /** Candidate split indices (first index of "after"), ascending. */
  cand: number[];
  /** Σ_s ℓ(K_s, N_s): the no-change log-likelihood. */
  ll0: number;
}

function prepare(x: ArrayLike<number>, strata: ArrayLike<number> | null, boundaries: readonly number[], minSide: number): Prepared {
  const N = x.length;
  const ids = new Map<number, number>();
  const strat = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const s = strata ? (strata[i] ?? 0) : 0;
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    strat[i] = id;
  }
  const S = Math.max(1, ids.size);
  const nTot = new Float64Array(S);
  const kTot = new Float64Array(S);
  for (let i = 0; i < N; i++) {
    const s = strat[i] ?? 0;
    nTot[s] = (nTot[s] ?? 0) + 1;
    kTot[s] = (kTot[s] ?? 0) + (x[i] ?? 0);
  }
  let ll0 = 0;
  for (let s = 0; s < S; s++) ll0 += logLik(kTot[s] ?? 0, nTot[s] ?? 0);
  const cand = [...new Set(boundaries)].filter((t) => t >= minSide && N - t >= minSide).sort((a, b) => a - b);
  return { strat, S, nTot, kTot, cand, ll0 };
}

export type Statistic = 'lr' | 'cmh';

/**
 * Scan statistic T = max over candidate splits τ of:
 *
 * 'lr' (one stratum, the spec's binomial likelihood ratio):
 *   LR(τ) = ℓ(k_before, n_before) + ℓ(k_after, n_after) − ℓ(K, N)
 *
 * 'cmh' (several strata, Cochran–Mantel–Haenszel):
 *   O_s = k_s,after,  E_s = n_s,after · K_s / N_s,
 *   V_s = n_s,after · n_s,before · K_s (N_s − K_s) / (N_s² (N_s − 1))
 *   CMH(τ) = (Σ_s (O_s − E_s))² / Σ_s V_s
 *   One common direction of change across strata (1 degree of freedom), each
 *   stratum compared only with itself.
 */
function scan(x: ArrayLike<number>, p: Prepared, stat: Statistic): { T: number; tau: number } {
  return stat === 'cmh' ? scanCmh(x, p) : scanLr(x, p);
}

function scanCmh(x: ArrayLike<number>, p: Prepared): { T: number; tau: number } {
  const { strat, S, nTot, kTot, cand } = p;
  const nB = new Float64Array(S);
  const kB = new Float64Array(S);
  let i = 0;
  let best = -Infinity;
  let bestTau = -1;
  for (const tau of cand) {
    for (; i < tau; i++) {
      const s = strat[i] ?? 0;
      nB[s] = (nB[s] ?? 0) + 1;
      kB[s] = (kB[s] ?? 0) + (x[i] ?? 0);
    }
    let dev = 0;
    let v = 0;
    for (let s = 0; s < S; s++) {
      const N = nTot[s] ?? 0;
      const K = kTot[s] ?? 0;
      const nb = nB[s] ?? 0;
      const na = N - nb;
      if (N < 2 || na === 0 || nb === 0) continue; // no before/after contrast in this stratum
      dev += K - (kB[s] ?? 0) - (na * K) / N;
      v += (na * nb * K * (N - K)) / (N * N * (N - 1));
    }
    const t = v > 0 ? (dev * dev) / v : 0;
    if (t > best) {
      best = t;
      bestTau = tau;
    }
  }
  return { T: best, tau: bestTau };
}

function scanLr(x: ArrayLike<number>, p: Prepared): { T: number; tau: number } {
  const { strat, S, nTot, kTot, cand, ll0 } = p;
  const nB = new Float64Array(S);
  const kB = new Float64Array(S);
  let i = 0;
  let best = -Infinity;
  let bestTau = -1;
  for (const tau of cand) {
    for (; i < tau; i++) {
      const s = strat[i] ?? 0;
      nB[s] = (nB[s] ?? 0) + 1;
      kB[s] = (kB[s] ?? 0) + (x[i] ?? 0);
    }
    let ll = 0;
    for (let s = 0; s < S; s++) {
      const nb = nB[s] ?? 0;
      const kb = kB[s] ?? 0;
      ll += logLik(kb, nb) + logLik((kTot[s] ?? 0) - kb, (nTot[s] ?? 0) - nb);
    }
    const lr = ll - ll0;
    if (lr > best) {
      best = lr;
      bestTau = tau;
    }
  }
  return { T: best, tau: bestTau };
}

/** Shuffles x within each stratum (Fisher–Yates), in place. Dates (positions) stay fixed. */
function shuffleWithin(perm: Float64Array, groups: number[][], rng: Rng): void {
  for (const g of groups) {
    for (let j = g.length - 1; j > 0; j--) {
      const r = Math.floor(rng() * (j + 1));
      const a = g[j] as number;
      const b = g[r] as number;
      const t = perm[a] as number;
      perm[a] = perm[b] as number;
      perm[b] = t;
    }
  }
}

export interface ChangePointOptions {
  permutations?: number;
  seed?: number;
  minSide?: number;
  /** Defaults to 'lr' with one stratum and 'cmh' with several. */
  statistic?: Statistic;
}

export interface ChangePoint {
  /** Index of the first observation after the change (in the given order). */
  tau: number;
  /** Observed scan statistic. */
  T: number;
  statistic: Statistic;
  pValue: number;
  permutations: number;
  candidates: number;
  strata: StratumCounts[];
  /** Pooled counts (not star-adjusted), for display. */
  kBefore: number;
  nBefore: number;
  kAfter: number;
  nAfter: number;
}

/**
 * Tests H0: each stratum's theme share is constant over time, against
 * H1: it changes at one common point τ. p-value by permuting x within strata:
 *   p = (1 + #{T_b ≥ T}) / (B + 1)
 * `x` must already be in date order; `boundaries` are allowed split indices.
 */
export function changePointTest(
  x: ArrayLike<number>,
  strata: ArrayLike<number> | null,
  boundaries: readonly number[],
  opts: ChangePointOptions = {},
): StatResult<ChangePoint> {
  const B = opts.permutations ?? PERMUTATIONS;
  const minSide = opts.minSide ?? MIN_SIDE;
  const p = prepare(x, strata, boundaries, minSide);
  if (p.cand.length === 0) {
    return {
      value: null,
      dataSufficiency: 'insufficient',
      explanation: `No possible change point with at least ${minSide} reviews on each side.`,
    };
  }

  const stat: Statistic = opts.statistic ?? (p.S > 1 ? 'cmh' : 'lr');
  const obs = scan(x, p, stat);
  const groups: number[][] = Array.from({ length: p.S }, () => []);
  for (let i = 0; i < x.length; i++) groups[p.strat[i] ?? 0]?.push(i);
  const perm = Float64Array.from({ length: x.length }, (_, i) => x[i] ?? 0);
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  let atLeast = 0;
  const eps = 1e-9 * Math.max(1, Math.abs(obs.T));
  for (let b = 0; b < B; b++) {
    shuffleWithin(perm, groups, rng);
    if (scan(perm, p, stat).T >= obs.T - eps) atLeast++;
  }
  const pValue = (1 + atLeast) / (B + 1);

  // Counts either side of the chosen change point.
  const ids = new Map<number, number>();
  const strata_: StratumCounts[] = [];
  let kBefore = 0;
  let kAfter = 0;
  for (let i = 0; i < x.length; i++) {
    const raw = strata ? (strata[i] ?? 0) : 0;
    let id = ids.get(raw);
    if (id === undefined) {
      id = strata_.length;
      ids.set(raw, id);
      strata_.push({ stratum: raw, kBefore: 0, nBefore: 0, kAfter: 0, nAfter: 0 });
    }
    const c = strata_[id] as StratumCounts;
    const xi = x[i] ?? 0;
    if (i < obs.tau) {
      c.nBefore++;
      c.kBefore += xi;
      kBefore += xi;
    } else {
      c.nAfter++;
      c.kAfter += xi;
      kAfter += xi;
    }
  }
  strata_.sort((a, b) => a.stratum - b.stratum);

  return {
    value: {
      tau: obs.tau,
      T: obs.T,
      statistic: stat,
      pValue,
      permutations: B,
      candidates: p.cand.length,
      strata: strata_,
      kBefore,
      nBefore: obs.tau,
      kAfter,
      nAfter: x.length - obs.tau,
    },
    dataSufficiency: 'ok',
    explanation:
      `Most likely change after review ${obs.tau} of ${x.length} ` +
      `(${p.cand.length} candidate points, ${B} permutations${p.S > 1 ? `, within ${p.S} star levels` : ''}): p = ${pValue.toFixed(3)}.`,
  };
}

/** Convenience: run the test on bucketed data; candidates are bucket boundaries. */
export function changePointFromBuckets(
  data: Bucketed,
  opts: ChangePointOptions & { stratified?: boolean } = {},
): StatResult<ChangePoint & { changeAt: string }> {
  const x = data.sorted.map((o) => o.x);
  const strata = opts.stratified === false ? null : data.sorted.map((o) => o.stratum ?? 0);
  const boundaries = data.buckets.slice(1).map((b) => b.startIndex);
  const r = changePointTest(x, strata, boundaries, opts);
  if (!r.value) return { ...r, value: null };
  const tau = r.value.tau;
  const bucket = data.buckets.find((b) => b.startIndex === tau);
  return { ...r, value: { ...r.value, changeAt: bucket?.start ?? data.sorted[tau]?.date ?? '' } };
}
