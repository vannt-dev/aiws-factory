import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, ok, git, tempDir, state, bareRepo } from './helpers.js';
import { prTitle } from '../src/engine.js';

test('PR gate: a pull request merged on the host is seen without updating the local base by hand', () => {
  const root = makeWorkspace({ discover: true });
  const origin = bareRepo('aiws-origin-');
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

  // done: the run says what to do with the knowledge branch
  const done = ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'done');
  assert.match(done.out, /knowledge updated on aiws\/REQ-001-knowledge: push it and merge it into main/);
});

test('the pull request title is a Conventional Commits subject that no shell reads', () => {
  const feat = [{ type: 'feat' }, { type: 'fix' }];
  assert.equal(prTitle({ req_id: 'REQ-001', title: 'User nickname', tasks: feat }), 'feat(REQ-001): user nickname');
  // only fixes: fix; no title: the requirement id
  assert.equal(prTitle({ req_id: 'REQ-002', title: 'Login loop', tasks: [{ type: 'fix' }] }), 'fix(REQ-002): login loop');
  assert.equal(prTitle({ req_id: 'REQ-003', tasks: [] }), 'feat(REQ-003): requirement REQ-003');
  // quotes, backticks, $, %, ! and backslashes are left out; at most 100 characters
  const title = prTitle({ req_id: 'REQ-001', title: 'list `rm -rf x` and $(id) "quoted" %PATH% !x!\nnext', tasks: feat });
  assert.equal(title, 'feat(REQ-001): list rm -rf x and (id) quoted PATH x next');
  assert.equal(prTitle({ req_id: 'REQ-001', title: 'x'.repeat(200), tasks: feat }).length, 100);
});
