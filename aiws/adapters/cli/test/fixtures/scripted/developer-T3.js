import { write, read } from './_lib.js';

const src = read('source-be/src/users.js');
write(
  'source-be/src/users.js',
  src.replace(
    "if (typeof nickname !== 'string'",
    "if (typeof nickname === 'string') nickname = nickname.trim();\n  if (typeof nickname !== 'string'"
  )
);
write(
  'source-be/test/trim.test.js',
  `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setNickname } from '../src/users.js';

test('trim: whitespace-only nickname is rejected', () => {
  assert.throws(() => setNickname('u1', '   '), (e) => e.status === 400);
});
`
);
console.log('T3 implemented');
