import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { parse } from '../src/adapters/claude.js';
import { runStats, statsLine, workspaceStats, statsText, tokenCounts } from '../src/stats.js';

test('the claude report keeps the token counts and the model of the run', () => {
  const raw = JSON.stringify({
    type: 'result',
    is_error: false,
    result: 'done',
    num_turns: 12,
    total_cost_usd: 1.25,
    session_id: 's1',
    usage: { input_tokens: 40, cache_creation_input_tokens: 9000, cache_read_input_tokens: 250000, output_tokens: 3000 },
    modelUsage: { 'claude-opus-5-5': { costUSD: 1.2 }, 'claude-haiku-5-5': { costUSD: 0.05 } },
  });
  const r = parse(`noise\n${raw}\n`);
  assert.deepEqual(r.tokens, { input: 40, cache_write: 9000, cache_read: 250000, output: 3000 });
  assert.equal(r.model, 'claude-opus-5-5, claude-haiku-5-5');
  // an older Claude Code without usage leaves the counts out
  assert.equal(parse(JSON.stringify({ result: 'x' })).tokens, null);
});

test('tokenCounts reads both the claude and the codex shape', () => {
  assert.deepEqual(tokenCounts({ tokens: { input: 1, cache_write: 2, cache_read: 3, output: 4 } }), {
    input: 1,
    cache_write: 2,
    cache_read: 3,
    output: 4,
  });
  assert.deepEqual(tokenCounts({ tokens: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 } }), {
    input: 6,
    cache_write: 0,
    cache_read: 4,
    output: 2,
  });
  assert.equal(tokenCounts({}), null);
});

function evidence(root, req, runs) {
  const dir = path.join(root, 'aiws', 'work', req);
  fs.mkdirSync(path.join(dir, 'evidence', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.yaml'), YAML.stringify({ req_id: req, title: 't', phase: 'done', status: 'done' }));
  runs.forEach((r, i) => {
    const id = `run-${String(i + 1).padStart(4, '0')}`;
    fs.writeFileSync(
      path.join(dir, 'evidence', 'runs', `${id}.json`),
      JSON.stringify({ run_id: id, phase: r.phase, duration_ms: 60000, report: { cost_usd: 1, num_turns: r.turns, tokens: r.tokens } })
    );
  });
}

test('runs, status and stats add up the tokens and turns per phase', () => {
  const root = makeWorkspace();
  const t = (cache_read, output) => ({ input: 10, cache_write: 1000, cache_read, output });
  evidence(root, 'REQ-001', [
    { phase: 'analysis', turns: 50, tokens: t(2_000_000, 20_000) },
    { phase: 'design', turns: 30, tokens: t(1_000_000, 40_000) },
    { phase: 'design', turns: 10, tokens: null },
  ]);
  const ws = new Workspace(root);
  const s = runStats(ws, 'REQ-001');
  assert.deepEqual(s.tokens, { input: 20, cache_write: 2000, cache_read: 3_000_000, output: 60_000 });
  assert.deepEqual(s.tokens_by_phase.design, { input: 10, cache_write: 1000, cache_read: 1_000_000, output: 40_000 });
  assert.equal(s.turns, 90);
  assert.equal(s.turns_by_phase.design, 40);
  assert.match(statsLine(s), /tokens 3\.06M \(98% read from cache, 60k output\), 90 turns/);

  const text = statsText(workspaceStats(ws));
  assert.match(text, /Tokens per phase/);
  assert.match(text, /analysis\s+50\s+10\s+1\.0k\s+2\.00M\s+20k/);
  assert.match(text, /design\s+40\s+10\s+1\.0k\s+1\.00M\s+40k/);
});

test('without token counts the status line and stats stay as they were', () => {
  const root = makeWorkspace();
  evidence(root, 'REQ-001', [{ phase: 'analysis', turns: null, tokens: null }]);
  const ws = new Workspace(root);
  assert.doesNotMatch(statsLine(runStats(ws, 'REQ-001')), /tokens/);
  assert.doesNotMatch(statsText(workspaceStats(ws)), /Tokens per phase/);
});
