import { describe, expect, it } from 'vitest';
import { clusterSentences, kmeans, silhouette } from '../../src/themes/cluster';
import { mulberry32, normal, type Rng } from '../../src/stats/rng';

const unit = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

describe('silhouette (cosine distance)', () => {
  it('is 1 for identical points in perfectly separated clusters', () => {
    // A = (1,0),(1,0); B = (0,1),(0,1): a(i) = 0, b(i) = 1 − cos 90° = 1 → s(i) = 1
    expect(silhouette([[1, 0], [1, 0], [0, 1], [0, 1]], [0, 0, 1, 1], 2)).toBeCloseTo(1, 12);
  });

  it('matches hand computation', () => {
    // A = {0°, 60°}, B = {180°, 120°}; d = 1 − cos(angle between)
    // a1(0°):   a = 1−cos60 = 0.5;  b = mean(1−cos180, 1−cos120) = mean(2, 1.5) = 1.75 → s = 1.25/1.75 = 0.714286
    // a2(60°):  a = 0.5;            b = mean(1−cos120, 1−cos60) = mean(1.5, 0.5) = 1.0 → s = 0.5
    // b1(180°): a = 0.5;            b = mean(2, 1.5) = 1.75 → s = 0.714286
    // b2(120°): a = 0.5;            b = mean(1.5, 0.5) = 1.0 → s = 0.5
    // mean = (0.714286·2 + 0.5·2)/4 = 0.607143
    const X = [unit(0), unit(60), unit(180), unit(120)];
    expect(silhouette(X, [0, 0, 1, 1], 2)).toBeCloseTo(0.607143, 5);
  });
});

/** n points around each of `centres` (unit vectors in d dims), noise sd σ, re-normalised. */
function blobs(rng: Rng, centres: number[][], n: number, sigma: number): number[][] {
  const out: number[][] = [];
  for (const c of centres) {
    for (let i = 0; i < n; i++) {
      const v = c.map((x) => x + sigma * normal(rng));
      const norm = Math.hypot(...v);
      out.push(v.map((x) => x / norm));
    }
  }
  return out;
}

const axis = (d: number, i: number) => Array.from({ length: d }, (_, j) => (j === i ? 1 : 0));

describe('kmeans', () => {
  it('recovers well-separated clusters and is deterministic for a seed', () => {
    const X = blobs(mulberry32(1), [axis(8, 0), axis(8, 3), axis(8, 6)], 20, 0.1);
    const a = kmeans(X, 3, mulberry32(7));
    const b = kmeans(X, 3, mulberry32(7));
    expect([...a.labels]).toEqual([...b.labels]);
    // Each true blob maps to exactly one label.
    for (let blob = 0; blob < 3; blob++) {
      const ls = new Set([...a.labels].slice(blob * 20, blob * 20 + 20));
      expect(ls.size).toBe(1);
    }
  });
});

describe('clusterSentences', () => {
  it.each([3, 4, 5])('picks k = %i for %i separated blobs', (k) => {
    const X = blobs(mulberry32(k), Array.from({ length: k }, (_, i) => axis(16, i * 3)), 15, 0.15);
    const r = clusterSentences(X, { seed: 1, restarts: 3 });
    expect(r.value?.k).toBe(k);
    expect(r.value?.scores.map((s) => s.k)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(r.dataSufficiency).toBe('ok');
  });

  it('needs at least 30 sentences', () => {
    const X = blobs(mulberry32(2), [axis(4, 0), axis(4, 1)], 10, 0.1);
    expect(clusterSentences(X).dataSufficiency).toBe('insufficient');
  });
});
