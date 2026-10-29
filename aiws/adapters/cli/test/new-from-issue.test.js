import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, git, tempDir, state, readFile, writeFile } from './helpers.js';
import { issueViewArgs, requirementFromIssue, splitCommand } from '../src/issue.js';

const ISSUE = {
  number: 12,
  title: 'Users can set a nickname',
  body: 'A user wants a nickname shown instead of the real name.\r\n\r\n- 1 to 30 characters\r\n- shown in the header',
  url: 'https://github.com/acme/shop/issues/12',
  labels: [{ name: 'feature' }, { name: 'ui' }],
};

test('issueViewArgs: a number, #number, owner/repo#number or an issue URL; anything else is refused', () => {
  const json = ['--json', 'number,title,body,url,labels'];
  assert.deepEqual(issueViewArgs('12'), ['issue', 'view', '12', ...json]);
  assert.deepEqual(issueViewArgs('#12'), ['issue', 'view', '12', ...json]);
  assert.deepEqual(issueViewArgs('acme/shop#7'), ['issue', 'view', '7', '-R', 'acme/shop', ...json]);
  assert.deepEqual(issueViewArgs('https://github.com/acme/shop/issues/7'), [
    'issue',
    'view',
    'https://github.com/acme/shop/issues/7',
    ...json,
  ]);
  assert.deepEqual(issueViewArgs('https://ghe.example.com/acme/shop/issues/7/'), [
    'issue',
    'view',
    'https://ghe.example.com/acme/shop/issues/7/',
    ...json,
  ]);
  for (const bad of ['', 'abc', '12; rm -rf /', 'https://github.com/acme/shop/pull/7', '-R x', '0x1', true]) {
    assert.throws(() => issueViewArgs(bad), /is not an issue/, String(bad));
  }
});

test('splitCommand splits a command line on spaces outside quotes, without a shell', () => {
  assert.deepEqual(splitCommand('gh'), ['gh']);
  assert.deepEqual(splitCommand('node "C:\\a b\\fake-gh.cjs"'), ['node', 'C:\\a b\\fake-gh.cjs']);
  assert.deepEqual(splitCommand("  /opt/gh/bin/gh  'x y' "), ['/opt/gh/bin/gh', 'x y']);
});

test('requirementFromIssue: title as heading, a link back to the issue, its labels and its body', () => {
  const { file, text } = requirementFromIssue('REQ-004', ISSUE);
  assert.equal(file, 'requirements/REQ-004-users-can-set-a-nickname.md');
  assert.equal(
    text,
    '# REQ-004 — Users can set a nickname\n\n' +
      'Source: [acme/shop#12](https://github.com/acme/shop/issues/12)  \n' +
      'Labels: feature, ui\n\n' +
      'A user wants a nickname shown instead of the real name.\n\n- 1 to 30 characters\n- shown in the header\n'
  );
  // Vietnamese title: the file name drops the accents; no labels, no body
  const vi = requirementFromIssue('REQ-005', { ...ISSUE, title: 'Đặt biệt danh cho người dùng', body: '', labels: [] });
  assert.equal(vi.file, 'requirements/REQ-005-dat-biet-danh-cho-nguoi-dung.md');
  assert.match(vi.text, /^# REQ-005 — Đặt biệt danh cho người dùng\n\nSource: .*\n\n_The issue has no description\._\n$/);
  // a long title is cut between words, at most 50 characters
  const long = requirementFromIssue('REQ-007', { ...ISSUE, title: 'Pilot findings from 0.2.1 (token-efficient-work, convert-md-to-pdf)' });
  assert.equal(long.file, 'requirements/REQ-007-pilot-findings-from-0-2-1-token-efficient-work.md');
  assert.equal(requirementFromIssue('REQ-008', { ...ISSUE, title: 'x'.repeat(60) }).file, `requirements/REQ-008-${'x'.repeat(50)}.md`);
  // a title with no letters or digits keeps the issue number in the name
  assert.equal(requirementFromIssue('REQ-006', { ...ISSUE, title: '???' }).file, 'requirements/REQ-006-issue-12.md');
});

/** A workspace whose runtime.yaml points pull_request.gh at a fake GitHub CLI; returns {root, calls()}. */
function workspaceWithFakeGh(issue = ISSUE) {
  const root = makeWorkspace({ discover: true });
  fs.rmSync(path.join(root, 'requirements', 'REQ-001-user-nickname.md'));
  git(root, ['commit', '-q', '-am', 'no requirement yet']);
  const dir = tempDir('aiws-gh-');
  const log = path.join(dir, 'gh-calls.jsonl');
  const fakeGh = path.join(dir, 'fake-gh.cjs');
  fs.writeFileSync(path.join(dir, 'issue.json'), JSON.stringify(issue));
  fs.writeFileSync(
    fakeGh,
    `const fs = require('fs'); const path = require('path');\n` +
      `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n` +
      `const mode = process.env.FAKE_GH_MODE || '';\n` +
      `if (mode === 'auth') { process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\\n'); process.exit(4); }\n` +
      `if (mode === 'missing') { process.stderr.write('GraphQL: Could not resolve to an issue or pull request with the number of 999.\\n'); process.exit(1); }\n` +
      `process.stdout.write(fs.readFileSync(path.join(__dirname, 'issue.json'), 'utf8'));\n`
  );
  const rtFile = 'aiws/config/runtime.yaml';
  const rt = YAML.parse(readFile(root, rtFile));
  rt.pull_request = { gh: `node "${fakeGh}"` };
  writeFile(root, rtFile, YAML.stringify(rt));
  git(root, ['commit', '-q', '-am', 'fake gh']);
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l))
      : [];
  return { root, calls };
}

test('aiws new --from-issue writes the requirement from the issue, commits it, then starts the requirement', () => {
  const { root, calls } = workspaceWithFakeGh();
  const r = ok(root, ['new', 'REQ-001', '--from-issue', '12']);
  assert.match(r.out, /requirements\/REQ-001-users-can-set-a-nickname\.md written from https:\/\/github\.com\/acme\/shop\/issues\/12/);
  assert.match(r.out, /REQ-001 created on branch aiws\/REQ-001/);
  assert.deepEqual(calls(), [['issue', 'view', '12', '--json', 'number,title,body,url,labels']]);

  const rel = 'requirements/REQ-001-users-can-set-a-nickname.md';
  assert.match(readFile(root, rel), /^# REQ-001 — Users can set a nickname\n\nSource: \[acme\/shop#12\]/);
  const st = state(root);
  assert.equal(st.title, 'Users can set a nickname');
  assert.equal(st.requirement, rel);
  assert.equal(st.issue, 'https://github.com/acme/shop/issues/12');
  // the requirement is committed on the base branch, like one written by hand, and the requirement branch starts after it
  assert.equal(git(root, ['log', '-1', '--format=%s', 'main']), 'docs(REQ-001): requirement from issue acme/shop#12');
  assert.equal(git(root, ['log', '-1', '--format=%H', 'main']), st.base_commit);
  assert.equal(git(root, ['branch', '--show-current']), 'aiws/REQ-001');
  assert.deepEqual(git(root, ['status', '--porcelain']), '');
});

test('aiws new --from-issue with an issue URL of another repository passes the URL to gh', () => {
  const { root, calls } = workspaceWithFakeGh();
  ok(root, ['new', 'REQ-001', '--from-issue=https://github.com/acme/shop/issues/12']);
  assert.deepEqual(calls()[0].slice(0, 3), ['issue', 'view', 'https://github.com/acme/shop/issues/12']);
});

test('aiws new --from-issue fails clearly and creates nothing when gh is missing, not signed in or the issue is not found', () => {
  const { root, calls } = workspaceWithFakeGh();
  const head = git(root, ['rev-parse', 'HEAD']);
  const nothingCreated = (label) => {
    assert.equal(git(root, ['rev-parse', 'HEAD']), head, label);
    assert.equal(git(root, ['status', '--porcelain']), '', label);
    assert.equal(git(root, ['branch', '--list', 'aiws/REQ-001']), '', label);
    assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-001')), label);
  };

  let r = aiws(root, ['new', 'REQ-001', '--from-issue', 'not-an-issue']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /'not-an-issue' is not an issue/);
  assert.equal(calls().length, 0, 'gh is not run for a reference it cannot take');
  nothingCreated('bad reference');

  r = aiws(root, ['new', 'REQ-001', '--from-issue'], {});
  assert.notEqual(r.status, 0);
  assert.match(r.out, /--from-issue needs a value/);

  r = aiws(root, ['new', 'REQ-001', '--from-issue', '12'], { env: { FAKE_GH_MODE: 'auth' } });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /gh is not signed in.*gh auth login/s);
  nothingCreated('not signed in');

  r = aiws(root, ['new', 'REQ-001', '--from-issue', '999'], { env: { FAKE_GH_MODE: 'missing' } });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /gh issue view 999 failed.*Could not resolve to an issue/s);
  nothingCreated('issue not found');

  const rtFile = 'aiws/config/runtime.yaml';
  const rt = YAML.parse(readFile(root, rtFile));
  writeFile(root, rtFile, YAML.stringify({ ...rt, pull_request: { gh: 'aiws-no-such-gh-cli' } }));
  git(root, ['commit', '-q', '-am', 'no gh']);
  const head2 = git(root, ['rev-parse', 'HEAD']);
  r = aiws(root, ['new', 'REQ-001', '--from-issue', '12']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /GitHub CLI \(gh\) not found.*https:\/\/cli\.github\.com/s);
  assert.equal(git(root, ['rev-parse', 'HEAD']), head2);
  assert.equal(git(root, ['branch', '--list', 'aiws/REQ-001']), '');
});

test('aiws new --from-issue refuses when a requirement file for the id already exists', () => {
  const { root, calls } = workspaceWithFakeGh();
  writeFile(root, 'requirements/REQ-001-by-hand.md', '# REQ-001 — By hand\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'by hand']);
  const r = aiws(root, ['new', 'REQ-001', '--from-issue', '12']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /requirements\/REQ-001-by-hand\.md already exists/);
  assert.equal(calls().length, 0);
});
