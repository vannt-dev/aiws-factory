import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, aiws, ok, state, git, scenario } from './helpers.js';

const failingT1 = `
  import { write, read } from './_lib.js';
  const src = read('source-be/src/users.js');
  if (!src.includes('setNickname')) write('source-be/src/users.js', src + '\nexport function setNickname() { return null; }\n');
  write('source-be/test/nickname.test.js', "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {setNickname} from '../src/users.js';\ntest('TC-1: x', () => assert.ok(setNickname('u1','a')));\ntest('TC-2: y', () => assert.ok(false));\n");
`;

const lockFile = (root) => path.join(root, '.git', 'aiws-source-lock.yaml');

test('a stuck requirement is abandoned by a human: recorded, lock released, nothing runs it again', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({ 'developer-T1.js': failingT1 });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  assert.equal(state(root).status, 'blocked');
  assert.ok(fs.existsSync(lockFile(root)), 'the blocked requirement holds the source lock');

  let r = aiws(root, ['abandon', 'REQ-001', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /abandon needs the reason: -m/);

  git(root, ['checkout', '--', 'source-be/src/users.js']);
  r = ok(root, ['abandon', 'REQ-001', '--yes', '-m', 'the customer dropped the feature']);
  assert.match(r.out, /REQ-001 abandoned in phase implementation/);
  const st = state(root);
  assert.equal(st.status, 'abandoned');
  assert.equal(st.phase, 'implementation');
  assert.match(st.reason, /the customer dropped the feature/);
  const last = st.history.at(-1);
  assert.equal(last.result, 'abandoned');
  assert.equal(last.reason, 'the customer dropped the feature');
  assert.ok(last.by);
  assert.ok(!fs.existsSync(lockFile(root)), 'the source lock is released');
  // the decision is committed on the requirement branch, and its work is kept
  assert.match(git(root, ['log', '-1', '--format=%s']), /chore\(REQ-001\): abandoned by /);
  assert.ok(fs.existsSync(path.join(root, 'aiws/work/REQ-001/state.yaml')));

  for (const args of [
    ['run', 'REQ-001'],
    ['resume', 'REQ-001', '--yes'],
    ['approve', 'REQ-001', 'pr', '--yes'],
    ['abandon', 'REQ-001', '--yes', '-m', 'again'],
  ]) {
    r = aiws(root, args);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.match(r.out, /REQ-001 was abandoned/, args.join(' '));
  }
  assert.match(ok(root, ['status', 'REQ-001']).out, /abandoned/);
});

test('abandon is human-only: it refuses inside an AI session', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  const r = aiws(root, ['abandon', 'REQ-001', '--yes', '-m', 'x'], { env: { CLAUDECODE: '1' } });
  assert.equal(r.status, 3);
  assert.match(r.out, /'abandon' is a human-only command/);
  assert.notEqual(state(root).status, 'abandoned');
});
