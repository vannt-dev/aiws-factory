import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, readFile, SCRIPTED } from './helpers.js';
import { parse, modelFor } from '../src/adapters/codex.js';
import { Workspace } from '../src/workspace.js';

/**
 * A stand-in for the Codex CLI: checks the arguments `codex exec` would get, reads the prompt from stdin,
 * does the reviewer's work through the scripted reviewer, prints the JSONL events Codex prints, and writes
 * the final message to the -o file. The real CLI is never called: that is for a person to try.
 */
function fakeCodex(root, { fail = false } = {}) {
  const script = path.join(root, 'fake-codex.cjs');
  fs.writeFileSync(
    script,
    `
const fs = require('fs');
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
fs.writeFileSync('codex-args.json', JSON.stringify(args));
const prompt = fs.readFileSync(0, 'utf8');
fs.writeFileSync('codex-prompt.md', prompt);
if (args[0] === '--version') { console.log('codex-cli 0.0.0-fake'); process.exit(0); }
const out = args[args.indexOf('-o') + 1];
console.log(JSON.stringify({ type: 'thread.started', thread_id: 't1', model: 'gpt-5-codex' }));
if (${fail}) {
  console.log(JSON.stringify({ type: 'error', message: "You've hit your usage limit. Try again at 3pm." }));
  process.exit(1);
}
const r = spawnSync(process.execPath, [${JSON.stringify(path.join(SCRIPTED, 'reviewer.js'))}], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
if (r.status !== 0) { console.log(JSON.stringify({ type: 'error', message: r.stderr })); process.exit(1); }
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Reviewed: ' + r.stdout.trim() } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1200, output_tokens: 300 } }));
fs.writeFileSync(out, 'Reviewed: ' + r.stdout.trim() + '\\n');
`
  );
  return `node "${script}"`;
}

function useCodexForReview(root, command, extra = {}) {
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.phases = { review: { adapter: 'codex' } };
  rt.codex = { command, models: { 'strong-reasoning': 'gpt-5-codex' }, ...extra };
  fs.writeFileSync(file, YAML.stringify(rt));
  fs.appendFileSync(path.join(root, '.gitignore'), 'fake-codex.cjs\ncodex-args.json\ncodex-prompt.md\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'review through codex']);
}

test('the review phase runs through the codex adapter while the other phases stay on the default adapter', () => {
  const root = makeWorkspace({ discover: true });
  useCodexForReview(root, fakeCodex(root));
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const r = ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval', state(root).reason);
  assert.match(r.stdout, /review \/ reviewer/);

  const args = JSON.parse(readFile(root, 'codex-args.json'));
  assert.equal(args[0], 'exec');
  assert.ok(args.includes('--json'));
  assert.deepEqual(args.slice(args.indexOf('-s'), args.indexOf('-s') + 2), ['-s', 'workspace-write'], 'the reviewer writes 05-review.md');
  assert.deepEqual(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2), ['-m', 'gpt-5-codex']);
  assert.equal(args.at(-1), '-', 'the prompt comes on stdin');
  assert.match(readFile(root, 'codex-prompt.md'), /phase: review - agent: reviewer/);

  const runs = fs.readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs')).filter((f) => f.endsWith('.json'));
  const evidence = runs.map((f) => JSON.parse(readFile(root, `aiws/work/REQ-001/evidence/runs/${f}`)));
  const review = evidence.find((e) => e.phase === 'review');
  assert.equal(review.adapter, 'codex');
  assert.equal(review.outcome, 'ok');
  assert.equal(review.report.model, 'gpt-5-codex');
  assert.deepEqual(review.report.tokens, { input_tokens: 1200, output_tokens: 300 });
  assert.equal(review.report.cost_usd, null);
  assert.match(review.report.result, /^Reviewed: /);
  assert.equal(review.allowed_tools, null);
  assert.ok(evidence.filter((e) => e.phase !== 'review').every((e) => e.adapter === 'scripted'));
});

test('a usage-limit answer from codex pauses the run like one from claude', () => {
  const root = makeWorkspace({ discover: true });
  useCodexForReview(root, fakeCodex(root, { fail: true }));
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const r = aiws(root, ['run', 'REQ-001']);
  assert.equal(r.status, 75, r.out);
  const st = state(root);
  assert.equal(st.phase, 'review');
  assert.equal(st.paused, 'usage_limit');
  assert.match(st.reason, /hit your usage limit/);
});

test('a phase whose contract has a shell is refused, and a missing codex is found before any agent runs', () => {
  const root = makeWorkspace({ discover: true });
  useCodexForReview(root, fakeCodex(root));
  // the implementation phase needs a shell the adapter cannot limit
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.phases = { implementation: { adapter: 'codex' } };
  fs.writeFileSync(file, YAML.stringify(rt));
  git(root, ['commit', '-q', '-am', 'codex for implementation']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001', '--once']); // planning
  ok(root, ['run', 'REQ-001', '--once']); // T1 on codex: refused
  const t1 = state(root).tasks.find((t) => t.id === 'T1');
  assert.match(t1.last_failure, /allows a shell, which this adapter cannot limit/);

  rt.phases = { review: { adapter: 'codex' } };
  rt.codex = { command: 'no-such-codex-binary' };
  fs.writeFileSync(file, YAML.stringify(rt));
  git(root, ['commit', '-q', '-am', 'codex missing']);
  const r = aiws(root, ['run', 'REQ-001']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /needs the Codex CLI/);
});

test('parse reads the events of codex exec --json, and modelFor follows phase, agent, then model_hint', () => {
  const raw = [
    'noise before the events',
    JSON.stringify({ type: 'thread.started', model: 'gpt-5' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'last' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } }),
  ].join('\n');
  assert.deepEqual(parse(raw), {
    is_error: false,
    error: null,
    result: 'last',
    num_turns: null,
    cost_usd: null,
    session_id: null,
    model: 'gpt-5',
    tokens: { input_tokens: 10, output_tokens: 2 },
  });
  assert.equal(parse(raw, 'from the file\n').result, 'from the file');
  assert.equal(parse(JSON.stringify({ type: 'error', message: 'boom' })).is_error, true);
  assert.equal(parse('').result, '');

  const ws = new Workspace(makeWorkspace());
  ws._cache.runtime = {
    codex: { models: { fast: 'gpt-5-mini' }, agent_models: { reviewer: 'o3' }, phase_models: { review: 'gpt-5-codex' } },
  };
  assert.equal(modelFor(ws, { id: 'reviewer', model_hint: 'fast' }, 'review'), 'gpt-5-codex');
  assert.equal(modelFor(ws, { id: 'reviewer', model_hint: 'fast' }, 'analysis'), 'o3');
  assert.equal(modelFor(ws, { id: 'analyst', model_hint: 'fast' }), 'gpt-5-mini');
  assert.equal(modelFor(ws, { id: 'analyst' }), null);
});
