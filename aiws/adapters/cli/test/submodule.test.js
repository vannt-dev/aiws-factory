import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, ok, aiws, state, git, tempDir, scenario } from './helpers.js';
import { prTitle } from '../src/engine.js';

/**
 * A workspace whose `side` folders are git submodules. Each one is its own repository (with a bare
 * "origin"), added back with `git submodule add`. Returns { root, subs: { side: { origin } } }.
 */
function makeSubmoduleWorkspace(sides = ['source-be']) {
  const root = makeWorkspace();
  const subs = {};
  for (const side of sides) {
    const origin = tempDir('aiws-sub-origin-');
    git(origin, ['init', '-q', '--bare', '-b', 'main']);
    const seed = tempDir('aiws-sub-seed-');
    fs.cpSync(path.join(root, side), seed, { recursive: true });
    git(seed, ['init', '-q', '-b', 'main']);
    git(seed, ['config', 'core.autocrlf', 'false']);
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', `initial ${side}`]);
    git(seed, ['push', '-q', origin, 'main']);
    git(root, ['rm', '-q', '-r', '--cached', side]);
    fs.rmSync(path.join(root, side), { recursive: true, force: true });
    git(root, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', origin, side]);
    git(path.join(root, side), ['config', 'core.autocrlf', 'false']);
    git(path.join(root, side), ['reset', '-q', '--hard']); // line endings as committed, like the workspace
    git(path.join(root, side), ['checkout', '-q', '--detach']); // as after `git submodule update --init`
    subs[side] = { origin };
  }
  git(root, ['commit', '-q', '-m', `submodules ${sides.join(' ')}`]);
  const r = aiws(root, ['discover']);
  if (r.status !== 0) throw new Error(`discover failed: ${r.out}`);
  return { root, subs };
}

test('submodule: tasks commit inside the submodule on its own branch, then the gitlink in the workspace', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const be = path.join(root, 'source-be');
  ok(root, ['new', 'REQ-001']);
  assert.equal(git(be, ['branch', '--show-current']), 'aiws/REQ-001');
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);

  // T1 is a commit of the submodule, with the trailers, on the submodule's requirement branch
  const t1 = st.tasks.find((t) => t.id === 'T1');
  const subLog = git(be, ['log', '--format=%s%n%b', '-1', '--grep=Task: T1', '-F']);
  assert.match(subLog, /^feat\(REQ-001\): .* \(T1\)\n/);
  assert.match(subLog, /REQ-ID: REQ-001/);
  assert.match(git(be, ['show', '--name-only', '--format=', 'HEAD~0']) + git(be, ['log', '--name-only', '--format=']), /src\/users\.js/);
  // the workspace commit of T1 moves the gitlink and carries the same trailers
  assert.match(git(root, ['show', '--format=%B', '--name-only', t1.commit]), /Task: T1[\s\S]*source-be/);
  // the gitlink of the workspace is the head of the submodule branch, and nothing is left dirty
  assert.equal(git(root, ['rev-parse', 'HEAD:source-be']), git(be, ['rev-parse', 'HEAD']));
  assert.equal(git(root, ['status', '--porcelain', '--ignore-submodules=none']), '');
  assert.equal(git(be, ['status', '--porcelain']), '');
  assert.deepEqual(Object.keys(st.submodules), ['source-be']);
  assert.equal(st.submodules['source-be'].branch, 'aiws/REQ-001');
  assert.equal(st.submodules['source-be'].base_branch, 'main');
});

function toPrGate(root, env) {
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  const st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  return st;
}

/** Merges the submodule's requirement branch on its host (a clone pushes the merge commit to origin). */
function mergeSubmodulePr(origin, branch = 'aiws/REQ-001') {
  const clone = tempDir('aiws-sub-clone-');
  git(clone, ['clone', '-q', origin, '.']);
  git(clone, ['merge', '-q', '--no-ff', '-m', `Merge ${branch}`, `origin/${branch}`]);
  git(clone, ['push', '-q', 'origin', 'main']);
}

test('submodule: both sides as submodules, each task commits in its own submodule', () => {
  const { root } = makeSubmoduleWorkspace(['source-fe', 'source-be']);
  const st = toPrGate(root);
  assert.deepEqual(Object.keys(st.submodules), ['source-be', 'source-fe']);
  for (const [side, task] of [
    ['source-be', 'T1'],
    ['source-fe', 'T2'],
  ]) {
    const abs = path.join(root, side);
    assert.equal(git(abs, ['branch', '--show-current']), 'aiws/REQ-001');
    assert.match(git(abs, ['log', '--format=%B', '-1', `--grep=Task: ${task}`, '-F']), new RegExp(`Task: ${task}`));
    assert.equal(git(root, ['rev-parse', `HEAD:${side}`]), git(abs, ['rev-parse', 'HEAD']));
  }
  assert.equal(git(root, ['status', '--porcelain', '--ignore-submodules=none']), '');
});

test('submodule: the draft pull request opens in the submodule repository first, then in the workspace', () => {
  const { root, subs } = makeSubmoduleWorkspace(['source-be']);
  const remote = tempDir('aiws-remote-');
  git(remote, ['init', '-q', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
  const script = path.join(tempDir('aiws-pr-'), 'create-pr.cjs');
  const calls = `${script}.calls`;
  fs.writeFileSync(
    script,
    `const fs = require('fs');\n` +
      `const n = fs.existsSync(${JSON.stringify(calls)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(calls)}, 'utf8')) : [];\n` +
      `n.push({ cwd: process.cwd(), args: process.argv.slice(2), body: fs.readFileSync(process.argv[5], 'utf8') });\n` +
      `fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify(n));\n` +
      `console.log('https://example.test/pull/' + n.length);\n`
  );
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { command: `node "${script}" "{branch}" "{base}" "{title}" "{body_file}"` };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'open draft pull requests']);

  const st = toPrGate(root);
  const made = JSON.parse(fs.readFileSync(calls, 'utf8'));
  assert.equal(made.length, 2);
  assert.equal(fs.realpathSync(made[0].cwd), fs.realpathSync(path.join(root, 'source-be')));
  assert.deepEqual(made[0].args.slice(0, 2), ['aiws/REQ-001', 'main']);
  // the submodule's own description: its commits, not the workspace's, and no workspace paths
  const subT1 = git(path.join(root, 'source-be'), ['log', '-1', '--format=%h', '--grep=Task: T1', '-F']);
  assert.match(made[0].body, new RegExp(`T1 .*\\(${subT1.slice(0, 7)}\\)`));
  assert.match(made[0].body, /pull request of the workspace/);
  assert.doesNotMatch(made[0].body, /aiws\/work\//);
  assert.match(made[1].body, /## Submodules[\s\S]*source-be/);
  assert.equal(fs.realpathSync(made[1].cwd), fs.realpathSync(root));
  const after = state(root);
  assert.equal(after.submodules['source-be'].pr_url, 'https://example.test/pull/1');
  assert.equal(after.pr_url, 'https://example.test/pull/2');
  assert.ok(st);
  assert.match(ok(root, ['status']).out, /submodule source-be: branch aiws\/REQ-001, pull request: https:\/\/example\.test\/pull\/1/);
  // the submodule host has the commit the workspace gitlink points at
  assert.equal(git(subs['source-be'].origin, ['rev-parse', 'aiws/REQ-001']), git(root, ['rev-parse', 'aiws/REQ-001:source-be']));
});

test('submodule: the PR gate waits for the submodule merge, then the knowledge update runs on the merged commit', () => {
  const { root, subs } = makeSubmoduleWorkspace(['source-be']);
  const be = path.join(root, 'source-be');
  toPrGate(root);
  git(be, ['push', '-q', 'origin', 'aiws/REQ-001']);
  git(root, ['switch', '-q', 'main']);
  git(root, ['merge', '-q', '--no-ff', '-m', 'Merge aiws/REQ-001', 'aiws/REQ-001']);

  // the workspace is merged, the submodule is not
  const refused = aiws(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.out, /submodule source-be: aiws\/REQ-001 is not merged into main/);

  mergeSubmodulePr(subs['source-be'].origin);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  let st = state(root);
  assert.equal(st.submodules['source-be'].done, true);
  assert.equal(st.submodules['source-be'].merge, 'merge commit');
  assert.equal(git(be, ['rev-parse', 'HEAD']), git(root, ['rev-parse', 'HEAD:source-be']));
  // detached, as after `git submodule update`: the next requirement must not start from aiws/REQ-001
  assert.equal(git(be, ['branch', '--show-current']), '');

  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.status, 'done', st.reason);
  // the incremental knowledge update was given the files changed inside the submodule
  const runs = path.join(root, 'aiws/work/REQ-001/evidence/runs');
  const last = fs
    .readdirSync(runs)
    .filter((f) => f.endsWith('.prompt.md'))
    .sort()
    .at(-1);
  assert.match(fs.readFileSync(path.join(runs, last), 'utf8'), /source-be\/src\/users\.js/);
});

test('submodule: a write outside the task scope inside the submodule is reverted there', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const before = fs.readFileSync(path.join(root, 'source-be', 'package.json'), 'utf8');
  const env = scenario({
    'developer-T1-1.js': `
      import { write, read } from './_lib.js';
      write('source-be/src/stray.js', 'export const x = 1;\\n');
      write('source-be/package.json', read('source-be/package.json') + '\\n');
      await import(${JSON.stringify(new URL('./fixtures/scripted/developer-T1.js', import.meta.url).href)});
    `,
  });
  toPrGate(root, env);
  const be = path.join(root, 'source-be');
  assert.equal(fs.existsSync(path.join(be, 'src', 'stray.js')), false);
  assert.equal(fs.readFileSync(path.join(be, 'package.json'), 'utf8'), before);
  const results = state(root)
    .history.filter((h) => h.task === 'T1')
    .map((h) => h.result);
  assert.deepEqual(results, ['fail', 'done']);
});

test('submodule: --worktree and nested submodules are refused before anything is created', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const wt = aiws(root, ['new', 'REQ-001', '--worktree', path.join(tempDir('aiws-wt-'), 'w')]);
  assert.notEqual(wt.status, 0);
  assert.match(wt.out, /--worktree does not work with submodules \(source-be\)/);
  assert.equal(git(root, ['branch', '--list', 'aiws/*']), '');

  // a submodule inside source-be
  const inner = tempDir('aiws-inner-');
  git(inner, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(inner, 'a.txt'), 'a\n');
  git(inner, ['add', '-A']);
  git(inner, ['commit', '-q', '-m', 'inner']);
  const be = path.join(root, 'source-be');
  git(be, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'vendor/inner']);
  git(be, ['commit', '-q', '-m', 'nested']);
  git(root, ['commit', '-qam', 'bump source-be']);
  const nested = aiws(root, ['new', 'REQ-001']);
  assert.notEqual(nested.status, 0);
  assert.match(nested.out, /submodule source-be has submodules of its own \(vendor\/inner\)/);
  assert.equal(git(be, ['branch', '--list', 'aiws/*']), '');
});

test('submodule: when the workspace refuses the task commit, the commit already made in the submodule is undone', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const be = path.join(root, 'source-be');
  // the workspace refuses the first T1 commit by its message (a commit-msg hook), once
  const hooks = tempDir('aiws-hooks-');
  fs.writeFileSync(
    path.join(hooks, 'commit-msg'),
    '#!/bin/sh\nif grep -q "^Task: T1" "$1" && [ ! -f "$(git rev-parse --git-dir)/refused-once" ]; then\n' +
      '  touch "$(git rev-parse --git-dir)/refused-once"; echo "commit-msg: not this time" >&2; exit 1\nfi\n'
  );
  fs.chmodSync(path.join(hooks, 'commit-msg'), 0o755);
  git(root, ['config', 'core.hooksPath', hooks.replaceAll('\\', '/')]);

  const st = toPrGate(root);
  assert.deepEqual(
    st.history.filter((h) => h.task === 'T1').map((h) => h.result),
    ['fail', 'done']
  );
  // one T1 commit in the submodule, and the workspace points at it
  assert.equal(git(be, ['log', '--format=%h', '--grep=Task: T1', '-F']).split('\n').length, 1);
  // ...made by the attempt that succeeded, not left over from the refused one
  const done = st.history.find((h) => h.task === 'T1' && h.result === 'done');
  assert.match(git(be, ['log', '-1', '--format=%B', '--grep=Task: T1', '-F']), new RegExp(`AIWS-Run: ${done.run}\\b`));
  assert.equal(git(root, ['rev-parse', 'HEAD:source-be']), git(be, ['rev-parse', 'HEAD']));
  assert.equal(git(root, ['status', '--porcelain', '--ignore-submodules=none']), '');
});

test('submodule: the base branch is never a branch left by an earlier requirement', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const be = path.join(root, 'source-be');
  // left on the branch of a finished requirement (e.g. the workspace pulled without `git submodule update`)
  git(be, ['switch', '-q', '-c', 'aiws/REQ-000']);
  ok(root, ['new', 'REQ-001']);
  assert.equal(state(root).submodules['source-be'].base_branch, 'main', 'the default branch of its origin');

  // .gitmodules names the branch the project follows: that one wins
  const ws2 = makeSubmoduleWorkspace(['source-be']).root;
  git(ws2, ['config', '-f', '.gitmodules', 'submodule.source-be.branch', 'develop']);
  git(ws2, ['commit', '-q', '-am', 'follow develop']);
  ok(ws2, ['new', 'REQ-001']);
  assert.equal(state(ws2).submodules['source-be'].base_branch, 'develop');
});

test('submodule: a hook that turns the submodule repository bare is undone and named', () => {
  const { root } = makeSubmoduleWorkspace(['source-be']);
  const be = path.join(root, 'source-be');
  const remote = tempDir('aiws-remote-');
  git(remote, ['init', '-q', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { command: 'node -e "console.log(1)"' };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'open draft pull requests']);
  // a pre-push hook whose tests run git with the GIT_DIR that git gives the hooks of a submodule
  const hooks = tempDir('aiws-hooks-');
  fs.writeFileSync(path.join(hooks, 'pre-push'), '#!/bin/sh\ngit config core.bare true\necho "tests: 4 failed"\nexit 1\n');
  fs.chmodSync(path.join(hooks, 'pre-push'), 0o755);
  git(be, ['config', 'core.hooksPath', hooks.replaceAll('\\', '/')]);

  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const r = ok(root, ['run', 'REQ-001']);
  // the push failed: the reason shows what the hook printed, and the repository works again
  assert.match(r.out, /git push origin aiws\/REQ-001 in submodule source-be failed/);
  assert.match(r.out, /tests: 4 failed/);
  assert.match(r.out, /core\.bare/);
  assert.equal(git(be, ['rev-parse', '--is-inside-work-tree']), 'true');
});

test('the pull request title cannot run anything in the shell of the command', () => {
  const title = prTitle({ req_id: 'REQ-001', title: 'list `rm -rf x` and $(id) "quoted" %PATH% !x!\nnext' });
  assert.equal(title, 'REQ-001: list rm -rf x and (id) quoted PATH x next');
});
