import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCustomerEditForm } from '../src/components/customerEditForm.js';

test('TC-76: renderCustomerEditForm pre-fills name, email and phone with the current values', () => {
  // Arrange
  const customer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' };

  // Act
  const html = renderCustomerEditForm(customer);

  // Assert
  assert.match(html, /<h2>Sửa khách hàng #7<\/h2>/);
  assert.match(html, /<form id="edit-form" data-id="7" novalidate>/);
  assert.match(
    html,
    /<label for="edit-name">Họ tên<\/label><input id="edit-name" name="name" type="text" value="Nguyen Van An"><\/div>/
  );
  assert.match(
    html,
    /<label for="edit-email">Email<\/label><input id="edit-email" name="email" type="email" value="an@example.com"><\/div>/
  );
  assert.match(
    html,
    /<label for="edit-phone">Điện thoại<\/label><input id="edit-phone" name="phone" type="tel" value="0912345678"><\/div>/
  );
  assert.match(html, /<button type="submit">Lưu<\/button>/);
  assert.match(html, /<button type="button" data-cancel-edit>Huỷ<\/button>/);
  assert.equal(html.match(/<input/g).length, 3);
  assert.doesNotMatch(html, /0912 345 678/);
  assert.doesNotMatch(html, /name="status"/);
  assert.doesNotMatch(html, /aria-invalid/);
  assert.doesNotMatch(html, /class="error"/);
});

test('TC-77: renderCustomerEditForm leaves the phone input empty when the customer has no phone', () => {
  const customers = [
    { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: null },
    { id: 7, name: 'Nguyen Van An', email: 'an@example.com' },
    { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '' },
  ];

  for (const customer of customers) {
    const html = renderCustomerEditForm(customer);

    assert.match(html, /<input id="edit-phone" name="phone" type="tel" value="">/);
    assert.doesNotMatch(html, /value="—"/);
    assert.doesNotMatch(html, /value="null"/);
    assert.doesNotMatch(html, /value="undefined"/);
  }
});

test('TC-78: renderCustomerEditForm escapes HTML in every pre-filled value', () => {
  // Arrange
  const customer = {
    id: '7" onsubmit="x',
    name: '"><b>x</b>',
    email: "a'b&c@example.com",
    phone: '"><script>alert(1)</script>',
  };

  // Act
  const html = renderCustomerEditForm(customer);

  // Assert
  assert.match(html, /name="name" type="text" value="&quot;&gt;&lt;b&gt;x&lt;\/b&gt;">/);
  assert.match(html, /name="email" type="email" value="a&#39;b&amp;c@example\.com">/);
  assert.match(html, /name="phone" type="tel" value="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;">/);
  assert.match(html, /data-id="7&quot; onsubmit=&quot;x"/);
  assert.match(html, /Sửa khách hàng #7&quot; onsubmit=&quot;x<\/h2>/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, / onsubmit="x"/);
});

test('TC-79: renderCustomerEditForm shows each field error right after its own input', () => {
  // Arrange
  const customer = { id: 7, name: '', email: 'an@example.com', phone: '0412345678' };
  const cases = [
    { name: 'must not be blank', phone: 'must be a valid phone number' },
    { email: 'is already used by another customer' },
    { name: 'must not be blank', email: 'must be a valid email address', phone: 'must be a valid phone number' },
  ];
  const inputs = {
    name: { type: 'text', value: '' },
    email: { type: 'email', value: 'an@example.com' },
    phone: { type: 'tel', value: '0412345678' },
  };

  for (const fieldErrors of cases) {
    // Act
    const html = renderCustomerEditForm(customer, fieldErrors);

    // Assert
    for (const [field, { type, value }] of Object.entries(inputs)) {
      const input = `<input id="edit-${field}" name="${field}" type="${type}" value="${value}"`;
      if (field in fieldErrors) {
        assert.match(
          html,
          new RegExp(
            `${input} aria-invalid="true" aria-describedby="edit-${field}-error"><span id="edit-${field}-error" class="error" role="alert">${fieldErrors[field]}</span>`
          )
        );
      } else {
        assert.match(html, new RegExp(`${input}></div>`));
        assert.doesNotMatch(html, new RegExp(`edit-${field}-error`));
      }
    }
    assert.equal(html.match(/class="error"/g).length, Object.keys(fieldErrors).length);
    assert.equal(html.match(/aria-invalid="true"/g).length, Object.keys(fieldErrors).length);
  }
});

test('TC-80: renderCustomerEditForm escapes HTML in field error messages', () => {
  // Arrange
  const customer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678' };
  const fieldErrors = { name: '<img src=x onerror=alert(1)>', email: 'a "quoted" & <b>bold</b> message' };

  // Act
  const html = renderCustomerEditForm(customer, fieldErrors);

  // Assert
  assert.match(html, /<span id="edit-name-error" class="error" role="alert">&lt;img src=x onerror=alert\(1\)&gt;<\/span>/);
  assert.match(
    html,
    /<span id="edit-email-error" class="error" role="alert">a &quot;quoted&quot; &amp; &lt;b&gt;bold&lt;\/b&gt; message<\/span>/
  );
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>bold<\/b>/);
});

test('TC-81: renderCustomerEditForm ignores fieldErrors keys other than name, email and phone', () => {
  // Arrange
  const customer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678' };

  // Act
  const withoutKnownFields = renderCustomerEditForm(customer, { status: 'must not change', id: 'is read-only' });
  const withNameError = renderCustomerEditForm(customer, { status: 'must not change', name: 'must not be blank' });

  // Assert
  assert.equal(withoutKnownFields, renderCustomerEditForm(customer));
  assert.doesNotMatch(withoutKnownFields, /class="error"/);
  assert.doesNotMatch(withoutKnownFields, /aria-invalid/);
  assert.equal(withNameError.match(/class="error"/g).length, 1);
  assert.match(
    withNameError,
    /<span id="edit-name-error" class="error" role="alert">must not be blank<\/span>/
  );
  for (const html of [withoutKnownFields, withNameError]) {
    assert.doesNotMatch(html, /must not change/);
    assert.doesNotMatch(html, /is read-only/);
    assert.doesNotMatch(html, /edit-status-error/);
    assert.doesNotMatch(html, /edit-id-error/);
  }
});
