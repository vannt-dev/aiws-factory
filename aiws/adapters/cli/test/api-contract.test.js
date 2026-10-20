import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, writeFile, scenario, readFile, tempDir } from './helpers.js';
import { lintOpenApi, compareContract, normalizePath, findSpecs, driftFindings } from '../src/apicontract.js';

const sound = () =>
  YAML.parse(`
openapi: 3.0.3
info: {title: t, version: '1'}
paths:
  /users/{id}/nickname:
    put:
      parameters:
        - {name: id, in: path, required: true, schema: {type: string}}
      requestBody:
        content:
          application/json:
            schema: {$ref: '#/components/schemas/Nick'}
      responses:
        "200": {description: OK}
components:
  schemas:
    Nick: {type: object}
`);

test('lintOpenApi names what is wrong with a contract, and nothing when it is sound', () => {
  assert.deepEqual(lintOpenApi(sound()), []);
  const bad = sound();
  bad.openapi = '2.0';
  bad.paths['users'] = {};
  bad.paths['/users/{id}/nickname'].put.responses = {};
  delete bad.paths['/users/{id}/nickname'].put.parameters;
  bad.paths['/users/{id}/nickname'].put.requestBody.content.schema = { $ref: '#/components/schemas/Missing' };
  const problems = lintOpenApi(bad);
  assert.ok(problems.some((p) => /'openapi' must be a 3\.x version/.test(p)));
  assert.ok(problems.some((p) => /path 'users' must start with \//.test(p)));
  assert.ok(problems.some((p) => /path 'users' has no operation/.test(p)));
  assert.ok(problems.some((p) => /PUT \/users\/\{id\}\/nickname has no responses/.test(p)));
  assert.ok(problems.some((p) => /path parameter \{id\} is not declared/.test(p)));
  assert.ok(problems.some((p) => /\$ref '#\/components\/schemas\/Missing' points to nothing/.test(p)));
  assert.deepEqual(lintOpenApi({ openapi: '3.1.0', paths: {} }), []);
  assert.match(lintOpenApi({ openapi: '3.0.0' })[0], /'paths' must be a map/);
});

test('compareContract finds the operations the backend does not expose, prefix and parameter names aside', () => {
  const be = {
    openapi: '3.0.3',
    paths: {
      '/api/v1/users/{userId}/nickname': { put: { responses: { 200: {} } } },
      '/api/v1/users': { get: { responses: { 200: {} } } },
    },
  };
  assert.deepEqual(compareContract(sound(), [{ file: 'be.yaml', doc: be }]), []);
  const contract = sound();
  contract.paths['/users'] = { get: { responses: { 200: {} } }, delete: { responses: { 204: {} } } };
  assert.deepEqual(compareContract(contract, [{ file: 'be.yaml', doc: be }]), [{ method: 'delete', path: '/users' }]);
  assert.equal(normalizePath('/Users/{userId}/Nickname/'), '/users/{}/nickname');
});

test('findSpecs reads OpenAPI documents in a source tree and skips what is not one', () => {
  const root = makeWorkspace();
  writeFile(root, 'source-be/openapi.yaml', 'openapi: 3.0.3\ninfo: {title: a, version: "1"}\npaths: {}\n');
  writeFile(root, 'source-be/docs/spec.json', JSON.stringify({ openapi: '3.1.0', paths: { '/x': { get: { responses: { 200: {} } } } } }));
  writeFile(root, 'source-be/config/app.yaml', 'server:\n  port: 8080\n');
  writeFile(root, 'source-be/node_modules/dep/openapi.yaml', 'openapi: 3.0.0\npaths: {}\n');
  const files = findSpecs(path.join(root, 'source-be'))
    .map((s) => path.relative(root, s.file).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(files, ['source-be/docs/spec.json', 'source-be/openapi.yaml']);
});

test('the review fails the contract as a critical finding when the backend document lacks an operation, and passes once it has it', () => {
  const root = makeWorkspace({ discover: true });
  writeFile(
    root,
    'source-be/openapi.yaml',
    'openapi: 3.0.3\ninfo: {title: users, version: "1"}\npaths:\n  /users/{id}:\n    get:\n      responses: {"200": {description: OK}}\n'
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'be: openapi document']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);

  // the CLI check says what the review will say
  const check = aiws(root, ['check', 'api-contract', '--req', 'REQ-001']);
  assert.equal(check.status, 1);
  assert.match(
    check.stdout,
    /PUT \/users\/\{id\}\/nickname of aiws\/work\/REQ-001\/api-contract\.yaml is not exposed by the backend's OpenAPI document \(source-be\/openapi\.yaml\)/
  );

  // step by step until the review has spoken
  let st;
  for (let i = 0; i < 12; i++) {
    ok(root, ['run', 'REQ-001', '--once']);
    st = state(root);
    if (st.history.some((h) => h.phase === 'review' && h.result === 'critical')) break;
  }
  assert.equal(st.phase, 'planning', st.reason);
  const fb = st.feedback.find((f) => f.phase === 'planning');
  assert.match(fb.text, /PUT \/users\/\{id\}\/nickname .* is not exposed/);

  // the backend document now exposes it (as a person or a fix task would make it); the next review passes
  writeFile(
    root,
    'source-be/openapi.yaml',
    'openapi: 3.0.3\ninfo: {title: users, version: "1"}\npaths:\n  /api/users/{userId}/nickname:\n    put:\n      responses: {"200": {description: OK}}\n'
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'be: expose the nickname endpoint']);
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.deepEqual(
    st.history.filter((h) => h.phase === 'review').map((h) => h.result),
    ['critical', 'ok']
  );
  const r = ok(root, ['check', 'api-contract', '--req', 'REQ-001']);
  assert.match(r.stdout, /every operation of aiws\/work\/REQ-001\/api-contract\.yaml \(1\) is exposed by source-be\/openapi\.yaml/);
  assert.match(r.stdout, /api-contract ok for REQ-001/);
});

/** A report as `openapi-drift check --format json` prints it. */
const driftReport = (over = {}) =>
  JSON.stringify({
    spec: 'aiws/work/REQ-001/api-contract.yaml',
    source: 'source-be',
    base: '',
    prefix: '/api',
    counts: { spec: 2, code: 5 },
    missingInSpec: [{ method: 'get', path: '/api/health', file: 'source-be/src/health.ts', line: 3, hint: '' }],
    missingInCode: [],
    paramMismatch: [],
    queryMismatch: [],
    statusMismatch: [],
    ...over,
  });

test('driftFindings turns the JSON report of openapi-drift into review findings', () => {
  const contract = 'aiws/work/REQ-001/api-contract.yaml';
  // an operation of the contract that no route serves is a finding; routes the contract does not list are not
  const missing = driftReport({
    missingInCode: [{ method: 'put', path: '/users/{id}/nickname', specPath: '/users/{id}/nickname', hint: 'the path exists with GET' }],
    paramMismatch: [
      { method: 'get', path: '/users/{id}', specParams: ['id'], codeParams: ['userId'], file: 'source-be/src/users.ts', line: 9 },
    ],
  });
  const r = driftFindings({ status: 1, stdout: missing }, { contract });
  assert.deepEqual(r.findings, [
    `PUT /users/{id}/nickname of ${contract} is served by no route of the backend code (openapi-drift; the path exists with GET)`,
  ]);
  assert.deepEqual(r.notes, [
    'GET /users/{id}: path parameters named differently, contract {id}, code {userId} (source-be/src/users.ts:9)',
  ]);

  // the code serves it under a prefix the contract leaves out (a NestJS global prefix): not a finding
  const prefixed = driftReport({
    missingInSpec: [{ method: 'put', path: '/api/users/{userId}/nickname', file: 'source-be/src/users.ts', line: 20, hint: '' }],
    missingInCode: [{ method: 'put', path: '/users/{id}/nickname', specPath: '/users/{id}/nickname', hint: '' }],
  });
  assert.deepEqual(driftFindings({ status: 1, stdout: prefixed }, { contract }).findings, []);

  // what the tool let pass (exit 0, --fail-on none) is not failed here either
  assert.deepEqual(driftFindings({ status: 0, stdout: missing }, { contract }).findings, []);

  // query and status differences fail only when the command asks for --strict
  const statuses = driftReport({
    statusMismatch: [
      { method: 'post', path: '/users', codeStatuses: [201], specResponses: ['200'], file: 'source-be/src/users.ts', line: 5 },
    ],
  });
  assert.deepEqual(driftFindings({ status: 0, stdout: statuses }, { contract }).findings, []);
  assert.match(driftFindings({ status: 0, stdout: statuses }, { contract }).notes[0], /POST \/users: the code answers 201/);
  assert.deepEqual(driftFindings({ status: 1, stdout: statuses }, { contract, strict: true }).findings, [
    `POST /users of ${contract}: the code answers 201; the contract describes 200 (source-be/src/users.ts:5)`,
  ]);

  // anything else (a usage error, a document with problems, another tool) is not a drift report
  assert.equal(driftFindings({ status: 2, stdout: '', stderr: 'bad usage' }, { contract }), null);
  assert.equal(driftFindings({ status: 1, stdout: 'FAILED: 3 tests' }, { contract }), null);
  assert.equal(driftFindings({ status: 0, stdout: '{"ok": true}' }, { contract }), null);
});

test('commands.api_contract_be: the review runs openapi-drift on the contract and fails what the code does not serve', () => {
  const root = makeWorkspace({ discover: true });
  const dir = tempDir('aiws-drift-');
  const script = path.join(dir, 'fake-drift.cjs');
  const calls = path.join(dir, 'calls.json');
  const report = driftReport({
    missingInCode: [{ method: 'put', path: '/users/{id}/nickname', specPath: '/users/{id}/nickname', hint: '' }],
  });
  fs.writeFileSync(
    script,
    `const fs = require('fs');\n` +
      `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n` +
      `if (fs.existsSync(${JSON.stringify(path.join(dir, 'fixed'))})) { process.stdout.write(${JSON.stringify(driftReport())}); process.exit(1); }\n` +
      `process.stdout.write(${JSON.stringify(report)});\n` +
      `process.exit(1);\n`
  );
  const pol = YAML.parse(readFile(root, 'aiws/config/policies.yaml'));
  pol.commands.api_contract_be = `node "${script}" check --spec aiws/work/{req}/api-contract.yaml --source source-be --fail-on code --format json`;
  writeFile(root, 'aiws/config/policies.yaml', YAML.stringify(pol));
  git(root, ['commit', '-qam', 'api contract check']);
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);

  // the CLI check runs it too, and says what the review will say
  const check = aiws(root, ['check', 'api-contract', '--req', 'REQ-001']);
  assert.equal(check.status, 1, check.out);
  assert.match(
    check.stdout,
    /PUT \/users\/\{id\}\/nickname of aiws\/work\/REQ-001\/api-contract\.yaml is served by no route of the backend code/
  );
  const first = JSON.parse(fs.readFileSync(calls, 'utf8').split('\n')[0]);
  assert.deepEqual(first.slice(0, 3), ['check', '--spec', 'aiws/work/REQ-001/api-contract.yaml'], '{req} is filled in');

  let st;
  for (let i = 0; i < 12; i++) {
    ok(root, ['run', 'REQ-001', '--once']);
    st = state(root);
    if (st.history.some((h) => h.phase === 'review' && h.result === 'critical')) break;
  }
  assert.equal(st.phase, 'planning', st.reason);
  const fb = st.feedback.find((f) => f.phase === 'planning');
  assert.match(
    fb.text,
    /PUT \/users\/\{id\}\/nickname of aiws\/work\/REQ-001\/api-contract\.yaml is served by no route of the backend code/
  );
  assert.doesNotMatch(fb.text, /\/api\/health/, 'routes the contract does not list are no finding');

  // the code serves it now (as the fix task would make it): the next review passes
  fs.writeFileSync(path.join(dir, 'fixed'), '');
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.deepEqual(
    st.history.filter((h) => h.phase === 'review').map((h) => h.result),
    ['critical', 'ok']
  );
});

test('a backend without an OpenAPI document is noted, not failed, unless require_spec says so', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const r = ok(root, ['check', 'api-contract', '--req', 'REQ-001']);
  assert.match(r.stdout, /no OpenAPI 3 document found in the backend source/);
  assert.match(r.stdout, /api-contract ok/);

  const polFile = path.join(root, 'aiws/config/policies.yaml');
  const pol = YAML.parse(readFile(root, 'aiws/config/policies.yaml'));
  pol.api_contract = { require_spec: true };
  writeFile(root, 'aiws/config/policies.yaml', YAML.stringify(pol));
  const strict = aiws(root, ['check', 'api-contract', '--req', 'REQ-001']);
  assert.equal(strict.status, 1, polFile);
  assert.match(strict.stdout, /api-contract FAILED/);
});

test('a malformed contract is sent back to the architect before the design gate', () => {
  const root = makeWorkspace({ discover: true });
  const env = scenario({
    'architect-1.js': `
      import { write, work } from './_lib.js';
      await import('./_architect_real.js');
      write(work('api-contract.yaml'), 'openapi: 3.0.3\\ninfo: {title: t, version: "1"}\\npaths:\\n  /users/{id}/nickname:\\n    put: {}\\n');
    `,
  });
  const dirs = env.AIWS_SCRIPTED_DIR.split(path.delimiter);
  fs.copyFileSync(path.join(dirs[1], 'architect.js'), path.join(dirs[0], '_architect_real.js'));
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  assert.equal(state(root).phase, 'design_approval');
  const prompt = readFile(root, 'aiws/work/REQ-001/evidence/runs/run-0003.prompt.md');
  assert.match(prompt, /Previous attempt failed/);
  assert.match(prompt, /PUT \/users\/\{id\}\/nickname has no responses/);
  assert.match(prompt, /path parameter \{id\} is not declared/);
});
