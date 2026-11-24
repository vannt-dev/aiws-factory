import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, git, scenario, readFile, writeFile } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { claudeArgs } from '../src/adapters/claude.js';
import { parseDriftAnswer } from '../src/drift.js';

const today = () => new Date().toISOString().slice(0, 10);
const reportOf = (root, req = 'REQ-001') => `aiws/work/${req}/drift/${today()}.md`;

/** A workspace with REQ-001 finished: its state says done, its design and test spec are committed. */
function finishedWorkspace() {
  const root = makeWorkspace({ discover: true });
  writeFile(
    root,
    'aiws/work/REQ-001/state.yaml',
    YAML.stringify({
      req_id: 'REQ-001',
      title: 'User nickname',
      requirement: 'requirements/REQ-001-user-nickname.md',
      branch: 'aiws/REQ-001',
      phase: 'done',
      status: 'done',
    })
  );
  writeFile(
    root,
    'aiws/work/REQ-001/02-design.md',
    '# REQ-001 — Thiết kế\n\n## Quyết định chính\n- D1: setNickname(id, nickname) trong source-be/src/users.js, 1-30 ký tự.\n'
  );
  writeFile(root, 'aiws/work/REQ-001/03-test-spec.md', '# REQ-001 — Test spec\n\n- TC-1: nickname hợp lệ được lưu.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'REQ-001 done']);
  return root;
}

// The scripted drift checker answers on stdout, as the AI answers in its final message. It fails when the run
// is not marked read-only, so every test also checks that the orchestrator sets that mode.
const checker = (answer, extra = '') => `
  if (process.env.AIWS_READ_ONLY !== '1') { console.error('not a read-only run'); process.exit(1); }
  if (process.env.AIWS_PHASE !== 'drift') { console.error('wrong phase ' + process.env.AIWS_PHASE); process.exit(1); }
  ${extra}
  console.log(${JSON.stringify(answer)});
`;

const NO_DRIFT = 'Checked D1 and TC-1 against source-be/src/users.js.\n\nSummary: no drift (2 claims checked).';
const DRIFT = [
  '## Findings',
  '- [drift] 02-design.md D1 — setNickname(id, nickname) exists in source-be/src/users.js — source-be/src/users.js:1 has no setNickname',
  '',
  'Summary: 1 of 2 claims no longer match the code.',
].join('\n');

test('drift --dry-run prints the read-only prompt of each finished requirement and runs nothing', () => {
  const root = finishedWorkspace();
  const r = ok(root, ['drift', '--dry-run']);
  assert.match(r.stdout, /phase: drift - agent: drift-checker/);
  assert.match(r.stdout, /## Read-only run \(enforced\)/);
  assert.doesNotMatch(r.stdout, /## Write scope \(enforced\)/);
  assert.match(r.stdout, /aiws\/work\/REQ-001\/02-design\.md/);
  assert.match(r.stdout, /aiws\/work\/REQ-001\/03-test-spec\.md/);
  // a document the requirement does not have is not listed
  assert.doesNotMatch(r.stdout, /aiws\/work\/REQ-001\/api-contract\.yaml/);
  assert.match(r.stdout, /Summary: no drift/);
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/_drift')), 'no run, no evidence');
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-001/drift')), 'no report');
});

test('no drift: exit 0 and a report that says so', () => {
  const root = finishedWorkspace();
  const env = scenario({ 'drift-checker.js': checker(NO_DRIFT) });
  const r = ok(root, ['drift'], { env });
  assert.match(r.out, /REQ-001: no drift/);
  const report = readFile(root, reportOf(root));
  assert.match(report, /# REQ-001 — Drift report/);
  assert.match(report, /Summary: no drift \(2 claims checked\)/);
  assert.match(report, /run-0001/);
  const ev = JSON.parse(readFile(root, 'aiws/work/_drift/evidence/runs/run-0001.json'));
  assert.equal(ev.phase, 'drift');
  assert.equal(ev.outcome, 'ok');
  // the report is left for a person to read or commit; the orchestrator commits nothing
  assert.match(git(root, ['status', '--porcelain']), /aiws\/work\/(REQ-001\/drift|_drift)/);
  assert.equal(git(root, ['log', '-1', '--format=%s']), 'REQ-001 done');
});

test('drift found: exit 1, each finding with its file:line in the report', () => {
  const root = finishedWorkspace();
  const env = scenario({ 'drift-checker.js': checker(DRIFT) });
  const r = aiws(root, ['drift', 'REQ-001'], { env });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REQ-001: 1 drift/);
  const report = readFile(root, reportOf(root));
  assert.match(report, /- \[drift\] 02-design\.md D1 .* source-be\/src\/users\.js:1 has no setNickname/);
  assert.match(report, /Summary: 1 of 2 claims no longer match the code\./);
});

test('an answer without file:line evidence or a summary is retried with the reason', () => {
  const root = finishedWorkspace();
  const env = scenario({
    'drift-checker-1.js': checker('- [drift] D1 — setNickname is gone\n\nSummary: 1 drift.'),
    'drift-checker-2.js': checker(DRIFT),
  });
  const r = aiws(root, ['drift'], { env });
  assert.equal(r.status, 1, r.out);
  const second = readFile(root, 'aiws/work/_drift/evidence/runs/run-0002.prompt.md');
  assert.match(second, /Previous attempt failed/);
  assert.match(second, /no file:line evidence/);
  assert.match(readFile(root, reportOf(root)), /run-0002/);
});

test('a drift run that writes is reverted and fails (exit 2), leaving no report', () => {
  const root = finishedWorkspace();
  const write = "import fs from 'node:fs'; fs.appendFileSync('source-be/src/users.js', '\\n// changed\\n');";
  const env = scenario({ 'drift-checker.js': checker(NO_DRIFT, write) });
  const before = readFile(root, 'source-be/src/users.js');
  const r = aiws(root, ['drift'], { env });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /reverted: source-be\/src\/users\.js/);
  assert.equal(readFile(root, 'source-be/src/users.js'), before);
  assert.ok(!fs.existsSync(path.join(root, reportOf(root))));
});

test('only finished requirements are checked', () => {
  const root = makeWorkspace({ discover: true });
  let r = ok(root, ['drift']);
  assert.match(r.out, /No finished requirement/);
  ok(root, ['new', 'REQ-001']);
  // an error is exit 2, so that CI tells it from drift (exit 1)
  r = aiws(root, ['drift', 'REQ-001']);
  assert.equal(r.status, 2);
  assert.match(r.out, /REQ-001 is not finished/);
  r = aiws(root, ['drift', 'REQ-404']);
  assert.equal(r.status, 2);
  assert.match(r.out, /REQ-404 does not exist/);
});

test('guard: a read-only run may write nothing, not even what its phase scope allows', () => {
  const root = finishedWorkspace();
  const hook = (tool, file, env) =>
    aiws(root, ['guard'], {
      input: JSON.stringify({ cwd: root, tool_name: tool, tool_input: { file_path: path.join(root, file) } }),
      env: { AIWS_REQ: 'REQ-001', AIWS_PHASE: 'review', ...env },
    });
  assert.equal(hook('Write', 'aiws/work/REQ-001/05-review.md', {}).status, 0);
  const denied = hook('Write', 'aiws/work/REQ-001/05-review.md', { AIWS_READ_ONLY: '1' });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /read-only run/);
  assert.equal(hook('Edit', 'source-be/src/users.js', { AIWS_READ_ONLY: '1' }).status, 2);
  assert.equal(hook('Read', 'source-be/src/users.js', { AIWS_READ_ONLY: '1' }).status, 0);
});

test('Claude runs the drift checker with read tools only', () => {
  const ws = new Workspace(finishedWorkspace());
  const contract = ws.contract('contracts/drift.yaml');
  assert.equal(contract.read_only, true);
  const { tools, args } = claudeArgs(ws, { contract, agent: ws.agent('drift-checker'), phase: 'drift' });
  assert.deepEqual(tools, ['Read', 'Grep', 'Glob']);
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Grep,Glob');
  // even a contract that names a write tool gets none once it is read-only
  assert.deepEqual(
    claudeArgs(ws, { contract: { ...contract, tools: ['read', 'write', 'bash'] }, agent: { id: 'x' }, phase: 'drift' }).tools,
    ['Read', 'Grep', 'Glob']
  );
});

test('parseDriftAnswer: findings, summary and the checks on them', () => {
  assert.deepEqual(parseDriftAnswer(NO_DRIFT), { findings: [], summary: 'Summary: no drift (2 claims checked).' });
  const d = parseDriftAnswer(DRIFT);
  assert.equal(d.findings.length, 1);
  assert.match(d.summary, /^Summary: 1 of 2/);
  assert.match(parseDriftAnswer('nothing to say').error, /no `Summary:` line/);
  assert.match(parseDriftAnswer('- [drift] D1 — gone\nSummary: 1 drift').error, /no file:line evidence/);
  // evidence in the requirement's own documents is not evidence about the code
  assert.match(parseDriftAnswer('- [drift] aiws/work/REQ-001/02-design.md:3 — gone\nSummary: 1 drift').error, /no file:line evidence/);
  assert.match(parseDriftAnswer('Summary: 2 claims no longer match').error, /lists no \[drift\] finding/);
  // a Windows path and a bold summary are understood
  assert.equal(parseDriftAnswer('* [DRIFT] x — source-be\\src\\users.js:12 — y\n**Summary:** 1 drift').findings.length, 1);
});

test('Codex runs the drift checker in its read-only sandbox', () => {
  const root = finishedWorkspace();
  const script = path.join(root, 'fake-codex.cjs');
  fs.writeFileSync(
    script,
    `
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.0.0-fake'); process.exit(0); }
fs.writeFileSync('codex-args.json', JSON.stringify({ args, readOnly: process.env.AIWS_READ_ONLY }));
fs.readFileSync(0, 'utf8');
const answer = ${JSON.stringify(NO_DRIFT)};
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: answer } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }));
fs.writeFileSync(args[args.indexOf('-o') + 1], answer);
`
  );
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.phases = { drift: { adapter: 'codex' } };
  rt.codex = { command: `node "${script}"` };
  fs.writeFileSync(file, YAML.stringify(rt));
  fs.appendFileSync(path.join(root, '.gitignore'), 'fake-codex.cjs\ncodex-args.json\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'drift through codex']);

  const r = ok(root, ['drift']);
  assert.match(r.out, /REQ-001: no drift/);
  const seen = JSON.parse(readFile(root, 'codex-args.json'));
  assert.equal(seen.args[seen.args.indexOf('-s') + 1], 'read-only');
  assert.equal(seen.readOnly, '1');
});
