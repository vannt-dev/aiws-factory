import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, readYaml, writeYaml, nowIso, pad } from './util.js';

export const STATUSES = ['running', 'waiting_human', 'blocked', 'done'];

export function statePath(ws, req) {
  return path.join(ws.workDir(req), 'state.yaml');
}

export function loadState(ws, req) {
  const st = readYaml(statePath(ws, req));
  if (!st) throw new AiwsError(`${req} does not exist. Create it with \`aiws new ${req}\`.`);
  st.history ??= [];
  st.tasks ??= [];
  st.feedback ??= [];
  st.attempts ??= {};
  st.last_failure ??= {};
  return st;
}

export function saveState(ws, st) {
  writeYaml(statePath(ws, st.req_id), orderState(st));
}

// Keep the human-readable fields at the top of state.yaml.
function orderState(st) {
  const keys = ['req_id', 'title', 'requirement', 'branch', 'base_branch', 'base_commit', 'phase', 'status', 'reason'];
  const out = {};
  for (const k of keys) if (st[k] !== undefined) out[k] = st[k];
  for (const [k, v] of Object.entries(st)) if (!(k in out)) out[k] = v;
  return out;
}

export function addHistory(st, entry) {
  st.history.push({ ...entry, at: nowIso() });
}

export function setPhase(st, phase, status = 'running', reason) {
  st.phase = phase;
  st.status = status;
  if (reason) st.reason = reason;
  else delete st.reason;
}

export function nextRunId(st) {
  st.run_seq = (st.run_seq ?? 0) + 1;
  return `run-${pad(st.run_seq, 4)}`;
}

/** Feedback (rejections, answers, review findings) waiting to be shown to the agent of `phase`. */
export function feedbackFor(st, phase) {
  return st.feedback.filter((f) => f.phase === phase);
}

export function addFeedback(st, phase, source, text) {
  st.feedback.push({ phase, source, text, at: nowIso() });
}

export function listReqs(ws) {
  const dir = path.join(ws.aiwsDir, 'work');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'state.yaml')))
    .sort();
}
