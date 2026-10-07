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

test('TC-36: renderCustomerTable has a phone column between email and status', () => {
  const customers = [
    { id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' },
    { id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: null, status: 'INACTIVE' },
  ];

  const html = renderCustomerTable(customers);

  assert.match(
    html,
    /<thead><tr><th>ID<\/th><th>Họ tên<\/th><th>Email<\/th><th>Điện thoại<\/th><th>Trạng thái<\/th><th>Thao tác<\/th><\/tr><\/thead>/
  );
  assert.match(html, /<td>an@example\.com<\/td><td>0912 345 678<\/td><td>Đang hoạt động<\/td>/);
  assert.match(html, /<td>binh@example\.com<\/td><td>—<\/td><td>Ngừng hoạt động<\/td>/);
  const bodyRows = html.match(/<tbody>(.*)<\/tbody>/)[1].match(/<tr>.*?<\/tr>/g);
  assert.equal(bodyRows.length, 2);
  for (const row of bodyRows) {
    assert.equal(row.match(/<td>/g).length, 6);
  }
});

test('TC-37: renderCustomerTable shows a 10-character phone as 4-3-3', () => {
  const customer = { id: 1, name: 'An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' };

  const html = renderCustomerTable([customer]);

  assert.match(html, /<td>0912 345 678<\/td>/);
  assert.doesNotMatch(html, /<td>0912345678<\/td>/);
});

test('TC-38: renderCustomerTable shows an 11-character phone as 3-4-4', () => {
  const customers = [
    { id: 1, name: 'An', email: 'an@example.com', phone: '02438251234', status: 'ACTIVE' },
    { id: 2, name: 'Binh', email: 'binh@example.com', phone: '01234567890', status: 'ACTIVE' },
  ];

  const html = renderCustomerTable(customers);

  assert.match(html, /<td>024 3825 1234<\/td>/);
  assert.match(html, /<td>012 3456 7890<\/td>/);
});

test('TC-39: renderCustomerTable shows an em dash when there is no phone', () => {
  const customers = [
    { id: 1, name: 'A', email: 'a@example.com', phone: null, status: 'ACTIVE' },
    { id: 2, name: 'B', email: 'b@example.com', phone: '', status: 'ACTIVE' },
    { id: 3, name: 'C', email: 'c@example.com', status: 'ACTIVE' },
  ];

  const html = renderCustomerTable(customers);

  assert.equal(html.match(/<td>—<\/td>/g).length, 3);
  assert.doesNotMatch(html, /<td><\/td>/);
  assert.doesNotMatch(html, /<td>null<\/td>/);
  assert.doesNotMatch(html, /<td>undefined<\/td>/);
});

test('TC-40: renderCustomerTable shows a phone of any other length verbatim and HTML-escaped', () => {
  const customers = [
    { id: 1, name: 'A', email: 'a@example.com', phone: '091234567', status: 'ACTIVE' },
    { id: 2, name: 'B', email: 'b@example.com', phone: '<b>1</b>', status: 'ACTIVE' },
  ];

  const html = renderCustomerTable(customers);

  assert.match(html, /<td>091234567<\/td>/);
  assert.match(html, /<td>&lt;b&gt;1&lt;\/b&gt;<\/td>/);
  assert.doesNotMatch(html, /<b>1<\/b>/);
});

test('TC-41: renderCustomerTable formats the raw phone before escaping it', () => {
  const customers = [
    { id: 1, name: 'A', email: 'a@example.com', phone: '012345678&', status: 'ACTIVE' },
    { id: 2, name: 'B', email: 'b@example.com', phone: '12345&', status: 'ACTIVE' },
  ];

  const html = renderCustomerTable(customers);

  assert.match(html, /<td>0123 456 78&amp;<\/td>/);
  assert.match(html, /<td>12345&amp;<\/td>/);
  assert.doesNotMatch(html, /<td>012345678&amp;<\/td>/);
  assert.doesNotMatch(html, /<td>1234 5&a mp;<\/td>/);
});

test('TC-74: renderCustomerTable adds an action column with one edit button carrying the id per row', () => {
  // Arrange
  const customers = [
    { id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' },
    { id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: null, status: 'INACTIVE' },
  ];

  // Act
  const html = renderCustomerTable(customers);

  // Assert
  assert.match(
    html,
    /<thead><tr><th>ID<\/th><th>Họ tên<\/th><th>Email<\/th><th>Điện thoại<\/th><th>Trạng thái<\/th><th>Thao tác<\/th><\/tr><\/thead>/
  );
  assert.match(
    html,
    /<tr><td>1<\/td><td>Nguyen Van An<\/td><td>an@example\.com<\/td><td>0912 345 678<\/td><td>Đang hoạt động<\/td><td><button type="button" data-edit-id="1">Sửa<\/button><\/td><\/tr>/
  );
  assert.match(
    html,
    /<tr><td>2<\/td><td>Tran Thi Binh<\/td><td>binh@example\.com<\/td><td>—<\/td><td>Ngừng hoạt động<\/td><td><button type="button" data-edit-id="2">Sửa<\/button><\/td><\/tr>/
  );
  const bodyRows = html.match(/<tbody>(.*)<\/tbody>/)[1].match(/<tr>.*?<\/tr>/g);
  assert.equal(bodyRows.length, 2);
  for (const row of bodyRows) {
    assert.equal(row.match(/<td>/g).length, 6);
    assert.equal(row.match(/data-edit-id=/g).length, 1);
  }
  assert.equal(html.match(/<tr>/g).length, 3); // header + two rows
});

test('TC-75: renderCustomerTable escapes the id inside data-edit-id', () => {
  // Arrange
  const customers = [{ id: '7"><b>x</b>', name: 'A', email: 'a@example.com', phone: null, status: 'ACTIVE' }];

  // Act
  const html = renderCustomerTable(customers);

  // Assert
  assert.match(html, /data-edit-id="7&quot;&gt;&lt;b&gt;x&lt;\/b&gt;"/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});
