import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, ok, aiws, git, tempDir, state, bareRepo } from './helpers.js';
import { ledgerFile } from '../src/reviewgate.js';

const PR = 'https://github.com/acme/shop/pull/7';

/** At the PR gate with a draft pull request (PR), merged on the host; review_gate as given. */
function atMergedPr(reviewGate) {
  const root = makeWorkspace({ discover: true });
  const origin = bareRepo('aiws-origin-');
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-q', '-u', 'origin', 'main']);
  const script = path.join(tempDir('aiws-pr-'), 'create-pr.cjs');
  fs.writeFileSync(script, `console.log(${JSON.stringify(PR)});\n`);
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { command: `node "${script}"` };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  if (reviewGate) {
    const wfFile = path.join(root, 'aiws/config/workflow.yaml');
    const wf = YAML.parse(fs.readFileSync(wfFile, 'utf8'));
    wf.review_gate = reviewGate;
    fs.writeFileSync(wfFile, YAML.stringify(wf));
  }
  git(root, ['commit', '-qam', 'pull requests and review gate']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).pr_url, PR);
  const head = git(root, ['rev-parse', 'aiws/REQ-001']);
  const host = tempDir('aiws-host-');
  git(host, ['clone', '-q', origin, '.']);
  git(host, ['config', 'user.name', 'Host']);
  git(host, ['config', 'user.email', 'host@example.com']);
  git(host, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #7', 'origin/aiws/REQ-001']);
  git(host, ['push', '-q', 'origin', 'main']);
  return { root, head };
}

/** A reviewproof ledger (schema 1) for PR with the given rounds. */
function writeLedger(home, rounds) {
  const file = ledgerFile(home, PR);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ledger = {
    schemaVersion: 1,
    pr: { host: 'github', hostname: 'github.com', project: 'acme/shop', number: 7, url: PR, title: 't' },
    rounds: rounds.map((r, i) => ({
      n: i + 1,
      head: r.head,
      base: 'b',
      from: 'b',
      startedAt: '2026-11-16T00:00:00Z',
      gates: [],
      reads: [],
      skips: [],
      ...(r.verdict ? { verdict: { value: r.verdict, summary: 's', at: '2026-11-16T00:00:00Z' } } : {}),
    })),
    findings: [],
  };
  fs.writeFileSync(file, JSON.stringify(ledger));
}

test('review gate: the ledger of a pull request sits where reviewproof keeps it', () => {
  assert.equal(ledgerFile('/h', PR), path.join('/h', 'github.com', 'acme', 'shop', '7', 'ledger.json'));
  assert.equal(
    ledgerFile('/h', 'https://gitlab.example.com:8443/g/sub/r/-/merge_requests/12'),
    path.join('/h', 'gitlab.example.com_8443', 'g', 'sub', 'r', '12', 'ledger.json')
  );
  assert.equal(ledgerFile('/h', 'https://example.test/not-a-pr'), null);
});

test('review gate reviewproof: approve pr needs a verdict pass of a round at the pull request head', () => {
  const { root, head } = atMergedPr('reviewproof');
  const home = tempDir('aiws-rp-home-');
  const env = { REVIEWPROOF_HOME: home };

  const none = aiws(root, ['approve', 'REQ-001', 'pr', '--yes'], { env });
  assert.notEqual(none.status, 0);
  assert.match(none.out, /no reviewproof ledger for https:\/\/github\.com\/acme\/shop\/pull\/7/);
  assert.equal(state(root).phase, 'pr_approval', 'nothing recorded');

  writeLedger(home, [{ head: '0'.repeat(40), verdict: 'pass' }]);
  const old = aiws(root, ['approve', 'REQ-001', 'pr', '--yes'], { env });
  assert.notEqual(old.status, 0);
  assert.match(old.out, new RegExp(`round 1 reviewed 0000000, the head of aiws/REQ-001 is ${head.slice(0, 7)}`));

  writeLedger(home, [{ head, verdict: 'not-yet' }]);
  const notYet = aiws(root, ['approve', 'REQ-001', 'pr', '--yes'], { env });
  assert.notEqual(notYet.status, 0);
  assert.match(notYet.out, /round 1 has verdict not-yet/);

  writeLedger(home, [{ head, verdict: 'pass' }, { head }]);
  const open = aiws(root, ['approve', 'REQ-001', 'pr', '--yes'], { env });
  assert.notEqual(open.status, 0);
  assert.match(open.out, /round 2 has no verdict yet/);

  writeLedger(home, [{ head, verdict: 'pass' }]);
  const r = ok(root, ['approve', 'REQ-001', 'pr', '--yes'], { env });
  assert.match(r.out, /reviewproof: round 1, verdict pass at/);
  const st = state(root);
  assert.equal(st.phase, 'knowledge_update');
  const merged = st.history.find((h) => h.result === 'merged');
  assert.equal(merged.review, `reviewproof round 1 pass at ${head.slice(0, 7)}`);
});

test('review gate: off by default, approve pr asks for no ledger', () => {
  const { root } = atMergedPr(null);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes'], { env: { REVIEWPROOF_HOME: tempDir('aiws-rp-empty-') } });
  assert.equal(state(root).phase, 'knowledge_update');
});

test('review gate: an unknown value is refused', () => {
  const { root } = atMergedPr('coderabbit');
  const r = aiws(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /review_gate coderabbit is not known: use reviewproof, or leave it out/);
});
