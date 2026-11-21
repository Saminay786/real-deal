import { describe, expect, it } from 'vitest';
import { analyzeThemes } from '../../src/themes/analyze';
import type { Sentence } from '../../src/themes/sentences';
import { mulberry32, normal } from '../../src/stats/rng';
import type { Review } from '../../src/types';

/**
 * Synthetic product: 360 reviews over 12 months, one sentence each, three topics
 * with fake embeddings near three axes. "adhesive" complaints jump from ~10% to
 * ~35% of reviews in month 7; "value" and "delivery" stay flat.
 */
function product(seed: number, stars: 'perfect' | 'partial' = 'perfect') {
  const rng = mulberry32(seed);
  const topics = [
    { text: 'the adhesive stopped sticking to the wall', axis: 0 },
    { text: 'great value for the price paid', axis: 4 },
    { text: 'delivery arrived quickly and well packed', axis: 8 },
  ];
  const reviews: Review[] = [];
  const sentences: Sentence[] = [];
  const vectors: number[][] = [];
  for (let i = 0; i < 360; i++) {
    const m = Math.floor(i / 30); // 30 reviews per month
    const pAdhesive = m < 6 ? 0.1 : 0.35;
    const u = rng();
    const t = u < pAdhesive ? 0 : u < pAdhesive + (1 - pAdhesive) / 2 ? 1 : 2;
    const id = `R${String(i).padStart(4, '0')}`;
    const topic = topics[t] ?? topics[0];
    if (!topic) throw new Error('no topic');
    reviews.push({
      reviewId: id,
      asin: 'B000000001',
      // perfect: adhesive complaints are always 1★, everything else 5★.
      // partial: adhesive 60% 1★ / 40% 3★; others 70% 5★ / 30% 3★ (3★ mixes both).
      rating: stars === 'perfect' ? (t === 0 ? 1 : 5) : t === 0 ? (rng() < 0.6 ? 1 : 3) : rng() < 0.7 ? 5 : 3,
      title: null,
      body: topic.text,
      date: `2025-${String(m + 1).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      verified: true,
      helpfulVotes: 0,
      variant: null,
      country: 'India',
    });
    sentences.push({ reviewId: id, index: 0, text: topic.text });
    const v = Array.from({ length: 12 }, (_, j) => (j === topic.axis ? 1 : 0) + 0.1 * normal(rng));
    const norm = Math.hypot(...v);
    vectors.push(v.map((x) => x / norm));
  }
  return { reviews, sentences, vectors };
}

describe('analyzeThemes', () => {
  it('finds the three topics and flags only the planted shift', () => {
    const { reviews, sentences, vectors } = product(3);
    const a = analyzeThemes(reviews, sentences, vectors, new Set(), { seed: 1, restarts: 3, permutations: 199 });
    expect(a.themes).toHaveLength(3);
    expect(a.analysedReviews).toBe(360);
    expect(a.shifts).toHaveLength(3);

    const adhesive = a.shifts.find((s) => s.label.includes('adhesive') || s.label.includes('sticking'));
    expect(adhesive).toBeDefined();
    expect(adhesive?.significant).toBe(true);
    expect(adhesive?.changeAt).toBe('2025-07-01');
    expect(adhesive?.after.share).toBeGreaterThan(adhesive?.before.share ?? 1);
    expect(adhesive?.exemplars.after.length).toBeGreaterThan(0);
    // Exemplars are the theme's most typical sentences on each side, de-duplicated (DECISIONS #42).
    expect(adhesive?.exemplars.before).toEqual(['the adhesive stopped sticking to the wall']);
    expect(adhesive?.exemplars.after).toEqual(['the adhesive stopped sticking to the wall']);
    // Sorted: significant first.
    expect(a.shifts[0]?.themeId).toBe(adhesive?.themeId);
    // Each theme's series covers the 12 months.
    expect(a.series.every((s) => s.buckets.length === 12)).toBe(true);
    // Typical sentences and star mix for labelling: every adhesive review is 1★ here.
    const t = a.themes.find((x) => x.id === adhesive?.themeId);
    expect(t?.samples).toEqual(['the adhesive stopped sticking to the wall']);
    expect(t?.meanRating).toBe(1);
  });

  it('stratified by star: blind to a theme that is perfectly tied to one star level (documented limitation)', () => {
    // Every adhesive complaint is 1★, so within each star level nothing changes:
    // the rise is entirely "more 1★ reviews", which stratification attributes to star mix.
    const { reviews, sentences, vectors } = product(3, 'perfect');
    const a = analyzeThemes(reviews, sentences, vectors, new Set(), { seed: 1, restarts: 3, permutations: 199, stratify: true });
    expect(a.stratified).toBe(true);
    expect(a.shifts.some((s) => s.significant)).toBe(false);
  });

  it('stratified by star: still detects the shift when stars are only partly tied to the theme', () => {
    const { reviews, sentences, vectors } = product(6, 'partial');
    const a = analyzeThemes(reviews, sentences, vectors, new Set(), { seed: 1, restarts: 3, permutations: 199, stratify: true });
    const adhesive = a.shifts.find((s) => s.label.includes('adhesive') || s.label.includes('sticking'));
    expect(adhesive?.significant).toBe(true);
    expect(adhesive?.diff).toBeGreaterThan(0);
  });

  it('is insufficient with too few reviews but still returns themes', () => {
    const { reviews, sentences, vectors } = product(4);
    const a = analyzeThemes(reviews.slice(0, 60), sentences.slice(0, 60), vectors.slice(0, 60), new Set(), {
      seed: 1,
      restarts: 2,
      permutations: 99,
    });
    expect(a.themes.length).toBeGreaterThan(0);
    expect(a.shifts).toHaveLength(0);
    expect(a.dataSufficiency).toBe('insufficient');
  });

  it('excludes non-English reviews from the denominator and reports them', () => {
    const { reviews, sentences, vectors } = product(5);
    const excluded = new Set(['R0000', 'R0001']);
    const a = analyzeThemes(reviews, sentences, vectors, excluded, { seed: 1, restarts: 2, permutations: 99 });
    expect(a.analysedReviews).toBe(358);
    expect(a.nonEnglishReviews).toBe(2);
  });
});
