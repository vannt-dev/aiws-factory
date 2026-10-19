import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, ok, tempDir } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { preflight } from '../src/adapters/claude.js';

const OURS = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** Runs the claude preflight with an `aiws` on PATH that prints `version`; returns what it warned. */
function preflightWith(version) {
  const root = makeWorkspace();
  ok(root, ['sync', 'claude']);
  const bin = tempDir('aiws-bin-');
  fs.writeFileSync(path.join(bin, 'aiws.cmd'), `@echo ${version}\r\n`);
  fs.writeFileSync(path.join(bin, 'aiws'), `#!/bin/sh\necho ${version}\n`);
  fs.chmodSync(path.join(bin, 'aiws'), 0o755);
  const oldPath = process.env.PATH;
  const write = process.stderr.write;
  let said = '';
  process.env.PATH = bin + path.delimiter + oldPath;
  process.stderr.write = (chunk) => {
    said += chunk;
    return true;
  };
  try {
    preflight(Workspace.open(root));
  } finally {
    process.stderr.write = write;
    process.env.PATH = oldPath;
  }
  return said;
}

test('the guard hook of PATH being another aiws version is said before the run', () => {
  assert.match(preflightWith('0.0.1'), new RegExp(`runs aiws 0\\.0\\.1 from PATH, while this run is aiws ${OURS.replaceAll('.', '\\.')}`));
  assert.equal(preflightWith(OURS), '', 'nothing to say when they match');
});
