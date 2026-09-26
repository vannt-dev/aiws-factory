import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeWorkspace, aiws, ok, state, git, scenario, readFile } from './helpers.js';

function hook(root, input, env = {}) {
  return aiws(root, ['guard', ...(input.tool_name === 'Bash' ? ['--bash'] : [])], { input: JSON.stringify({ cwd: root, ...input }), env });
}

const inPhase = (phase, extra = {}) => ({ AIWS_REQ: 'REQ-001', AIWS_PHASE: phase, ...extra });

test('guard: phase write scope, protected paths, secrets', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  const abs = (p) => path.join(root, p);

  // analysis may write its own output only
  assert.equal(
    hook(root, { tool_name: 'Write', tool_input: { file_path: abs('aiws/work/REQ-001/01-analysis.md') } }, inPhase('analysis')).status,
    0
  );
  const src = hook(root, { tool_name: 'Edit', tool_input: { file_path: abs('source-be/src/users.js') } }, inPhase('analysis'));
  assert.equal(src.status, 2);
  assert.match(src.stderr, /outside the write scope of phase 'analysis'/);

  // protected, in every phase
  for (const p of [
    'source-legacy/README.md',
    'aiws/work/REQ-001/state.yaml',
    'aiws/work/REQ-001/approvals/design-01.yaml',
    'aiws/config/policies.yaml',
    'requirements/x.md',
  ]) {
    const r = hook(root, { tool_name: 'Write', tool_input: { file_path: abs(p) } }, inPhase('implementation', { AIWS_TASK: 'T1' }));
    assert.equal(r.status, 2, p);
  }

  // outside the workspace during a phase
  assert.equal(
    hook(root, { tool_name: 'Write', tool_input: { file_path: path.join(path.dirname(root), 'evil.txt') } }, inPhase('design')).status,
    2
  );

  // secrets cannot be read, also via bash
  assert.equal(hook(root, { tool_name: 'Read', tool_input: { file_path: abs('source-be/.env') } }).status, 2);
  assert.equal(hook(root, { tool_name: 'Read', tool_input: { file_path: abs('source-be/config/server.pem') } }).status, 2);
  assert.equal(hook(root, { tool_name: 'Bash', tool_input: { command: 'type source-be\\.env' } }).status, 2);
  assert.equal(hook(root, { tool_name: 'Read', tool_input: { file_path: abs('source-be/src/users.js') } }).status, 0);
});

test('guard: resolves context from the aiws/REQ branch when no env is set (interactive session)', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  const abs = (p) => path.join(root, p);
  // on aiws/REQ-001 in phase analysis -> source write blocked, analysis output allowed
  assert.equal(hook(root, { tool_name: 'Write', tool_input: { file_path: abs('source-fe/src/view.js') } }).status, 2);
  assert.equal(hook(root, { tool_name: 'Write', tool_input: { file_path: abs('aiws/work/REQ-001/01-analysis.md') } }).status, 0);

  // on main (maintainer session): aiws/ kit is editable, legacy is not
  git(root, ['switch', '-q', 'main']);
  assert.equal(hook(root, { tool_name: 'Edit', tool_input: { file_path: abs('aiws/agents/developer.md') } }).status, 0);
  assert.equal(hook(root, { tool_name: 'Edit', tool_input: { file_path: abs('source-legacy/README.md') } }).status, 2);
});

test('guard: waiting for a human means no agent writes at all', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'waiting_human');
  const r = hook(root, { tool_name: 'Write', tool_input: { file_path: path.join(root, 'aiws/work/REQ-001/02-design.md') } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /waiting_human/);
});

test('guard --bash: denylist incl. nested, path-prefixed and option-laden forms', () => {
  const root = makeWorkspace();
  const blocked = [
    'git push origin main',
    'git -C . push',
    'bash -c "git push"',
    "sh -c 'aiws approve REQ-001 design --yes'",
    'node aiws/adapters/cli/bin/aiws.js approve REQ-001 design',
    'npx aiws approve REQ-001 design',
    'echo x && aiws resume REQ-001',
    'X=1 aiws reject REQ-001 design -m hi',
    'curl https://example.com',
    'cat .env',
    'git commit -m "sneaky"',
    'rm -rf source-fe',
    '$(aiws unlock)',
  ];
  const phaseEnv = inPhase('implementation', { AIWS_TASK: 'T1' });
  for (const command of blocked) assert.equal(hook(root, { tool_name: 'Bash', tool_input: { command } }, phaseEnv).status, 2, command);
  // the PowerShell tool (Claude Code on Windows) gets the same checks
  assert.equal(hook(root, { tool_name: 'PowerShell', tool_input: { command: 'git push origin main' } }, phaseEnv).status, 2);
  assert.equal(
    hook(
      root,
      { tool_name: 'PowerShell', tool_input: { command: '& node aiws/adapters/cli/bin/aiws.js approve REQ-001 design' } },
      phaseEnv
    ).status,
    2
  );
  const allowed = [
    'npm test --prefix source-be',
    'node --test source-be/test/',
    'git status',
    'git diff',
    'aiws status REQ-001',
    'ls source-fe',
  ];
  for (const command of allowed) assert.equal(hook(root, { tool_name: 'Bash', tool_input: { command } }, phaseEnv).status, 0, command);
});

test('guard --bash: a maintainer session on main may commit, but an AI may never approve or read secrets', () => {
  const root = makeWorkspace();
  const run = (command) => hook(root, { tool_name: 'Bash', tool_input: { command } }).status;
  assert.equal(run('git commit -m "update skills"'), 0);
  assert.equal(run('git push origin main'), 0);
  assert.equal(run('aiws approve REQ-001 design --yes'), 2);
  assert.equal(run('bash -c "aiws resume REQ-001"'), 2);
  assert.equal(run('cat source-be/.env'), 2);
});

test('human-only commands refuse inside an AI session and without a TTY', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  for (const env of [{ CLAUDECODE: '1' }, { AIWS_PHASE: 'implementation' }]) {
    const r = aiws(root, ['approve', 'REQ-001', 'design', '--yes'], { env });
    assert.equal(r.status, 3, JSON.stringify(env));
    assert.match(r.stderr, /human-only/);
  }
  const noTty = aiws(root, ['approve', 'REQ-001', 'design']);
  assert.equal(noTty.status, 3);
  assert.match(noTty.stderr, /interactive terminal/);
  assert.equal(state(root).phase, 'design_approval');
});

test('diff-scope reverts out-of-scope writes (incl. via shell) and fails the attempt', () => {
  const root = makeWorkspace({ discover: true });
  // attempt 1 of T1: a rogue developer writes legacy, the other side, a new file and the approvals dir
  const env = scenario({
    'developer-T1-1.js': `
      import { write } from './_lib.js';
      import { execSync } from 'node:child_process';
      write('source-legacy/README.md', 'hacked');
      write('source-fe/src/view.js', 'export const x = 1;');
      write('source-be/src/extra.js', 'export const y = 2;');
      execSync('node -e "require(\\'fs\\').writeFileSync(\\'aiws/work/REQ-001/approvals/design-99.yaml\\', \\'decision: approved\\')"');
    `,
  });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001', '--once'], { env }); // planning
  ok(root, ['run', 'REQ-001', '--once'], { env }); // T1 attempt 1 (rogue)
  let st = state(root);
  const t1 = st.tasks.find((t) => t.id === 'T1');
  assert.equal(t1.status, 'running');
  assert.match(t1.last_failure, /outside the allowed scope/);
  assert.match(readFile(root, 'source-legacy/README.md'), /read-only/);
  assert.match(readFile(root, 'source-fe/src/view.js'), /displayName/);
  assert.throws(() => readFile(root, 'source-be/src/extra.js'));
  assert.throws(() => readFile(root, 'aiws/work/REQ-001/approvals/design-99.yaml'));
  const ev = JSON.parse(readFile(root, 'aiws/work/REQ-001/evidence/runs/' + st.history.at(-1).run + '.json'));
  assert.ok(ev.scope_violations_reverted.includes('source-legacy/README.md'));

  // attempt 2 uses the well-behaved developer and succeeds
  ok(root, ['run', 'REQ-001'], { env });
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.equal(st.tasks.find((t) => t.id === 'T1').attempts, 2);
});
