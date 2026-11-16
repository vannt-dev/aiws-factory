import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, aiws, ok, tempDir } from './helpers.js';

const OURS = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('help lists detect --write among the human-only commands', () => {
  const r = aiws(tempDir('aiws-help-'), ['help']);
  const human = r.out.slice(r.out.indexOf('Human-only'), r.out.indexOf('Checks (for CI'));
  assert.match(human, /aiws detect --write/);
});

/** An `aiws` on PATH that prints `version`. */
function fakeAiws(version) {
  const bin = tempDir('aiws-bin-');
  fs.writeFileSync(path.join(bin, 'aiws.cmd'), `@echo ${version}\r\n`);
  fs.writeFileSync(path.join(bin, 'aiws'), `#!/bin/sh\necho ${version}\n`);
  fs.chmodSync(path.join(bin, 'aiws'), 0o755);
  return { PATH: bin + path.delimiter + process.env.PATH };
}

test('sync claude says when the guard hook it writes will run another aiws version from PATH', () => {
  const root = makeWorkspace();
  const other = ok(root, ['sync', 'claude'], { env: fakeAiws('0.0.1') });
  assert.match(other.out, new RegExp(`runs aiws 0\\.0\\.1 from PATH, while this is aiws ${OURS.replaceAll('.', '\\.')}`));
  const same = ok(root, ['sync', 'claude'], { env: fakeAiws(OURS) });
  assert.doesNotMatch(same.out, /from PATH/);
});
