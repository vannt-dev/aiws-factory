import fs from 'node:fs';
import path from 'node:path';
import { readTextIfExists, readYaml } from './util.js';
import { listApprovals } from './gate.js';
import { buildTrace } from './trace.js';
import { runStats } from './stats.js';
import { pipelineSteps, pipelineHtml, PIPELINE_STYLE } from './pipeline.js';

/**
 * One page per requirement: what a person reads at a gate, in one place instead of a dozen files.
 * Everything on it comes from files that agents or third-party tools wrote, so every string is escaped.
 */
const DOCS = [
  '01-analysis.md',
  '02-design.md',
  '03-test-spec.md',
  'api-contract.yaml',
  '02-design-review.md',
  '04-plan.yaml',
  '05-review.md',
  'questions.md',
];

export function buildReport(ws, st) {
  const req = st.req_id;
  const work = (f) => readTextIfExists(ws.abs(ws.workRel(req, f)));
  const evidence = path.join(ws.workDir(req), 'evidence');
  const stats = runStats(ws, req);
  return {
    req,
    title: st.title ?? '',
    requirement: st.requirement ?? '',
    branch: st.branch ?? '',
    phase: st.phase ?? '',
    status: st.status ?? '',
    reason: st.reason ?? '',
    paused: st.paused ?? null,
    budget_usd: typeof st.budget_usd === 'number' ? st.budget_usd : null,
    stats,
    pipeline: pipelineSteps(ws.workflow, st, stats),
    pr_url: st.pr_url ?? '',
    tasks: (st.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title ?? '',
      status: t.status ?? '',
      tests: t.tests ?? [],
      allowed_files: t.allowed_files ?? [],
      attempts: t.attempts ?? 0,
      test_result: t.test_result ?? '',
      commit: t.commit ? String(t.commit).slice(0, 7) : '',
      last_failure: t.status === 'done' ? '' : (t.last_failure ?? ''),
    })),
    trace: safeTrace(ws, st),
    approvals: ['design', 'pr'].flatMap((gate) =>
      listApprovals(ws, req, gate).map((a) => ({
        gate,
        name: a.name,
        decision: a.decision ?? '',
        by: a.by ?? '',
        at: a.at ?? '',
        notes: a.notes ?? '',
      }))
    ),
    history: (st.history ?? []).slice(-40),
    runs: readJsonDir(path.join(evidence, 'runs'), /^run-\d+\.json$/).map((ev) => ({
      run_id: ev.run_id ?? '',
      phase: ev.phase ?? '',
      agent: ev.agent ?? '',
      task: ev.task ?? '',
      attempt: ev.attempt ?? '',
      outcome: ev.outcome ?? '',
      minutes: ev.duration_ms ? Math.round(ev.duration_ms / 6000) / 10 : null,
      cost_usd: typeof ev.report?.cost_usd === 'number' ? ev.report.cost_usd : null,
      model: ev.report?.model ?? '',
      files: (ev.files_changed ?? []).length,
      reverted: (ev.scope_violations_reverted ?? []).length,
    })),
    tests: listFiles(path.join(evidence, 'test-results'), /\.ya?ml$/)
      .map((f) => readYaml(f))
      .filter(Boolean)
      .map((t) => ({ task: t.task ?? '', attempt: t.attempt ?? '', result: t.result ?? '', at: t.at ?? '', problems: t.problems ?? [] })),
    docs: DOCS.map((name) => ({ name, text: work(name) })).filter((d) => d.text),
  };
}

function safeTrace(ws, st) {
  try {
    return buildTrace(ws, st);
  } catch (e) {
    return { rows: [], problems: [`trace could not be built: ${e?.message ?? e}`] };
  }
}

function listFiles(dir, re) {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => re.test(f))
        .sort()
        .map((f) => path.join(dir, f))
    : [];
}

function readJsonDir(dir, re) {
  const out = [];
  for (const file of listFiles(dir, re)) {
    try {
      out.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // a run interrupted while writing its evidence
    }
  }
  return out;
}

// ---------------------------------------------------------------- html

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const money = (n) => (typeof n === 'number' ? n.toFixed(2) : '-');

function table(headers, rows) {
  if (!rows.length) return '<p class="muted">none</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n');
  return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

const STYLE = `
  :root { --bg: #fff; --fg: #1a1a1a; --muted: #666; --line: #ddd; --ok: #1a7f37; --bad: #c0392b; --warn: #b26a00; --card: #f6f7f9; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111417; --fg: #e6e6e6; --muted: #9a9a9a; --line: #333; --card: #1b1f24; } }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 1100px; padding: 24px 16px; color: var(--fg); background: var(--bg); }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; }
  .muted { color: var(--muted); } .ok { color: var(--ok); } .bad { color: var(--bad); } .warn { color: var(--warn); }
  .card { background: var(--card); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
  .cards .card b { display: block; font-size: 18px; } .cards .card span { color: var(--muted); font-size: 12px; }
  details { margin: 8px 0; } summary { cursor: pointer; font-weight: 600; }
  pre { background: var(--card); padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; font-size: 12.5px; }
  code { font-size: 12.5px; }
`;

function statusClass(status) {
  if (['done', 'pass', 'ok', 'approved', 'merged'].includes(status)) return 'ok';
  if (['blocked', 'fail', 'failed', 'MISSING', 'rejected', 'changes_requested', 'critical_findings'].includes(status)) return 'bad';
  if (['waiting_human', 'running', 'needs_human', 'usage_limit', 'question'].includes(status)) return 'warn';
  return '';
}

const flag = (s) => `<span class="${statusClass(s)}">${esc(s)}</span>`;

export function renderHtml(d, { generatedAt = new Date().toISOString() } = {}) {
  const s = d.stats;
  const minutes = s.runs ? Math.max(1, Math.round(s.duration_ms / 60000)) : 0;
  const cards = [
    [flag(d.status), 'status'],
    [esc(d.phase), 'phase'],
    [`${d.tasks.filter((t) => t.status === 'done').length} / ${d.tasks.length}`, 'tasks done'],
    [String(s.runs), 'AI runs'],
    [`${minutes} min`, 'AI time'],
    [
      s.cost_usd === null ? '-' : `${money(s.cost_usd)} USD`,
      d.budget_usd !== null ? `cost (budget ${money(d.budget_usd)})` : 'cost, list price',
    ],
  ]
    .map(([b, l]) => `<div class="card"><b>${b}</b><span>${esc(l)}</span></div>`)
    .join('\n');

  const phaseCosts = Object.entries(s.by_phase ?? {});
  const parts = [];
  parts.push(`<h1>${esc(d.req)} — ${esc(d.title)}</h1>`);
  parts.push(
    `<p class="muted">${esc(d.requirement)} · branch <code>${esc(d.branch)}</code> · generated ${esc(generatedAt)} by <code>aiws report</code></p>`
  );
  parts.push(`<div class="cards">${cards}</div>`);
  if (d.pipeline?.length) parts.push(pipelineHtml(d.pipeline, esc));
  if (d.pr_url) parts.push(`<p>Pull request: <a href="${esc(d.pr_url)}">${esc(d.pr_url)}</a></p>`);
  if (d.reason) parts.push(`<div class="card"><b>${d.paused ? 'Paused' : 'Why it stopped'}</b><br>${esc(d.reason)}</div>`);

  parts.push('<h2>Trace: acceptance criterion → test case → task → commit</h2>');
  parts.push(
    table(
      ['AC', 'Test case', 'Task', 'Commit', 'Test result'],
      d.trace.rows.map((r) => [esc(r.ac), esc(r.tc), esc(r.task), `<code>${esc(r.commit)}</code>`, flag(r.result)])
    )
  );
  if (d.trace.problems.length) parts.push(`<p class="bad">Problems: ${d.trace.problems.map(esc).join(' · ')}</p>`);

  parts.push('<h2>Tasks</h2>');
  parts.push(
    table(
      ['Task', 'Title', 'Status', 'Tests', 'Attempts', 'Commit', 'Last failure'],
      d.tasks.map((t) => [
        esc(t.id),
        esc(t.title),
        flag(t.status) + (t.test_result ? ` <span class="muted">(tests ${esc(t.test_result)})</span>` : ''),
        esc(t.tests.join(', ')),
        esc(t.attempts || ''),
        `<code>${esc(t.commit)}</code>`,
        esc(t.last_failure.split('\n')[0].slice(0, 200)),
      ])
    )
  );

  parts.push('<h2>Approvals</h2>');
  parts.push(
    table(
      ['Gate', 'Decision', 'By', 'At', 'Notes', 'Record'],
      d.approvals.map((a) => [esc(a.gate), flag(a.decision), esc(a.by), esc(a.at), esc(a.notes), `<code>${esc(a.name)}</code>`])
    )
  );

  parts.push('<h2>AI runs and cost</h2>');
  if (phaseCosts.length) {
    parts.push(`<p>${phaseCosts.map(([p, c]) => `${esc(p)} <b>${money(c)}</b>`).join(' · ')} USD list-price equivalent</p>`);
  }
  parts.push(
    table(
      ['Run', 'Phase', 'Agent', 'Task', 'Attempt', 'Outcome', 'Min', 'USD', 'Model', 'Files', 'Reverted'],
      d.runs.map((r) => [
        `<code>${esc(r.run_id)}</code>`,
        esc(r.phase),
        esc(r.agent),
        esc(r.task),
        esc(r.attempt),
        flag(r.outcome),
        r.minutes === null ? '-' : esc(r.minutes),
        money(r.cost_usd),
        esc(r.model),
        esc(r.files),
        r.reverted ? `<span class="bad">${esc(r.reverted)}</span>` : '0',
      ])
    )
  );

  parts.push('<h2>Test runs</h2>');
  parts.push(
    table(
      ['Task', 'Attempt', 'Result', 'At', 'Problems'],
      d.tests.map((t) => [esc(t.task), esc(t.attempt), flag(t.result), esc(t.at), esc(t.problems.map((p) => p.split('\n')[0]).join(' · '))])
    )
  );

  parts.push('<h2>History</h2>');
  parts.push(
    table(
      ['At', 'Phase', 'Agent / task', 'Result', 'By / run'],
      d.history.map((h) => [
        esc(h.at),
        esc(h.phase),
        esc([h.agent, h.task].filter(Boolean).join(' / ')),
        flag(h.result),
        esc([h.by, h.run, h.reason].filter(Boolean).join(' · ')),
      ])
    )
  );

  parts.push('<h2>Documents</h2>');
  for (const doc of d.docs) {
    parts.push(
      `<details${doc.name === '05-review.md' ? ' open' : ''}><summary>${esc(doc.name)}</summary><pre>${esc(doc.text)}</pre></details>`
    );
  }

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(d.req)} — ${esc(d.title)}</title>`,
    `<style>${STYLE}${PIPELINE_STYLE}</style>`,
    '</head>',
    '<body>',
    parts.join('\n'),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
