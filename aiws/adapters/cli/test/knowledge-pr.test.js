import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, ok, git, tempDir, state, bareRepo } from './helpers.js';

/**
 * A workspace with an origin and runtime.yaml -> pull_request: a script that appends its arguments to a
 * calls file and prints a URL per branch (the knowledge branch gets pull/8). `failOn` makes it exit 3 for
 * a branch containing that text.
 */
function withPullRequests({ failOn } = {}) {
  const root = makeWorkspace({ discover: true });
  const origin = bareRepo('aiws-origin-');
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-q', '-u', 'origin', 'main']);
  const dir = tempDir('aiws-pr-');
  const script = path.join(dir, 'create-pr.cjs');
  const calls = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(
    script,
    `const fs = require('fs');\n` +
      `const [branch, base, title, body] = process.argv.slice(2);\n` +
      `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ branch, base, title, body }) + '\\n');\n` +
      (failOn ? `if (branch.includes(${JSON.stringify(failOn)})) process.exit(3);\n` : '') +
      `console.log('https://example.test/acme/shop/pull/' + (branch.includes('knowledge') ? 8 : 7));\n`
  );
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { command: `node "${script}" "{branch}" "{base}" "{title}" "{body_file}"` };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'open draft pull requests']);
  return { root, origin, calls: () => fs.readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) };
}

/** Runs REQ-001 to the PR gate, merges its pull request on the host, approves the PR gate. */
function throughPrGate(root, origin) {
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  const host = tempDir('aiws-host-');
  git(host, ['clone', '-q', origin, '.']);
  git(host, ['config', 'user.name', 'Host']);
  git(host, ['config', 'user.email', 'host@example.com']);
  git(host, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #7', 'origin/aiws/REQ-001']);
  git(host, ['push', '-q', 'origin', 'main']);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
}

test('pull_request: the knowledge update opens its own pull request, like the requirement did', () => {
  const { root, origin, calls } = withPullRequests();
  throughPrGate(root, origin);
  const r = ok(root, ['run', 'REQ-001']);
  const st = state(root);
  assert.equal(st.status, 'done');
  assert.equal(st.knowledge_pr_url, 'https://example.test/acme/shop/pull/8');
  assert.match(st.reason, /knowledge pull request opened: https:\/\/example\.test\/acme\/shop\/pull\/8; merge it into main/);
  assert.match(r.out, /knowledge pull request opened: https:\/\/example\.test\/acme\/shop\/pull\/8/);
  const k = calls().at(-1);
  assert.equal(k.branch, 'aiws/REQ-001-knowledge');
  assert.equal(k.base, 'main');
  assert.equal(k.title, 'docs(REQ-001): knowledge base after the requirement');
  assert.ok(st.history.some((h) => h.result === 'knowledge_pr' && h.url === st.knowledge_pr_url));
  // the branch, with the state that records the pull request, is on the host
  assert.equal(git(origin, ['rev-parse', 'aiws/REQ-001-knowledge']), git(root, ['rev-parse', 'aiws/REQ-001-knowledge']));
  assert.equal(git(root, ['status', '--porcelain']), '');
  // a later run opens no second one
  ok(root, ['run', 'REQ-001']);
  assert.equal(calls().filter((c) => c.branch === 'aiws/REQ-001-knowledge').length, 1);
});

test('pull_request: a failing knowledge pull request leaves the requirement done and says what to do', () => {
  const { root, origin } = withPullRequests({ failOn: 'knowledge' });
  throughPrGate(root, origin);
  const r = ok(root, ['run', 'REQ-001']);
  const st = state(root);
  assert.equal(st.status, 'done');
  assert.equal(st.knowledge_pr_url, undefined);
  assert.match(r.out, /knowledge pull request not opened/);
  assert.match(st.reason, /knowledge updated on aiws\/REQ-001-knowledge: push it and merge it into main/);
  assert.ok(st.history.some((h) => h.result === 'knowledge_pr_failed'));
  assert.equal(git(root, ['status', '--porcelain']), '');
});
