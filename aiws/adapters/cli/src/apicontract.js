import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { readTextIfExists, runShell, osCommand, fill } from './util.js';

/**
 * The API contract of a requirement (aiws/work/REQ/api-contract.yaml) is the bridge between the backend and
 * the frontend: the backend must expose it, the frontend must call it. Two checks without any dependency:
 *  - a lint of the contract itself, run when the architect writes it, so a malformed contract never reaches
 *    the design gate;
 *  - a comparison with the OpenAPI document the backend keeps in its source tree, run by the review phase:
 *    every path and method of the contract must exist there. A backend that keeps no such document is not
 *    checked, and the review says so.
 * And, when `policies.yaml -> commands.api_contract_be` is set (`aiws detect` proposes openapi-drift for
 * NestJS, Express, Fastify and Spring), a comparison with the routes of the backend code, run by the review
 * phase too: nothing is installed unless that command does it.
 */

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** Problems of an OpenAPI 3 document, as a person would list them; empty when it is sound. */
export function lintOpenApi(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (!/^3\./.test(String(doc.openapi ?? ''))) problems.push("'openapi' must be a 3.x version");
  if (!doc.paths || typeof doc.paths !== 'object') {
    problems.push("'paths' must be a map (use `paths: {}` when the requirement changes no API)");
    return problems;
  }
  for (const [p, item] of Object.entries(doc.paths)) {
    if (!p.startsWith('/')) problems.push(`path '${p}' must start with /`);
    if (!item || typeof item !== 'object') {
      problems.push(`path '${p}' has no operations`);
      continue;
    }
    const ops = METHODS.filter((m) => item[m]);
    if (!ops.length) problems.push(`path '${p}' has no operation (get, post, put, ...)`);
    const templated = [...p.matchAll(/\{([^}/]+)\}/g)].map((m) => m[1]);
    for (const m of ops) {
      const op = item[m];
      const where = `${m.toUpperCase()} ${p}`;
      if (!op || typeof op !== 'object') {
        problems.push(`${where} is not an object`);
        continue;
      }
      const responses = op.responses;
      if (!responses || typeof responses !== 'object' || !Object.keys(responses).length) problems.push(`${where} has no responses`);
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].filter((x) => x && typeof x === 'object');
      for (const name of templated) {
        const declared = params.find((x) => x.name === name && x.in === 'path');
        if (!declared)
          problems.push(
            `${where}: path parameter {${name}} is not declared (parameters: - {name: ${name}, in: path, required: true, ...})`
          );
        else if (declared.required !== true) problems.push(`${where}: path parameter {${name}} must be required: true`);
      }
      if (op.requestBody && !(op.requestBody.content && typeof op.requestBody.content === 'object'))
        problems.push(`${where}: requestBody needs a content map (application/json: {schema: ...})`);
    }
  }
  for (const ref of refs(doc)) {
    if (!ref.startsWith('#/')) continue; // a reference to another file is not checked here
    const target = ref
      .slice(2)
      .split('/')
      .reduce((o, k) => (o && typeof o === 'object' ? o[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), doc);
    if (target === undefined) problems.push(`$ref '${ref}' points to nothing in the document`);
  }
  return problems;
}

function refs(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else refs(v, out);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the backend's own document

const SKIP = new Set(['node_modules', 'target', 'build', 'dist', 'vendor', 'bin', 'obj', '.git', '.venv', '__pycache__']);
const SPEC_NAME = /^(openapi|swagger|api)[^/]*\.(ya?ml|json)$/i;

/** OpenAPI 3 documents kept in a directory (a few levels deep): [{file, doc}]. */
export function findSpecs(dir, { maxDepth = 4 } = {}) {
  const found = [];
  const walk = (d, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name), depth + 1);
        continue;
      }
      if (!/\.(ya?ml|json)$/i.test(e.name)) continue;
      const file = path.join(d, e.name);
      let size;
      try {
        size = fs.statSync(file).size;
      } catch {
        continue;
      }
      if (size > 4 * 1024 * 1024) continue;
      const text = readTextIfExists(file) ?? '';
      // a quick look before parsing: only documents that name an OpenAPI version
      if (!SPEC_NAME.test(e.name) && !/["']?openapi["']?\s*:\s*["']?3\./.test(text.slice(0, 4000))) continue;
      try {
        const doc = YAML.parse(text);
        if (doc && typeof doc === 'object' && /^3\./.test(String(doc.openapi ?? '')) && doc.paths) found.push({ file, doc });
      } catch {
        // not a document we can read
      }
    }
  };
  walk(dir, 0);
  return found;
}

/** `/users/{id}/nickname` -> `/users/{}/nickname`, without a trailing slash: parameter names may differ. */
export function normalizePath(p) {
  return String(p)
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** The operations of a document: [{method, path}]. */
export function operations(doc) {
  const out = [];
  for (const [p, item] of Object.entries(doc?.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) if (item[m]) out.push({ method: m, path: p });
  }
  return out;
}

/**
 * The operations of the contract that no backend document exposes. A backend path may carry a prefix the
 * contract leaves out (`/api/v1/users/{id}` for `/users/{id}`), so a backend path that ends with the
 * contract path counts.
 */
export function compareContract(contract, specs) {
  const exposed = specs.flatMap(({ doc }) => operations(doc).map((op) => ({ method: op.method, norm: normalizePath(op.path) })));
  const missing = [];
  for (const op of operations(contract)) {
    const want = normalizePath(op.path);
    const hit = exposed.some((e) => e.method === op.method && (e.norm === want || e.norm.endsWith(want)));
    if (!hit) missing.push(op);
  }
  return missing;
}

/**
 * `aiws check api-contract --req R`, and the review phase's builtin check: lints the contract and compares it
 * with the backend's OpenAPI documents. Returns {problems, notes}; a problem is a critical finding.
 * `policies.yaml -> api_contract: {spec: path, require_spec: true}` pins the document, or demands one.
 */
export function checkApiContract(ws, req) {
  const notes = [];
  const rel = ws.workRel(req, 'api-contract.yaml');
  const text = readTextIfExists(ws.abs(rel));
  if (text === null) return { problems: [`${rel} is missing`], notes };
  let contract;
  try {
    contract = YAML.parse(text);
  } catch (e) {
    return { problems: [`${rel} is not valid YAML: ${e.message.split('\n')[0]}`], notes };
  }
  const problems = lintOpenApi(contract).map((p) => `${rel}: ${p}`);
  if (problems.length) return { problems, notes };
  const ops = operations(contract);
  if (!ops.length) {
    notes.push(`${rel} declares no operation (paths: {}): nothing to compare.`);
    return { problems, notes };
  }

  const cfg = ws.policies.api_contract ?? {};
  let specs;
  if (cfg.spec) {
    const file = ws.abs(cfg.spec);
    const doc = (() => {
      try {
        return YAML.parse(readTextIfExists(file) ?? '');
      } catch {
        return null;
      }
    })();
    if (!doc) return { problems: [`policies.yaml -> api_contract.spec: ${cfg.spec} is missing or not valid YAML`], notes };
    specs = [{ file, doc }];
  } else {
    const sides = ws.policies.sides ?? {};
    const beGlob = sides.be ?? Object.values(sides).find((g) => /be|back|api|server/i.test(g));
    const beDir = beGlob ? ws.abs(String(beGlob).replace(/\/\*\*$/, '')) : null;
    specs = beDir && fs.existsSync(beDir) ? findSpecs(beDir) : [];
  }
  if (!specs.length) {
    const msg =
      'no OpenAPI 3 document found in the backend source, so the contract was not compared with the code (the reviewer reads the code instead; set policies.yaml -> api_contract.spec to point at one)';
    if (cfg.require_spec) return { problems: [msg], notes };
    notes.push(msg);
    return { problems, notes };
  }
  const files = specs.map((s) => path.relative(ws.root, s.file).replace(/\\/g, '/'));
  const missing = compareContract(contract, specs);
  for (const op of missing) {
    problems.push(`${op.method.toUpperCase()} ${op.path} of ${rel} is not exposed by the backend's OpenAPI document (${files.join(', ')})`);
  }
  if (!missing.length) notes.push(`every operation of ${rel} (${ops.length}) is exposed by ${files.join(', ')}.`);
  return { problems, notes };
}

// ---------------------------------------------------------------- the backend's code (commands.api_contract_*)

/** The operations of the requirement's contract; null when it is missing or not valid YAML. */
export function contractOperations(ws, req) {
  const text = readTextIfExists(ws.abs(ws.workRel(req, 'api-contract.yaml')));
  if (text === null) return null;
  try {
    return operations(YAML.parse(text));
  } catch {
    return null;
  }
}

const where = (x) => (x.file ? ` (${x.file}${x.line ? `:${x.line}` : ''})` : '');

/**
 * The JSON report of `openapi-drift check --format json` (https://www.npmjs.com/package/openapi-drift), which
 * compares the contract with the routes the backend code declares, as review findings: {findings, notes}.
 * Null when `res` (a command result) is not such a report, so the caller treats it as any other command.
 *
 * The contract lists only the operations of one requirement, so the routes of the code it does not list are
 * never a finding: only an operation of the contract that no route serves is. A route that serves it under a
 * prefix the contract leaves out (`/api/users/{id}` for `/users/{id}`) counts, as for the backend's document.
 * What the tool let pass (exit 0) is not failed here; query and status differences fail only with `strict`.
 */
export function driftFindings(res, { contract, strict = false }) {
  let report;
  try {
    report = JSON.parse(String(res.stdout ?? '').trim());
  } catch {
    return null;
  }
  if (!report || typeof report !== 'object' || !Array.isArray(report.missingInCode) || !Array.isArray(report.missingInSpec)) return null;
  const list = (k) => (Array.isArray(report[k]) ? report[k] : []);
  const routes = [...list('missingInSpec'), ...(report.accepted?.missingInSpec ?? [])].map((r) => ({
    method: String(r.method).toLowerCase(),
    norm: normalizePath(r.path),
  }));
  const served = (op) =>
    [op.path, op.specPath]
      .filter(Boolean)
      .map(normalizePath)
      .some((want) => routes.some((r) => r.method === String(op.method).toLowerCase() && (r.norm === want || r.norm.endsWith(want))));
  const M = (x) => String(x.method).toUpperCase();
  const failed = res.status !== 0;
  const findings = [];
  const notes = [];

  if (failed) {
    for (const op of list('missingInCode')) {
      if (served(op)) continue;
      findings.push(
        `${M(op)} ${op.specPath ?? op.path} of ${contract} is served by no route of the backend code (openapi-drift${op.hint ? `; ${op.hint}` : ''})`
      );
    }
  }
  for (const p of list('paramMismatch')) {
    notes.push(
      `${M(p)} ${p.path}: path parameters named differently, contract {${(p.specParams ?? []).join('}, {')}}, code {${(p.codeParams ?? []).join('}, {')}}${where(p)}`
    );
  }
  const strictOnes = [
    ...list('queryMismatch').map((q) => {
      const parts = [
        q.codeOnly?.length ? `in the code only: ${q.codeOnly.join(', ')}` : '',
        q.specOnly?.length ? `in the contract only: ${q.specOnly.join(', ')}` : '',
      ].filter(Boolean);
      return { op: q, text: `query parameters differ, ${parts.join('; ')}${where(q)}` };
    }),
    ...list('statusMismatch').map((s) => ({
      op: s,
      text: `the code answers ${(s.codeStatuses ?? []).join(', ')}; the contract describes ${(s.specResponses ?? []).join(', ') || 'no status'}${where(s)}`,
    })),
  ];
  for (const { op, text } of strictOnes) {
    if (strict && failed) findings.push(`${M(op)} ${op.path} of ${contract}: ${text}`);
    else notes.push(`${M(op)} ${op.path}: ${text}`);
  }
  return { findings, notes };
}

/**
 * Runs `policies.yaml -> commands.<key>` (`api_contract_be`, `api_contract_fe`) for a requirement, `{req}` filled
 * in: the review's optional contract checks and `aiws check api-contract`. Null when the command is not
 * configured. Not run when the contract is missing or declares no operation: there is nothing to compare, and the
 * builtin check already reports a missing contract. A report of openapi-drift becomes one finding per drift;
 * any other command fails on its exit code, with the end of its output.
 */
export function runContractCommand(ws, req, key, { env } = {}) {
  const cmd = osCommand(ws.policies.commands?.[key]);
  if (!cmd) return null;
  const rel = ws.workRel(req, 'api-contract.yaml');
  if (!contractOperations(ws, req)?.length) return { failures: [], notes: [`${key} not run: ${rel} is missing or declares no operation.`] };
  const res = runShell(fill(cmd, { req }), { cwd: ws.root, env, timeout: 30 * 60 * 1000 });
  const drift = driftFindings(res, { contract: rel, strict: /(^|\s)--strict(\s|$)/.test(cmd) });
  if (drift) {
    if (!drift.findings.length) drift.notes.push(`${key}: every operation of ${rel} is served by the backend code.`);
    return { failures: drift.findings, notes: drift.notes };
  }
  if (res.status === 0) return { failures: [], notes: [] };
  const output = `${res.stdout}\n${res.stderr}`.trim();
  return {
    failures: [`check '${key}' failed (exit ${res.status}):\n${output.length > 3000 ? '...' + output.slice(-3000) : output}`],
    notes: [],
  };
}
