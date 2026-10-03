import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, scenario, readFile, writeFile, tempDir, BIN } from './helpers.js';

function toImplementation(root, env) {
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
}

const failingT1 = `
  import { write, read } from './_lib.js';
  const src = read('source-be/src/users.js');
  if (!src.includes('setNickname')) write('source-be/src/users.js', src + '\\nexport function setNickname() { return null; }\\n');
  write('source-be/test/nickname.test.js', "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {setNickname} from '../src/users.js';\\ntest('TC-1: x', () => assert.ok(setNickname('u1','a')));\\ntest('TC-2: y', () => assert.ok(false));\\n");
`;

test('failing tests are retried with the failure in the prompt, then block after 3 attempts; resume continues', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({ 'developer-T1.js': failingT1 });
  toImplementation(root, env);
  ok(root, ['run', 'REQ-001'], { env });
  let st = state(root);
  assert.equal(st.status, 'blocked');
  const t1 = st.tasks.find((t) => t.id === 'T1');
  assert.equal(t1.status, 'blocked');
  assert.equal(t1.attempts, 3);
  assert.equal(t1.test_result, 'fail');
  const prompts = fs.readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs')).filter((f) => f.endsWith('.prompt.md'));
  const last = readFile(root, `aiws/work/REQ-001/evidence/runs/${prompts.sort().at(-1)}`);
  assert.match(last, /Previous attempt failed/);
  assert.match(last, /be tests failed/);
  assert.ok(fs.existsSync(path.join(root, 'aiws/work/REQ-001/evidence/test-results/T1-attempt-3.yaml')));

  // the human reverts the broken attempt and resumes; the default (good) developer takes over
  git(root, ['checkout', '--', 'source-be/src/users.js']);
  ok(root, ['resume', 'REQ-001', '--yes', '-m', 'da revert ban loi']);
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
});

test('a test case id missing from the task tests fails the task', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'developer-T1-1.js': `
      import { write, read } from './_lib.js';
      write('source-be/src/users.js', read('source-be/src/users.js') + '\\nexport function setNickname() {}\\n');
      write('source-be/test/nickname.test.js', "import {test} from 'node:test';\\ntest('TC-1 only', () => {});\\n");
    `,
  });
  toImplementation(root, env);
  ok(root, ['run', 'REQ-001', '--once'], { env }); // planning
  ok(root, ['run', 'REQ-001', '--once'], { env }); // T1 attempt 1
  const t1 = state(root).tasks.find((t) => t.id === 'T1');
  assert.match(t1.last_failure, /TC-2 is not referenced/);
});

test('developer question -> human answer -> implementation continues with the answer', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'developer-T2.js': `
      import { write, read, work } from './_lib.js';
      if (!read(work('questions.md')).includes('Trả lời')) {
        write(work('questions.md'), '# Câu hỏi T2\\n\\nNickname rỗng chuỗi "" thì hiển thị gì?\\n');
        process.exit(0);
      }
      await import(${JSON.stringify(new URL('./fixtures/scripted/developer-T2.js', import.meta.url).href)});
    `,
  });
  toImplementation(root, env);
  ok(root, ['run', 'REQ-001'], { env });
  let st = state(root);
  assert.equal(st.phase, 'design_change_requested');
  assert.equal(st.status, 'waiting_human');
  ok(root, ['answer', 'REQ-001', '--yes', '-m', 'Hien thi ten that']);
  assert.match(readFile(root, 'aiws/work/REQ-001/questions.md'), /Hien thi ten that/);
  ok(root, ['run', 'REQ-001'], { env });
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  const prompt = fs
    .readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs'))
    .filter((f) => f.endsWith('.prompt.md'))
    .map((f) => readFile(root, `aiws/work/REQ-001/evidence/runs/${f}`))
    .filter((p) => p.includes('task: T2'))
    .at(-1);
  assert.match(prompt, /Hien thi ten that/);
});

test('developer question -> redesign -> design must be approved again, done tasks survive re-plan', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'developer-T2-1.js': `
      import { write, work } from './_lib.js';
      write(work('questions.md'), '# Câu hỏi\\n\\nDesign thiếu xử lý nickname trùng.\\n');
    `,
  });
  toImplementation(root, env);
  ok(root, ['run', 'REQ-001'], { env });
  assert.equal(state(root).phase, 'design_change_requested');
  ok(root, ['redesign', 'REQ-001', '--yes', '-m', 'Them rule nickname khong trung']);
  ok(root, ['run', 'REQ-001'], { env: { ...env, AIWS_DESIGN_NOTE: 'v2: nickname unique' } });
  let st = state(root);
  assert.equal(st.phase, 'design_approval');
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.equal(st.history.filter((h) => h.task === 'T1' && h.result === 'done').length, 1, 'T1 kept done across re-plan');
});

test('blocking question in analysis waits for a human answer', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'analyst.js': `
      import { write, work, read } from './_lib.js';
      const fb = process.env.AIWS_ATTEMPT;
      const answered = read(work('01-analysis.md')).includes('Q1');
      write(work('01-analysis.md'), \`# A
## Mục tiêu
x
## Acceptance criteria
- AC-1: nickname luu duoc
## Impact
x
## Reuse
x
## Câu hỏi mở
- \${answered ? '[answered]' : '[blocking]'} Q1: Nickname co phai duy nhat?
\`);
    `,
  });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  let st = state(root);
  assert.equal(st.phase, 'analysis');
  assert.equal(st.status, 'waiting_human');
  assert.match(st.reason, /Q1/);
  ok(root, ['answer', 'REQ-001', '--yes', '-m', 'Khong can duy nhat']);
  ok(root, ['run', 'REQ-001', '--once'], { env });
  st = state(root);
  assert.equal(st.phase, 'design');
});

test('aiws stop: the run stops after the current step and continues later', () => {
  const root = makeWorkspace({ discover: true });
  // while T1 is running, a human asks for a stop from another terminal
  const t1 = new URL('./fixtures/scripted/developer-T1.js', import.meta.url).href;
  const env = {
    ...scenario({
      'developer-T1.js': `
        import { spawnSync } from 'node:child_process';
        await import(${JSON.stringify(t1)});
        spawnSync(process.execPath, [process.env.AIWS_TEST_BIN, 'stop', 'REQ-001']);
      `,
    }),
    AIWS_TEST_BIN: BIN,
  };
  toImplementation(root, env);
  const first = ok(root, ['run', 'REQ-001'], { env });
  assert.match(first.stdout, /stop requested/);
  let st = state(root);
  assert.equal(st.phase, 'implementation');
  assert.equal(st.status, 'running', 'a stop is not a block: no human gate command is needed to continue');
  assert.deepEqual(
    st.tasks.map((t) => t.status),
    ['done', 'pending']
  );
  assert.equal(git(root, ['status', '--porcelain']), '', 'the tree is clean after a stop');

  // a stop requested while nothing runs is stale: the next run ignores it
  ok(root, ['stop', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
});

test('a task interrupted mid-run is resumed with its partial work', () => {
  const root = makeWorkspace({ discover: true });
  toImplementation(root);
  ok(root, ['run', 'REQ-001', '--once']); // planning

  // what a killed `aiws run` leaves behind: T1 saved as running, a half-written file of the task
  const file = path.join(root, 'aiws/work/REQ-001/state.yaml');
  const saved = YAML.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(saved.tasks[0], { status: 'running', in_progress: true, base: git(root, ['rev-parse', 'HEAD']) });
  fs.writeFileSync(file, YAML.stringify(saved));
  writeFile(root, 'source-be/test/nickname.test.js', '// half written\n');

  const r = ok(root, ['run', 'REQ-001']);
  assert.match(r.stdout, /T1 \(attempt 1\/3\) - resuming an interrupted attempt/);
  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.equal(st.tasks[0].in_progress, undefined);
  const prompts = fs.readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs')).filter((f) => f.endsWith('.prompt.md'));
  const t1Prompt = prompts.map((f) => readFile(root, `aiws/work/REQ-001/evidence/runs/${f}`)).find((p) => p.includes('task: T1'));
  assert.match(t1Prompt, /previous attempt was interrupted/);

  // dirty files outside the task are still refused
  const other = makeWorkspace({ discover: true });
  toImplementation(other);
  ok(other, ['run', 'REQ-001', '--once']);
  writeFile(other, 'source-fe/src/stray.js', 'export const x = 1;\n');
  const refused = aiws(other, ['run', 'REQ-001']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.out, /uncommitted changes outside REQ-001's scope/);
});

test('source lock: a second REQ in its own worktree cannot enter implementation', () => {
  const root = makeWorkspace({ discover: true });
  writeFile(root, 'requirements/REQ-002-avatar.md', '# REQ-002 — Avatar\n\nUser co avatar.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'req 2']);

  // REQ-001 takes the lock (stops at pr_approval, lock held until merge)
  toImplementation(root);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval');

  git(root, ['switch', '-q', 'main']);
  const wt = path.join(tempDir('aiws-wt-'), 'req2');
  ok(root, ['new', 'REQ-002', '--worktree', wt]);
  ok(wt, ['run', 'REQ-002']); // analysis + design are allowed in parallel
  assert.equal(state(wt, 'REQ-002').phase, 'design_approval');
  ok(wt, ['approve', 'REQ-002', 'design', '--yes']);
  const r = aiws(wt, ['run', 'REQ-002']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Source lock is held by REQ-001/);
  assert.match(ok(root, ['status']).stdout, /No REQs on this branch|source lock/);
});

test('check build runs every configured build and test command and fails when one fails', () => {
  const root = makeWorkspace();
  const pass = ok(root, ['check', 'build']);
  for (const name of ['be_build', 'be_test', 'fe_build', 'fe_test']) assert.match(pass.stdout, new RegExp(`> ${name}: `));
  assert.match(pass.stdout, /build check ok \(4 command\(s\)\)/);

  // a failing test fails the check, but the remaining commands still run
  writeFile(
    root,
    'source-be/test/broken.test.js',
    "import { test } from 'node:test';\ntest('broken', () => { throw new Error('boom'); });\n"
  );
  const fail = aiws(root, ['check', 'build']);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /be_test: .*\n\s+FAILED \(exit 1\)/);
  assert.match(fail.stdout, /> fe_test: /, 'later commands still run');
  assert.match(fail.stdout, /build check FAILED: be_test/);

  // a workspace without configured commands (the kit itself) is a no-op
  const kit = tempDir('aiws-kit-');
  ok(kit, ['init']);
  assert.match(ok(kit, ['check', 'build']).stdout, /nothing to run/);
});

test('status shows the AI runs and the cumulative cost of a requirement', () => {
  const root = makeWorkspace();
  ok(root, ['new', 'REQ-001']);
  assert.doesNotMatch(ok(root, ['status', 'REQ-001']).stdout, /AI runs/, 'nothing to report before the first run');

  const runs = 'aiws/work/REQ-001/evidence/runs';
  writeFile(root, `${runs}/run-0001.json`, JSON.stringify({ phase: 'analysis', duration_ms: 120000, report: { cost_usd: 1.25 } }));
  writeFile(root, `${runs}/run-0002.json`, JSON.stringify({ phase: 'design', duration_ms: 180000, report: { cost_usd: 2 } }));
  writeFile(root, `${runs}/run-0003.json`, JSON.stringify({ phase: 'design', duration_ms: 60000, report: { cost_usd: 0.5 } }));
  writeFile(root, `${runs}/run-0004.json`, '{ "truncated": '); // interrupted run: ignored
  writeFile(root, `${runs}/run-0003.prompt.md`, 'prompt'); // not evidence
  assert.match(
    ok(root, ['status', 'REQ-001']).stdout,
    /AI runs: 3 \(6 min\), cost 3\.75 USD list-price equivalent \(analysis 1\.25, design 2\.50\)/
  );

  // adapters that report no cost (scripted): runs and time only
  writeFile(root, `${runs}/run-0001.json`, JSON.stringify({ phase: 'analysis', duration_ms: 1000, report: {} }));
  fs.rmSync(path.join(root, runs, 'run-0002.json'));
  fs.rmSync(path.join(root, runs, 'run-0003.json'));
  const line = ok(root, ['status', 'REQ-001'])
    .stdout.split('\n')
    .find((l) => l.includes('AI runs'));
  assert.equal(line.trim(), 'AI runs: 1 (1 min)');
});

test('init copies the kit into a fresh project and sync claude generates .claude/', () => {
  const dir = tempDir('aiws-init-');
  assert.match(ok(dir, ['--version']).stdout.trim(), /^\d+\.\d+\.\d+$/);
  ok(dir, ['init']);
  for (const p of [
    'aiws/config/workflow.yaml',
    'aiws/agents/developer.md',
    'aiws/skills/unit-testing/SKILL.md',
    'aiws/templates/01-analysis.md',
    'AGENTS.md',
    'source-legacy',
    'requirements',
  ]) {
    assert.ok(fs.existsSync(path.join(dir, p)), p);
  }
  ok(dir, ['sync', 'claude']);
  assert.equal(readFile(dir, 'CLAUDE.md').trim(), '@AGENTS.md');
  const settings = JSON.parse(readFile(dir, '.claude/settings.json'));
  assert.ok(settings.permissions.deny.includes('Edit(./source-legacy/**)'));
  assert.ok(settings.permissions.deny.includes('Read(./**/.env)'));
  assert.ok(
    !settings.permissions.deny.includes('Edit(./aiws/agents/**)'),
    'maintainer-editable paths are guarded by the hook, not static deny'
  );
  assert.ok(settings.permissions.deny.includes('Bash(aiws approve *)'), 'an AI may never approve');
  assert.ok(!settings.permissions.deny.includes('Bash(git commit *)'), 'git is blocked per phase by the hook, not statically');
  assert.ok(!settings.permissions.deny.includes('Bash(aiws run *)'), 'aiws run is blocked per phase by the hook, not statically');
  for (const gate of ['approve', 'reject', 'answer', 'redesign', 'resume', 'unlock']) {
    assert.ok(settings.permissions.deny.includes(`Bash(aiws ${gate} *)`), `aiws ${gate} is always denied`);
  }
  assert.equal(settings.hooks.PreToolUse[1].matcher, 'Bash|PowerShell');
  assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /aiws\.js" guard$/);
  const dev = readFile(dir, '.claude/agents/developer.md');
  assert.match(dev, /^---\nname: developer\n/);
  assert.match(dev, /tools: Read, Grep, Glob, Edit, MultiEdit, Write, Bash/);
  assert.match(dev, /model: opus/);
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/be-conventions/SKILL.md')));
});
