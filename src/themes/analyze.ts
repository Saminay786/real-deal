// Themes over time: sentences + embeddings -> clusters -> per-theme change-point
// tests -> BH -> ShiftResult[]. Pure: no DOM, no chrome.*, no IndexedDB.

import { bucketize, type Obs } from '../stats/bucket';
import { changePointFromBuckets } from '../stats/changepoint';
import { benjaminiHochberg, FDR_Q } from '../stats/fdr';
import { newcombe, standardizedDiff } from '../stats/intervals';
import type { Review, ShiftResult, Theme, ThemeSeries } from '../types';
import { clusterSentences, dot, type ClusterOptions, type Vec } from './cluster';
import { ctfidf } from './ctfidf';
import type { Sentence } from './sentences';

export interface ThemeAnalysis {
  themes: Theme[];
  series: ThemeSeries[];
  /** One per theme with a testable change point, sorted: significant first, then by |diff|. */
  shifts: ShiftResult[];
  analysedReviews: number;
  nonEnglishReviews: number;
  sentences: number;
  /** Whether change-point tests compared reviews within star levels. */
  stratified: boolean;
  dataSufficiency: 'insufficient' | 'low' | 'ok';
  explanation: string;
}

export interface AnalyzeOptions extends ClusterOptions {
  permutations?: number;
  exemplars?: number;
  /**
   * Compare reviews only within the same star level (CMH). Use when star-filtered
   * views were collected: they distort the star mix over time. Without filters the
   * star mix is natural and a theme rising together with low stars is real signal,
   * which stratifying would hide. Default false.
   */
  stratify?: boolean;
  /** Words kept out of keyword labels, e.g. the brand (DECISIONS #44). */
  extraStopWords?: ReadonlySet<string>;
}

/**
 * @param reviews usable reviews (dated, analysed country), each with a reviewId
 * @param sentences English sentences of those reviews
 * @param vectors one L2-normalised embedding per sentence (same order)
 * @param nonEnglish reviews excluded because they had no English sentence
 */
export function analyzeThemes(
  reviews: readonly Review[],
  sentences: readonly Sentence[],
  vectors: readonly Vec[],
  nonEnglish: ReadonlySet<string>,
  opts: AnalyzeOptions = {},
): ThemeAnalysis {
  const stratify = opts.stratify ?? false;
  const base = { analysedReviews: 0, nonEnglishReviews: nonEnglish.size, sentences: sentences.length, stratified: stratify };
  const empty = (explanation: string): ThemeAnalysis => ({
    themes: [],
    series: [],
    shifts: [],
    ...base,
    dataSufficiency: 'insufficient',
    explanation,
  });

  const clustering = clusterSentences(vectors, opts);
  if (!clustering.value) return empty(clustering.explanation);
  const { k, labels, centroids } = clustering.value;

  // Labels, sizes, most typical sentences (closest to the centroid) and mean stars.
  const docs: string[][] = Array.from({ length: k }, () => []);
  sentences.forEach((s, i) => docs[labels[i] ?? 0]?.push(s.text));
  const terms = ctfidf(docs, 3, opts.extraStopWords);
  const ratingOf = new Map(reviews.map((r) => [r.reviewId, r.rating]));
  const themes: Theme[] = docs.map((d, id) => {
    const members = sentences
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => labels[i] === id)
      .map(({ s, i }) => ({ s, sim: dot(vectors[i] as Vec, centroids[id] as Vec) }))
      .sort((a, b) => b.sim - a.sim);
    const samples = [...new Set(members.map((m) => m.s.text))].slice(0, 8);
    const stars = [...new Set(members.map((m) => m.s.reviewId))]
      .map((rid) => ratingOf.get(rid))
      .filter((r): r is number => typeof r === 'number');
    return {
      id,
      label: terms[id]?.terms.join(', ') || `theme ${id + 1}`,
      labelSource: 'ctfidf',
      topTerms: terms[id]?.terms ?? [],
      size: d.length,
      samples,
      meanRating: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
    };
  });

  // Which themes each review mentions, and its sentences per theme (for exemplars).
  const byReview = new Map<string, Map<number, string[]>>();
  // How typical each sentence is of its theme (cosine to the theme centre), for exemplars.
  const typicality = new Map<string, number>();
  sentences.forEach((s, i) => {
    const t = labels[i] ?? 0;
    const m = byReview.get(s.reviewId) ?? new Map<number, string[]>();
    m.set(t, [...(m.get(t) ?? []), s.text]);
    byReview.set(s.reviewId, m);
    typicality.set(`${t}\u0000${s.text}`, dot(vectors[i] as Vec, centroids[t] as Vec));
  });

  const analysed = reviews.filter((r) => r.reviewId && r.date && !nonEnglish.has(r.reviewId));
  base.analysedReviews = analysed.length;

  const series: ThemeSeries[] = [];
  const raw: (Omit<ShiftResult, 'qValue' | 'significant'> & { order: number })[] = [];
  let sufficiency: ThemeAnalysis['dataSufficiency'] = clustering.dataSufficiency === 'low' ? 'low' : 'ok';
  let explanation = clustering.explanation;

  for (const theme of themes) {
    const obs: (Obs & { reviewId: string })[] = analysed.map((r) => ({
      reviewId: r.reviewId as string,
      date: r.date as string,
      x: byReview.get(r.reviewId as string)?.has(theme.id) ? 1 : 0,
      stratum: r.rating ?? 0,
    }));
    const b = bucketize(obs);
    if (!b.value) continue;
    series.push({
      themeId: theme.id,
      buckets: b.value.buckets.map(({ start, end, n, k: kk, share, ci }) => ({ start, end, n, k: kk, share, ci })),
    });
    if (b.dataSufficiency === 'insufficient') {
      sufficiency = 'insufficient';
      explanation = b.explanation;
      continue;
    }
    const cp = changePointFromBuckets(b.value, { seed: opts.seed, permutations: opts.permutations, stratified: stratify });
    if (!cp.value) continue;
    const v = cp.value;
    const pooled = newcombe(v.kBefore, v.nBefore, v.kAfter, v.nAfter);
    // A star-adjusted Δ needs ≥ 2 star levels with ≥ 10 reviews on each side; with
    // one, it would be that single level's change shown as the overall one
    // ("7% → 13%, Δ +21%", DECISIONS #35).
    const adjusted = stratify ? standardizedDiff(v.strata) : null;
    const effect = adjusted && adjusted.strataUsed >= 2 ? adjusted : pooled;

    // Exemplars: the theme's MOST TYPICAL sentences on each side of the change.
    // (Previously: sentences from reviews nearest the change date, which showed
    // off-topic text like "Online warranty is available" under "Chain lock
    // quality", DECISIONS #42.)
    const sorted = b.value.sorted as (Obs & { reviewId: string })[];
    const n = opts.exemplars ?? 3;
    const pick = (from: number, to: number) => {
      const pool: { text: string; sim: number }[] = [];
      for (let i = from; i < to; i++) {
        for (const text of byReview.get(sorted[i]?.reviewId ?? '')?.get(theme.id) ?? []) {
          pool.push({ text, sim: typicality.get(`${theme.id}\u0000${text}`) ?? 0 });
        }
      }
      const seen = new Set<string>();
      return pool
        .sort((p, q) => q.sim - p.sim)
        .map((p) => p.text)
        .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
        .slice(0, n);
    };

    raw.push({
      themeId: theme.id,
      label: theme.label,
      changeAt: v.changeAt,
      before: { n: v.nBefore, k: v.kBefore, share: v.nBefore ? v.kBefore / v.nBefore : 0 },
      after: { n: v.nAfter, k: v.kAfter, share: v.nAfter ? v.kAfter / v.nAfter : 0 },
      diff: effect.diff,
      diffCi: effect.ci,
      pValue: v.pValue,
      exemplars: { before: pick(0, v.tau), after: pick(v.tau, sorted.length) },
      order: raw.length,
    });
  }

  const q = benjaminiHochberg(raw.map((r) => r.pValue));
  const shifts: ShiftResult[] = raw
    .map(({ order, ...r }) => ({ ...r, qValue: q[order] ?? 1, significant: (q[order] ?? 1) <= FDR_Q }))
    .sort((a, b) => Number(b.significant) - Number(a.significant) || Math.abs(b.diff) - Math.abs(a.diff));

  return { themes, series, shifts, ...base, dataSufficiency: sufficiency, explanation };
}
