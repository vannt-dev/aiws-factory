import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, aiws, ok, state, git, scenario, readFile, writeFile, tempDir } from './helpers.js';

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
