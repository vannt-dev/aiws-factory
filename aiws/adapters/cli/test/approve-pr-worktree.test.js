import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeWorkspace, ok, git, tempDir, state, bareRepo } from './helpers.js';

test('approve pr in a worktree: the base is checked out elsewhere, so the merge is checked on the remote copy', () => {
  const root = makeWorkspace({ discover: true });
  const origin = bareRepo('aiws-origin-');
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-q', '-u', 'origin', 'main']);
  // the requirement runs in a worktree; main stays checked out in the main clone (as with lane slots)
  const wt = path.join(tempDir('aiws-wt-'), 'slot');
  ok(root, ['new', 'REQ-001', '--worktree', wt]);
  ok(wt, ['run', 'REQ-001']);
  ok(wt, ['approve', 'REQ-001', 'design', '--yes']);
  ok(wt, ['run', 'REQ-001']);
  git(wt, ['push', '-q', 'origin', 'aiws/REQ-001']);

  const host = tempDir('aiws-host-');
  git(host, ['clone', '-q', origin, '.']);
  git(host, ['config', 'user.name', 'Host']);
  git(host, ['config', 'user.email', 'host@example.com']);
  git(host, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'origin/aiws/REQ-001']);
  git(host, ['push', '-q', 'origin', 'main']);
  const merged = git(host, ['rev-parse', 'HEAD']);
  const localMain = git(root, ['rev-parse', 'main']);

  const r = ok(wt, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.match(r.out, /could not update the local main/);
  assert.match(r.out, /checked the merge against origin\/main/);
  assert.equal(state(wt).phase, 'knowledge_update');
  assert.equal(git(root, ['rev-parse', 'main']), localMain, 'the main clone is left alone');
  // the knowledge branch starts from the merged base on the remote
  assert.equal(git(wt, ['merge-base', '--is-ancestor', merged, 'HEAD']) === '' ? 'yes' : 'no', 'yes');
});
