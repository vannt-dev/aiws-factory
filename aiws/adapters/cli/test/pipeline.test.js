import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { KIT } from './helpers.js';
import { pipelineSteps, pipelineText, pipelineHtml } from '../src/pipeline.js';
import { esc } from '../src/report.js';

const workflow = YAML.parse(fs.readFileSync(path.join(KIT, 'config', 'workflow.yaml'), 'utf8'));
const noStats = { runs_by_phase: {}, duration_by_phase: {}, by_phase: {} };

test('the row follows the workflow, without the side gate for questions', () => {
  const steps = pipelineSteps(workflow, { phase: 'analysis', status: 'running', history: [] }, noStats);
  assert.ok(!steps.some((s) => s.id === 'design_change_requested'));
  assert.equal(steps[0].id, 'analysis');
  assert.equal(steps[0].status, 'running');
  assert.ok(steps.slice(1).every((s) => s.status === 'not_started'));
});

test('a requirement at the design gate: earlier steps done with their runs, cost and time, the gate waits', () => {
  const stats = {
    runs_by_phase: { analysis: 1, design: 3 },
    duration_by_phase: { analysis: 120000, design: 420000 },
    by_phase: { analysis: 0.4, design: 2.25 },
  };
  const steps = pipelineSteps(workflow, { phase: 'design_approval', status: 'waiting_human', history: [] }, stats);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId.analysis.status, 'done');
  assert.deepEqual([byId.design.runs, byId.design.minutes, byId.design.cost_usd], [3, 7, 2.25]);
  assert.equal(byId.design_approval.status, 'waiting');
  assert.equal(byId.design_approval.note, 'waiting for you');
  const lines = pipelineText(steps);
  assert.match(lines[1], /^\[x\] design\s+3 runs · 7 min · 2\.25 USD$/);
  assert.match(lines[2], /^\[\?\] design_approval\s+waiting for you$/);
});

test('review rounds count the findings that sent the work back; a gate names who decided', () => {
  const history = [
    { phase: 'design_approval', result: 'approved', by: 'tuan' },
    { phase: 'review', result: 'critical' },
  ];
  const st = { phase: 'review', status: 'running', history, tasks: [{ status: 'done' }, { status: 'done' }] };
  const byId = Object.fromEntries(pipelineSteps(workflow, st, noStats).map((s) => [s.id, s]));
  assert.equal(byId.design_approval.note, 'approved by tuan');
  assert.equal(byId.implementation.note, '2/2 tasks');
  assert.deepEqual(byId.review.rounds, { count: 2, max: null });
});

test('a developer question puts the requirement back at implementation; a finished one is all done', () => {
  const asked = pipelineSteps(workflow, { phase: 'design_change_requested', status: 'waiting_human', history: [] }, noStats);
  assert.equal(asked.find((s) => s.id === 'implementation').status, 'waiting');
  const done = pipelineSteps(workflow, { phase: 'done', status: 'done', history: [] }, noStats);
  assert.ok(done.every((s) => s.status === 'done'));
});

test('the HTML row escapes what it shows and has a legend', () => {
  const steps = [{ id: '<x>', kind: 'agent', status: 'blocked', runs: 1, minutes: 2, cost_usd: null, note: 'a & b' }];
  const html = pipelineHtml(steps, esc);
  assert.match(html, /class="step blocked"><b>&lt;x&gt;<\/b><span>a &amp; b<\/span>/);
  assert.match(html, /waiting on you/);
});
