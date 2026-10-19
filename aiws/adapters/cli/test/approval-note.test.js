import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, ok, state, readFile, git } from './helpers.js';

test('a note given with the design approval reaches the planner, the developer and the reviewer', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes', '-m', 'Keep the nickname at most 20 characters']);
  ok(root, ['run', 'REQ-001']);
  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  for (const phase of ['planning', 'implementation', 'review']) {
    const run = st.history.find((h) => h.phase === phase && h.run)?.run;
    assert.ok(run, `a ${phase} run`);
    const prompt = readFile(root, `aiws/work/REQ-001/evidence/runs/${run}.prompt.md`);
    assert.match(prompt, /design approval by .*Keep the nickname at most 20 characters/, phase);
  }
});

test('an approval without a note adds no feedback', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  assert.deepEqual(
    state(root).feedback.filter((f) => /design approval/.test(f.source)),
    []
  );
});

test('git_language: the planner writes task titles, the future commit subjects, in that language', () => {
  const root = makeWorkspace({ discover: true });
  const wf = path.join(root, 'aiws/config/workflow.yaml');
  fs.writeFileSync(wf, fs.readFileSync(wf, 'utf8').replace(/^language: vi$/m, 'language: vi\ngit_language: en'));
  git(root, ['commit', '-qam', 'commits in English']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  const run = state(root).history.find((h) => h.phase === 'planning' && h.run).run;
  const prompt = readFile(root, `aiws/work/REQ-001/evidence/runs/${run}.prompt.md`);
  assert.match(prompt, /write each task `title` in English/);
  assert.match(prompt, /in Vietnamese/, 'the documents stay in the workspace language');
  assert.equal(ok(root, ['prompt', 'REQ-001', 'planning']).out.includes('task `title` in English'), true);
});
