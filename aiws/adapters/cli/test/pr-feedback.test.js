import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { makeWorkspace, aiws, ok, git, tempDir, state, readFile, writeFile, cleanEnv, FIXTURES } from './helpers.js';
import { reviewComments } from '../src/prfeedback.js';

const URL7 = 'https://github.com/acme/shop/pull/7';

/** What `gh pr view --json url,number,reviews,comments` prints for a pull request with feedback. */
const VIEW = {
  url: URL7,
  number: 7,
  reviews: [
    { author: { login: 'alice' }, state: 'CHANGES_REQUESTED', body: 'Two things before this can merge.' },
    { author: { login: 'bob' }, state: 'APPROVED', body: '' },
    { author: { login: 'ci-helper[bot]' }, state: 'COMMENTED', body: 'Coverage 91%' },
  ],
  comments: [
    { author: { login: 'carol' }, body: 'Please keep the old endpoint\nuntil the app is updated.' },
    { author: { login: 'app/dependabot' }, body: 'Bumps x' },
  ],
};

/** What the GraphQL query for the review threads prints. */
const THREADS = {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              isOutdated: false,
              path: 'source-be/src/users.js',
              line: 12,
              originalLine: 12,
              comments: {
                nodes: [
                  { author: { login: 'alice' }, body: 'Validate the nickname length here (TC-3).' },
                  { author: { login: 'dave' }, body: 'And trim it first.' },
                ],
              },
            },
            {
              isResolved: true,
              isOutdated: false,
              path: 'source-be/src/users.js',
              line: 3,
              originalLine: 3,
              comments: { nodes: [{ author: { login: 'alice' }, body: 'Already fixed typo' }] },
            },
            {
              isResolved: false,
              isOutdated: true,
              path: 'source-fe/src/view.js',
              line: null,
              originalLine: 8,
              comments: { nodes: [{ author: { login: 'alice' }, body: 'Show the error inline.' }] },
            },
          ],
        },
      },
    },
  },
};

test('reviewComments formats review bodies, comments and unresolved inline threads with file:line', () => {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'pr') return { status: 0, stdout: JSON.stringify(VIEW), stderr: '' };
    return { status: 0, stdout: JSON.stringify(THREADS), stderr: '' };
  };
  const { text, count } = reviewComments({ url: URL7, dir: '' }, gh);
  assert.equal(count, 4);
  assert.equal(
    text,
    [
      `Review comments of the pull request ${URL7}:`,
      '- Review by @alice (changes requested): Two things before this can merge.',
      '- source-be/src/users.js:12 (@alice): Validate the nickname length here (TC-3).',
      '  - reply by @dave: And trim it first.',
      '- source-fe/src/view.js:8 (outdated, the line of an earlier version) (@alice): Show the error inline.',
      '- Comment by @carol: Please keep the old endpoint',
      '  until the app is updated.',
    ].join('\n')
  );
  assert.deepEqual(calls[0].args, ['pr', 'view', URL7, '--json', 'url,number,reviews,comments']);
  assert.deepEqual(calls[1].args, ['api', 'graphql', '--input', '-']);
  assert.deepEqual(JSON.parse(calls[1].input).variables, { owner: 'acme', name: 'shop', number: 7 });

  // a pull request of a submodule: its paths are the submodule's, so they get its folder
  const sub = reviewComments({ url: URL7, dir: 'source-be' }, gh);
  assert.match(sub.text, /^- source-be\/source-be\/src\/users\.js:12 /m);

  // a host without the GraphQL threads: the inline comments come from the REST API instead
  const rest = [
    { id: 1, path: 'src/users.js', line: 5, user: { login: 'alice', type: 'User' }, body: 'Rename this.' },
    { id: 2, in_reply_to_id: 1, path: 'src/users.js', line: 5, user: { login: 'bob', type: 'User' }, body: 'Agreed.' },
    { id: 3, path: 'src/users.js', line: null, original_line: 9, user: { login: 'lint', type: 'Bot' }, body: 'Style' },
  ];
  const restCalls = [];
  const viaRest = reviewComments({ url: 'https://ghe.example.com/acme/shop/pull/7', dir: '' }, (args) => {
    restCalls.push(args);
    if (args[0] === 'pr') return { status: 0, stdout: JSON.stringify({ ...VIEW, reviews: [], comments: [] }), stderr: '' };
    if (args[1] === 'graphql') return { status: 1, stdout: '', stderr: 'HTTP 404' };
    // `--paginate` prints one array a page
    return { status: 0, stdout: JSON.stringify(rest.slice(0, 1)) + JSON.stringify(rest.slice(1)), stderr: '' };
  });
  assert.equal(
    viaRest.text,
    [
      'Review comments of the pull request https://ghe.example.com/acme/shop/pull/7:',
      '- src/users.js:5 (@alice): Rename this.',
      '  - reply by @bob: Agreed.',
    ].join('\n')
  );
  assert.deepEqual(restCalls[1], ['api', 'graphql', '--input', '-', '--hostname', 'ghe.example.com']);
  assert.deepEqual(restCalls[2], ['api', 'repos/acme/shop/pulls/7/comments', '--paginate', '--hostname', 'ghe.example.com']);
});

test('aiws reject REQ pr --from-pr: the review comments of the draft pull request become the planner feedback', () => {
  const root = makeWorkspace({ discover: true });
  const remote = tempDir('aiws-remote-');
  git(remote, ['init', '-q', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
  const dir = tempDir('aiws-gh-');
  const marker = path.join(dir, 'open');
  const log = path.join(dir, 'gh-calls.jsonl');
  const createPr = path.join(dir, 'create-pr.cjs');
  fs.writeFileSync(
    createPr,
    `if (!require('fs').existsSync(${JSON.stringify(marker)})) process.exit(3);\nconsole.log(${JSON.stringify(URL7)});\n`
  );
  const fakeGh = path.join(dir, 'fake-gh.cjs');
  fs.writeFileSync(
    fakeGh,
    `const fs = require('fs');\n` +
      `const args = process.argv.slice(2);\n` +
      `const mode = process.env.FAKE_GH || 'comments';\n` +
      `const input = args.includes('--input') ? fs.readFileSync(0, 'utf8') : null;\n` +
      `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input }) + '\\n');\n` +
      `if (mode === 'auth') { process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\\n'); process.exit(4); }\n` +
      `const view = ${JSON.stringify(VIEW)};\n` +
      `const threads = ${JSON.stringify(THREADS)};\n` +
      `if (mode === 'empty') { view.reviews = []; view.comments = []; threads.data.repository.pullRequest.reviewThreads.nodes = []; }\n` +
      `process.stdout.write(JSON.stringify(args[0] === 'pr' ? view : threads));\n`
  );
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { command: `node "${createPr}"`, gh: `node "${fakeGh}"` };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'draft pull requests']);

  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval');
  assert.equal(state(root).pr_url, undefined, 'the draft pull request could not be opened');

  // nothing to read yet
  let r = aiws(root, ['reject', 'REQ-001', 'pr', '--from-pr', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /No pull request is recorded for REQ-001/);
  const noPr = spawnSync(process.execPath, [path.join(FIXTURES, 'gate-driver.mjs'), root, 'REQ-001', 'ESC'], {
    encoding: 'utf8',
    env: cleanEnv(),
    timeout: 60000,
  });
  assert.doesNotMatch(noPr.stdout, /review comments of the pull request/, 'the menu offers it only with a pull request');
  // the typed feedback alone is still needed without --from-pr; --from-pr has no meaning at the design gate
  assert.match(aiws(root, ['reject', 'REQ-001', 'pr', '--yes']).out, /reject needs feedback/);

  fs.writeFileSync(marker, '');
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).pr_url, URL7);

  // gh missing, gh not signed in, no comments: each says so and changes nothing
  const rtText = readFile(root, 'aiws/config/runtime.yaml');
  writeFile(root, 'aiws/config/runtime.yaml', rtText.replace(`node "${fakeGh}"`, 'aiws-no-such-gh-cli'));
  r = aiws(root, ['reject', 'REQ-001', 'pr', '--from-pr', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /GitHub CLI \(gh\) not found/);
  writeFile(root, 'aiws/config/runtime.yaml', rtText);
  r = aiws(root, ['reject', 'REQ-001', 'pr', '--from-pr', '--yes'], { env: { FAKE_GH: 'auth' } });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /gh is not signed in.*gh auth login/s);
  r = aiws(root, ['reject', 'REQ-001', 'pr', '--from-pr', '-m', 'Also log it', '--yes'], { env: { FAKE_GH: 'empty' } });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /No review comments on https:\/\/github\.com\/acme\/shop\/pull\/7/);
  assert.equal(state(root).phase, 'pr_approval', 'nothing recorded');
  assert.equal(git(root, ['status', '--porcelain']), '');

  // the gate menu offers it once a pull request is recorded; nothing to read keeps the menu open
  const menu = spawnSync(
    process.execPath,
    [path.join(FIXTURES, 'gate-driver.mjs'), root, 'REQ-001', 'DOWN', 'DOWN', 'ENTER', 'WAIT:3000', 'ESC'],
    {
      encoding: 'utf8',
      env: cleanEnv({ FAKE_GH: 'empty' }),
      timeout: 60000,
    }
  );
  assert.equal(menu.status, 0, menu.stderr);
  assert.match(menu.stdout, /3\. Request changes: send the review comments of the pull request/);
  assert.match(menu.stdout, /No review comments on https:\/\/github\.com\/acme\/shop\/pull\/7/);
  assert.match(menu.stdout, /PICKED later/);
  assert.equal(state(root).phase, 'pr_approval');

  // the comments, after the typed message
  ok(root, ['reject', 'REQ-001', 'pr', '--from-pr', '-m', 'Also log the change.', '--yes']);
  const st = state(root);
  assert.equal(st.phase, 'planning');
  const fb = st.feedback.find((f) => f.phase === 'planning' && /changes_requested/.test(f.source));
  assert.match(fb.text, /^Also log the change\.\n\nReview comments of the pull request https:\/\/github\.com\/acme\/shop\/pull\/7:/);
  assert.match(
    fb.text,
    /- source-be\/src\/users\.js:12 \(@alice\): Validate the nickname length here \(TC-3\)\.\n {2}- reply by @dave: And trim it first\./
  );
  assert.match(fb.text, /- Review by @alice \(changes requested\): Two things/);
  assert.match(fb.text, /- Comment by @carol: Please keep the old endpoint/);
  assert.doesNotMatch(fb.text, /Already fixed typo|Coverage 91%|Bumps x/, 'resolved threads and bots are left out');
  const calls = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.deepEqual(calls.at(-2).args, ['pr', 'view', URL7, '--json', 'url,number,reviews,comments']);
  assert.deepEqual(JSON.parse(calls.at(-1).input).variables, { owner: 'acme', name: 'shop', number: 7 });
});

test('--from-pr belongs to the PR gate, and pull_request.feedback_command replaces gh for other hosts', () => {
  const root = makeWorkspace({ discover: true });
  const dir = tempDir('aiws-fb-');
  const script = path.join(dir, 'mr-notes.cjs');
  fs.writeFileSync(script, `console.log('MR ' + process.argv[2] + ': src/a.js:3 use a constant');\n`);
  const rtFile = path.join(root, 'aiws/config/runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.pull_request = { feedback_command: `node "${script}" "{url}"` };
  fs.writeFileSync(rtFile, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'feedback command']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const r = aiws(root, ['reject', 'REQ-001', 'design', '--from-pr', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /--from-pr .* `aiws reject REQ-001 pr`/);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  // the URL of a merge request opened by hand
  ok(root, ['reject', 'REQ-001', 'pr', '--from-pr=https://gitlab.example.com/acme/shop/-/merge_requests/4', '--yes']);
  const fb = state(root).feedback.find((f) => f.phase === 'planning' && /changes_requested/.test(f.source));
  assert.equal(
    fb.text,
    'Review comments of the pull request https://gitlab.example.com/acme/shop/-/merge_requests/4:\nMR https://gitlab.example.com/acme/shop/-/merge_requests/4: src/a.js:3 use a constant'
  );
});
