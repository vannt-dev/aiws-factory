import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCustomerTable } from '../src/components/customerTable.js';

test('renderCustomerTable shows one row per customer with a translated status', () => {
  // Arrange
  const customers = [{ id: 1, name: 'Nguyen Van An', email: 'an@example.com', status: 'ACTIVE' }];

  // Act
  const html = renderCustomerTable(customers);

  // Assert
  assert.match(html, /<td>Nguyen Van An<\/td>/);
  assert.match(html, /<td>Đang hoạt động<\/td>/);
  assert.equal(html.match(/<tr>/g).length, 2); // header + one row
});

test('renderCustomerTable escapes HTML in customer data', () => {
  const html = renderCustomerTable([{ id: 1, name: '<b>x</b>', email: 'a@b.c', status: 'ACTIVE' }]);

  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('renderCustomerTable shows an empty state', () => {
  assert.equal(renderCustomerTable([]), '<p>Chưa có khách hàng.</p>');
});
