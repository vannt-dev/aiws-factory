import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, scenario, readFile, cleanEnv, git, BIN } from './helpers.js';
import { expandEnv, stopEvent } from '../src/notify.js';

/** Changes runtime.yaml and commits it: the requirement commands want a clean tree. */
function configure(root, patch) {
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(rt, patch);
  fs.writeFileSync(file, YAML.stringify(rt));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'configure']);
}

/** A notify command that appends what it was given to a file: cross-platform, no shell quoting to get right. */
function fileNotifier(root) {
  const script = path.join(root, 'notify.cjs');
  fs.writeFileSync(
    script,
    "const fs=require('fs');fs.appendFileSync(process.argv[2], JSON.stringify({argv: process.argv.slice(3), " +
      'message: process.env.AIWS_NOTIFY_MESSAGE, event: process.env.AIWS_NOTIFY_EVENT, req: process.env.AIWS_NOTIFY_REQ, ' +
      "phase: process.env.AIWS_NOTIFY_PHASE}) + '\\n');"
  );
  const out = path.join(root, 'notified.log');
  return {
    command: `node "${script}" "${out}" {event} {req}`,
    lines: () =>
      fs.existsSync(out)
        ? fs
            .readFileSync(out, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l))
        : [],
  };
}

test('the person is told when a run reaches a gate, is blocked, or is paused', () => {
  const root = makeWorkspace({ discover: true });
  const notifier = fileNotifier(root);
  // git must not see the notifier's files as stray changes of the requirement
  fs.appendFileSync(path.join(root, '.gitignore'), 'notify.cjs\nnotified.log\n');
  configure(root, { notify: { command: notifier.command } });
  ok(root, ['new', 'REQ-001']);

  const r = ok(root, ['run', 'REQ-001']);
  assert.match(r.stdout, /notified \(command\)/);
  let lines = notifier.lines();
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].argv, ['gate', 'REQ-001']);
  assert.equal(lines[0].event, 'gate');
  assert.equal(lines[0].phase, 'design_approval');
  assert.match(lines[0].message, /^REQ-001: design_approval \/ waiting_human - design ready for review/);

  // paused by the usage limit
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const env = scenario({ 'planner.js': 'console.log("You\'ve hit your session limit · resets 1:50pm"); process.exit(75);' });
  assert.equal(aiws(root, ['run', 'REQ-001'], { env }).status, 75);
  lines = notifier.lines();
  assert.equal(lines.at(-1).event, 'paused');
  assert.match(lines.at(-1).message, /paused by the AI usage limit/);

  // only the events asked for (the paused run left state.yaml changed; the configuration commit takes it along)
  configure(root, { notify: { command: notifier.command, events: ['blocked'] } });
  assert.equal(aiws(root, ['run', 'REQ-001'], { env }).status, 75);
  assert.equal(notifier.lines().length, 2, 'a paused run is not reported when only blocked is asked for');
});

test('a failing notify command warns and changes nothing about the run', () => {
  const root = makeWorkspace({ discover: true });
  configure(root, { notify: { command: 'node -e "process.exit(2)"' } });
  ok(root, ['new', 'REQ-001']);
  const r = ok(root, ['run', 'REQ-001']);
  assert.match(r.stderr, /notify command failed \(exit 2\)/);
  assert.equal(state(root).phase, 'design_approval');
});

test('the webhook receives the stop as JSON, with its address taken from the environment', async () => {
  const root = makeWorkspace({ discover: true });
  configure(root, { notify: { webhook: '${AIWS_TEST_WEBHOOK}' } });
  ok(root, ['new', 'REQ-001']);
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ method: req.method, type: req.headers['content-type'], body: JSON.parse(body) });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  try {
    // the server answers in this process, so the run must not block the event loop
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN, 'run', 'REQ-001'], { cwd: root, env: cleanEnv({ AIWS_TEST_WEBHOOK: url }) });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (out += c));
      child.on('close', (code) => resolve({ code, out }));
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /notified \(webhook\)/);
    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'POST');
    assert.match(received[0].type, /application\/json/);
    assert.equal(received[0].body.event, 'gate');
    assert.equal(received[0].body.req, 'REQ-001');
    assert.equal(received[0].body.phase, 'design_approval');
    assert.equal(received[0].body.text, received[0].body.content);
    assert.match(received[0].body.text, /design ready for review/);
  } finally {
    server.close();
  }
  // without the variable the webhook is not sent, and that is only a warning
  ok(root, ['reject', 'REQ-001', 'design', '--yes', '-m', 'again']);
  const r2 = ok(root, ['run', 'REQ-001']);
  assert.match(r2.stderr, /environment variable AIWS_TEST_WEBHOOK is not set/);
  assert.equal(state(root).phase, 'design_approval');
});

test('--wait starts the run again after a usage-limit pause, until it stops for another reason', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  // the limit is in force for the first two attempts of the architect, then it has reset
  const env = scenario({
    'architect.js': `
      import fs from 'node:fs';
      // next to this script: the work directory is cleaned between runs, the scenario directory is not
      const marker = new URL('./limit-hits', import.meta.url);
      const hits = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
      if (hits < 2) { fs.writeFileSync(marker, String(hits + 1)); console.log("You've hit your session limit · resets 1:50pm"); process.exit(75); }
      await import('./_architect_real.js');
    `,
  });
  const real = path.join(env.AIWS_SCRIPTED_DIR.split(path.delimiter)[0], '_architect_real.js');
  fs.copyFileSync(path.join(env.AIWS_SCRIPTED_DIR.split(path.delimiter)[1], 'architect.js'), real);
  const r = ok(root, ['run', 'REQ-001', '--wait'], { env: { ...env, AIWS_WAIT_SECONDS: '1' } });
  assert.equal((r.stdout.match(/waiting 1 s for the usage limit to reset/g) ?? []).length, 2, r.out);
  const st = state(root);
  assert.equal(st.phase, 'design_approval', st.reason);
  assert.equal(st.paused, undefined);
  assert.equal(st.history.filter((h) => h.result === 'usage_limit').length, 2);
});

test('--wait gives up at wait.max_hours and exits 75 like a plain run', () => {
  const root = makeWorkspace({ discover: true });
  configure(root, { wait: { max_hours: 0.0001 } }); // a third of a second
  ok(root, ['new', 'REQ-001']);
  const env = scenario({ 'analyst.js': "console.log('Weekly limit reached ∙ resets Mon 10am'); process.exit(75);" });
  const r = aiws(root, ['run', 'REQ-001', '--wait'], { env: { ...env, AIWS_WAIT_SECONDS: '1' } });
  assert.equal(r.status, 75, r.out);
  assert.doesNotMatch(r.stdout, /waiting 1 s/);
  assert.match(readFile(root, 'aiws/work/REQ-001/state.yaml'), /paused: usage_limit/);
});

test('stopEvent and expandEnv', () => {
  assert.equal(stopEvent({ status: 'running', paused: 'usage_limit' }), 'paused');
  assert.equal(stopEvent({ status: 'blocked' }), 'blocked');
  assert.equal(stopEvent({ status: 'waiting_human' }), 'gate');
  assert.equal(stopEvent({ status: 'waiting_human' }, { budgetWarning: true }), 'budget');
  assert.equal(stopEvent({ status: 'done' }), null);
  assert.equal(expandEnv('https://h/${A}/x', { A: 'one' }), 'https://h/one/x');
  assert.deepEqual(expandEnv('${MISSING}', {}), { missing: 'MISSING' });
  assert.equal(expandEnv(undefined), undefined);
});
