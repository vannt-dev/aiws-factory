import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, ok, state } from './helpers.js';

test('new says at once that the knowledge is missing; run lifts that block itself once it exists', () => {
  const root = makeWorkspace(); // no aiws discover yet
  const created = ok(root, ['new', 'REQ-001']);
  assert.match(created.out, /aiws\/knowledge\/system-map\.md is missing: run `aiws discover` before `aiws run REQ-001`/);

  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'blocked');
  assert.match(state(root).reason, /^missing prerequisites aiws\/knowledge\/system-map\.md/);

  ok(root, ['discover']); // the files now exist: nothing for a person to decide
  const r = ok(root, ['run', 'REQ-001']);
  assert.match(r.out, /prerequisites are present now: REQ-001 continues/);
  const st = state(root);
  assert.notEqual(st.status, 'blocked', st.reason);
  assert.ok(st.history.some((h) => h.result === 'unblocked' && h.reason === 'prerequisites present'));
});

test('run does not lift a prerequisites block while the files are still missing', () => {
  const root = makeWorkspace();
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'blocked');
  assert.ok(!state(root).history.some((h) => h.result === 'unblocked'));
});

test('new says nothing about prerequisites when they are there', () => {
  const root = makeWorkspace({ discover: true });
  const created = ok(root, ['new', 'REQ-001']);
  assert.doesNotMatch(created.out, /is missing: run `aiws discover`/);
});
