// Build: syntax-checks every source module, then copies index.html and src/ into dist/.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listJs(p) : p.endsWith('.js') ? [p] : [];
  });
}

for (const file of listJs(path.join(root, 'src'))) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(res.stderr);
    process.exit(1);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
fs.cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
console.log('built dist/');
