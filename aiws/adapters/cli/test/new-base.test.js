import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, ok, aiws, git, state, bareRepo } from './helpers.js';

/** A workspace with an origin, like a clone: main tracks origin/main. */
function cloned() {
  const root = makeWorkspace({ discover: true });
  const origin = bareRepo('aiws-origin-');
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-q', '-u', 'origin', 'main']);
  return root;
}

test('new: a branch that tracks a remote is the base, as before', () => {
  const root = cloned();
  ok(root, ['new', 'REQ-001']);
  assert.equal(state(root).base_branch, 'main');
});

test('new: a local branch without an upstream (a task branch of a worktree tool) is not taken as the base', () => {
  const root = cloned();
  git(root, ['switch', '-q', '-c', 'REQ-001']); // what `lane new <repo> REQ-001` leaves checked out
  const r = ok(root, ['new', 'REQ-001']);
  assert.equal(state(root).base_branch, 'main', 'the workflow base, not the task branch');
  assert.match(r.out, /REQ-001 has no upstream/);
  assert.match(r.out, /--base/);
});

test('new --base names the base, which must exist locally or on the remote', () => {
  const root = cloned();
  git(root, ['push', '-q', 'origin', 'main:release/1.x']);
  git(root, ['fetch', '-q', 'origin']);
  git(root, ['switch', '-q', '-c', 'scratch']);
  ok(root, ['new', 'REQ-001', '--base', 'release/1.x']);
  assert.equal(state(root).base_branch, 'release/1.x');

  const root2 = cloned();
  const bad = aiws(root2, ['new', 'REQ-001', '--base', 'nope']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.out, /--base nope: no branch nope here or on origin/);
});

test('new: without any remote, the current branch stays the base (a local-only workspace)', () => {
  const root = makeWorkspace({ discover: true });
  git(root, ['switch', '-q', '-c', 'work']);
  ok(root, ['new', 'REQ-001']);
  assert.equal(state(root).base_branch, 'work');
});
