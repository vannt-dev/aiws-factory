import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createCustomer, listCustomers } from '../src/api/customerApi.js';

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test('listCustomers calls GET /api/customers and returns the body', async () => {
  const calls = [];
  const result = await listCustomers({ fetchImpl: fakeFetch(200, [{ id: 1 }], calls) });

  assert.deepEqual(result, [{ id: 1 }]);
  assert.equal(calls[0].url, '/api/customers');
  assert.equal(calls[0].init.method, undefined);
});

test('createCustomer posts JSON and returns the created customer', async () => {
  const calls = [];
  const created = await createCustomer({ name: 'An', email: 'an@example.com' }, { fetchImpl: fakeFetch(201, { id: 7 }, calls) });

  assert.equal(created.id, 7);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'An', email: 'an@example.com' });
});

test('createCustomer throws ApiError with field errors from a problem response', async () => {
  const problem = { title: 'Validation failed', status: 400, errors: { email: 'must be a valid email address' } };

  await assert.rejects(
    createCustomer({ name: 'An', email: 'x' }, { fetchImpl: fakeFetch(400, problem) }),
    (error) => error instanceof ApiError && error.status === 400 && error.fieldErrors.email === 'must be a valid email address'
  );
});
