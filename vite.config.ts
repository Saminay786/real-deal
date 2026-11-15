import { crx } from '@crxjs/vite-plugin';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import baseManifest from './src/manifest.json' with { type: 'json' };

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Copies the bundled model (models/, fetched once by `npm run fetch-model`) into
 * dist/, so the extension never needs the network to run it. (The ONNX runtime
 * .wasm is emitted by Vite itself via a `?url` import in embed.worker.ts.)
 */
function bundleOfflineAssets(): Plugin {
  return {
    name: 'real-deal-offline-assets',
    apply: 'build',
    closeBundle() {
      const model = join(root, 'models', 'Xenova', 'all-MiniLM-L6-v2');
      if (!existsSync(join(model, 'onnx', 'model_quantized.onnx'))) {
        throw new Error('Model files missing. Run `npm run fetch-model` first.');
      }
      const out = join(root, 'dist', 'models', 'Xenova');
      mkdirSync(out, { recursive: true });
      cpSync(join(root, 'models', 'Xenova'), out, { recursive: true });
    },
  };
}

// `--mode fixtures` builds a dev-only variant whose side panel can save the
// current amazon.in page as a test fixture (needs the `scripting` permission).
export default defineConfig(({ mode }) => {
  const manifest =
    mode === 'fixtures'
      ? { ...baseManifest, name: 'Real Deal (fixtures)', permissions: [...baseManifest.permissions, 'scripting'] }
      : baseManifest;
  return {
    plugins: [crx({ manifest }), bundleOfflineAssets()],
    worker: { format: 'es' },
  };
});
