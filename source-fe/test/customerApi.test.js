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

test('TC-42: createCustomer sends the phone value exactly as entered', async () => {
  const calls = [];
  const inputs = [
    { name: 'An', email: 'an@example.com', phone: '0912 345 678' },
    { name: 'Binh', email: 'binh@example.com', phone: '' },
  ];

  for (const input of inputs) {
    await createCustomer(input, { fetchImpl: fakeFetch(201, { id: 7 }, calls) });
  }

  assert.equal(calls.length, 2);
  inputs.forEach((input, i) => {
    assert.equal(calls[i].url, '/api/customers');
    assert.equal(calls[i].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[i].init.body), input);
  });
  assert.equal(JSON.parse(calls[0].init.body).phone, '0912 345 678');
  assert.equal(JSON.parse(calls[1].init.body).phone, '');
});

test('TC-43: createCustomer throws ApiError with the phone field error returned by the API', async () => {
  const messages = ['must be a valid phone number', 'is already used by another customer'];

  for (const phone of messages) {
    const problem = {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      detail: 'The request has invalid fields',
      errors: { phone },
    };

    await assert.rejects(
      createCustomer({ name: 'An', email: 'an@example.com', phone: '0412345678' }, { fetchImpl: fakeFetch(400, problem) }),
      (error) => error instanceof ApiError && error.status === 400 && error.fieldErrors.phone === phone
    );
  }
});
