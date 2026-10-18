import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeWorkspace, ok, aiws, state, cleanEnv, scenario, FIXTURES } from './helpers.js';

const DRIVER = path.join(FIXTURES, 'gate-driver.mjs');

function drive(root, keys, env = {}) {
  const r = spawnSync(process.execPath, [DRIVER, root, 'REQ-001', ...keys], { encoding: 'utf8', env: cleanEnv(env), timeout: 60000 });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function atDesignGate() {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'design_approval');
  return root;
}

test('gate menu at the design gate: a summary, and Enter on the first option approves the design', () => {
  const root = atDesignGate();
  const r = drive(root, ['ENTER']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /REQ-001: the design waits for your decision/);
  assert.match(r.out, /Design review: 0 critical, 0 major, 1 minor open/);
  assert.match(r.out, /> 1\. Approve the design/);
  assert.match(r.out, /PICKED approve/);
  const st = state(root);
  assert.equal(st.phase, 'planning');
  assert.ok(st.history.some((h) => h.phase === 'design_approval' && h.result === 'approved'));
});

test('gate menu: reject asks what must change and records it as feedback for the design', () => {
  const root = atDesignGate();
  const r = drive(root, ['DOWN', 'ENTER', 'TEXT:Return 409 for a duplicate nickname']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /What must change\?/);
  const st = state(root);
  assert.equal(st.phase, 'design');
  assert.match(JSON.stringify(st.feedback ?? st), /Return 409 for a duplicate nickname/);
});

test('gate menu: Esc changes nothing, and a number picks its option', () => {
  const root = atDesignGate();
  assert.match(drive(root, ['ESC']).out, /PICKED later/);
  assert.equal(state(root).phase, 'design_approval');
  assert.match(drive(root, ['4']).out, /PICKED later/);
  assert.equal(state(root).phase, 'design_approval');
});

test('aiws gate refuses inside an AI session and without a terminal', () => {
  const root = atDesignGate();
  const inAi = aiws(root, ['gate', 'REQ-001'], { env: { CLAUDECODE: '1' } });
  assert.equal(inAi.status, 3);
  assert.match(inAi.out, /human-only command and refuses to run inside an AI session/);
  const noTty = aiws(root, ['gate', 'REQ-001']);
  assert.equal(noTty.status, 3);
  assert.match(noTty.out, /needs an interactive terminal/);
  // and the driver, which is not a terminal, is refused in an AI session too
  assert.match(drive(root, ['ENTER'], { CLAUDECODE: '1' }).out, /refuses to run inside an AI session/);
  assert.equal(state(root).phase, 'design_approval');
});

test('aiws run does not open the menu without a terminal (scripts and CI keep working)', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  const r = ok(root, ['run', 'REQ-001']);
  assert.doesNotMatch(r.out, /waits for your decision/);
});

test('gate menu at a blocking question of the analysis: the answer is typed and recorded', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'analyst.js': `
      import { write, work, read } from './_lib.js';
      const answered = read(work('01-analysis.md')).includes('Q1');
      write(work('01-analysis.md'), \`# A
## Mục tiêu
x
## Acceptance criteria
- AC-1: nickname luu duoc
## Impact
x
## Reuse
x
## Câu hỏi mở
- \${answered ? '[answered]' : '[blocking]'} Q1: Nickname co phai duy nhat?
\`);
    `,
  });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  const r = drive(root, ['ENTER', 'TEXT:Khong can duy nhat']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /a question waits for your answer/);
  assert.match(r.out, /Q1: Nickname co phai duy nhat/);
  assert.match(r.out, /PICKED answer/);
  assert.equal(state(root).status, 'running');
});

test('gate menu at the PR gate: tasks, review and the reminder to merge first', () => {
  const root = atDesignGate();
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  const r = drive(root, ['ESC']);
  assert.match(r.out, /the pull request waits for you/);
  assert.match(r.out, /Tasks done: 2 of 2/);
  assert.match(r.out, /Approve only after the pull request is merged/);
  assert.match(r.out, /The pull request is merged: approve/);
  assert.equal(state(root).phase, 'pr_approval');
});
