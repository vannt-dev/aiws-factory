// Copies the reference kit of the repository (aiws/config, agents, skills, templates, docs and AGENTS.md)
// into kit/ of this package, so that a published package carries what `aiws init` copies into a new
// project. Runs on `npm pack` / `npm publish` (prepack); `npm run kit:clean` removes it again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoKit = path.resolve(pkgRoot, '..', '..'); // <repo>/aiws
const target = path.join(pkgRoot, 'kit');

const clean = process.argv.includes('--clean');
fs.rmSync(target, { recursive: true, force: true });
if (clean) {
  console.error('kit/ removed');
  process.exit(0);
}
if (!fs.existsSync(path.join(repoKit, 'config', 'workflow.yaml'))) {
  console.error(`no kit at ${repoKit}: run this inside the aiws-factory repository`);
  process.exit(1);
}
const parts = ['config', 'agents', 'skills', 'templates', 'docs'];
for (const part of parts) {
  const src = path.join(repoKit, part);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(target, part), { recursive: true });
}
fs.copyFileSync(path.join(repoKit, '..', 'AGENTS.md'), path.join(target, 'AGENTS.md'));
const version = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(target, 'VERSION'), `${version}\n`);
console.error(`kit/ bundled from ${repoKit} (${parts.join(', ')}, AGENTS.md) for version ${version}`);
