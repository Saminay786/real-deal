// Network audit of the built extension (run after `npm run build`):
//
//   npm run audit:network
//
// Real Deal must make zero outbound network requests. Two layers guarantee it:
//   1. Chrome enforces `connect-src 'self'` on all extension pages and workers
//      (checked below), so fetch/XHR/WebSocket to any other origin is blocked.
//   2. This audit lists every URL that appears in dist/ and fails on any host
//      without a documented reason, and checks that the library defaults that
//      would download models/runtime from the internet are overridden.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

/** Host → why its appearance in the bundle does not cause a request. */
const EXPECTED = {
  'www.amazon.in': 'tab-URL checks and "Open next filter" links that navigate the user\'s own tab',
  'huggingface.co': 'transformers.js default model host; disabled by env.allowRemoteModels = false',
  'cdn.jsdelivr.net': 'transformers.js default WASM location; replaced by env.backends.onnx.wasm.wasmPaths',
  'www.w3.org': 'SVG/XML namespace identifiers, not requests',
  'web.dev': 'link inside an ONNX runtime warning message',
  'developer.mozilla.org': 'link inside a transformers.js error message',
  'github.com': 'link inside a transformers.js error message',
  'gist.github.com': 'link inside a transformers.js error message',
  'rolldown.rs': 'link inside a bundler error message',
};

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const textFiles = files(root).filter((f) => /\.(m?js|html|json|css)$/.test(f));
const found = new Map(); // host -> Set(file)
let apiUses = 0;
for (const f of textFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
    const host = m[1];
    if (!found.has(host)) found.set(host, new Set());
    found.get(host).add(relative(root, f));
  }
  apiUses += (src.match(/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon|new EventSource/g) ?? []).length;
}

const problems = [];

// 1. Every host must be expected.
console.log('Hosts referenced in dist/:');
for (const [host, where] of [...found].sort()) {
  const why = EXPECTED[host];
  console.log(`  ${why ? 'ok  ' : 'FAIL'} ${host.padEnd(24)} ${why ?? 'UNEXPECTED'}  (${[...where].join(', ')})`);
  if (!why) problems.push(`unexpected host ${host}`);
}

// 2. Chrome-enforced CSP must restrict connections to the extension itself.
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!/connect-src 'self'(;|$)/.test(csp)) problems.push(`CSP lacks connect-src 'self': "${csp}"`);
else console.log(`\nCSP: ${csp}`);

// 3. Host permissions: amazon.in only.
const hosts = manifest.host_permissions ?? [];
if (hosts.length !== 1 || hosts[0] !== 'https://www.amazon.in/*') problems.push(`host_permissions: ${JSON.stringify(hosts)}`);

// 4. The worker must override the library's internet defaults.
const worker = textFiles.filter((f) => /embed\.worker/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
const overrides = {
  'allowRemoteModels = false': /\.allowRemoteModels=!1/,
  'localModelPath = <extension>/models/': /\.localModelPath=`\$\{\w+\}\/models\/`/,
  'useBrowserCache = false': /\.useBrowserCache=!1/,
  'wasmPaths = local .wasm': /\.wasmPaths=\{wasm:/,
};
for (const [name, re] of Object.entries(overrides)) {
  const ok = re.test(worker);
  console.log(`${ok ? 'ok  ' : 'FAIL'} worker sets ${name}`);
  if (!ok) problems.push(`worker does not set ${name}`);
}

// 5. The content script runs inside amazon.in pages, where the extension CSP does
//    not apply: it must contain no network API at all (it only reads the DOM and
//    messages the extension).
const contentChunks = textFiles.filter((f) => /src-content-index|content.*\.js$/.test(f));
for (const f of contentChunks) {
  const n = (readFileSync(f, 'utf8').match(/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon|new EventSource/g) ?? []).length;
  console.log(`${n === 0 ? 'ok  ' : 'FAIL'} content script ${relative(root, f)}: ${n} network API call sites`);
  if (n > 0) problems.push(`content script ${relative(root, f)} uses a network API`);
}
if (contentChunks.length === 0) problems.push('content script chunk not found');

console.log(`\n${apiUses} network API call sites in bundled code (library code in extension pages/worker; limited to 'self' by the CSP above).`);
if (problems.length) {
  console.error(`\nNETWORK AUDIT FAILED:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('\nNetwork audit passed: no outbound requests are possible from the extension.');
