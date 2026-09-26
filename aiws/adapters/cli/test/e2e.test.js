import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, aiws, ok, state, git, readFile, writeFile, mergeToMain } from './helpers.js';

test('happy path: REQ-001 from requirement to done with 2 human interventions', () => {
  const root = makeWorkspace();

  // analysis is blocked until discovery has produced the knowledge base
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'blocked');
  assert.match(state(root).reason, /aiws discover/);

  // discovery must run on the base branch; switch back, discover, return
  git(root, ['switch', '-q', 'main']);
  git(root, ['branch', '-q', '-D', 'aiws/REQ-001']);
  ok(root, ['discover']);
  assert.ok(fs.existsSync(path.join(root, 'aiws/knowledge/system-map.md')));

  ok(root, ['new', 'REQ-001']);
  assert.equal(git(root, ['branch', '--show-current']), 'aiws/REQ-001');
  ok(root, ['run', 'REQ-001']);
  let st = state(root);
  assert.equal(st.phase, 'design_approval');
  assert.equal(st.status, 'waiting_human');

  // human gate 1: design approval (records hash)
  ok(root, ['approve', 'REQ-001', 'design', '--yes', '-m', 'OK 30 ky tu']);
  const approval = readFile(root, 'aiws/work/REQ-001/approvals/design-01.yaml');
  assert.match(approval, /decision: approved/);
  assert.match(approval, /02-design\.md: sha256:/);

  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval', JSON.stringify(st, null, 2));
  assert.deepEqual(st.tasks.map((t) => [t.id, t.status, t.test_result]), [
    ['T1', 'done', 'pass'],
    ['T2', 'done', 'pass'],
  ]);

  // commits carry trailers
  const t1 = git(root, ['log', '-1', '--format=%B', st.tasks[0].commit]);
  assert.match(t1, /REQ-ID: REQ-001/);
  assert.match(t1, /Task: T1/);
  assert.match(t1, /Tests: TC-1, TC-2/);
  assert.match(t1, /AIWS-Run: run-\d{4}/);
  assert.match(git(root, ['show', '--name-only', '--format=', st.tasks[0].commit]), /source-be\/src\/users\.js/);

  // evidence exists
  assert.ok(fs.readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs')).some((f) => f.endsWith('.json')));
  assert.ok(fs.existsSync(path.join(root, 'aiws/work/REQ-001/evidence/test-results/T1-attempt-1.yaml')));

  // trace is complete
  const tr = ok(root, ['trace', 'REQ-001']);
  assert.match(tr.stdout, /\| AC-3 \| TC-3 \| T2 \| [0-9a-f]{7} \| pass \|/);
  assert.match(tr.stdout, /- none/);
  ok(root, ['check', 'commit-trailer', '--req', 'REQ-001']);
  ok(root, ['check', 'approvals', '--req', 'REQ-001']);

  // pr approval refuses before merge
  const early = aiws(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.notEqual(early.status, 0);
  assert.match(early.out, /not merged/);

  // human gate 2: merge PR, then knowledge update on its own branch
  mergeToMain(root);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.equal(git(root, ['branch', '--show-current']), 'aiws/REQ-001-knowledge');
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'done');
  assert.equal(st.status, 'done');
  assert.match(readFile(root, 'aiws/knowledge/api-inventory.md'), /nickname/);
  ok(root, ['status', 'REQ-001']);
});

test('design reject keeps every round of feedback and numbers approvals', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['reject', 'REQ-001', 'design', '--yes', '-m', 'Dung bang rieng cho nickname']);
  let st = state(root);
  assert.equal(st.phase, 'design');
  assert.equal(st.status, 'running');

  ok(root, ['run', 'REQ-001']);
  const prompt = fs
    .readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs'))
    .filter((f) => f.endsWith('.prompt.md'))
    .map((f) => readFile(root, `aiws/work/REQ-001/evidence/runs/${f}`))
    .find((p) => p.includes('agent: architect') && p.includes('Dung bang rieng'));
  assert.ok(prompt, 'architect prompt of round 2 must contain the rejection feedback');

  ok(root, ['reject', 'REQ-001', 'design', '--yes', '-m', 'Them index']);
  ok(root, ['run', 'REQ-001']);
  const round3 = fs
    .readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs'))
    .filter((f) => f.endsWith('.prompt.md'))
    .map((f) => readFile(root, `aiws/work/REQ-001/evidence/runs/${f}`))
    .filter((p) => p.includes('agent: architect'))
    .at(-1);
  assert.match(round3, /Dung bang rieng/);
  assert.match(round3, /Them index/);

  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const files = fs.readdirSync(path.join(root, 'aiws/work/REQ-001/approvals')).sort();
  assert.deepEqual(files, ['design-01.yaml', 'design-02.yaml', 'design-03.yaml']);
  st = state(root);
  assert.equal(st.phase, 'planning');
});

test('editing the design after approval invalidates it', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const f = 'aiws/work/REQ-001/02-design.md';
  writeFile(root, f, readFile(root, f) + '\nsua len sau khi duyet\n');
  git(root, ['commit', '-q', '-am', 'tamper']);
  ok(root, ['run', 'REQ-001']);
  const st = state(root);
  assert.equal(st.phase, 'design_approval');
  assert.equal(st.status, 'waiting_human');
  assert.match(st.reason, /changed after approval/);
  assert.equal(st.tasks.length, 0, 'planning must not have run');
});

test('review critical finding goes back to planning, adds a fix task, keeps done tasks', () => {
  const root = makeWorkspace({ discover: true });
  const env = { AIWS_REVIEW_CRITICAL: '1' };
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  const byId = Object.fromEntries(st.tasks.map((t) => [t.id, t]));
  assert.equal(byId.T3.status, 'done');
  const reviews = st.history.filter((h) => h.phase === 'review').map((h) => h.result);
  assert.deepEqual(reviews, ['critical', 'ok']);
  // T1 was not redone
  assert.equal(st.history.filter((h) => h.task === 'T1' && h.result === 'done').length, 1);
  // every commit subject on the branch follows Conventional Commits; the fix task is typed 'fix'
  assert.match(git(root, ['log', '-1', '--format=%s', byId.T3.commit]), /^fix\(REQ-001\): T3 /);
  const subjects = git(root, ['log', '--format=%s', 'main..HEAD']).split('\n');
  for (const s of subjects) assert.match(s, /^(feat|fix|refactor|perf|test|docs|style|build|ci|chore|revert)\(REQ-001\): /, s);
});
