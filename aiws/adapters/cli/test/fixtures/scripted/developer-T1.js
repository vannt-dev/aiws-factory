import { write, read } from './_lib.js';

const src = read('source-be/src/users.js');
if (!src.includes('setNickname')) {
  write('source-be/src/users.js', src + `
export function setNickname(id, nickname) {
  const u = users.get(id);
  if (!u) {
    const err = new Error('USER_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 30) {
    const err = new Error('INVALID_NICKNAME');
    err.status = 400;
    throw err;
  }
  u.nickname = nickname;
  return { ...u };
}
`);
}

write('source-be/test/nickname.test.js', `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setNickname, getUser } from '../src/users.js';

test('TC-1: setNickname stores a valid nickname', () => {
  setNickname('u1', 'Anie');
  assert.equal(getUser('u1').nickname, 'Anie');
});

test('TC-2: setNickname rejects empty or too long nickname', () => {
  assert.throws(() => setNickname('u2', ''), (e) => e.status === 400);
  assert.throws(() => setNickname('u2', 'x'.repeat(31)), (e) => e.status === 400);
  assert.equal(getUser('u2').nickname, undefined);
});
`);
console.log('T1 implemented');
