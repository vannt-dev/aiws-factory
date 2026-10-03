import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone } from '../src/utils/formatPhone.js';

test('TC-33: formatPhone formats a 10-character string as 4-3-3', () => {
  // Arrange
  const cases = [
    ['0912345678', '0912 345 678'],
    ['0312345678', '0312 345 678'],
    ['012345678&', '0123 456 78&'],
  ];

  for (const [value, expected] of cases) {
    // Act
    const formatted = formatPhone(value);

    // Assert
    assert.equal(formatted, expected);
  }
});

test('TC-34: formatPhone formats an 11-character string as 3-4-4', () => {
  const cases = [
    ['02438251234', '024 3825 1234'],
    ['01234567890', '012 3456 7890'],
    ['09123456789', '091 2345 6789'],
  ];

  for (const [value, expected] of cases) {
    assert.equal(formatPhone(value), expected);
  }
});

test('TC-35: formatPhone returns a string of any other length unchanged', () => {
  const cases = ['', '0', '<b>1</b>', '091234567', '024382512345'];

  for (const value of cases) {
    assert.equal(formatPhone(value), value);
  }
});
