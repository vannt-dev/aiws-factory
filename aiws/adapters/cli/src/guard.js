import fs from 'node:fs';
import path from 'node:path';
import { toRepoRel } from './util.js';
import { matcher, writeScope, orchestratorPaths } from './scope.js';
import { currentBranch } from './git.js';
import { loadState } from './state.js';
import { hardProtected } from './adapters/claude.js';
import { isHumanOnlyEntry } from './gate.js';

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read']);
// Claude Code on Windows also has a PowerShell tool; it gets the same command checks as Bash.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/**
 * Works out which REQ / phase / task the current session acts for.
 * Env vars set by the orchestrator win; otherwise the aiws/REQ-xxx branch + state.yaml.
 * Returns null when the session is not working on any REQ (plain maintainer session).
 */
export function resolveContext(ws, env = process.env) {
  if (env.AIWS_PHASE) {
    return { req: env.AIWS_REQ ?? null, phase: env.AIWS_PHASE, taskId: env.AIWS_TASK ?? null, source: 'env', status: 'running' };
  }
  const branch = currentBranch(ws.root);
  const m = /^aiws\/(REQ-[A-Za-z0-9_-]+?)(-knowledge)?$/.exec(branch ?? '');
  if (!m) return null;
  let st;
  try {
    st = loadState(ws, m[1]);
  } catch {
    return null;
  }
  const running = (st.tasks ?? []).find((t) => t.status === 'running');
  return { req: st.req_id, phase: st.phase, taskId: running?.id ?? null, source: 'branch', status: st.status, state: st };
}

function taskOf(ws, ctx) {
  if (!ctx.taskId) return null;
  const st = ctx.state ?? safeState(ws, ctx.req);
  return st?.tasks?.find((t) => t.id === ctx.taskId) ?? null;
}

function safeState(ws, req) {
  try {
    return loadState(ws, req);
  } catch {
    return null;
  }
}

/** Decides one tool call. Returns {allow: true} or {allow: false, reason}. */
export function decide(ws, input, env = process.env) {
  const tool = input.tool_name;
  const ti = input.tool_input ?? {};
  const pol = ws.policies;

  if (SHELL_TOOLS.has(tool)) return decideBash(pol, ti.command ?? '', { inPhase: Boolean(resolveContext(ws, env)) });

  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (!target) return { allow: true };
  const rel = toRepoRel(ws.root, path.resolve(input.cwd ?? ws.root, target));

  if (READ_TOOLS.has(tool)) {
    if (rel && matcher(pol.read_deny)(rel)) return deny(`reading ${rel} is forbidden by read_deny (secrets)`);
    return { allow: true };
  }
  if (!WRITE_TOOLS.has(tool)) return { allow: true };

  const ctx = resolveContext(ws, env);
  if (!ctx) {
    if (rel && matcher(hardProtected(pol))(rel)) return deny(`${rel} is protected (policies.yaml protected_paths)`);
    return { allow: true };
  }
  if (!rel) return deny(`writing outside the workspace (${target}) is not allowed during ${ctx.req} ${ctx.phase}`);
  if (matcher(pol.protected_paths)(rel)) return deny(`${rel} is protected; agents may never write it`);
  if (ctx.status !== 'running') {
    return deny(
      `${ctx.req} is '${ctx.status}' in phase ${ctx.phase}; no agent writes are allowed until a human acts (aiws status ${ctx.req})`
    );
  }
  const task = taskOf(ws, ctx);
  const scope = [...writeScope(pol, ctx.phase, { req: ctx.req, task }), ...orchestratorPaths(ctx.req ?? '*')];
  if (!matcher(scope)(rel)) {
    return deny(
      `${rel} is outside the write scope of phase '${ctx.phase}'${task ? ` task ${task.id}` : ''}. Allowed: ${scope.join(', ') || '(nothing)'}. ` +
        'If the design or task scope is wrong, stop and write your question to the work dir questions.md.'
    );
  }
  return { allow: true };
}

function deny(reason) {
  return { allow: false, reason: `AIWS guard: ${reason}` };
}

/** Normalises a shell command so nested / quoted / path-prefixed forms can be matched. */
export function normalizeCommand(cmd) {
  const flat = String(cmd)
    .replace(/\\\r?\n/g, ' ')
    .replace(/["'`\\]/g, ' ')
    .replace(/\$\(/g, ' ; ')
    .replace(/[;&|(){}\r\n]+/g, ' ; ')
    .toLowerCase();
  const tokens = flat
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const base = t.split(/[\\/]/).pop();
      if (/^aiws(\.js|\.cmd|\.ps1)?$/.test(base)) return 'aiws';
      if (/^git(\.exe)?$/.test(base)) return 'git';
      return t;
    });
  // drop "node" directly in front of aiws so `node .../aiws.js approve` == `aiws approve`
  const out = tokens.filter((t, i) => !(t === 'node' && tokens[i + 1] === 'aiws'));
  return collapseGitOptions(out).join(' ');
}

// `git -C dir -c k=v push` -> `git push`
function collapseGitOptions(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    out.push(tokens[i]);
    if (tokens[i] !== 'git') continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith('-')) {
      // tokens are lower-cased, so -C and -c both appear as '-c'; both take a value
      j += ['-c', '--git-dir', '--work-tree', '--namespace'].includes(tokens[j]) ? 2 : 1;
    }
    i = j - 1;
  }
  return out;
}

/**
 * Shell command check. Inside a REQ phase the whole bash_denylist applies (so an agent can neither
 * run git nor start a nested `aiws run`). In a plain maintainer session only the human-only gate
 * commands stay blocked: an assistant may drive `aiws new` / `aiws run`, but never approve.
 * Secret paths are blocked everywhere.
 */
export function decideBash(pol, command, { inPhase = true } = {}) {
  const norm = ` ${normalizeCommand(command)} `;
  for (const entry of pol.bash_denylist ?? []) {
    const e = normalizeCommand(entry);
    if (!e) continue;
    if (!inPhase && !isHumanOnlyEntry(e)) continue;
    const re = new RegExp(`(^|\\s|;)${escapeRe(e)}(?=\\s|;|$)`);
    if (re.test(norm)) return deny(`command matches bash_denylist entry '${entry}'`);
  }
  const readDeny = matcher(pol.read_deny);
  for (const tok of norm.split(/[\s;<>]+/).filter(Boolean)) {
    const t = tok.replace(/^\.\//, '');
    if (readDeny(t) || readDeny(path.posix.basename(t))) return deny(`command references a secret path (${tok}) blocked by read_deny`);
  }
  return { allow: true };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hook entry point: reads the tool call JSON from stdin, exits 2 with a reason to block. */
export async function runHook(ws, { bash = false } = {}) {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    return failClosed('could not parse hook input');
  }
  if (bash && !SHELL_TOOLS.has(input.tool_name)) input.tool_name = 'Bash';
  try {
    const d = decide(ws, input);
    if (d.allow) return 0;
    process.stderr.write(d.reason + '\n');
    return 2;
  } catch (e) {
    return failClosed(e.message);
  }
}

// Inside an orchestrated run we fail closed; in a maintainer session a guard bug must not brick the editor.
function failClosed(msg) {
  process.stderr.write(`AIWS guard error: ${msg}\n`);
  return process.env.AIWS_PHASE ? 2 : 0;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

export function hookFileExists(root) {
  return fs.existsSync(path.join(root, '.claude', 'settings.json'));
}
