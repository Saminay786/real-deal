// Builds a ready-to-install zip for people who don't want to build from source:
// release/real-deal-v<version>.zip, containing dist/ plus LICENSE and third-party notices.
// Usage: npm run package   (after `npm run fetch-model` once)
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const { version } = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
const model = join(root, 'dist/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx');

if (!existsSync(model)) {
  console.error('dist/ has no model. Run `npm run fetch-model` and `npm run build` first.');
  process.exit(1);
}
for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) copyFileSync(join(root, f), join(root, 'dist', f));

mkdirSync(join(root, 'release'), { recursive: true });
const zip = join(root, 'release', `real-deal-v${version}.zip`);
rmSync(zip, { force: true });

// The zip holds a single top-level folder "real-deal", so unzipping gives one folder to load.
if (process.platform === 'win32') {
  const staging = join(root, 'release', 'real-deal');
  rmSync(staging, { recursive: true, force: true });
  cpSync(join(root, 'dist'), staging, { recursive: true });
  // Windows' bsdtar writes standard forward-slash paths (Compress-Archive in PowerShell 5 writes backslashes,
  // which unzip wrongly on macOS/Linux).
  const tar = join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', join(root, 'release'), 'real-deal'], { stdio: 'inherit' });
  rmSync(staging, { recursive: true, force: true });
} else {
  execFileSync('sh', ['-c', `rm -rf release/real-deal && cp -R dist release/real-deal && cd release && zip -qr ${JSON.stringify(zip)} real-deal && rm -rf real-deal`], {
    stdio: 'inherit',
  });
}
console.log(`Wrote ${zip} (${(statSync(zip).size / 1e6).toFixed(1)} MB)`);
