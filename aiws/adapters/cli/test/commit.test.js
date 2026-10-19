import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, ok, state, git, scenario, tempDir, readFile } from './helpers.js';
import { taskSubject } from '../src/engine.js';

test('task commit subject: Conventional Commits lint rules, the task id last', () => {
  assert.equal(taskSubject('REQ-001', { id: 'T1', title: 'be - add setNickname' }), 'feat(REQ-001): be - add setNickname (T1)');
  // a capitalised first word starts lower case, an acronym is left alone, no full stop
  assert.equal(taskSubject('REQ-001', { id: 'T2', title: 'Add the  url validator.' }), 'feat(REQ-001): add the url validator (T2)');
  assert.equal(taskSubject('REQ-001', { id: 'T3', type: 'fix', title: 'API errors' }), 'fix(REQ-001): API errors (T3)');
  assert.equal(taskSubject('REQ-001', { id: 'T4' }), 'feat(REQ-001): task (T4)');
  const long = taskSubject('REQ-001', { id: 'T5', title: 'x'.repeat(150) });
  assert.equal(long.length, 100);
  assert.match(long, /…\s\(T5\)$/);
});

/** A hooks folder for the repository at `root` (core.hooksPath), with executable hooks. */
function installHooks(root, hooks) {
  const dir = tempDir('aiws-hooks-');
  for (const [name, body] of Object.entries(hooks)) {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`);
    fs.chmodSync(path.join(dir, name), 0o755);
  }
  git(root, ['config', 'core.hooksPath', dir.replaceAll('\\', '/')]);
}

test('a git hook that refuses the task commit fails the attempt; the developer gets its output and fixes it', () => {
  const root = makeWorkspace({ discover: true });
  installHooks(root, {
    'pre-commit':
      'if git diff --cached -- source-be | grep -q FORBIDDEN; then printf "\\033[31mlint: FORBIDDEN is not allowed\\033[0m\\n" >&2; exit 1; fi',
  });
  const t1 = new URL('./fixtures/scripted/developer-T1.js', import.meta.url).href;
  const env = scenario({
    'developer-T1-1.js': `
      import { write, read } from './_lib.js';
      await import(${JSON.stringify(t1)});
      write('source-be/src/users.js', read('source-be/src/users.js') + '// FORBIDDEN\\n');
    `,
    'developer-T1-2.js': `
      import { write, read } from './_lib.js';
      write('source-be/src/users.js', read('source-be/src/users.js').replace('// FORBIDDEN\\n', ''));
    `,
  });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });

  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  const t1History = st.history.filter((h) => h.task === 'T1').map((h) => [h.result, h.reason ?? '']);
  assert.deepEqual(t1History, [
    ['fail', 'commit refused'],
    ['done', ''],
  ]);
  // the second attempt was told what the hook said
  const run2 = st.history.find((h) => h.task === 'T1' && h.result === 'done').run;
  const prompt = readFile(root, `aiws/work/REQ-001/evidence/runs/${run2}.prompt.md`);
  assert.match(prompt, /a git hook of the workspace refused the commit/);
  assert.match(prompt, /lint: FORBIDDEN is not allowed/);
  assert.ok(!prompt.includes('\u001b['), 'without terminal colour codes');
  // one commit for T1, without the marker, with the subject and trailers
  const commits = git(root, ['log', '--format=%s', '--grep=Task: T1', '-F', 'main..HEAD']).split('\n');
  assert.deepEqual(commits, [
    taskSubject(
      'REQ-001',
      st.tasks.find((t) => t.id === 'T1')
    ),
  ]);
  assert.doesNotMatch(readFile(root, 'source-be/src/users.js'), /FORBIDDEN/);
});
