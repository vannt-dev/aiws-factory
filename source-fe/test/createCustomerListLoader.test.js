import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerListLoader } from '../src/utils/createCustomerListLoader.js';

const AN = { id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'ACTIVE' };
const BINH = { id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: '0912345678', status: 'INACTIVE' };
const CUONG = { id: 3, name: 'Le Van Cuong', email: 'cuong@example.com', phone: '0987654321', status: 'ACTIVE' };
const DUNG = { id: 4, name: 'Pham Thi Dung', email: 'dung@example.com', phone: null, status: 'INACTIVE' };

test('TC-128: createCustomerListLoader asks for the selected status once per load', async () => {
  const rows = [
    ['', 'ACTIVE', 'INACTIVE', ''],
    ['INACTIVE', 'INACTIVE'],
    ['ACTIVE'],
  ];

  for (const statuses of rows) {
    const calls = [];
    let getStatusCalls = 0;
    let selected;
    const getStatus = () => {
      getStatusCalls += 1;
      return selected;
    };
    const listCustomers = (options) => {
      calls.push(options);
      return Promise.resolve([]);
    };
    const load = createCustomerListLoader(listCustomers, getStatus);

    for (let i = 0; i < statuses.length; i += 1) {
      selected = statuses[i];
      const result = await load();

      assert.equal(calls.length, i + 1);
      assert.equal(getStatusCalls, i + 1);
      assert.deepEqual(calls[i], { status: statuses[i] });
      assert.equal(result.current, true);
    }

    assert.deepEqual(calls, statuses.map((status) => ({ status })));
  }
});

test('TC-129: createCustomerListLoader reads the selected status at each load, not at creation or from an earlier load', async () => {
  const rows = [
    { createdWith: 'ACTIVE', loads: ['INACTIVE', 'INACTIVE'] },
    { createdWith: 'ACTIVE', loads: ['ACTIVE', 'INACTIVE'] },
    { createdWith: 'INACTIVE', loads: ['INACTIVE', ''] },
    { createdWith: '', loads: ['', 'ACTIVE', ''] },
  ];

  for (const { createdWith, loads } of rows) {
    let selected = createdWith;
    let getStatusCalls = 0;
    const getStatus = () => {
      getStatusCalls += 1;
      return selected;
    };
    const calls = [];
    const listCustomers = (options) => {
      calls.push(options);
      return Promise.resolve([]);
    };
    const load = createCustomerListLoader(listCustomers, getStatus);

    assert.equal(getStatusCalls, 0);
    assert.equal(calls.length, 0);

    for (const value of loads) {
      selected = value;
      const pending = load();
      selected = 'CHANGED';
      await pending;
    }

    assert.equal(getStatusCalls, loads.length);
    assert.deepEqual(calls, loads.map((status) => ({ status })));
    assert.ok(calls.every((call) => call.status !== 'CHANGED'));
  }
});

test('TC-130: createCustomerListLoader returns the list of the API unchanged when no newer load exists', async () => {
  const rows = [
    { status: 'ACTIVE', body: [AN, BINH, CUONG, DUNG] },
    { status: '', body: [CUONG, AN, BINH] },
    { status: 'INACTIVE', body: [] },
    { status: 'ACTIVE', body: null },
  ];

  for (const { status, body } of rows) {
    const listCustomers = () => Promise.resolve(body);
    const load = createCustomerListLoader(listCustomers, () => status);

    const result = await load();

    assert.deepEqual(result, { current: true, customers: body });
    assert.equal(result.customers, body);
  }
});

test('TC-131: createCustomerListLoader rejects with the API error and loads again afterwards', async () => {
  const errors = [
    new Error('network down'),
    Object.assign(new Error('The request has invalid fields'), {
      status: 400,
      fieldErrors: { status: 'must be ACTIVE or INACTIVE' },
    }),
  ];

  for (const error of errors) {
    const calls = [];
    let selected = 'ACTIVE';
    let callNumber = 0;
    const listCustomers = (options) => {
      calls.push(options);
      callNumber += 1;
      return callNumber === 1 ? Promise.reject(error) : Promise.resolve([BINH]);
    };
    const load = createCustomerListLoader(listCustomers, () => selected);

    const first = load();
    await assert.rejects(first, (caught) => {
      assert.equal(caught, error);
      return true;
    });

    selected = 'INACTIVE';
    const second = await load();

    assert.deepEqual(second, { current: true, customers: [BINH] });
    assert.deepEqual(calls, [{ status: 'ACTIVE' }, { status: 'INACTIVE' }]);
  }
});

test('TC-132: createCustomerListLoader marks a load overtaken by a newer one as not current, whatever the response order', async () => {
  const STATUS = { A: 'ACTIVE', B: 'INACTIVE', C: '' };
  const BODY = { A: [AN], B: [BINH], C: [CUONG] };
  const rows = [
    { order: ['A', 'B'], resolveOrder: ['B', 'A'], current: 'B' },
    { order: ['A', 'B'], resolveOrder: ['A', 'B'], current: 'B' },
    { order: ['A', 'B', 'C'], resolveOrder: ['C', 'A', 'B'], current: 'C' },
    { order: ['A', 'B', 'C'], resolveOrder: ['A', 'B', 'C'], current: 'C' },
  ];

  for (const { order, resolveOrder, current } of rows) {
    const calls = [];
    const deferredQueue = [];
    let selected;
    const listCustomers = (options) => {
      calls.push(options);
      const deferred = Promise.withResolvers();
      deferredQueue.push(deferred);
      return deferred.promise;
    };
    const load = createCustomerListLoader(listCustomers, () => selected);

    const promises = {};
    for (const label of order) {
      selected = STATUS[label];
      promises[label] = load();
    }

    for (const label of resolveOrder) {
      deferredQueue[order.indexOf(label)].resolve(BODY[label]);
    }

    for (const label of order) {
      const result = await promises[label];
      if (label === current) {
        assert.deepEqual(result, { current: true, customers: BODY[label] });
      } else {
        assert.deepEqual(result, { current: false });
      }
    }

    assert.equal(calls.length, order.length);
    assert.deepEqual(calls, order.map((label) => ({ status: STATUS[label] })));
  }
});

test('TC-133: createCustomerListLoader swallows the error of an overtaken load and rejects with the error of the latest one', async () => {
  const eA = new Error('A failed');
  const eB = new Error('B failed');
  const rows = [
    { aOutcome: { type: 'reject', value: eA }, bOutcome: { type: 'resolve', value: [BINH] }, resolveOrder: ['A', 'B'] },
    { aOutcome: { type: 'reject', value: eA }, bOutcome: { type: 'resolve', value: [BINH] }, resolveOrder: ['B', 'A'] },
    { aOutcome: { type: 'resolve', value: [AN] }, bOutcome: { type: 'reject', value: eB }, resolveOrder: ['A', 'B'] },
    { aOutcome: { type: 'reject', value: eA }, bOutcome: { type: 'reject', value: eB }, resolveOrder: ['A', 'B'] },
  ];

  for (const { aOutcome, bOutcome, resolveOrder } of rows) {
    let selected = 'ACTIVE';
    const deferredA = Promise.withResolvers();
    const deferredB = Promise.withResolvers();
    const queue = [deferredA, deferredB];
    let callIndex = 0;
    const listCustomers = () => {
      const deferred = queue[callIndex];
      callIndex += 1;
      return deferred.promise;
    };
    const load = createCustomerListLoader(listCustomers, () => selected);

    const a = load();
    selected = 'INACTIVE';
    const b = load();

    const bRejects = bOutcome.type === 'reject';
    const bAssertion = bRejects
      ? assert.rejects(b, (caught) => {
          assert.equal(caught, bOutcome.value);
          return true;
        })
      : null;

    const settle = (label) => {
      const outcome = label === 'A' ? aOutcome : bOutcome;
      const deferred = label === 'A' ? deferredA : deferredB;
      if (outcome.type === 'reject') deferred.reject(outcome.value);
      else deferred.resolve(outcome.value);
    };

    for (const label of resolveOrder) settle(label);

    const resultA = await a;
    assert.deepEqual(resultA, { current: false });

    if (bRejects) {
      await bAssertion;
    } else {
      const resultB = await b;
      assert.deepEqual(resultB, { current: true, customers: bOutcome.value });
    }
  }
});

test('TC-134: createCustomerListLoader returns loaders that do not share state', async () => {
  const deferredFirst = Promise.withResolvers();
  const loadFirst = createCustomerListLoader(() => deferredFirst.promise, () => 'ACTIVE');
  const loadSecond = createCustomerListLoader(() => Promise.resolve([BINH]), () => 'INACTIVE');

  const first = loadFirst();
  const second = await loadSecond();

  assert.deepEqual(second, { current: true, customers: [BINH] });

  deferredFirst.resolve([AN]);
  const firstResult = await first;

  assert.deepEqual(firstResult, { current: true, customers: [AN] });
});
