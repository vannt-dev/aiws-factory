import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, aiws, ok, git, readFile, writeFile } from './helpers.js';

const runs = (root) =>
  fs
    .readdirSync(path.join(root, 'aiws/work/_discover/evidence/runs'))
    .filter((f) => f.endsWith('.json'))
    .sort();

test('discover --since updates the knowledge base for the source files changed since the last knowledge commit', () => {
  const root = makeWorkspace({ discover: true });
  const first = runs(root);
  assert.equal(first.length, 1);
  const knowledgeCommit = git(root, ['log', '-1', '--format=%H', '--', 'aiws/knowledge']);

  // nothing changed: no AI run, no commit
  const same = ok(root, ['discover', '--since']);
  assert.match(same.stdout, new RegExp(`nothing changed in source-\\* since ${knowledgeCommit.slice(0, 7)}`));
  assert.equal(runs(root).length, 1);
  assert.equal(git(root, ['log', '-1', '--format=%H']), git(root, ['log', '-1', '--format=%H', '--', 'aiws/knowledge']));

  // a source change, committed by a person; a change outside source-* does not count
  writeFile(root, 'source-be/src/audit.js', 'export function audit() {}\n');
  writeFile(root, 'requirements/notes.md', 'not code\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'feat: audit log']);
  const r = ok(root, ['discover', '--since']);
  assert.match(r.stdout, /knowledge updated \([0-9a-f]{7}\)/);
  assert.equal(runs(root).length, 2);
  const prompt = readFile(root, 'aiws/work/_discover/evidence/runs/run-0002.prompt.md');
  assert.match(prompt, /## Incremental mode/);
  assert.match(prompt, new RegExp(`as of ${knowledgeCommit.slice(0, 7)}`));
  assert.match(prompt, /source-be\/src\/audit\.js/);
  assert.doesNotMatch(prompt, /requirements\/notes\.md/);
  assert.match(prompt, /feat: audit log/);
  assert.match(git(root, ['log', '-1', '--format=%s']), /^docs\(knowledge\): update knowledge base since [0-9a-f]{7}$/);
  assert.equal(git(root, ['status', '--porcelain']), '');

  // an explicit revision, and an unknown one
  ok(root, ['discover', `--since=${knowledgeCommit}`]);
  assert.equal(runs(root).length, 3);
  assert.match(readFile(root, 'aiws/work/_discover/evidence/runs/run-0003.prompt.md'), /source-be\/src\/audit\.js/);
  const bad = aiws(root, ['discover', '--since=nope']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown revision 'nope'/);
  assert.equal(runs(root).length, 3);
});

test('discover --since needs a knowledge base to update', () => {
  const root = makeWorkspace();
  const r = aiws(root, ['discover', '--since']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /has no commit yet/);
  // --branch checks the revision before creating a branch
  const b = aiws(root, ['discover', '--branch', '--since=nope']);
  assert.notEqual(b.status, 0);
  assert.equal(git(root, ['branch', '--show-current']), 'main');
});
