import { describe, expect, it } from 'vitest';
import { rankingScore } from '../../src/stats/rating';

// Constants from research (DECISIONS #48): m = 3.98, σ = 1.34, C = 5, z = 1.645.
describe('rankingScore (C1)', () => {
  it('few ratings are pulled toward the prior and penalised for uncertainty', () => {
    // 4.6★ from 9: r̃ = (5·3.98 + 9·4.6)/14 = (19.9 + 41.4)/14 = 4.378571
    //   SE = 1.34/√14 = 0.358130; score = 4.378571 − 1.645·0.358130 = 3.789447
    const r = rankingScore(4.6, 9).value;
    expect(r?.shrunk).toBeCloseTo(4.378571, 5);
    expect(r?.se).toBeCloseTo(0.35813, 5);
    expect(r?.score).toBeCloseTo(3.789447, 5);
  });

  it('many ratings keep the average and are nearly certain', () => {
    // 4.3★ from 2,000: r̃ = (19.9 + 8600)/2005 = 4.299202; SE = 1.34/√2005 = 0.029926
    //   score = 4.299202 − 0.049228 = 4.249974
    expect(rankingScore(4.3, 2000).value?.score).toBeCloseTo(4.249974, 5);
    // 4.6★ from 9,000: r̃ = 41419.9/9005 = 4.599656; SE = 0.014121 → score 4.576427
    expect(rankingScore(4.6, 9000).value?.score).toBeCloseTo(4.576427, 5);
  });

  it('orders products as intended: 4.6★×9000 > 4.3★×2000 > 4.6★×9', () => {
    const s = (r: number, n: number) => rankingScore(r, n).value?.score ?? 0;
    expect(s(4.6, 9000)).toBeGreaterThan(s(4.3, 2000));
    expect(s(4.3, 2000)).toBeGreaterThan(s(4.6, 9));
  });

  it('flags few ratings and gives no score without ratings', () => {
    expect(rankingScore(4.6, 4).dataSufficiency).toBe('low');
    expect(rankingScore(null, 10).value).toBeNull();
    expect(rankingScore(4.2, 0).value).toBeNull();
  });
});
