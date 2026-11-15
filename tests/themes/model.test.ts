// Smoke test of the real bundled model (Node build of transformers.js, local files only).
// Skipped if `npm run fetch-model` has not been run.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODELS = resolve(process.cwd(), 'models');
const present = existsSync(resolve(MODELS, 'Xenova', 'all-MiniLM-L6-v2', 'onnx', 'model_quantized.onnx'));

describe.skipIf(!present)('all-MiniLM-L6-v2 (bundled, offline)', () => {
  it('embeds to 384-d unit vectors and ranks paraphrases above unrelated sentences', async () => {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.localModelPath = `${MODELS}/`;
    const ext = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
    const s = [
      'The hook fell off the wall after two days.',
      'It does not stick to the wall at all.',
      'Great value for money.',
      'Wheels were missing from the box.',
    ];
    const v = (await ext(s, { pooling: 'mean', normalize: true })).tolist() as number[][];
    const cos = (a: number[], b: number[]) => a.reduce((x, y, i) => x + y * (b[i] ?? 0), 0);
    expect(v[0]).toHaveLength(384);
    expect(cos(v[0] ?? [], v[0] ?? [])).toBeCloseTo(1, 4);
    // "fell off the wall" is closer to "does not stick" than to "value" or "wheels".
    const fell = v[0] ?? [];
    expect(cos(fell, v[1] ?? [])).toBeGreaterThan(cos(fell, v[2] ?? []) + 0.1);
    expect(cos(fell, v[1] ?? [])).toBeGreaterThan(cos(fell, v[3] ?? []) + 0.1);
  }, 120_000);
});
