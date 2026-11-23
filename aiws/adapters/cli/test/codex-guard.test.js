import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { makeWorkspace, ok, cleanEnv, readFile, writeFile, BIN } from './helpers.js';
import { runAgent } from '../src/adapters/codex.js';
import { patchFiles } from '../src/guard.js';
import { Workspace } from '../src/workspace.js';

const inPhase = (phase) => ({ AIWS_REQ: 'REQ-001', AIWS_PHASE: phase });

function guardHook(root, payload, env = {}) {
  const r = spawnSync(process.execPath, [BIN, 'guard', '--from', 'codex'], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv(env),
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

function setCodex(root, codex) {
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.codex = codex;
  fs.writeFileSync(file, YAML.stringify(rt));
}

test('patchFiles reads every file an apply_patch adds, updates, deletes or moves to', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: notes/new.md',
    '+x',
    '*** Update File: source-be/src/users.js',
    '*** Move to: source-be/src/people.js',
    '@@',
    '-a',
    '+b',
    '*** Delete File: old.txt',
    '*** End Patch',
  ].join('\n');
  assert.deepEqual(patchFiles(patch), ['notes/new.md', 'source-be/src/users.js', 'source-be/src/people.js', 'old.txt']);
  assert.deepEqual(patchFiles('*** Begin Patch\r\n*** Update File: a.js\r\n*** End Patch'), ['a.js']);
  assert.deepEqual(patchFiles(''), []);
});

test('guard --from codex: reads the call as Codex sends it and answers in its PreToolUse shape', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  // as the Codex hooks documentation describes the PreToolUse input
  const call = (tool_name, tool_input) => ({
    session_id: 's',
    transcript_path: null,
    cwd: root,
    hook_event_name: 'PreToolUse',
    model: 'gpt-5-codex',
    permission_mode: 'default',
    tool_name,
    tool_use_id: 'u1',
    tool_input,
  });
  const patch = (file, kind = 'Update') => `*** Begin Patch\n*** ${kind} File: ${file}\n@@\n-a\n+b\n*** End Patch\n`;
  const analysis = inPhase('analysis');

  assert.equal(guardHook(root, call('apply_patch', { command: patch('aiws/work/REQ-001/01-analysis.md', 'Add') }), analysis), null);
  const out = guardHook(root, call('apply_patch', { command: patch('source-be/src/users.js') }), analysis);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /outside the write scope of phase 'analysis'/);
  // one file out of scope among several refuses the whole patch
  const mixed = `*** Begin Patch\n*** Add File: aiws/work/REQ-001/01-analysis.md\n+x\n*** Add File: requirements/x.md\n+x\n*** End Patch\n`;
  assert.match(
    guardHook(root, call('apply_patch', { command: mixed }), analysis).hookSpecificOutput.permissionDecisionReason,
    /requirements\/x\.md is protected/
  );
  assert.equal(guardHook(root, call('Bash', { command: 'Get-Content .env' }), analysis).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(
    guardHook(root, call('Bash', { command: 'aiws approve REQ-001 --gate design' }), analysis).hookSpecificOutput.permissionDecision,
    'deny'
  );
  assert.equal(guardHook(root, call('Bash', { command: 'git status --short' }), analysis), null);
  assert.equal(guardHook(root, call('mcp__fs__read', { path: 'x' }), analysis), null);

  // input that is no tool call: refused inside a phase, let through in a session that works on no requirement
  assert.equal(guardHook(root, 'not json', analysis).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(guardHook(root, 'not json'), null);

  // every call the hook gets is counted in the canary file aiws gives it, decided or not
  const canary = path.join(root, 'canary.txt');
  guardHook(root, call('Bash', { command: 'git status' }), { ...analysis, AIWS_HOOK_CANARY: canary });
  guardHook(root, call('Bash', { command: 'Get-Content .env' }), { ...analysis, AIWS_HOOK_CANARY: canary });
  assert.equal(fs.readFileSync(canary, 'utf8').trim().split('\n').length, 2);
});

test('sync codex writes the guard hook into .codex/hooks.json only with codex.guard_hook, keeping other hooks', () => {
  const root = makeWorkspace();
  const other = { matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-check' }] };
  writeFile(root, '.codex/hooks.json', JSON.stringify({ description: 'mine', hooks: { PreToolUse: [other], Stop: [other] } }));

  assert.match(ok(root, ['sync', 'codex']).out, /Codex has no guard hook/);
  assert.deepEqual(JSON.parse(readFile(root, '.codex/hooks.json')).hooks.PreToolUse, [other], 'off by default: nothing added');

  setCodex(root, { guard_hook: true });
  assert.match(ok(root, ['sync', 'codex']).out, /runs the aiws guard hook/);
  ok(root, ['sync', 'codex']); // twice: still one entry of its own
  const doc = JSON.parse(readFile(root, '.codex/hooks.json'));
  assert.equal(doc.description, 'mine');
  assert.deepEqual(doc.hooks.Stop, [other]);
  assert.equal(doc.hooks.PreToolUse.length, 2);
  assert.deepEqual(doc.hooks.PreToolUse[0], other);
  const own = doc.hooks.PreToolUse[1];
  assert.equal(own.matcher, '', 'every tool goes to the guard');
  assert.match(own.hooks[0].command, /^node ".+aiws\.js" guard --from codex$/);
  assert.equal(own.hooks[0].timeout, 30);

  // a workspace that carries the CLI runs that one; Codex starts hooks in the session's folder, the root
  fs.mkdirSync(path.join(root, 'aiws/adapters/cli/bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'aiws/adapters/cli/bin/aiws.js'), '');
  ok(root, ['sync', 'codex']);
  assert.equal(
    JSON.parse(readFile(root, '.codex/hooks.json')).hooks.PreToolUse[1].hooks[0].command,
    'node aiws/adapters/cli/bin/aiws.js guard --from codex'
  );

  setCodex(root, { guard_hook: false });
  ok(root, ['sync', 'codex']);
  assert.deepEqual(JSON.parse(readFile(root, '.codex/hooks.json')).hooks.PreToolUse, [other], 'switched off: its entry goes');
});

/**
 * A stand-in for `codex exec` with the guard hook: prints a command_execution event, and in mode `hook` first
 * runs the aiws hook command of .codex/hooks.json the way Codex would, with the tool call on stdin.
 */
function fakeCodex(root, mode) {
  const script = path.join(root, `fake-codex-${mode}.cjs`);
  fs.writeFileSync(
    script,
    `
const fs = require('fs');
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
fs.writeFileSync('codex-args.json', JSON.stringify(args));
fs.readFileSync(0, 'utf8');
const out = args[args.indexOf('-o') + 1];
if (${JSON.stringify(mode)} === 'hook') {
  const doc = JSON.parse(fs.readFileSync('.codex/hooks.json', 'utf8'));
  for (const entry of doc.hooks.PreToolUse) for (const h of entry.hooks) {
    spawnSync(h.command, { shell: true, input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: 'node --version' } }), env: process.env });
  }
}
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'node --version', exit_code: 0 } }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
fs.writeFileSync(out, 'done\\n');
`
  );
  return `node "${script}"`;
}

test('codex with guard_hook runs a phase with a shell, and fails a run in which the hook never ran', () => {
  const root = makeWorkspace();
  const agent = { id: 'developer' };
  const contract = { tools: ['read', 'write', 'edit', 'bash'] };
  const run = (mode) => {
    setCodex(root, { command: fakeCodex(root, mode), guard_hook: true });
    return runAgent(new Workspace(root), { prompt: 'p', env: cleanEnv(inPhase('implementation')), contract, agent });
  };

  // switched on but never synced: refused before Codex starts
  const unsynced = run('hook');
  assert.equal(unsynced.ok, false);
  assert.match(unsynced.stderr, /run `aiws sync codex`/);

  ok(root, ['sync', 'codex']);
  const guarded = run('hook');
  assert.equal(guarded.ok, true, guarded.stderr);
  const args = JSON.parse(readFile(root, 'codex-args.json'));
  assert.ok(args.includes('--dangerously-bypass-hook-trust'), 'aiws wrote the hook itself, so it needs no stored trust');
  assert.deepEqual(args.slice(args.indexOf('-s'), args.indexOf('-s') + 2), ['-s', 'workspace-write']);

  const unguarded = run('nohook');
  assert.equal(unguarded.ok, false);
  assert.match(unguarded.stderr, /guard hook did not run/);

  // without guard_hook a shell stays refused, as before
  setCodex(root, { command: fakeCodex(root, 'hook') });
  const refused = runAgent(new Workspace(root), { prompt: 'p', env: cleanEnv(inPhase('implementation')), contract, agent });
  assert.equal(refused.ok, false);
  assert.match(refused.stderr, /cannot limit.*codex\.guard_hook/s);
});
