import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, ok, aiws } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { workspaceStats, estimateFromHistory, statsText, estimateText } from '../src/stats.js';

/** A finished (or not) requirement with the evidence its runs would have left, costs included. */
function fakeReq(root, req, { status = 'done', phase = 'done', runs }) {
  const dir = path.join(root, 'aiws', 'work', req);
  fs.mkdirSync(path.join(dir, 'evidence', 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'state.yaml'),
    YAML.stringify({ req_id: req, title: `${req} title`, phase, status, tasks: [{ id: 'T1' }, { id: 'T2' }] })
  );
  runs.forEach((r, i) => {
    const id = `run-${String(i + 1).padStart(4, '0')}`;
    fs.writeFileSync(
      path.join(dir, 'evidence', 'runs', `${id}.json`),
      JSON.stringify({ run_id: id, phase: r.phase, duration_ms: r.minutes * 60000, report: { cost_usd: r.cost, model: r.model ?? 'opus' } })
    );
  });
}

test('stats lists every requirement with runs, time and cost, and the cost of each phase across them', () => {
  const root = makeWorkspace();
  fakeReq(root, 'REQ-001', {
    runs: [
      { phase: 'analysis', minutes: 4, cost: 2.5 },
      { phase: 'design', minutes: 10, cost: 7 },
      { phase: 'implementation', minutes: 20, cost: 6, model: 'sonnet' },
    ],
  });
  fakeReq(root, 'REQ-002', {
    status: 'waiting_human',
    phase: 'design_approval',
    runs: [
      { phase: 'analysis', minutes: 3, cost: 1.5 },
      { phase: 'design', minutes: 8, cost: 5 },
    ],
  });
  const ws = new Workspace(root);
  const summary = workspaceStats(ws);
  assert.deepEqual(
    summary.rows.map((r) => [r.req, r.status, r.runs, r.cost_usd]),
    [
      ['REQ-001', 'done', 3, 15.5],
      ['REQ-002', 'waiting_human', 2, 6.5],
    ]
  );
  assert.deepEqual(summary.rows[0].models, ['opus', 'sonnet']);

  const text = statsText(summary);
  assert.match(text, /REQ-001\s+done\s+done\s+2\s+3\s+34\s+15\.50\s+REQ-001 title/);
  assert.match(text, /2 requirement\(s\), 5 AI run\(s\), 45 min, 22\.00 USD/);
  // the phase table follows the order of workflow.yaml and gives the median per requirement
  assert.match(text, /analysis\s+2\s+7\s+4\.00\s+2\.00\n\s*design\s+2\s+18\s+12\.00\s+6\.00\n\s*implementation\s+1\s+20\s+6\.00\s+6\.00/);
  assert.match(text, /Models seen in the evidence: opus, sonnet\./);

  const r = ok(root, ['stats']);
  assert.match(r.stdout, /REQ-002\s+waiting_human/);
});

test('stats without cost (scripted runs) still counts runs and time', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const r = ok(root, ['stats']);
  // analyst, architect, test designer and design reviewer
  assert.match(r.stdout, /REQ-001\s+waiting_human\s+design_approval\s+0\s+4\s+\d+\s+-\s+/);
  assert.doesNotMatch(r.stdout, /USD list-price/);
});

test('estimate comes from finished requirements only: median and range, per phase', () => {
  const root = makeWorkspace();
  fakeReq(root, 'REQ-001', {
    runs: [
      { phase: 'analysis', minutes: 4, cost: 2 },
      { phase: 'implementation', minutes: 20, cost: 10 },
    ],
  });
  fakeReq(root, 'REQ-002', {
    runs: [
      { phase: 'analysis', minutes: 6, cost: 4 },
      { phase: 'implementation', minutes: 40, cost: 20 },
    ],
  });
  fakeReq(root, 'REQ-003', {
    runs: [
      { phase: 'analysis', minutes: 5, cost: 3 },
      { phase: 'implementation', minutes: 30, cost: 15 },
    ],
  });
  fakeReq(root, 'REQ-004', { status: 'blocked', phase: 'implementation', runs: [{ phase: 'analysis', minutes: 100, cost: 99 }] });
  const est = estimateFromHistory(new Workspace(root));
  assert.equal(est.based_on, 3);
  assert.deepEqual(est.cost_usd, { median: 18, min: 12, max: 24 });
  assert.deepEqual(est.minutes, { median: 35, min: 24, max: 46 });
  assert.deepEqual(est.by_phase.analysis, { cost_usd: 3, minutes: 5 });
  assert.deepEqual(est.by_phase.implementation, { cost_usd: 15, minutes: 30 });

  const r = ok(root, ['estimate']);
  assert.match(r.stdout, /Based on 3 finished requirement\(s\)/);
  assert.match(r.stdout, /cost: median 18\.00 USD, range 12\.00 to 24\.00 USD/);
  assert.match(r.stdout, /AI time: median 35 min, range 24 to 46 min/);
  assert.match(r.stdout, /not a forecast/);
});

test('estimate says so when nothing is finished, and points at the handbook numbers', () => {
  const root = makeWorkspace();
  assert.equal(estimateFromHistory(new Workspace(root)), null);
  const r = ok(root, ['estimate']);
  assert.match(r.stdout, /No finished requirement/);
  assert.match(r.stdout, /25 to 41 USD/);
  assert.match(r.stdout, /13 minutes and 4.31 USD up to the pull request gate/);
  assert.equal(aiws(root, ['stats']).stdout.trim(), 'No requirements in aiws/work/ yet.');
  assert.match(estimateText(null), /handbook/);
});
