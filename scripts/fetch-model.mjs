// Dev-time only: downloads the sentence-embedding model into models/ so it can be
// bundled into the extension. The built extension never downloads anything.
//
//   npm run fetch-model
//
// Files are pinned to a repository commit and checked against SHA-256 hashes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Xenova/all-MiniLM-L6-v2';
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'models', ...REPO.split('/'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

for (const [file, expected] of Object.entries(FILES)) {
  const dest = join(root, ...file.split('/'));
  if (existsSync(dest) && (expected === null || sha256(readFileSync(dest)) === expected)) {
    console.log(`ok       ${file}`);
    continue;
  }
  const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (expected !== null && sha256(buf) !== expected) {
    throw new Error(`SHA-256 mismatch for ${file}: got ${sha256(buf)}, expected ${expected}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  console.log(`fetched  ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
