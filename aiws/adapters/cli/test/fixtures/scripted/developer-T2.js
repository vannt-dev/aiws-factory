import { write } from './_lib.js';

write(
  'source-fe/src/view.js',
  `
// Formats a user for display (sample frontend for AIWS tests).
export function displayName(user) {
  return user.nickname || user.name;
}
`
);

write(
  'source-fe/test/nickname.test.js',
  `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName } from '../src/view.js';

test('TC-3: displayName prefers nickname and falls back to name', () => {
  assert.equal(displayName({ name: 'An', nickname: 'Anie' }), 'Anie');
  assert.equal(displayName({ name: 'An' }), 'An');
});
`
);
console.log('T2 implemented');
