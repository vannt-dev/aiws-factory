import { ApiError, createCustomer, listCustomers } from './api/customerApi.js';
import { renderCustomerTable } from './components/customerTable.js';

const listEl = document.getElementById('customers');
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

refresh();
