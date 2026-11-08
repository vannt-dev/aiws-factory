import fs from 'node:fs';
import http from 'node:http';
import { Workspace } from './workspace.js';
import { loadState, listReqs, statePath } from './state.js';
import { runStats } from './stats.js';
import { pipelineSteps, LABEL } from './pipeline.js';
import { gateChoices } from './gatemenu.js';
import { buildReport, renderHtml, esc, STYLE } from './report.js';

/**
 * One page over every requirement of aiws/work/: where each stands, what waits for a person and the command
 * that person runs, the pull request, cost and time so far, and the last activity. Read-only by design: the
 * decisions stay in the terminal, where an AI session cannot take them and no sign-in is needed.
 * Like `aiws stats`, it shows the requirements whose work folder is in this checkout.
 */

/** The order of the page: what needs a person first, what is finished last. */
export const BOARD_STATES = ['waiting', 'blocked', 'paused', 'running', 'not_started', 'done', 'abandoned', 'error'];

const STATE_LABEL = {
  waiting: LABEL.waiting,
  blocked: LABEL.blocked,
  paused: LABEL.paused,
  running: 'running',
  not_started: LABEL.not_started,
  done: LABEL.done,
  abandoned: 'abandoned',
  error: 'unreadable',
};

export const DEFAULT_PORT = 4319;

/** The state of a requirement as a whole, in the words of the pipeline row. */
function boardState(st, stats) {
  if (st.status === 'done') return 'done';
  if (st.status === 'abandoned') return 'abandoned';
  if (st.status === 'waiting_human') return 'waiting';
  if (st.status === 'blocked') return 'blocked';
  if (st.paused) return 'paused';
  return stats.runs ? 'running' : 'not_started';
}

/** The command a person runs next, when the next step is theirs to start. */
function nextCommand(state, req) {
  if (state === 'waiting') return `aiws gate ${req}`;
  if (state === 'blocked') return `aiws resume ${req}`;
  if (state === 'paused' || state === 'not_started') return `aiws run ${req}`;
  return '';
}

/** What the requirement waits for at a human gate, in the words of the gate menu. */
function waitsFor(ws, st) {
  try {
    const title = gateChoices(ws, st)?.title;
    if (title) return title.replace(new RegExp(`^${st.req_id}: `), '');
  } catch {
    // a phase the workflow no longer defines
  }
  return 'a decision of yours';
}

function lastActivity(ws, st) {
  const at = (st.history ?? []).at(-1)?.at;
  if (at) return String(at);
  try {
    return fs.statSync(statePath(ws, st.req_id)).mtime.toISOString();
  } catch {
    return '';
  }
}

function row(ws, req) {
  let st;
  try {
    st = loadState(ws, req); // switches ws to the workflow profile of this requirement
  } catch (e) {
    return { req, title: '', state: 'error', error: e?.message ?? String(e), steps: [] };
  }
  const stats = runStats(ws, req);
  const state = boardState(st, stats);
  const tasks = st.tasks ?? [];
  return {
    req,
    title: st.title ?? '',
    state,
    phase: st.phase ?? '',
    profile: st.profile ?? '',
    waits_for: state === 'waiting' ? waitsFor(ws, st) : '',
    next: nextCommand(state, req),
    reason: ['blocked', 'paused', 'abandoned'].includes(state) ? (st.reason ?? '') : '',
    pr_url: st.pr_url ?? '',
    tasks_done: tasks.filter((t) => t.status === 'done').length,
    tasks_total: tasks.length,
    runs: stats.runs,
    minutes: stats.runs ? Math.max(1, Math.round(stats.duration_ms / 60000)) : 0,
    cost_usd: stats.cost_usd,
    last_activity: lastActivity(ws, st),
    steps: stepsOf(ws, st, stats, state),
  };
}

/**
 * The pipeline row of the requirement. Its step in progress is drawn as the requirement stands: not yet
 * running before the first AI run, and greyed out once the requirement is abandoned.
 */
function stepsOf(ws, st, stats, state) {
  const steps = pipelineSteps(ws.workflow, st, stats);
  const instead = { not_started: 'not_started', abandoned: 'abandoned' }[state];
  if (instead) for (const s of steps) if (s.status === 'running') s.status = instead;
  return steps;
}

/** Every requirement of aiws/work/ with its state, sorted by what needs a person first, and the totals. */
export function buildBoard(ws) {
  const rows = listReqs(ws).map((req) => row(ws, req));
  const order = (r) => BOARD_STATES.indexOf(r.state);
  rows.sort((a, b) => order(a) - order(b) || a.req.localeCompare(b.req, 'en', { numeric: true }));
  const by_state = {};
  for (const r of rows) by_state[r.state] = (by_state[r.state] ?? 0) + 1;
  const costs = rows.map((r) => r.cost_usd).filter((c) => typeof c === 'number');
  return {
    rows,
    totals: {
      requirements: rows.length,
      by_state,
      runs: rows.reduce((n, r) => n + (r.runs ?? 0), 0),
      minutes: rows.reduce((n, r) => n + (r.minutes ?? 0), 0),
      cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    },
  };
}

// ---------------------------------------------------------------- html

const money = (n) => (typeof n === 'number' ? n.toFixed(2) : '-');

/** "just now", "12 min ago", "3 h ago", "4 days ago"; empty when a time is missing. */
export function ago(at, now) {
  const ms = Date.parse(now) - Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** "2026-11-08 13:33 UTC" from an ISO time; anything else as it is. */
export function shortTime(at) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::[\d.]+)?Z$/.exec(String(at));
  return m ? `${m[1]} ${m[2]} UTC` : String(at);
}

// the columns of numbers stay on one line: tasks, runs, cost
const NOWRAP = new Set([4, 6, 7]);

/** Only web addresses become links; anything else a tool wrote stays text. */
const webUrl = (u) => /^https?:\/\//i.test(String(u ?? ''));

const BOARD_STYLE = `
  :root { --wait: #b26a00; --wait-bg: #fff5e5; --stop: #c62828; --stop-bg: #fdecea; --run: #1565c0; --run-bg: #eaf2fb;
    --done: #2e7d32; --done-bg: #eef7ee; --idle: #8a8f98; --idle-bg: transparent; }
  @media (prefers-color-scheme: dark) {
    :root { --wait: #f0a43a; --wait-bg: #3a2a10; --stop: #ef6b6b; --stop-bg: #3a1717; --run: #6aa8ef; --run-bg: #14263b;
      --done: #5cbf64; --done-bg: #14301a; --idle: #8a8f98; }
    a { color: #8ab4f8; }
  }
  .wrap { overflow-x: auto; }
  .cards { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin: 12px 0; } .cards .card { margin: 0; }
  .badge { display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 600; white-space: nowrap;
    border: 1px solid var(--idle); color: var(--idle); }
  .badge.waiting { color: var(--wait); border-color: var(--wait); background: var(--wait-bg); }
  .badge.blocked, .badge.error { color: var(--stop); border-color: var(--stop); background: var(--stop-bg); }
  .badge.running, .badge.paused { color: var(--run); border-color: var(--run); background: var(--run-bg); }
  .badge.done { color: var(--done); border-color: var(--done); background: var(--done-bg); }
  .cards .card.waiting b { color: var(--wait); } .cards .card.blocked b { color: var(--stop); }
  .card.ask { border-left: 4px solid var(--wait); }
  .dots { display: flex; gap: 3px; margin-top: 4px; }
  .dot { width: 12px; height: 8px; border-radius: 2px; border: 1px solid var(--idle); }
  .dot.gate { border-style: dashed; }
  .dot.done { background: var(--done); border-color: var(--done); }
  .dot.running, .dot.paused { background: var(--run); border-color: var(--run); }
  .dot.waiting { background: var(--wait); border-color: var(--wait); }
  .dot.blocked { background: var(--stop); border-color: var(--stop); }
  .dot.abandoned { background: var(--idle); }
  td.nowrap { white-space: nowrap; }
  td code { white-space: nowrap; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
`;

const FOOTER =
  'Read-only. Decisions (approve, reject, answer, resume, abandon) are made by a person in a terminal, with ' +
  '<code>aiws gate REQ-xxx</code> or the commands it offers: an AI session must not take them, and a page that could ' +
  'would need a sign-in. Cost is the list-price equivalent the AI tool reported.';

function badge(state) {
  return `<span class="badge ${esc(state)}">${esc(STATE_LABEL[state] ?? state)}</span>`;
}

function dots(steps) {
  if (!steps?.length) return '';
  const one = (s) =>
    `<span class="dot ${esc(s.status)}${s.kind === 'gate' ? ' gate' : ''}" title="${esc(`${s.id}: ${LABEL[s.status] ?? s.status}`)}"></span>`;
  return `<div class="dots">${steps.map(one).join('')}</div>`;
}

function reqCell(r, reportHref) {
  const href = reportHref(r.req);
  const id = href ? `<a href="${esc(href)}">${esc(r.req)}</a>` : esc(r.req);
  return `<b>${id}</b> ${esc(r.title)}${r.profile ? ` <span class="muted">(${esc(r.profile)})</span>` : ''}${dots(r.steps)}`;
}

function stateCell(r) {
  const lines = [];
  if (r.waits_for) lines.push(esc(r.waits_for));
  if (r.reason) lines.push(esc(r.reason.split('\n')[0].slice(0, 200)));
  if (r.error) lines.push(`<span class="bad">${esc(r.error.split('\n')[0].slice(0, 200))}</span>`);
  if (r.next) lines.push(`<code>${esc(r.next)}</code>`);
  return lines.join('<br>');
}

function prCell(url) {
  if (!url) return '';
  if (!webUrl(url)) return esc(url);
  // owner/repo#7 for the usual hosts (GitHub, GitLab, Bitbucket), the address without its scheme otherwise
  const m = /\/([^/]+\/[^/]+?)(?:\/-)?\/(?:pull|pull-requests|merge_requests)\/(\d+)/.exec(url);
  return `<a href="${esc(url)}">${esc(m ? `${m[1]}#${m[2]}` : url.replace(/^https?:\/\/(www\.)?/i, ''))}</a>`;
}

/**
 * The page. `reportHref(req)` gives the link to the report of a requirement, or null for none; with
 * `refreshSeconds` the browser reloads the page on its own (the served board).
 */
export function renderBoard(board, { generatedAt = new Date().toISOString(), reportHref = () => null, refreshSeconds = null } = {}) {
  const t = board.totals;
  const count = (s) => t.by_state[s] ?? 0;
  const parts = [];
  parts.push('<h1>AIWS board</h1>');
  parts.push(
    `<p class="muted">${t.requirements} requirement(s) in aiws/work/ · generated ${esc(generatedAt)} by <code>aiws board</code>` +
      (refreshSeconds ? ` · refreshes every ${esc(refreshSeconds)} s` : '') +
      '</p>'
  );
  if (!board.rows.length) {
    parts.push('<p>No requirements in aiws/work/ yet. Start one with <code>aiws new REQ-001</code>.</p>');
  } else {
    const cards = [
      [String(count('waiting')), 'waiting on you', 'waiting'],
      [String(count('blocked')), 'stopped', 'blocked'],
      [String(count('running') + count('paused')), count('paused') ? `running (${count('paused')} paused)` : 'running', ''],
      [String(count('not_started')), 'not started', ''],
      [String(count('done')), 'done', ''],
      ...(count('abandoned') ? [[String(count('abandoned')), 'abandoned', '']] : []),
      [`${t.minutes} min`, `AI time, ${t.runs} run(s)`, ''],
      [t.cost_usd === null ? '-' : `${money(t.cost_usd)} USD`, 'cost so far, list price', ''],
    ];
    parts.push(
      `<div class="cards">${cards.map(([b, l, c]) => `<div class="card${c ? ` ${c}` : ''}"><b>${esc(b)}</b><span>${esc(l)}</span></div>`).join('\n')}</div>`
    );

    const waiting = board.rows.filter((r) => r.state === 'waiting');
    if (waiting.length) {
      parts.push('<h2>Waiting on you</h2>');
      for (const r of waiting) {
        parts.push(
          `<div class="card ask">${reqCell(r, reportHref)}${esc(r.waits_for)} (${esc(r.phase)}): run <code>${esc(r.next)}</code> in a terminal` +
            (webUrl(r.pr_url) ? ` · pull request ${prCell(r.pr_url)}` : '') +
            '</div>'
        );
      }
    }

    parts.push('<h2>All requirements</h2>');
    const head = ['Requirement', 'State', 'Phase', 'Waits for / next', 'Tasks', 'Pull request', 'AI runs', 'USD', 'Last activity'];
    const body = board.rows.map((r) =>
      [
        reqCell(r, reportHref),
        badge(r.state),
        esc(r.phase),
        stateCell(r),
        r.tasks_total ? `${r.tasks_done} / ${r.tasks_total}` : '',
        prCell(r.pr_url),
        r.runs ? `${r.runs} (${r.minutes} min)` : '',
        money(r.cost_usd),
        r.last_activity
          ? `<span title="${esc(r.last_activity)}">${esc(shortTime(r.last_activity))}</span><br>` +
            `<span class="muted">${esc(ago(r.last_activity, generatedAt))}</span>`
          : '',
      ]
        .map((c, i) => `<td${NOWRAP.has(i) ? ' class="nowrap"' : ''}>${c ?? ''}</td>`)
        .join('')
    );
    parts.push(
      `<div class="wrap"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>\n` +
        body.map((b) => `<tr>${b}</tr>`).join('\n') +
        '\n</tbody></table></div>'
    );
  }
  parts.push(`<footer>${FOOTER}</footer>`);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    ...(refreshSeconds ? [`<meta http-equiv="refresh" content="${esc(refreshSeconds)}">`] : []),
    '<title>AIWS board</title>',
    `<style>${STYLE}${BOARD_STYLE}</style>`,
    '</head>',
    '<body>',
    parts.join('\n'),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- serve

/** Nothing on the pages loads or runs anything: inline styles only. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'";

const REPORT_PATH = /^\/(REQ-[A-Za-z0-9_-]+)\/report\.html$/;
// a page of another site whose name was pointed at 127.0.0.1 (DNS rebinding) sends its own Host
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * The served board: an http.Server (not listening yet) that renders the board, and the report of a
 * requirement of aiws/work/, fresh on every request. It answers two kinds of path and nothing else; no part
 * of a URL is ever used as a file path. Read-only: GET and HEAD only, nothing is written.
 */
export function boardServer(root, { refreshSeconds = 10 } = {}) {
  return http.createServer((req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8', extra = {}) => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...extra,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (!LOCAL_HOST.test(req.headers.host ?? '')) return send(403, 'Forbidden: the board answers on 127.0.0.1 and localhost only.\n');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Read-only: GET only.\n', undefined, { Allow: 'GET, HEAD' });
    let pathname;
    try {
      pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      return send(400, 'Bad request.\n');
    }
    try {
      const ws = new Workspace(root); // config read again too, so a change shows on the next request
      const html = 'text/html; charset=utf-8';
      if (pathname === '/' || pathname === '/board.html') {
        const board = buildBoard(ws);
        return send(200, renderBoard(board, { refreshSeconds, reportHref: (r) => `/${r}/report.html` }), html);
      }
      const m = REPORT_PATH.exec(pathname);
      if (m && listReqs(ws).includes(m[1])) return send(200, renderHtml(buildReport(ws, loadState(ws, m[1]))), html);
      return send(404, 'Not found. The board is at /.\n');
    } catch (e) {
      return send(500, `The page could not be rendered: ${e?.message ?? e}\n`);
    }
  });
}

/** Starts `server` on 127.0.0.1:port, never on another interface; resolves to its address. */
export function listenBoard(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}
