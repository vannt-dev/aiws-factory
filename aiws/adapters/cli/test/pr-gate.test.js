import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, ok, git, tempDir, state } from './helpers.js';

test('PR gate: a pull request merged on the host is seen without updating the local base by hand', () => {
  const root = makeWorkspace({ discover: true });
  const origin = tempDir('aiws-origin-');
  git(origin, ['init', '-q', '--bare', '-b', 'main']);
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-q', 'origin', 'main']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  git(root, ['push', '-q', 'origin', 'aiws/REQ-001']);

  // merged on the host: a clone merges and pushes; the local main is not touched
  const clone = tempDir('aiws-host-');
  git(clone, ['clone', '-q', origin, '.']);
  git(clone, ['config', 'user.name', 'Host']);
  git(clone, ['config', 'user.email', 'host@example.com']);
  git(clone, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'origin/aiws/REQ-001']);
  git(clone, ['push', '-q', 'origin', 'main']);

  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.equal(state(root).phase, 'knowledge_update');
  assert.equal(git(root, ['rev-parse', 'main']), git(clone, ['rev-parse', 'HEAD']), 'local main fast-forwarded');
});
