// Writes the manifest of the kit of a past release into src/kit-manifests/<version>.json, read from git:
//
//   node tool/kit-manifest.mjs v0.5.0
//
// A release that wrote no manifest into its workspaces (0.5.0, the first one on npm) is only known to
// `aiws upgrade` through such a file; releases from 0.6.0 on record their own in the workspace.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KIT_PARTS, hashOf } from '../src/kit.js';

const ref = process.argv[2];
if (!ref) {
  console.error('usage: node tool/kit-manifest.mjs <git tag of a release>');
  process.exit(1);
}
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(pkgRoot, '..', '..', '..');
const git = (args, encoding) => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 64 * 1024 * 1024 });

const version = JSON.parse(git(['show', `${ref}:aiws/adapters/cli/package.json`], 'utf8')).version;
const listed = git(['ls-tree', '-r', '--name-only', ref, '--', ...KIT_PARTS.map((part) => `aiws/${part}`), 'AGENTS.md'], 'utf8');
const files = {};
for (const rel of listed.split('\n').filter(Boolean).sort()) {
  if (rel === 'aiws/config/kit-version' || rel === 'aiws/config/kit-manifest.json') continue;
  files[rel] = hashOf(git(['show', `${ref}:${rel}`]));
}
const out = path.join(pkgRoot, 'src', 'kit-manifests', `${version}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ version, files }, null, 2) + '\n');
console.error(`${path.relative(pkgRoot, out)}: ${Object.keys(files).length} files of ${ref}`);
