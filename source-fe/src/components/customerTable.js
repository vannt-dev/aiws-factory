import { escapeHtml } from '../utils/escapeHtml.js';
import { formatPhone } from '../utils/formatPhone.js';

const STATUS_LABELS = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động' };
const STATUS_ACTIONS = {
  ACTIVE: { target: 'INACTIVE', label: 'Ngừng hoạt động' },
  INACTIVE: { target: 'ACTIVE', label: 'Kích hoạt lại' },
};
const NO_PHONE = '—';

/** Renders the customer list as an HTML table string. */
export function renderCustomerTable(customers) {
  if (!customers.length) return '<p>Chưa có khách hàng.</p>';
  const rows = customers
    .map((c) => {
      const action = STATUS_ACTIONS[c.status];
      const statusButton = action
        ? ` <button type="button" data-status-id="${escapeHtml(c.id)}" data-target-status="${escapeHtml(action.target)}">${action.label}</button>`
        : '';
      return (
        `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.email)}</td>` +
        `<td>${escapeHtml(c.phone ? formatPhone(c.phone) : NO_PHONE)}</td>` +
        `<td>${escapeHtml(STATUS_LABELS[c.status] ?? c.status)}</td>` +
        `<td><button type="button" data-edit-id="${escapeHtml(c.id)}">Sửa</button>${statusButton}</td></tr>`
      );
    })
    .join('');
  return `<table><thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table>`;
}
