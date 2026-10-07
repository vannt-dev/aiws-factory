import { ApiError, createCustomer, getCustomer, listCustomers, updateCustomer, updateCustomerStatus } from './api/customerApi.js';
import { renderCustomerEditForm } from './components/customerEditForm.js';
import { renderCustomerTable } from './components/customerTable.js';
import { describeStatusError } from './utils/describeStatusError.js';

const listEl = document.getElementById('customers');
const editEl = document.getElementById('edit-customer');
const messageEl = document.getElementById('message');
const form = document.getElementById('create-form');

async function refresh() {
  try {
    listEl.innerHTML = renderCustomerTable(await listCustomers());
  } catch {
    listEl.textContent = 'Không tải được danh sách khách hàng.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  messageEl.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  try {
    await createCustomer({ name: data.name, email: data.email, phone: data.phone });
    form.reset();
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
  messageEl.textContent = '';
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
  messageEl.textContent = '';
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
  messageEl.textContent = '';
});

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-status-id]');
  if (!button) return;
  messageEl.textContent = '';
  try {
    await updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus);
    await refresh();
  } catch (error) {
    messageEl.textContent = describeStatusError(error);
  }
});

refresh();
