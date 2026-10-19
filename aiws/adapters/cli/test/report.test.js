import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, ok, scenario, readFile, mergeToMain, tempDir, git } from './helpers.js';
import { esc, renderHtml } from '../src/report.js';

test('the report page carries the state, the trace, the tasks, the approvals, the runs and the documents', () => {
  const root = makeWorkspace({ discover: true });
  // the architect writes text that would be markup on the page
  const env = scenario({
    'architect-1.js': `
      import { write, work } from './_lib.js';
      await import('./_architect_real.js');
      write(work('02-design.md'), (await import('node:fs')).readFileSync(work('02-design.md'), 'utf8') + '\\n<script>alert("x")</script> & "quotes"\\n');
    `,
  });
  const dir = env.AIWS_SCRIPTED_DIR.split(path.delimiter);
  fs.copyFileSync(path.join(dir[1], 'architect.js'), path.join(dir[0], '_architect_real.js'));
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes', '-m', 'looks <fine>']);
  ok(root, ['run', 'REQ-001']);

  const r = ok(root, ['report', 'REQ-001']);
  assert.match(r.stdout, /Report written: .*report\.html/);
  const html = readFile(root, 'aiws/work/REQ-001/report.html');
  assert.match(html, /<title>REQ-001 — User nickname<\/title>/);
  assert.match(html, /<span class="warn">waiting_human<\/span>/);
  assert.match(html, /pr_approval/);
  // the pipeline row: done steps, the gate that waits, who approved the design
  assert.match(html, /<div class="step done"><b>analysis<\/b>/);
  assert.match(html, /<div class="step done gate"><b>design_approval<\/b><span>approved by tuan<\/span>/);
  assert.match(html, /<div class="step waiting gate"><b>pr_approval<\/b><span>waiting for you<\/span>/);
  // trace rows, tasks and the approval
  assert.match(html, /<td>AC-1<\/td><td>TC-1<\/td><td>T1<\/td><td><code>[0-9a-f]{7}<\/code><\/td><td><span class="ok">pass<\/span><\/td>/);
  assert.match(html, /<td>T2<\/td>/);
  assert.match(html, /<td>design<\/td><td><span class="ok">approved<\/span><\/td><td>tuan<\/td>/);
  assert.match(html, /looks &lt;fine&gt;/);
  // runs with their outcome, test runs, history
  assert.match(html, /<code>run-0001<\/code><\/td><td>analysis<\/td><td>analyst<\/td>/);
  assert.match(html, /<td>T1<\/td><td>1<\/td><td><span class="ok">pass<\/span>/);
  assert.match(html, /all_tasks_done/);
  // documents are there, and markup inside them is inert
  assert.match(html, /<summary>02-design\.md<\/summary><pre>/);
  assert.match(html, /<summary>02-design-review\.md<\/summary><pre>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &quot;quotes&quot;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /<details open><summary>05-review\.md<\/summary>/);
});

test('--out writes the page elsewhere, and a finished requirement reports done', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  mergeToMain(root);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  ok(root, ['run', 'REQ-001']);
  const out = path.join(tempDir('aiws-report-'), 'r.html');
  ok(root, ['report', 'REQ-001', '--out', out]);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /<span class="ok">done<\/span><\/b><span>status<\/span>/);
  assert.match(html, /<td>pr<\/td><td><span class="ok">merged<\/span>/);
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-001/report.html')));
});

test('renderHtml escapes every field and copes with an empty requirement', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  const html = renderHtml(
    {
      req: 'REQ-9',
      title: 'T <b>',
      requirement: '',
      branch: '',
      phase: 'analysis',
      status: 'running',
      reason: '',
      paused: null,
      budget_usd: 20,
      stats: { runs: 0, duration_ms: 0, cost_usd: null, by_phase: {} },
      tasks: [],
      trace: { rows: [], problems: ['No acceptance criteria found'] },
      approvals: [],
      history: [],
      runs: [],
      tests: [],
      docs: [],
    },
    { generatedAt: '2026-10-11T00:00:00Z' }
  );
  assert.match(html, /<h1>REQ-9 — T &lt;b&gt;<\/h1>/);
  assert.match(html, /cost \(budget 20\.00\)/);
  assert.match(html, /Problems: No acceptance criteria found/);
  assert.match(html, /generated 2026-10-11T00:00:00Z/);
  assert.equal((html.match(/<p class="muted">none<\/p>/g) ?? []).length, 6);
});

test('the report in the work folder does not block the PR gate, and is never committed', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['report', 'REQ-001']); // the gate menu offers it, at the default place
  assert.ok(fs.existsSync(path.join(root, 'aiws/work/REQ-001/report.html')));
  mergeToMain(root);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(git(root, ['status', '--porcelain']), '');
  assert.equal(git(root, ['log', '--all', '--format=', '--name-only', '--', 'aiws/work/REQ-001/report.html']), '');
});
