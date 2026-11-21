// Pipeline A: credible interval for a product's true mean star rating.
// Pure: no DOM, no chrome.* APIs. Method and formulas: docs/METHODOLOGY.md#rating-credible-interval

import type { StatResult, Stars } from '../types';
import { DEFAULT_SEED, dirichlet, mulberry32, quantileSorted } from './rng';

/**
 * Dirichlet prior pseudo-count per star: Jeffreys prior (α0 = 0.5).
 * The uniform prior (α0 = 1) pulled 5★-heavy products toward 3★ and its 90% interval
 * covered the truth only ~74% of the time at n = 20; Jeffreys gave 88–91% across all
 * shapes tested. See docs/METHODOLOGY.md#rating-credible-interval.
 */
export const RATING_PRIOR_ALPHA = 0.5;
/** Monte Carlo draws for the interval. */
export const RATING_DRAWS = 4000;
/** Credible level of the equal-tailed interval. */
export const RATING_LEVEL = 0.9;
/** Below this many ratings the result is flagged as low data. */
export const RATING_LOW_N = 30;
/** Rounded percentages must sum to within this many points of 100. */
const PERCENT_SUM_TOLERANCE = 3;

const STARS: readonly Stars[] = [1, 2, 3, 4, 5];

export type StarCounts = [number, number, number, number, number];

export interface RatingInterval {
  /** Posterior mean of the average rating. */
  mean: number;
  lo: number;
  hi: number;
  /** Rating count reported by Amazon. */
  n: number;
  /** Reconstructed counts c_1..c_5. */
  counts: StarCounts;
  level: number;
}

export interface RatingOptions {
  seed?: number;
  draws?: number;
  level?: number;
  priorAlpha?: number;
}

/** c_k = round(p_k / 100 · N) for k = 1..5. */
export function ratingCounts(distribution: Record<Stars, number>, n: number): StarCounts {
  const c = STARS.map((k) => Math.round((distribution[k] / 100) * n));
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, c[4] ?? 0];
}

/** E[μ] = Σ k·(α0 + c_k) / (5·α0 + Σ c_k): closed-form posterior mean. */
export function posteriorMeanRating(counts: readonly number[], priorAlpha = RATING_PRIOR_ALPHA): number {
  let num = 0;
  let den = 0;
  counts.forEach((c, i) => {
    num += (i + 1) * (priorAlpha + c);
    den += priorAlpha + c;
  });
  return num / den;
}

/** Equal-tailed credible interval for μ = Σ k·θ_k under the Dirichlet posterior, from counts. */
export function intervalFromCounts(
  counts: readonly number[],
  opts: RatingOptions = {},
): { mean: number; lo: number; hi: number } {
  const level = opts.level ?? RATING_LEVEL;
  const priorAlpha = opts.priorAlpha ?? RATING_PRIOR_ALPHA;
  const draws = opts.draws ?? RATING_DRAWS;
  const alpha = counts.map((c) => priorAlpha + c);
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  const mus = new Array<number>(draws);
  for (let s = 0; s < draws; s++) {
    const theta = dirichlet(rng, alpha);
    mus[s] = theta.reduce((acc, t, i) => acc + (i + 1) * t, 0);
  }
  mus.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return {
    mean: posteriorMeanRating(counts, priorAlpha),
    lo: quantileSorted(mus, tail),
    hi: quantileSorted(mus, 1 - tail),
  };
}

export function ratingInterval(
  distribution: Record<Stars, number> | null,
  n: number | null,
  opts: RatingOptions = {},
): StatResult<RatingInterval> {
  const level = opts.level ?? RATING_LEVEL;
  if (n === null || n <= 0 || distribution === null) {
    return { value: null, dataSufficiency: 'insufficient', explanation: 'No ratings found on this page.' };
  }
  const pctSum = STARS.reduce((s, k) => s + distribution[k], 0);
  if (Math.abs(pctSum - 100) > PERCENT_SUM_TOLERANCE) {
    return {
      value: null,
      dataSufficiency: 'insufficient',
      explanation: `Star percentages add up to ${pctSum}%, not about 100%, so the breakdown could not be read reliably.`,
    };
  }

  const counts = ratingCounts(distribution, n);
  const value: RatingInterval = { ...intervalFromCounts(counts, opts), n, counts, level };
  const low = n < RATING_LOW_N;
  return {
    value,
    dataSufficiency: low ? 'low' : 'ok',
    explanation:
      `Based on ${n.toLocaleString('en-IN')} ratings, the true average rating is likely ` +
      `(${Math.round(level * 100)}% probability) between ${value.lo.toFixed(2)} and ${value.hi.toFixed(2)}.` +
      (low ? ` Fewer than ${RATING_LOW_N} ratings, so treat this as rough.` : ''),
  };
}

// ---------------------------------------------------------------- C1: ranking score (v2)

/**
 * Prior mean m, per-review SD σ and prior weight C for the ranking score, estimated
 * from 6,044 amazon.com beauty products in research/01_changepoint_validation.ipynb
 * (DECISIONS #48). Placeholders were 3.9 / 1.2 / 20.
 */
export const RANK_PRIOR_MEAN = 3.98;
export const RANK_REVIEW_SD = 1.34;
export const RANK_PRIOR_WEIGHT = 5;
/** One-sided 95% lower bound. */
export const RANK_Z = 1.645;

export interface RankingScore {
  /** Cautious estimate of the true rating: shrunk mean − 1.645 · SE. */
  score: number;
  /** (C·m + N·r̄) / (C + N) */
  shrunk: number;
  /** σ / √(C + N) */
  se: number;
}

/**
 * Score for ordering search results:
 *   r̃ = (C·m + N·r̄) / (C + N),  SE = σ / √(C + N),  score = r̃ − 1.645·SE.
 * Few ratings pull r̃ toward m and widen SE, so 4.6★ from 9 ratings ranks below
 * 4.3★ from 2,000. Products without a rating get no score.
 */
export function rankingScore(
  rating: number | null,
  n: number | null,
  c: { m?: number; sigma?: number; C?: number } = {},
): StatResult<RankingScore> {
  if (rating === null || n === null || n <= 0) {
    return { value: null, dataSufficiency: 'insufficient', explanation: 'No ratings yet.' };
  }
  const m = c.m ?? RANK_PRIOR_MEAN;
  const sigma = c.sigma ?? RANK_REVIEW_SD;
  const C = c.C ?? RANK_PRIOR_WEIGHT;
  const shrunk = (C * m + n * rating) / (C + n);
  const se = sigma / Math.sqrt(C + n);
  const score = shrunk - RANK_Z * se;
  return {
    value: { score, shrunk, se },
    dataSufficiency: n < RATING_LOW_N ? 'low' : 'ok',
    explanation:
      `Cautious estimate of the true rating from ${rating.toFixed(1)}★ and ${n.toLocaleString('en-IN')} ratings: ` +
      `${score.toFixed(2)}. Fewer ratings mean a lower, more cautious score.`,
  };
}
