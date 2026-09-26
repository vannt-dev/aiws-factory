import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, readYaml, writeYaml, hashFile, nowIso, pad, run } from './util.js';

/** `aiws` subcommands only a human may run (they decide gates). Everything else may be driven by an assistant. */
export const HUMAN_ONLY_COMMANDS = ['approve', 'reject', 'answer', 'redesign', 'resume', 'unlock'];

/** True when a bash_denylist entry such as "aiws approve" names a human-only command. */
export function isHumanOnlyEntry(entry) {
  const m = /^aiws\s+(\S+)/.exec(String(entry).trim());
  return Boolean(m && HUMAN_ONLY_COMMANDS.includes(m[1]));
}

const AI_SESSION_VARS = ['AIWS_PHASE', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_SANDBOX', 'GEMINI_CLI'];

/** True when the current process looks like it was started from inside an AI agent session. */
export function inAiSession(env = process.env) {
  return AI_SESSION_VARS.some((v) => env[v]);
}

/** Human-only commands refuse to run inside an AI session and need an interactive confirmation or --yes. */
export async function requireHuman(action, req, { yes = false } = {}) {
  if (inAiSession()) {
    throw new AiwsError(`'${action}' is a human-only command and refuses to run inside an AI session.`, 3);
  }
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new AiwsError(`'${action}' needs an interactive terminal (or pass --yes when you are sure a human runs it).`, 3);
  }
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type ${req} to confirm '${action}': `);
  rl.close();
  if (answer.trim() !== req) throw new AiwsError('Confirmation did not match; nothing changed.', 3);
}

export function currentUser(root) {
  if (process.env.AIWS_USER) return process.env.AIWS_USER;
  const res = run('git', ['config', 'user.name'], { cwd: root });
  return res.stdout.trim() || process.env.USERNAME || process.env.USER || 'unknown';
}

function approvalsDir(ws, req) {
  return path.join(ws.workDir(req), 'approvals');
}

export function listApprovals(ws, req, gate) {
  const dir = approvalsDir(ws, req);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => new RegExp(`^${gate}-\\d+\\.yaml$`).test(f))
    .sort()
    .map((f) => ({ file: path.join(dir, f), name: f, ...readYaml(path.join(dir, f)) }));
}

export function hashArtifacts(ws, req, artifacts) {
  const out = {};
  for (const a of artifacts ?? []) {
    const abs = path.join(ws.workDir(req), a);
    if (!fs.existsSync(abs)) throw new AiwsError(`Cannot hash missing artifact ${ws.workRel(req, a)}`);
    out[a] = hashFile(abs);
  }
  return out;
}

/** Writes approvals/<gate>-NN.yaml (never overwrites). Returns the repo-relative path. */
export function recordApproval(ws, req, { gate, decision, by, notes, artifacts }) {
  const existing = listApprovals(ws, req, gate);
  const nn = pad(existing.length + 1);
  const file = path.join(approvalsDir(ws, req), `${gate}-${nn}.yaml`);
  if (fs.existsSync(file)) throw new AiwsError(`Approval ${file} already exists`);
  const record = { gate, decision, by, at: nowIso() };
  if (artifacts) record.artifacts = artifacts;
  if (notes) record.notes = notes;
  writeYaml(file, record);
  return ws.workRel(req, `approvals/${gate}-${nn}.yaml`);
}

/**
 * Checks that the latest design approval is 'approved' and that the approved artifacts are unchanged.
 * Returns {valid, reason}.
 */
export function designApprovalStatus(ws, req, artifacts) {
  const list = listApprovals(ws, req, 'design');
  const last = list.at(-1);
  if (!last) return { valid: false, reason: 'design has not been approved' };
  if (last.decision !== 'approved') return { valid: false, reason: `latest design decision is '${last.decision}'` };
  for (const a of artifacts ?? []) {
    const abs = path.join(ws.workDir(req), a);
    const now = fs.existsSync(abs) ? hashFile(abs) : null;
    if (now !== last.artifacts?.[a]) return { valid: false, reason: `${a} changed after approval ${last.name}` };
  }
  return { valid: true, approval: last };
}
