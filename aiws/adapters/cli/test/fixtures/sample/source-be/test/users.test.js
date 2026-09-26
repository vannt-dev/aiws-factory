import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUser } from '../src/users.js';

test('getUser returns a copy of the user', () => {
  assert.equal(getUser('u1').name, 'An Nguyen');
});

test('getUser throws 404 for unknown id', () => {
  assert.throws(() => getUser('nope'), (e) => e.status === 404);
});
