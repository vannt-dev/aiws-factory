import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseStatusClickKey } from '../src/utils/chooseStatusClickKey.js';
import { createDoubleClickGuard } from '../src/utils/createDoubleClickGuard.js';

test('TC-137: chooseStatusClickKey returns the given customerId unchanged when no status filter is selected', () => {
  const cases = [
    ['', '7'],
    [undefined, '7'],
    [null, '7'],
    ['', ''],
    ['', 'constructor'],
    ['', '__proto__'],
    ['', '7"><b>x</b>'],
  ];

  for (const [statusFilter, customerId] of cases) {
    const key = chooseStatusClickKey(statusFilter, customerId);
    assert.equal(key, customerId);
  }
});

test('TC-138: chooseStatusClickKey returns one shared non-string key for every customer when a status filter is selected', () => {
  const customerIds = ['1', '2', '2', ''];
  const keys = [
    chooseStatusClickKey('ACTIVE', '1'),
    chooseStatusClickKey('ACTIVE', '2'),
    chooseStatusClickKey('INACTIVE', '2'),
    chooseStatusClickKey('INACTIVE', ''),
  ];

  for (const key of keys) {
    assert.notEqual(typeof key, 'string');
  }
  for (const key of keys) {
    assert.equal(key, keys[0]);
  }
  for (const customerId of customerIds) {
    assert.notEqual(keys[0], customerId);
  }
});

test("TC-139: a second click on any customer's status button is rejected within the double-click window while a status filter is selected", () => {
  const sequences = [
    [['ACTIVE', '1', 1000], ['ACTIVE', '2', 1000]],
    [['ACTIVE', '1', 1000], ['ACTIVE', '2', 1001]],
    [['ACTIVE', '1', 1000], ['ACTIVE', '2', 1499]],
    [['ACTIVE', '1', 1000], ['ACTIVE', '1', 1300]],
    [['INACTIVE', '2', 1000], ['INACTIVE', '4', 1499]],
  ];

  for (const clicks of sequences) {
    const accept = createDoubleClickGuard();
    const results = clicks.map(([statusFilter, customerId, at]) => accept(chooseStatusClickKey(statusFilter, customerId), at));
    assert.deepEqual(results, [true, false]);
  }
});

test("TC-140: a click on a customer's status button is accepted from 500 ms onward since the last accepted click, while a status filter is selected", () => {
  const cases = [
    [[['ACTIVE', '1', 1000]], [true]],
    [[['ACTIVE', '1', 1000], ['ACTIVE', '3', 1500]], [true, true]],
    [[['ACTIVE', '1', 1000], ['ACTIVE', '3', 1300], ['ACTIVE', '3', 1500]], [true, false, true]],
  ];

  for (const [clicks, expected] of cases) {
    const accept = createDoubleClickGuard();
    const results = clicks.map(([statusFilter, customerId, at]) => accept(chooseStatusClickKey(statusFilter, customerId), at));
    assert.deepEqual(results, expected);
  }
});

test('TC-141: viewing "Tất cả" still tracks the double-click window per customer', () => {
  const clicks = [
    ['', '1', 1000],
    ['', '2', 1001],
    ['', '1', 1002],
  ];

  const accept = createDoubleClickGuard();
  const results = clicks.map(([statusFilter, customerId, at]) => accept(chooseStatusClickKey(statusFilter, customerId), at));
  assert.deepEqual(results, [true, true, false]);
});

test('TC-142: changing the status filter between two clicks starts a new double-click window for the new mode', () => {
  const cases = [
    [[['ACTIVE', '1', 1000], ['', '1', 1300]], [true, true]],
    [[['', '1', 1000], ['ACTIVE', '2', 1300]], [true, true]],
    [[['ACTIVE', '1', 1000], ['INACTIVE', '2', 1300]], [true, false]],
  ];

  for (const [clicks, expected] of cases) {
    const accept = createDoubleClickGuard();
    const results = clicks.map(([statusFilter, customerId, at]) => accept(chooseStatusClickKey(statusFilter, customerId), at));
    assert.deepEqual(results, expected);
  }
});
