import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import baseManifest from './src/manifest.json' with { type: 'json' };

// `--mode fixtures` builds a dev-only variant whose side panel can save the
// current amazon.in page as a test fixture (needs the `scripting` permission).
export default defineConfig(({ mode }) => {
  const manifest =
    mode === 'fixtures'
      ? { ...baseManifest, name: 'Real Deal (fixtures)', permissions: [...baseManifest.permissions, 'scripting'] }
      : baseManifest;
  return { plugins: [crx({ manifest })] };
});
