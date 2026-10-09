import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createCustomer, getCustomer, listCustomers, updateCustomer, updateCustomerStatus } from '../src/api/customerApi.js';

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

test('TC-70: updateCustomer sends PUT /api/customers/{id} with the input exactly as entered', async () => {
  const apiCustomer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' };
  const rows = [
    { id: 7, input: { name: 'Nguyen Van An', email: 'an@example.com', phone: '0912 345 678' } },
    { id: '7', input: { name: 'Nguyen Van An', email: 'an@example.com', phone: '' } },
  ];

  for (const { id, input } of rows) {
    const calls = [];
    const result = await updateCustomer(id, input, { fetchImpl: fakeFetch(200, apiCustomer, calls) });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/customers/7');
    assert.equal(calls[0].init.method, 'PUT');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), input);
    assert.deepEqual(result, apiCustomer);
  }
});

test('TC-71: updateCustomer throws ApiError with the status and field errors of the problem', async () => {
  const rows = [
    {
      status: 400,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        detail: 'The request has invalid fields',
        errors: { name: 'must not be blank', email: 'must be a valid email address', phone: 'must be a valid phone number' },
      },
      fieldErrors: { name: 'must not be blank', email: 'must be a valid email address', phone: 'must be a valid phone number' },
    },
    {
      status: 404,
      problem: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' },
      fieldErrors: {},
    },
  ];

  for (const row of rows) {
    await assert.rejects(
      updateCustomer(7, { name: '', email: 'x', phone: '0412345678' }, { fetchImpl: fakeFetch(row.status, row.problem) }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, row.status);
        assert.deepEqual(error.fieldErrors, row.fieldErrors);
        return true;
      }
    );
  }
});

test('TC-72: getCustomer calls GET /api/customers/{id} without a body and returns the customer', async () => {
  const rows = [
    { id: 7, body: { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' } },
    { id: '7', body: { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'INACTIVE' } },
  ];

  for (const { id, body } of rows) {
    const calls = [];
    const result = await getCustomer(id, { fetchImpl: fakeFetch(200, body, calls) });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/customers/7');
    assert.equal(calls[0].init.method, undefined);
    assert.equal(calls[0].init.headers['Content-Type'], undefined);
    assert.deepEqual(result, body);
  }
});

test('TC-73: getCustomer throws ApiError when the API returns an error', async () => {
  const rows = [
    { status: 404, problem: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' } },
    { status: 500, problem: { type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' } },
  ];

  for (const { status, problem } of rows) {
    await assert.rejects(
      getCustomer(7, { fetchImpl: fakeFetch(status, problem) }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.deepEqual(error.fieldErrors, {});
        return true;
      }
    );
  }
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

test('TC-101: updateCustomerStatus sends PUT /api/customers/{id}/status with a body containing only the target status', async () => {
  const rows = [
    { id: 7, status: 'INACTIVE', url: '/api/customers/7/status' },
    { id: '7', status: 'ACTIVE', url: '/api/customers/7/status' },
    { id: '7/8', status: 'INACTIVE', url: '/api/customers/7%2F8/status' },
  ];

  for (const { id, status, url } of rows) {
    const calls = [];
    const apiCustomer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status };
    const result = await updateCustomerStatus(id, status, { fetchImpl: fakeFetch(200, apiCustomer, calls) });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, url);
    assert.equal(calls[0].init.method, 'PUT');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { status });
    assert.deepEqual(result, apiCustomer);
  }
});

test('TC-102: updateCustomerStatus throws ApiError with the status and field errors of the API', async () => {
  const rows = [
    {
      status: 400,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        detail: 'The request has invalid fields',
        errors: { phone: 'is already used by another customer' },
      },
      fieldErrors: { phone: 'is already used by another customer' },
    },
    {
      status: 400,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        detail: 'The request has invalid fields',
        errors: { status: 'must be ACTIVE or INACTIVE' },
      },
      fieldErrors: { status: 'must be ACTIVE or INACTIVE' },
    },
    {
      status: 404,
      problem: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' },
      fieldErrors: {},
    },
  ];

  for (const row of rows) {
    await assert.rejects(
      updateCustomerStatus(7, 'ACTIVE', { fetchImpl: fakeFetch(row.status, row.problem) }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, row.status);
        assert.deepEqual(error.fieldErrors, row.fieldErrors);
        return true;
      }
    );
  }
});

test('TC-125: listCustomers sends one GET whose URL carries the status filter', async () => {
  const rows = [
    { options: {}, url: '/api/customers' },
    { options: { status: '' }, url: '/api/customers' },
    { options: { status: undefined }, url: '/api/customers' },
    { options: { status: null }, url: '/api/customers' },
    { options: { status: 'ACTIVE' }, url: '/api/customers?status=ACTIVE' },
    { options: { status: 'INACTIVE' }, url: '/api/customers?status=INACTIVE' },
    { options: { status: 'A&B=C D' }, url: '/api/customers?status=A%26B%3DC%20D' },
  ];

  for (const { options, url } of rows) {
    const calls = [];
    await listCustomers({ ...options, fetchImpl: fakeFetch(200, [], calls) });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, url);
    assert.deepEqual(calls[0].init, { headers: { Accept: 'application/json' } });
  }
});

test('TC-126: listCustomers returns the array sent by the API without filtering or sorting', async () => {
  const AN = { id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'ACTIVE' };
  const BINH = { id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: '0912345678', status: 'INACTIVE' };
  const CUONG = { id: 3, name: 'Le Van Cuong', email: 'cuong@example.com', phone: '0987654321', status: 'ACTIVE' };
  const DUNG = { id: 4, name: 'Pham Thi Dung', email: 'dung@example.com', phone: null, status: 'INACTIVE' };
  const rows = [
    { status: 'ACTIVE', body: [AN, BINH, CUONG, DUNG] },
    { status: 'INACTIVE', body: [CUONG, BINH, AN] },
    { status: 'INACTIVE', body: [] },
    { status: '', body: [] },
  ];

  for (const { status, body } of rows) {
    const result = await listCustomers({ status, fetchImpl: fakeFetch(200, body) });

    assert.deepEqual(result, body);
  }
});

test('TC-127: listCustomers throws ApiError with the status and field errors of the API', async () => {
  const notFound500 = { type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' };
  const rows = [
    {
      options: { status: 'DELETED' },
      status: 400,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        detail: 'The request has invalid fields',
        errors: { status: 'must be ACTIVE or INACTIVE' },
      },
      url: '/api/customers?status=DELETED',
      fieldErrors: { status: 'must be ACTIVE or INACTIVE' },
    },
    { options: { status: 'ACTIVE' }, status: 500, problem: notFound500, url: '/api/customers?status=ACTIVE', fieldErrors: {} },
    { options: {}, status: 500, problem: notFound500, url: '/api/customers', fieldErrors: {} },
  ];

  for (const row of rows) {
    const calls = [];

    await assert.rejects(
      listCustomers({ ...row.options, fetchImpl: fakeFetch(row.status, row.problem, calls) }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, row.status);
        assert.deepEqual(error.fieldErrors, row.fieldErrors);
        return true;
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, row.url);
  }
});
