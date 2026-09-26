import fs from 'node:fs';
import YAML from 'yaml';
import { fill, readTextIfExists } from './util.js';
import { matcher } from './scope.js';
import * as P from './parse.js';

/**
 * Validates a phase's outputs against its contract.
 * Returns {ok, errors: [{kind, message}]} where kind is:
 *   'invalid'      - fix and retry (sent back to the agent)
 *   'needs_human'  - blocking questions; wait for `aiws answer`
 *   'critical'     - open critical review findings; route via on_critical
 */
export function validateOutputs(ws, contract, { req, task } = {}) {
  const errors = [];
  const vars = { req, task: task?.id };
  const read = (rel) => readTextIfExists(ws.abs(fill(rel, vars)));

  for (const out of contract.outputs ?? []) {
    const rel = fill(out.path, vars);
    const text = read(rel);
    if (text === null || !text.trim()) {
      errors.push({ kind: 'invalid', message: `Missing required output ${rel}` });
      continue;
    }
    if (out.required_headings) {
      const missing = P.missingHeadings(text, out.required_headings);
      if (missing.length) errors.push({ kind: 'invalid', message: `${rel} is missing headings: ${missing.join(', ')}` });
    }
    if (out.format === 'yaml' || out.format === 'openapi') {
      try {
        const data = YAML.parse(text);
        if (out.format === 'openapi' && !isOpenApi(data)) {
          errors.push({ kind: 'invalid', message: `${rel} is not a valid OpenAPI document (needs 'openapi' version and 'paths' map)` });
        }
      } catch (e) {
        errors.push({ kind: 'invalid', message: `${rel} is not valid YAML: ${e.message.split('\n')[0]}` });
      }
    }
  }

  const ctx = { ws, req, task, read, work: (f) => read(ws.workRel(req, f)) };
  for (const name of contract.rules ?? []) {
    const rule = RULES[name];
    if (!rule) {
      errors.push({ kind: 'invalid', message: `Unknown contract rule '${name}'` });
      continue;
    }
    errors.push(...(rule(ctx) ?? []));
  }
  return { ok: errors.length === 0, errors };
}

function isOpenApi(d) {
  return d && typeof d === 'object' && /^3\./.test(String(d.openapi ?? '')) && d.paths && typeof d.paths === 'object';
}

const invalid = (message) => ({ kind: 'invalid', message });

export const RULES = {
  ac_numbered({ work }) {
    const ids = P.acceptanceCriteria(work('01-analysis.md'));
    if (!ids.length) return [invalid('01-analysis.md defines no acceptance criteria (expected list items "- AC-1: ...")')];
    const expected = ids.map((_, i) => `AC-${i + 1}`);
    if (ids.join() !== expected.join())
      return [invalid(`Acceptance criteria must be numbered AC-1..AC-${ids.length} in order; found ${ids.join(', ')}`)];
    return [];
  },

  no_blocking_questions({ work }) {
    const open = P.blockingQuestions(work('01-analysis.md'));
    return open.map((q) => ({ kind: 'needs_human', message: `Blocking question: ${q}` }));
  },

  every_ac_has_tc({ work }) {
    const acs = P.acceptanceCriteria(work('01-analysis.md'));
    const tcs = P.testCases(work('03-test-spec.md'));
    const errs = [];
    if (!tcs.length) errs.push(invalid('03-test-spec.md defines no test cases (expected "### TC-1: ..." headings)'));
    for (const ac of acs) {
      if (!tcs.some((t) => t.covers.includes(ac))) errs.push(invalid(`${ac} has no test case in 03-test-spec.md`));
    }
    for (const t of tcs) {
      if (!t.covers.length) errs.push(invalid(`${t.id} has no 'covers:' line`));
      for (const ac of t.covers) if (!acs.includes(ac)) errs.push(invalid(`${t.id} covers unknown ${ac}`));
    }
    const dup = tcs.map((t) => t.id).filter((id, i, a) => a.indexOf(id) !== i);
    if (dup.length) errs.push(invalid(`Duplicate test case ids: ${[...new Set(dup)].join(', ')}`));
    return errs;
  },

  plan_valid({ ws, work }) {
    return validatePlan(ws, work('04-plan.yaml'), P.testCases(work('03-test-spec.md'))).map(invalid);
  },

  review_no_open_critical({ work }) {
    return P.reviewFindings(work('05-review.md'))
      .filter((f) => f.severity === 'critical' && !f.resolved)
      .map((f) => ({ kind: 'critical', message: f.text }));
  },
};

// commitlint config-conventional types
export const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'build', 'ci', 'chore', 'revert'];

export function loadPlan(text) {
  const data = YAML.parse(text ?? '') ?? {};
  return Array.isArray(data.tasks) ? data.tasks : [];
}

/** Returns a list of problems with 04-plan.yaml (empty when valid). */
export function validatePlan(ws, text, testCases) {
  if (text === null || text === undefined) return ['04-plan.yaml is missing'];
  let tasks;
  try {
    tasks = loadPlan(text);
  } catch (e) {
    return [`04-plan.yaml is not valid YAML: ${e.message.split('\n')[0]}`];
  }
  const errs = [];
  if (!tasks.length) errs.push('04-plan.yaml has no tasks');
  const pol = ws.policies;
  const maxFiles = pol.limits?.max_files_per_task ?? 10;
  const isProtected = matcher(pol.protected_paths);
  const inSource = matcher(pol.source_paths ?? ['**']);
  const ids = new Set();
  for (const t of tasks) {
    const id = t?.id;
    if (!id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
      errs.push(`Task has invalid id '${id}'`);
      continue;
    }
    if (ids.has(id)) errs.push(`Duplicate task id ${id}`);
    ids.add(id);
    const files = t.allowed_files ?? [];
    if (!Array.isArray(files) || !files.length) errs.push(`${id}: allowed_files is empty`);
    else {
      if (files.length > maxFiles) errs.push(`${id}: ${files.length} allowed_files exceeds limit ${maxFiles}; split the task`);
      for (const f of files) {
        if (isProtected(f)) errs.push(`${id}: allowed file ${f} is protected`);
        else if (!inSource(f)) errs.push(`${id}: allowed file ${f} is outside source_paths`);
      }
    }
    if (!Array.isArray(t.tests)) errs.push(`${id}: 'tests' must be a list of TC ids`);
    if (t.type !== undefined && !COMMIT_TYPES.includes(t.type)) {
      errs.push(`${id}: type '${t.type}' is not a Conventional Commits type (${COMMIT_TYPES.join(', ')})`);
    }
  }
  for (const t of tasks) {
    for (const d of t.depends_on ?? []) if (!ids.has(d)) errs.push(`${t.id}: depends_on unknown task ${d}`);
  }
  if (hasCycle(tasks)) errs.push('Task dependencies contain a cycle');
  const known = new Set(testCases.map((t) => t.id));
  const assigned = new Map();
  for (const t of tasks)
    for (const tc of t.tests ?? []) {
      if (!known.has(tc)) errs.push(`${t.id}: test ${tc} is not defined in 03-test-spec.md`);
      assigned.set(tc, (assigned.get(tc) ?? 0) + 1);
    }
  for (const tc of known) if (!assigned.has(tc)) errs.push(`${tc} is not assigned to any task`);
  return errs;
}

function hasCycle(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, t.depends_on ?? []]));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return tasks.some((t) => visit(t.id));
}

export function fileExists(ws, rel) {
  return fs.existsSync(ws.abs(rel));
}
