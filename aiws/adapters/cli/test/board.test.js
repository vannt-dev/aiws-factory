import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, git, tempDir, cleanEnv, BIN } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { buildBoard, renderBoard, boardServer, listenBoard } from '../src/board.js';
import { parseArgs } from '../src/cli.js';

/** A requirement as its state and evidence would be on disk, without running the pipeline. */
function fakeReq(root, req, st, runs = []) {
  const dir = path.join(root, 'aiws', 'work', req);
  fs.mkdirSync(path.join(dir, 'evidence', 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'state.yaml'),
    YAML.stringify({ req_id: req, title: `${req} title`, branch: `aiws/${req}`, tasks: [], history: [], ...st })
  );
  runs.forEach((r, i) => {
    const id = `run-${String(i + 1).padStart(4, '0')}`;
    fs.writeFileSync(
      path.join(dir, 'evidence', 'runs', `${id}.json`),
      JSON.stringify({ run_id: id, phase: r.phase, duration_ms: r.minutes * 60000, report: { cost_usd: r.cost } })
    );
  });
}

/** Eight requirements, one in each state the board knows, and one whose state cannot be read. */
function boardWorkspace() {
  const root = makeWorkspace();
  const at = (h) => [{ phase: 'analysis', result: 'ok', at: `2026-11-08T0${h}:00:00.000Z` }];
  fakeReq(root, 'REQ-001', { phase: 'done', status: 'done', history: at(1), tasks: [{ id: 'T1', status: 'done' }] }, [
    { phase: 'analysis', minutes: 4, cost: 2.5 },
    { phase: 'implementation', minutes: 20, cost: 6 },
  ]);
  fakeReq(
    root,
    'REQ-002',
    { title: '<script>alert(1)</script> nickname', phase: 'design_approval', status: 'waiting_human', history: at(5) },
    [{ phase: 'design', minutes: 10, cost: 3 }]
  );
  fakeReq(root, 'REQ-003', { phase: 'implementation', status: 'blocked', reason: 'T2 failed 3 attempts', history: at(3) }, [
    { phase: 'implementation', minutes: 5, cost: 1 },
  ]);
  fakeReq(
    root,
    'REQ-004',
    {
      phase: 'pr_approval',
      status: 'waiting_human',
      pr_url: 'https://github.com/acme/shop/pull/7',
      tasks: [
        { id: 'T1', status: 'done' },
        { id: 'T2', status: 'done' },
      ],
      history: at(4),
    },
    [{ phase: 'review', minutes: 2, cost: 0.5 }]
  );
  fakeReq(root, 'REQ-005', { phase: 'design', status: 'running', paused: 'usage limit', reason: 'resets at 14:00', history: at(2) }, [
    { phase: 'analysis', minutes: 1 },
  ]);
  fakeReq(root, 'REQ-006', { phase: 'analysis', status: 'running', pr_url: 'javascript:alert(1)' });
  fakeReq(root, 'REQ-007', { phase: 'design', status: 'abandoned', reason: 'abandoned by tuan: not needed' });
  fakeReq(root, 'REQ-008', { profile: 'small', phase: 'design_approval', status: 'waiting_human', history: at(6) });
  fs.mkdirSync(path.join(root, 'aiws', 'work', 'REQ-009'), { recursive: true });
  fs.writeFileSync(path.join(root, 'aiws', 'work', 'REQ-009', 'state.yaml'), 'phase: [unclosed\n');
  fakeReq(root, 'REQ-010', { phase: 'implementation', status: 'running', history: at(7) }, [{ phase: 'design', minutes: 3, cost: 1 }]);
  return root;
}

test('the board lists every requirement, those waiting on a person first, with what each waits for', () => {
  const root = boardWorkspace();
  const board = buildBoard(new Workspace(root));
  assert.deepEqual(
    board.rows.map((r) => [r.req, r.state]),
    [
      ['REQ-002', 'waiting'],
      ['REQ-004', 'waiting'],
      ['REQ-008', 'waiting'],
      ['REQ-003', 'blocked'],
      ['REQ-005', 'paused'],
      ['REQ-010', 'running'],
      ['REQ-006', 'not_started'],
      ['REQ-001', 'done'],
      ['REQ-007', 'abandoned'],
      ['REQ-009', 'error'],
    ]
  );
  const row = Object.fromEntries(board.rows.map((r) => [r.req, r]));
  assert.equal(row['REQ-002'].waits_for, 'the design waits for your decision');
  assert.equal(row['REQ-002'].next, 'aiws gate REQ-002');
  assert.equal(row['REQ-004'].waits_for, 'the pull request waits for you');
  assert.equal(row['REQ-004'].pr_url, 'https://github.com/acme/shop/pull/7');
  assert.deepEqual([row['REQ-004'].tasks_done, row['REQ-004'].tasks_total], [2, 2]);
  assert.equal(row['REQ-003'].next, 'aiws resume REQ-003');
  assert.equal(row['REQ-003'].reason, 'T2 failed 3 attempts');
  assert.equal(row['REQ-005'].next, 'aiws run REQ-005');
  assert.equal(row['REQ-006'].next, 'aiws run REQ-006');
  assert.equal(row['REQ-010'].next, '');
  assert.equal(row['REQ-001'].cost_usd, 8.5);
  assert.equal(row['REQ-001'].minutes, 24);
  assert.equal(row['REQ-001'].last_activity, '2026-11-08T01:00:00.000Z');
  assert.equal(row['REQ-005'].cost_usd, null);
  assert.match(row['REQ-009'].error, /./);
  // each requirement is drawn on its own workflow: the small profile has no separate design review
  assert.ok(row['REQ-002'].steps.some((s) => s.id === 'design_review'));
  assert.ok(!row['REQ-008'].steps.some((s) => s.id === 'design_review'));
  assert.equal(row['REQ-002'].steps.find((s) => s.id === 'design_approval').status, 'waiting');
  // a requirement no AI ran yet, or one abandoned, has no step drawn as running
  assert.equal(row['REQ-006'].steps[0].status, 'not_started');
  assert.ok(row['REQ-007'].steps.some((s) => s.status === 'abandoned'));
  assert.ok(!row['REQ-007'].steps.some((s) => s.status === 'running'));

  assert.equal(board.totals.requirements, 10);
  assert.deepEqual(board.totals.by_state, {
    waiting: 3,
    blocked: 1,
    paused: 1,
    running: 1,
    not_started: 1,
    done: 1,
    abandoned: 1,
    error: 1,
  });
  assert.equal(board.totals.cost_usd, 14);
  assert.equal(board.totals.runs, 7);
});

test('the board page escapes what agents wrote, links only http(s) pull requests and says it is read-only', () => {
  const root = boardWorkspace();
  const board = buildBoard(new Workspace(root));
  const html = renderBoard(board, {
    generatedAt: '2026-11-08T08:00:00.000Z',
    reportHref: (req) => (req === 'REQ-002' ? 'REQ-002/report.html' : null),
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; nickname/);
  assert.match(html, /<a href="REQ-002\/report\.html">REQ-002<\/a>/);
  assert.doesNotMatch(html, /<a href="REQ-004\//);
  assert.match(html, /<a href="https:\/\/github\.com\/acme\/shop\/pull\/7">acme\/shop#7<\/a>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<code>aiws gate REQ-002<\/code>/);
  assert.match(html, /<b>3<\/b><span>waiting on you<\/span>/);
  assert.match(html, /2026-11-08 05:00 UTC/);
  assert.match(html, /14\.00 USD/);
  assert.match(html, /T2 failed 3 attempts/);
  assert.match(html, /generated 2026-11-08T08:00:00.000Z/);
  assert.match(html, /3 h ago/); // REQ-002's last activity, 05:00, seen at 08:00
  assert.match(html, /Read-only/);
  assert.match(html, /in a terminal/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.doesNotMatch(html, /<script|src="http|<link /);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  // the waiting requirements come first in the page too
  assert.ok(html.indexOf('REQ-008') < html.indexOf('REQ-003'));
  assert.match(renderBoard(board, { refreshSeconds: 10 }), /<meta http-equiv="refresh" content="10">/);
});

test('a board of an empty workspace says so', () => {
  const root = makeWorkspace();
  const html = renderBoard(buildBoard(new Workspace(root)));
  assert.match(html, /No requirements in aiws\/work\/ yet/);
});

test('aiws board writes the page and a fresh report per requirement, all kept out of commits', () => {
  const root = boardWorkspace();
  fs.rmSync(path.join(root, 'aiws', 'work', 'REQ-009'), { recursive: true });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'work']);
  // read-only like `aiws report`: an AI session may run it too
  const r = ok(root, ['board'], { env: { CLAUDECODE: '1' } });
  assert.match(r.stdout, /Board written: .*board\.html/);
  const html = fs.readFileSync(path.join(root, 'aiws', 'work', 'board.html'), 'utf8');
  assert.match(html, /<a href="REQ-002\/report\.html">REQ-002<\/a>/);
  assert.ok(fs.existsSync(path.join(root, 'aiws', 'work', 'REQ-002', 'report.html')));
  assert.ok(fs.existsSync(path.join(root, 'aiws', 'work', 'REQ-007', 'report.html')));
  assert.equal(git(root, ['status', '--porcelain']), '');

  const out = path.join(tempDir('aiws-board-'), 'b.html');
  ok(root, ['board', '--out', out]);
  const elsewhere = fs.readFileSync(out, 'utf8');
  const href = /<a href="([^"]+)">REQ-002<\/a>/.exec(elsewhere)[1];
  const target = href.startsWith('file:') ? new URL(href) : path.resolve(path.dirname(out), decodeURI(href));
  assert.ok(fs.existsSync(target), href);
});

test('aiws board refuses options that do not go together, and a port that is not a number', () => {
  const root = makeWorkspace();
  assert.match(aiws(root, ['board', '--port', '5000']).stderr, /--port goes with --serve/);
  assert.match(aiws(root, ['board', '--serve', '--out', 'x.html']).stderr, /--out/);
  assert.match(aiws(root, ['board', '--serve', '--port', 'abc']).stderr, /port/i);
  assert.match(aiws(root, ['board', '--serve', '--port=70000']).stderr, /port/i);
  assert.deepEqual(parseArgs(['board', '--serve', '--port', '4320']), { pos: ['board'], flags: { serve: true, port: '4320' } });
});

// ---------------------------------------------------------------- serve

function request(port, rawPath, { method = 'GET', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers: host ? { host } : {} }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address())));
}

test('the board server renders on each request, serves only the pages it makes, and changes nothing', async () => {
  const root = boardWorkspace();
  const before = fs.readFileSync(path.join(root, 'aiws', 'work', 'REQ-002', 'state.yaml'), 'utf8');
  const server = boardServer(root, { refreshSeconds: 10 });
  const { port, address } = await listenBoard(server, 0);
  assert.equal(address, '127.0.0.1');
  try {
    const home = await request(port, '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html; charset=utf-8/);
    assert.equal(home.headers['cache-control'], 'no-store');
    assert.match(home.headers['content-security-policy'], /default-src 'none'/);
    assert.match(home.body, /<meta http-equiv="refresh" content="10">/);
    assert.match(home.body, /<a href="\/REQ-002\/report\.html">REQ-002<\/a>/);

    // rendered fresh: a requirement that moves on shows up on the next request
    fakeReq(root, 'REQ-011', { phase: 'analysis', status: 'running' });
    assert.match((await request(port, '/board.html')).body, /REQ-011/);

    const report = await request(port, '/REQ-002/report.html');
    assert.equal(report.status, 200);
    assert.match(report.body, /<h1>REQ-002 — &lt;script&gt;/);
    assert.ok(!fs.existsSync(path.join(root, 'aiws', 'work', 'REQ-002', 'report.html')), 'served, not written');

    for (const p of [
      '/REQ-999/report.html',
      '/REQ-002/state.yaml',
      '/../package.json',
      '/REQ-002/../state.yaml',
      '/%2e%2e/%2e%2e/package.json',
      '/REQ-002%2f..%2fstate.yaml/report.html',
      '/aiws/work/REQ-002/report.html',
      '/favicon.ico',
    ]) {
      assert.equal((await request(port, p)).status, 404, p);
    }
    assert.equal((await request(port, '/', { method: 'POST' })).status, 405);
    // a page of another site that points its own name at 127.0.0.1 cannot read the board
    assert.equal((await request(port, '/', { host: 'evil.example:80' })).status, 403);
    assert.equal((await request(port, '/', { host: `localhost:${port}` })).status, 200);
    assert.equal(fs.readFileSync(path.join(root, 'aiws', 'work', 'REQ-002', 'state.yaml'), 'utf8'), before);
  } finally {
    server.close();
  }
});

test('aiws board --serve listens on 127.0.0.1 only, and says so when the port is taken', async () => {
  const root = boardWorkspace();
  const blocker = net.createServer();
  const { port: busy } = await listen(blocker);
  try {
    const r = aiws(root, ['board', '--serve', '--port', String(busy)]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`port ${busy} is in use`, 'i'));
  } finally {
    blocker.close();
  }

  // a free port: take one, release it, hand it to the CLI
  const probe = net.createServer();
  const { port } = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [BIN, 'board', '--serve', '--port', String(port)], { cwd: root, env: cleanEnv() });
  try {
    const line = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (c) => {
        out += c;
        if (out.includes('\n')) resolve(out);
      });
      child.on('exit', (code) => reject(new Error(`exited ${code}: ${out}`)));
    });
    assert.match(line, new RegExp(`http://127\\.0\\.0\\.1:${port}/`));
    assert.match(line, /read-only/i);
    const home = await request(port, '/');
    assert.equal(home.status, 200);
    assert.match(home.body, /REQ-002/);
  } finally {
    child.kill();
  }
});
