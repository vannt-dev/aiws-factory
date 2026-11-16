import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, ok, state, readFile, writeFile, git } from './helpers.js';

const RULES_VI = '# Làm việc tiết kiệm token';
const RULES_EN = '# Token-efficient work';

/** Every file `aiws sync <target>` writes for an agent. */
function agentFiles(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else out.push(r);
    }
  };
  for (const dir of ['.claude/agents', '.codex/agents', '.opencode/agents', '.agents/agents']) walk(dir);
  return out;
}

function syncAll(root) {
  for (const target of ['claude', 'codex', 'opencode', 'antigravity']) ok(root, ['sync', target]);
}

function turnOff(root) {
  const rel = 'aiws/config/runtime.yaml';
  writeFile(root, rel, `${readFile(root, rel)}\ntoken_efficient: false\n`);
}

test('sync gives every agent of every tool the token-efficient rules, and CLAUDE.md too', () => {
  const root = makeWorkspace();
  syncAll(root);
  const files = agentFiles(root);
  assert.ok(files.length >= 4 * 4, files.join('\n'));
  for (const f of files) assert.ok(readFile(root, f).includes(RULES_VI), f);
  const claude = readFile(root, 'CLAUDE.md');
  assert.ok(claude.startsWith('@AGENTS.md\n'), claude);
  assert.ok(claude.includes(RULES_VI), claude);
  // the source is credited, so a reader knows where the rules come from
  assert.match(claude, /token-efficient-work/);
});

test('the rules follow the document language', () => {
  const root = makeWorkspace();
  const file = path.join(root, 'aiws/config/workflow.yaml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^language: vi$/m, 'language: en'));
  ok(root, ['sync', 'claude']);
  ok(root, ['sync', 'codex']);
  for (const f of agentFiles(root)) {
    const text = readFile(root, f);
    assert.ok(text.includes(RULES_EN), f);
    assert.ok(!text.includes(RULES_VI), f);
  }
});

test('a headless run carries the rules in its prompt', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const run = state(root).history.find((h) => h.run);
  const prompt = readFile(root, `aiws/work/REQ-001/evidence/runs/${run.run}.prompt.md`);
  assert.match(prompt, /^## Token-efficient work$/m);
});

test('runtime.yaml token_efficient: false leaves the rules out everywhere', () => {
  const root = makeWorkspace({ discover: true });
  turnOff(root);
  git(root, ['commit', '-qam', 'turn the token-efficient rules off']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const run = state(root).history.find((h) => h.run);
  assert.doesNotMatch(readFile(root, `aiws/work/REQ-001/evidence/runs/${run.run}.prompt.md`), /Token-efficient work/);
  syncAll(root);
  for (const f of agentFiles(root)) {
    const text = readFile(root, f);
    assert.ok(!text.includes(RULES_VI) && !text.includes(RULES_EN), f);
  }
  assert.equal(readFile(root, 'CLAUDE.md'), '@AGENTS.md\n');
});
