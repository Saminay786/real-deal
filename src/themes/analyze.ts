// Themes over time: sentences + embeddings -> clusters -> per-theme change-point
// tests -> BH -> ShiftResult[]. Pure: no DOM, no chrome.*, no IndexedDB.

import { bucketize, type Obs } from '../stats/bucket';
import { changePointFromBuckets } from '../stats/changepoint';
import { benjaminiHochberg, FDR_Q } from '../stats/fdr';
import { newcombe, standardizedDiff } from '../stats/intervals';
import type { Review, ShiftResult, Theme, ThemeSeries } from '../types';
import { clusterSentences, type ClusterOptions, type Vec } from './cluster';
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
  const { k, labels } = clustering.value;

  // Labels and theme sizes.
  const docs: string[][] = Array.from({ length: k }, () => []);
  sentences.forEach((s, i) => docs[labels[i] ?? 0]?.push(s.text));
  const terms = ctfidf(docs);
  const themes: Theme[] = docs.map((d, id) => ({
    id,
    label: terms[id]?.terms.join(', ') || `theme ${id + 1}`,
    labelSource: 'ctfidf',
    topTerms: terms[id]?.terms ?? [],
    size: d.length,
  }));

  // Which themes each review mentions, and its sentences per theme (for exemplars).
  const byReview = new Map<string, Map<number, string[]>>();
  sentences.forEach((s, i) => {
    const t = labels[i] ?? 0;
    const m = byReview.get(s.reviewId) ?? new Map<number, string[]>();
    m.set(t, [...(m.get(t) ?? []), s.text]);
    byReview.set(s.reviewId, m);
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
    const effect = stratify ? (standardizedDiff(v.strata) ?? pooled) : pooled;

    // Exemplars: theme sentences from the reviews nearest the change, either side.
    const sorted = b.value.sorted as (Obs & { reviewId: string })[];
    const n = opts.exemplars ?? 3;
    const pick = (from: number, step: number) => {
      const out: string[] = [];
      for (let i = from; i >= 0 && i < sorted.length && out.length < n; i += step) {
        const s = byReview.get(sorted[i]?.reviewId ?? '')?.get(theme.id)?.[0];
        if (s) out.push(s);
      }
      return out;
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
      exemplars: { before: pick(v.tau - 1, -1), after: pick(v.tau, 1) },
      order: raw.length,
    });
  }

  const q = benjaminiHochberg(raw.map((r) => r.pValue));
  const shifts: ShiftResult[] = raw
    .map(({ order, ...r }) => ({ ...r, qValue: q[order] ?? 1, significant: (q[order] ?? 1) <= FDR_Q }))
    .sort((a, b) => Number(b.significant) - Number(a.significant) || Math.abs(b.diff) - Math.abs(a.diff));

  return { themes, series, shifts, ...base, dataSufficiency: sufficiency, explanation };
}
