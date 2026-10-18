import fs from 'node:fs';
import path from 'node:path';
import { readYaml } from './util.js';

/**
 * Totals over the evidence of a requirement (evidence/runs/run-NNNN.json): number of AI runs,
 * wall time and cost. Cost is the list-price equivalent reported by the adapter; it is null when
 * no run reported one (for example with the scripted adapter).
 */
export function runStats(ws, req) {
  const dir = path.join(ws.workDir(req), 'evidence', 'runs');
  const stats = { runs: 0, duration_ms: 0, cost_usd: null, by_phase: {}, duration_by_phase: {}, runs_by_phase: {} };
  if (!fs.existsSync(dir)) return stats;
  for (const file of fs.readdirSync(dir).filter((f) => /^run-\d+\.json$/.test(f))) {
    let ev;
    try {
      ev = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue; // a run that was interrupted while writing its evidence
    }
    const phase = ev.phase ?? 'unknown';
    stats.runs += 1;
    stats.runs_by_phase[phase] = (stats.runs_by_phase[phase] ?? 0) + 1;
    stats.duration_ms += ev.duration_ms ?? 0;
    stats.duration_by_phase[phase] = (stats.duration_by_phase[phase] ?? 0) + (ev.duration_ms ?? 0);
    const cost = ev.report?.cost_usd;
    if (typeof cost === 'number') {
      stats.cost_usd = (stats.cost_usd ?? 0) + cost;
      stats.by_phase[phase] = (stats.by_phase[phase] ?? 0) + cost;
    }
    const turns = ev.report?.num_turns;
    if (typeof turns === 'number') {
      stats.turns = (stats.turns ?? 0) + turns;
      (stats.turns_by_phase ??= {})[phase] = (stats.turns_by_phase[phase] ?? 0) + turns;
    }
    const t = tokenCounts(ev.report);
    if (t) {
      stats.tokens = addTokens(stats.tokens, t);
      (stats.tokens_by_phase ??= {})[phase] = addTokens(stats.tokens_by_phase[phase], t);
    }
  }
  return stats;
}

/**
 * The token counts of one run as { input, cache_write, cache_read, output }, from the shape the claude adapter
 * writes or the raw usage of Codex (whose input count includes the cached part); null when the run has none.
 */
export function tokenCounts(report) {
  const t = report?.tokens;
  if (!t || typeof t !== 'object') return null;
  if ('cache_read' in t || 'cache_write' in t) {
    return { input: t.input ?? 0, cache_write: t.cache_write ?? 0, cache_read: t.cache_read ?? 0, output: t.output ?? 0 };
  }
  const cached = t.cached_input_tokens ?? 0;
  return { input: Math.max(0, (t.input_tokens ?? 0) - cached), cache_write: 0, cache_read: cached, output: t.output_tokens ?? 0 };
}

function addTokens(a, b) {
  const base = a ?? { input: 0, cache_write: 0, cache_read: 0, output: 0 };
  return Object.fromEntries(Object.keys(base).map((k) => [k, base[k] + b[k]]));
}

const tokenTotal = (t) => t.input + t.cache_write + t.cache_read + t.output;

/** 950, 1.2k, 45k, 3.06M */
export function count(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

/** One status line, e.g. "AI runs: 5 (40 min), cost 14.10 USD list-price equivalent (analysis 2.65, design 7.06)". */
export function statsLine(stats) {
  if (!stats.runs) return null;
  const minutes = Math.max(1, Math.round(stats.duration_ms / 60000));
  let line = `AI runs: ${stats.runs} (${minutes} min)`;
  if (stats.cost_usd !== null) {
    const phases = Object.entries(stats.by_phase)
      .map(([phase, cost]) => `${phase} ${cost.toFixed(2)}`)
      .join(', ');
    line += `, cost ${stats.cost_usd.toFixed(2)} USD list-price equivalent (${phases})`;
  }
  if (stats.tokens) {
    const total = tokenTotal(stats.tokens);
    const cached = total ? Math.round((100 * stats.tokens.cache_read) / total) : 0;
    line += `, tokens ${count(total)} (${cached}% read from cache, ${count(stats.tokens.output)} output)`;
    if (stats.turns) line += `, ${stats.turns} turns`;
  }
  return line;
}

// ---------------------------------------------------------------- across requirements

/** The phases of the workflow, in order, so that tables read the way the work went. */
function phaseOrder(ws, extra = []) {
  const order = (ws.workflow.phases ?? []).map((p) => p.id);
  for (const p of extra) if (!order.includes(p)) order.push(p);
  return order;
}

/**
 * One row per requirement of aiws/work/ (whatever branch it ran on, as long as its work directory is
 * here): title, phase, status, runs, time, cost and the models the evidence names.
 */
export function workspaceStats(ws) {
  const dir = path.join(ws.aiwsDir, 'work');
  const rows = [];
  if (!fs.existsSync(dir)) return { rows, phases: phaseOrder(ws) };
  for (const req of fs.readdirSync(dir).sort()) {
    const st = readYaml(path.join(dir, req, 'state.yaml'));
    if (!st) continue; // _discover and the like keep no state
    const stats = runStats(ws, req);
    rows.push({
      req,
      title: st.title ?? '',
      phase: st.phase ?? '',
      status: st.status ?? '',
      tasks: (st.tasks ?? []).length,
      ...stats,
      models: modelsUsed(ws, req),
    });
  }
  const seen = new Set(rows.flatMap((r) => Object.keys(r.runs_by_phase)));
  return { rows, phases: phaseOrder(ws, [...seen]) };
}

function modelsUsed(ws, req) {
  const dir = path.join(ws.workDir(req), 'evidence', 'runs');
  const models = new Set();
  if (!fs.existsSync(dir)) return [];
  for (const file of fs.readdirSync(dir).filter((f) => /^run-\d+\.json$/.test(f))) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).report?.model;
      // a run that used several models lists them as "a, b"
      if (m) for (const one of String(m).split(', ')) models.add(one);
    } catch {
      // unreadable evidence is skipped by runStats as well
    }
  }
  return [...models].sort();
}

function median(values) {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function range(values) {
  const v = values.filter((x) => typeof x === 'number');
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

/**
 * What a requirement has cost so far, from the requirements that reached `done`: median and range of the
 * total, and the median per phase. An estimate, not a forecast: it says what finished requirements of this
 * workspace took, nothing about the one being planned. Null when no requirement is finished.
 */
export function estimateFromHistory(ws) {
  const { rows, phases } = workspaceStats(ws);
  const done = rows.filter((r) => r.status === 'done' && r.runs > 0);
  if (!done.length) return null;
  const costs = done.map((r) => r.cost_usd).filter((c) => typeof c === 'number');
  const minutes = done.map((r) => r.duration_ms / 60000);
  const byPhase = {};
  for (const phase of phases) {
    const cost = done.map((r) => r.by_phase[phase]).filter((c) => typeof c === 'number');
    const time = done.map((r) => r.duration_by_phase[phase]).filter((t) => typeof t === 'number' && t > 0);
    if (!cost.length && !time.length) continue;
    byPhase[phase] = { cost_usd: median(cost), minutes: median(time.map((t) => t / 60000)) };
  }
  return {
    based_on: done.length,
    cost_usd: costs.length ? { median: median(costs), ...range(costs) } : null,
    minutes: { median: median(minutes), ...range(minutes) },
    by_phase: byPhase,
  };
}

// ---------------------------------------------------------------- text

const money = (n) => (typeof n === 'number' ? n.toFixed(2) : '-');
const mins = (ms) => (ms ? String(Math.max(1, Math.round(ms / 60000))) : '-');

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) =>
    cells
      .map((c, i) => String(c).padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

/** The `aiws stats` text: one line per requirement, totals, and the cost of each phase across them. */
export function statsText(summary) {
  const { rows, phases } = summary;
  if (!rows.length) return 'No requirements in aiws/work/ yet.';
  const out = [];
  out.push(
    table(
      ['REQ', 'status', 'phase', 'tasks', 'runs', 'min', 'USD', 'title'],
      rows.map((r) => [r.req, r.status, r.phase, r.tasks, r.runs, mins(r.duration_ms), money(r.cost_usd), r.title])
    )
  );
  const withCost = rows.filter((r) => typeof r.cost_usd === 'number');
  const totalRuns = rows.reduce((n, r) => n + r.runs, 0);
  const totalMs = rows.reduce((n, r) => n + r.duration_ms, 0);
  const totalCost = withCost.reduce((n, r) => n + r.cost_usd, 0);
  out.push(
    '',
    `${rows.length} requirement(s), ${totalRuns} AI run(s), ${mins(totalMs)} min` +
      (withCost.length ? `, ${money(totalCost)} USD list-price equivalent` : '')
  );
  const used = phases.filter((p) => rows.some((r) => r.runs_by_phase[p]));
  if (used.length && withCost.length) {
    out.push('', 'Per phase, across these requirements:');
    out.push(
      table(
        ['phase', 'runs', 'min', 'USD', 'USD median/REQ'],
        used.map((p) => [
          p,
          rows.reduce((n, r) => n + (r.runs_by_phase[p] ?? 0), 0),
          mins(rows.reduce((n, r) => n + (r.duration_by_phase[p] ?? 0), 0)),
          money(withCost.reduce((n, r) => n + (r.by_phase[p] ?? 0), 0)),
          money(median(withCost.map((r) => r.by_phase[p]))),
        ])
      )
    );
  }
  const withTokens = rows.filter((r) => r.tokens_by_phase);
  const tokenPhases = phases.filter((p) => withTokens.some((r) => r.tokens_by_phase[p]));
  if (tokenPhases.length) {
    // every turn reads the whole conversation again, mostly from the cache: many turns or a large context cost most
    out.push('', 'Tokens per phase (each turn reads the conversation so far again, mostly from the cache):');
    out.push(
      table(
        ['phase', 'turns', 'input', 'cache write', 'cache read', 'output'],
        tokenPhases.map((p) => {
          const t = withTokens.reduce((acc, r) => (r.tokens_by_phase[p] ? addTokens(acc, r.tokens_by_phase[p]) : acc), null);
          const turns = rows.reduce((n, r) => n + (r.turns_by_phase?.[p] ?? 0), 0);
          return [p, turns || '-', count(t.input), count(t.cache_write), count(t.cache_read), count(t.output)];
        })
      )
    );
  }
  const models = [...new Set(rows.flatMap((r) => r.models))];
  if (models.length) out.push('', `Models seen in the evidence: ${models.join(', ')}.`);
  return out.join('\n');
}

/** The `aiws estimate` text. */
export function estimateText(est) {
  if (!est) {
    return [
      'No finished requirement in aiws/work/ yet, so there is nothing to estimate from.',
      'For an order of magnitude: the six demo requirements of the handbook (3 to 7 tasks each) took 60 to 90 minutes',
      'and 25 to 41 USD list-price equivalent, mostly on Opus. See aiws/docs/handbook.md, section 8.',
    ].join('\n');
  }
  const out = [`Based on ${est.based_on} finished requirement(s) of this workspace:`];
  if (est.cost_usd) {
    out.push(
      `  cost: median ${money(est.cost_usd.median)} USD, range ${money(est.cost_usd.min)} to ${money(est.cost_usd.max)} USD (list-price equivalent)`
    );
  } else {
    out.push('  cost: no run reported a cost (scripted adapter?)');
  }
  const m = est.minutes;
  out.push(`  AI time: median ${Math.round(m.median)} min, range ${Math.round(m.min)} to ${Math.round(m.max)} min`);
  const phases = Object.entries(est.by_phase);
  if (phases.length) {
    out.push('', 'Median per phase:');
    out.push(
      table(
        ['phase', 'USD', 'min'],
        phases.map(([p, v]) => [p, money(v.cost_usd), v.minutes === null ? '-' : Math.round(v.minutes)])
      )
    );
  }
  out.push(
    '',
    'This is what finished requirements took, not a forecast for the next one: a requirement with more acceptance',
    'criteria or tasks costs more, and the models in runtime.yaml decide most of the price.'
  );
  return out.join('\n');
}
