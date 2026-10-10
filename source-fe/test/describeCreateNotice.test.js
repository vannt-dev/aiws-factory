import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCreateNotice } from '../src/utils/describeCreateNotice.js';

test('TC-143: describeCreateNotice returns an empty string when there is no status filter or the created customer matches it', () => {
  const cases = [
    [{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }, ''],
    [{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'INACTIVE' }, undefined],
    [null, null],
    [{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }, 'ACTIVE'],
    [{ id: 5, name: 'E', email: 'e@example.com', phone: '0912345678', status: 'INACTIVE' }, 'INACTIVE'],
  ];

  for (const [created, statusFilter] of cases) {
    assert.equal(describeCreateNotice(created, statusFilter), '');
  }
});

test('TC-144: describeCreateNotice returns the added-customer notice when a status filter hides the created customer or its status cannot be read', () => {
  const cases = [
    [{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }, 'INACTIVE'],
    [{ id: 5, name: 'E', email: 'e@example.com', phone: '0912345678', status: 'INACTIVE' }, 'ACTIVE'],
    [null, 'ACTIVE'],
    [undefined, 'INACTIVE'],
    [{ id: 5, name: 'E', email: 'e@example.com', phone: null }, 'ACTIVE'],
  ];

  for (const [created, statusFilter] of cases) {
    assert.equal(describeCreateNotice(created, statusFilter), 'Đã thêm khách hàng.');
  }
});
