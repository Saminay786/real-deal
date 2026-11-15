import { describe, expect, it } from 'vitest';
import { bucketize, type Obs } from '../../src/stats/bucket';
import { changePointFromBuckets, changePointTest, logLik } from '../../src/stats/changepoint';
import { mulberry32, type Rng } from '../../src/stats/rng';

describe('logLik', () => {
  it('matches hand computation', () => {
    expect(logLik(0, 30)).toBe(0);
    expect(logLik(30, 30)).toBe(0);
    expect(logLik(0, 0)).toBe(0);
    // ℓ(5,10) = 10·ln 0.5 = −6.931472
    expect(logLik(5, 10)).toBeCloseTo(-6.931472, 6);
    // ℓ(2,10) = 2·ln 0.2 + 8·ln 0.8 = −3.218876 − 1.785148 = −5.004024
    expect(logLik(2, 10)).toBeCloseTo(-5.004024, 6);
  });
});

describe('changePointTest: hand-computed cases', () => {
  const zeros = (n: number) => Array<number>(n).fill(0);
  const ones = (n: number) => Array<number>(n).fill(1);

  it('a perfect step gives T = −60·ln 0.5 and the smallest possible p-value', () => {
    // x = 30 zeros then 30 ones, one candidate split at 30
    // LR = ℓ(0,30) + ℓ(30,30) − ℓ(30,60) = 0 + 0 − 60·ln 0.5 = 41.588831
    // Only the identity arrangement (1 of C(60,30) ≈ 1.2e17) reaches T, so no permutation does:
    // p = (1 + 0)/(999 + 1) = 0.001
    const r = changePointTest([...zeros(30), ...ones(30)], null, [30]);
    expect(r.value?.T).toBeCloseTo(41.588831, 5);
    expect(r.value?.tau).toBe(30);
    expect(r.value?.pValue).toBeCloseTo(0.001, 12);
    expect(r.value).toMatchObject({ kBefore: 0, nBefore: 30, kAfter: 30, nAfter: 30 });
  });

  it('a constant series has T = 0 and p = 1 (every permutation ties)', () => {
    const r = changePointTest(zeros(80), null, [30, 40, 50]);
    expect(r.value?.T).toBe(0);
    expect(r.value?.pValue).toBe(1);
  });

  it('stratifying by star removes a shift caused only by the star mix', () => {
    // Before: 30 one-star reviews, 15 mention the theme. After: 30 five-star reviews, 3 mention it.
    // Unstratified: LR = ℓ(15,30) + ℓ(3,30) − ℓ(18,60)
    //   ℓ(15,30) = 30·ln 0.5 = −20.794415
    //   ℓ(3,30)  = 3·ln 0.1 + 27·ln 0.9 = −6.907755 − 2.844738 = −9.752493
    //   ℓ(18,60) = 18·ln 0.3 + 42·ln 0.7 = −21.671511 − 14.980350 = −36.651861
    //   LR = −20.794415 − 9.752493 + 36.651861 = 6.104953
    // Stratified: each star level lies entirely on one side of the split, so within each
    //   level before/after can't differ: LR_1★ = ℓ(15,30) + ℓ(0,0) − ℓ(15,30) = 0, same for 5★ → T = 0
    const x = [...ones(15), ...zeros(15), ...ones(3), ...zeros(27)];
    const stars = [...Array<number>(30).fill(1), ...Array<number>(30).fill(5)];
    const plain = changePointTest(x, null, [30]);
    const strat = changePointTest(x, stars, [30], { statistic: 'lr' });
    const cmh = changePointTest(x, stars, [30]); // default with strata: CMH
    expect(plain.value?.T).toBeCloseTo(6.104953, 5);
    expect(strat.value?.T).toBeCloseTo(0, 12);
    expect(strat.value?.pValue).toBe(1);
    // CMH: every stratum has n_after = 0 or n_before = 0 → no contrast → T = 0
    expect(cmh.value?.statistic).toBe('cmh');
    expect(cmh.value?.T).toBe(0);
    expect(cmh.value?.pValue).toBe(1);
    expect(strat.value?.strata).toEqual([
      { stratum: 1, kBefore: 15, nBefore: 30, kAfter: 0, nAfter: 0 },
      { stratum: 5, kBefore: 0, nBefore: 0, kAfter: 3, nAfter: 30 },
    ]);
  });

  it('CMH statistic matches hand computation', () => {
    // Two strata, one split at τ = 4 (positions 0–3 before, 4–7 after).
    // Stratum A at positions 0,1,4,5 with x = 0,0,1,1: N=4, K=2, n_before=2, n_after=2, O=2
    //   E = 2·2/4 = 1; V = 2·2·2·2 / (16·3) = 16/48 = 1/3
    // Stratum B at positions 2,3,6,7 with x = 0,1,1,1: N=4, K=3, n_before=2, n_after=2, O=2
    //   E = 2·3/4 = 1.5; V = 2·2·3·1 / (16·3) = 12/48 = 1/4
    // CMH = ((2−1) + (2−1.5))² / (1/3 + 1/4) = 1.5² / (7/12) = 2.25 · 12/7 = 3.857143
    const x = [0, 0, 0, 1, 1, 1, 1, 1];
    const s = [1, 1, 2, 2, 1, 1, 2, 2];
    const r = changePointTest(x, s, [4], { minSide: 1 });
    expect(r.value?.statistic).toBe('cmh');
    expect(r.value?.T).toBeCloseTo(27 / 7, 10);
  });

  it('ignores candidate splits with fewer than 30 reviews on a side', () => {
    const r = changePointTest([...zeros(40), ...ones(20)], null, [10, 40, 55]);
    expect(r.dataSufficiency).toBe('insufficient'); // 10: before < 30; 40: after = 20 < 30; 55: after < 30
    expect(r.value).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const rng = mulberry32(5);
    const x = Array.from({ length: 120 }, () => (rng() < 0.2 ? 1 : 0));
    const a = changePointTest(x, null, [30, 60, 90], { seed: 1 });
    const b = changePointTest(x, null, [30, 60, 90], { seed: 1 });
    expect(a).toEqual(b);
  });
});

// ------------------------------------------------------------ simulations

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => `2025-${m}`);

/**
 * n reviews spread evenly over 12 months. starOf(month) picks a star level,
 * pOf(month, star) the chance a review mentions the theme.
 */
function series(rng: Rng, n: number, pOf: (m: number, star: number) => number, starOf: (m: number) => number = () => 0): Obs[] {
  const out: Obs[] = [];
  for (let i = 0; i < n; i++) {
    const m = Math.floor((i * MONTHS.length) / n);
    const star = starOf(m);
    out.push({
      date: `${MONTHS[m]}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      x: rng() < pOf(m, star) ? 1 : 0,
      stratum: star,
    });
  }
  return out;
}

function rejectionRate(
  reps: number,
  seed: number,
  make: (rng: Rng) => Obs[],
  stratified: boolean,
  alpha = 0.05,
): number {
  const rng = mulberry32(seed);
  let rejected = 0;
  for (let r = 0; r < reps; r++) {
    const b = bucketize(make(rng)).value;
    if (!b) continue;
    const res = changePointFromBuckets(b, { seed: r, stratified });
    if (res.value && res.value.pValue <= alpha) rejected++;
  }
  return rejected / reps;
}

const REPS = 500;
const randomStar = (rng: Rng) => () => 1 + Math.floor(rng() * 5);

describe('simulation: false positive rate under no change', () => {
  it('unstratified, n = 300, p = 0.15 constant: FPR at α = 0.05 is ≤ 0.07', () => {
    const fpr = rejectionRate(REPS, 11, (rng) => series(rng, 300, () => 0.15), false);
    console.log(`[sim] null FPR, unstratified, n=300: ${fpr.toFixed(3)}`);
    expect(fpr).toBeLessThanOrEqual(0.07);
    expect(fpr).toBeGreaterThanOrEqual(0.02); // a test that never rejects is broken too
  }, 120_000);

  it('stratified by random star, n = 300: FPR ≤ 0.07', () => {
    const fpr = rejectionRate(REPS, 12, (rng) => series(rng, 300, () => 0.15, randomStar(rng)), true);
    console.log(`[sim] null FPR, stratified, n=300: ${fpr.toFixed(3)}`);
    expect(fpr).toBeLessThanOrEqual(0.07);
    expect(fpr).toBeGreaterThanOrEqual(0.02);
  }, 120_000);
});

describe('simulation: the star-filter trap', () => {
  // No real change: within each star level the theme share is constant (1★: 0.40, 5★: 0.10).
  // But the collection over-samples 1★ early (as star filters do) and 5★ later:
  // months 1–6 are 80% 1★, months 7–12 are 80% 5★. The pooled share therefore falls
  // from 0.8·0.4 + 0.2·0.1 = 0.34 to 0.2·0.4 + 0.8·0.1 = 0.16 with nothing real behind it.
  const make = (rng: Rng) =>
    series(
      rng,
      300,
      (_m, star) => (star === 1 ? 0.4 : 0.1),
      (m) => (rng() < (m < 6 ? 0.8 : 0.2) ? 1 : 5),
    );

  it('unstratified test is fooled (FPR far above 0.05)', () => {
    const fpr = rejectionRate(200, 21, make, false);
    console.log(`[sim] star-mix trap, unstratified FPR: ${fpr.toFixed(3)}`);
    expect(fpr).toBeGreaterThan(0.5);
  }, 120_000);

  it('stratified test is not (FPR ≤ 0.07)', () => {
    const fpr = rejectionRate(REPS, 22, make, true);
    console.log(`[sim] star-mix trap, stratified FPR: ${fpr.toFixed(3)}`);
    expect(fpr).toBeLessThanOrEqual(0.07);
  }, 120_000);
});

describe('simulation: power for a planted shift', () => {
  // Share jumps from 0.10 to 0.25 halfway (start of month 7).
  const shift = (m: number) => (m < 6 ? 0.1 : 0.25);

  it('n = 300, 0.10 → 0.25: power ≥ 0.80 (unstratified and stratified)', () => {
    const plain = rejectionRate(REPS, 31, (rng) => series(rng, 300, shift), false);
    const strat = rejectionRate(REPS, 32, (rng) => series(rng, 300, shift, randomStar(rng)), true);
    console.log(`[sim] power n=300 0.10→0.25: unstratified ${plain.toFixed(3)}, stratified ${strat.toFixed(3)}`);
    expect(plain).toBeGreaterThanOrEqual(0.8);
    expect(strat).toBeGreaterThanOrEqual(0.8);
  }, 240_000);

  it('locates the change at the planted month most of the time', () => {
    const rng = mulberry32(41);
    let exact = 0;
    const reps = 100;
    for (let r = 0; r < reps; r++) {
      const b = bucketize(series(rng, 300, shift)).value;
      const res = b ? changePointFromBuckets(b, { seed: r, permutations: 99, stratified: false }) : null;
      if (res?.value?.changeAt === '2025-07-01') exact++;
    }
    console.log(`[sim] change located at the planted month: ${exact}/${reps}`);
    expect(exact / reps).toBeGreaterThanOrEqual(0.5);
  }, 120_000);
});
