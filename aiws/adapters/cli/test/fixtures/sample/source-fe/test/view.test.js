import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName } from '../src/view.js';

test('displayName shows the name', () => {
  assert.equal(displayName({ name: 'An' }), 'An');
});
