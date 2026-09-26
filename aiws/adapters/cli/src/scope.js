import picomatch from 'picomatch';
import { fill } from './util.js';

const NOCASE = process.platform === 'win32';

export function matcher(patterns) {
  const list = (patterns ?? []).filter(Boolean);
  if (list.length === 0) return () => false;
  const m = picomatch(list, { dot: true, nocase: NOCASE });
  return (file) => m(file);
}

export function matchesAny(file, patterns) {
  return matcher(patterns)(file);
}

/** Paths that the orchestrator itself writes during a run; never counted as agent violations. */
export function orchestratorPaths(req) {
  return [`aiws/work/${req}/evidence/runs/**`];
}

/**
 * Resolves the write scope of a phase for a REQ (and task, in implementation).
 * `{task.allowed_files}` expands to the task's allowed file list.
 */
export function writeScope(policies, phase, { req, task } = {}) {
  const raw = policies.phase_write_scope?.[phase] ?? [];
  const out = [];
  for (const pattern of raw) {
    if (pattern === '{task.allowed_files}') {
      out.push(...(task?.allowed_files ?? []));
    } else {
      out.push(fill(pattern, { req, task: task?.id }));
    }
  }
  return out;
}

/**
 * Splits changed files into allowed and violations for one run.
 * Protected paths are always violations, even if a write scope matches them.
 */
export function classify(files, { allowed, protectedPaths, ignore = [] }) {
  const isAllowed = matcher(allowed);
  const isProtected = matcher(protectedPaths);
  const isIgnored = matcher(ignore);
  const result = { allowed: [], violations: [] };
  for (const f of files) {
    if (isIgnored(f)) continue;
    if (isProtected(f) || !isAllowed(f)) result.violations.push(f);
    else result.allowed.push(f);
  }
  return result;
}
