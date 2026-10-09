import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoubleClickGuard } from '../src/utils/createDoubleClickGuard.js';

test('TC-108: createDoubleClickGuard rejects a click on the same key less than 500 ms after the last accepted click', () => {
  const cases = [
    ['1', 1000, 1000],
    ['1', 1000, 1001],
    ['1', 1000, 1499],
    ['1', 1000, 1499.9],
    ['1', 0, 499],
  ];

  for (const [key, first, second] of cases) {
    const accept = createDoubleClickGuard();
    assert.equal(accept(key, first), true);
    assert.equal(accept(key, second), false);
  }
});

test('TC-109: createDoubleClickGuard accepts a click when no click on that key was accepted in the previous 500 ms', () => {
  const cases = [
    ['1', [1000]],
    ['1', [0]],
    ['1', [1000, 1500]],
    ['1', [1000, 1501]],
    ['1', [1000, 101000]],
  ];

  for (const [key, ats] of cases) {
    const accept = createDoubleClickGuard();
    for (const at of ats) {
      assert.equal(accept(key, at), true);
    }
  }
});

test('TC-110: createDoubleClickGuard measures the window from the last accepted click, not from a rejected one', () => {
  const cases = [
    [[1000, 1300, 1500], [true, false, true]],
    [[1000, 1500, 1999, 2000], [true, true, false, true]],
  ];

  for (const [ats, expected] of cases) {
    const accept = createDoubleClickGuard();
    const results = ats.map((at) => accept('1', at));
    assert.deepEqual(results, expected);
  }
});

test('TC-111: createDoubleClickGuard tracks each key independently', () => {
  const cases = [
    [
      [['1', 1000], ['2', 1001], ['1', 1002], ['2', 1003]],
      [true, true, false, false],
    ],
    [
      [['1', 1000], ['2', 1400], ['1', 1500], ['2', 1899], ['2', 1900]],
      [true, true, true, false, true],
    ],
  ];

  for (const [calls, expected] of cases) {
    const accept = createDoubleClickGuard();
    const results = calls.map(([key, at]) => accept(key, at));
    assert.deepEqual(results, expected);
  }
});

test('TC-112: createDoubleClickGuard treats keys named like built-in object properties as ordinary keys', () => {
  const keys = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

  for (const key of keys) {
    const accept = createDoubleClickGuard();
    assert.equal(accept(key, 1000), true);
    assert.equal(accept(key, 1001), false);
  }
});

test('TC-113: createDoubleClickGuard returns guards that do not share state', () => {
  const acceptA = createDoubleClickGuard();
  const acceptB = createDoubleClickGuard();

  assert.equal(acceptA('1', 1000), true);
  assert.equal(acceptB('1', 1001), true);
});
