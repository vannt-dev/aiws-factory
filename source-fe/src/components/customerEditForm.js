import { escapeHtml } from '../utils/escapeHtml.js';

const FIELDS = [
  { name: 'name', label: 'Họ tên', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Điện thoại', type: 'tel' },
];

/** Renders the edit form for one customer; each field error is shown right below its input. */
export function renderCustomerEditForm(customer, fieldErrors = {}) {
  const fields = FIELDS.map(({ name, label, type }) => {
    const inputId = `edit-${name}`;
    const error = fieldErrors[name];
    const invalidAttrs = error ? ` aria-invalid="true" aria-describedby="${inputId}-error"` : '';
    const errorEl = error ? `<span id="${inputId}-error" class="error" role="alert">${escapeHtml(error)}</span>` : '';
    return (
      `<div class="field"><label for="${inputId}">${label}</label>` +
      `<input id="${inputId}" name="${name}" type="${type}" value="${escapeHtml(customer[name])}"${invalidAttrs}>${errorEl}</div>`
    );
  }).join('');
  return (
    `<h2>Sửa khách hàng #${escapeHtml(customer.id)}</h2>` +
    `<form id="edit-form" data-id="${escapeHtml(customer.id)}" novalidate>${fields}` +
    '<button type="submit">Lưu</button><button type="button" data-cancel-edit>Huỷ</button></form>'
  );
}
