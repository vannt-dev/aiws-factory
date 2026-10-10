import { ApiError, createCustomer, getCustomer, listCustomers, updateCustomer, updateCustomerStatus } from './api/customerApi.js';
import { renderCustomerEditForm } from './components/customerEditForm.js';
import { renderCustomerTable } from './components/customerTable.js';
import { describeStatusError } from './utils/describeStatusError.js';
import { createDoubleClickGuard } from './utils/createDoubleClickGuard.js';
import { createCustomerListLoader } from './utils/createCustomerListLoader.js';
import { chooseStatusClickKey } from './utils/chooseStatusClickKey.js';
import { describeCreateNotice } from './utils/describeCreateNotice.js';

const listEl = document.getElementById('customers');
const editEl = document.getElementById('edit-customer');
const messageEl = document.getElementById('message');
const noticeEl = document.getElementById('notice');
const form = document.getElementById('create-form');
const filterEl = document.getElementById('status-filter');
const acceptStatusClick = createDoubleClickGuard();
const loadCustomers = createCustomerListLoader(listCustomers, () => filterEl.value);

function clearMessages() {
  messageEl.textContent = '';
  noticeEl.textContent = '';
}

async function refresh() {
  const statusFilter = filterEl.value;
  try {
    const { current, customers } = await loadCustomers();
    if (current) listEl.innerHTML = renderCustomerTable(customers, statusFilter);
  } catch {
    listEl.textContent = 'Không tải được danh sách khách hàng.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();
  const data = Object.fromEntries(new FormData(form));
  try {
    const created = await createCustomer({ name: data.name, email: data.email, phone: data.phone });
    form.reset();
    noticeEl.textContent = describeCreateNotice(created, filterEl.value);
    await refresh();
  } catch (error) {
    messageEl.textContent =
      error instanceof ApiError && Object.keys(error.fieldErrors).length
        ? Object.entries(error.fieldErrors).map(([field, msg]) => `${field}: ${msg}`).join('; ')
        : 'Không lưu được khách hàng.';
  }
});

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-edit-id]');
  if (!button) return;
  clearMessages();
  try {
    const customer = await getCustomer(button.dataset.editId);
    editEl.innerHTML = renderCustomerEditForm(customer);
    editEl.querySelector('input')?.focus();
  } catch {
    messageEl.textContent = 'Không tải được khách hàng.';
  }
});

editEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();
  const editForm = event.target;
  const id = editForm.dataset.id;
  const data = Object.fromEntries(new FormData(editForm));
  const customer = { name: data.name, email: data.email, phone: data.phone };
  try {
    await updateCustomer(id, customer);
    editEl.innerHTML = '';
    await refresh();
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
      editEl.innerHTML = renderCustomerEditForm({ id, ...customer }, error.fieldErrors);
      editEl.querySelector('[aria-invalid="true"]')?.focus();
    } else {
      messageEl.textContent = 'Không lưu được khách hàng.';
    }
  }
});

editEl.addEventListener('click', (event) => {
  if (!event.target.closest('button[data-cancel-edit]')) return;
  editEl.innerHTML = '';
  clearMessages();
});

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-status-id]');
  if (!button) return;
  if (!acceptStatusClick(chooseStatusClickKey(filterEl.value, button.dataset.statusId), event.timeStamp)) return;
  clearMessages();
  try {
    await updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus);
    await refresh();
  } catch (error) {
    messageEl.textContent = describeStatusError(error);
  }
});

filterEl.addEventListener('change', () => {
  clearMessages();
  refresh();
});

filterEl.value = '';
refresh();
