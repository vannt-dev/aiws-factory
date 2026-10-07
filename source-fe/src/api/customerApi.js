// HTTP client for the CRM API (/api/customers). Errors are RFC 9457 problem details.

export const API_BASE = '/api';

/** Raised for any non-2xx response; carries the problem details returned by the API. */
export class ApiError extends Error {
  constructor(status, problem) {
    super(problem?.detail || problem?.title || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = problem?.errors ?? {};
  }
}

async function request(path, { fetchImpl = fetch, ...init } = {}) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}

export function listCustomers(options) {
  return request('/customers', options);
}

export function createCustomer(customer, options) {
  return request('/customers', { ...options, method: 'POST', body: JSON.stringify(customer) });
}

/** Fetches one customer by id, used to fill the edit form with current values. */
export function getCustomer(id, options) {
  return request(`/customers/${encodeURIComponent(id)}`, options);
}

/** Replaces name, email and phone of customer `id`; the body is sent exactly as given. */
export function updateCustomer(id, customer, options) {
  return request(`/customers/${encodeURIComponent(id)}`, { ...options, method: 'PUT', body: JSON.stringify(customer) });
}
