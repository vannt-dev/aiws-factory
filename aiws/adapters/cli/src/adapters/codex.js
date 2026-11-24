import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AiwsError, runShell } from '../util.js';
import { usageLimit, shellCommand } from './claude.js';
import { generatedNote, hasLocalCli, instructions, localCliFrom, removeStale, syncSkills, writeText } from './shared.js';
import { PKG_ROOT } from '../workspace.js';

/** The items of `codex exec --json` that are tool calls a PreToolUse hook sees. */
const TOOL_ITEMS = new Set(['command_execution', 'file_change', 'mcp_tool_call']);
/** What tells this workspace's entry in `.codex/hooks.json` from the entries of others. */
const HOOK_MARK = 'guard --from codex';

/**
 * Runs an agent through the Codex CLI (`codex exec`), headless. Meant for one phase at a time, for example
 * `runtime.yaml -> phases.review.adapter: codex`, so that the review is made by another model than the
 * code. The prompt goes through stdin; the final answer is read from the file `-o` writes.
 *
 * What is different from the Claude adapter, and why:
 *  - no tool whitelist: Codex has no per-tool permission list. The sandbox is the limit
 *    (`read-only` for an agent whose contract has no write tool, `workspace-write` otherwise), and
 *    diff-scope still reverts anything written outside the phase's scope after the run;
 *  - no guard hook: the `aiws guard` hook is a Claude Code hook. Under Codex a run is enforced by the
 *    sandbox and diff-scope only, so a phase whose contract has `bash` is refused;
 *  - no cost: Codex reports tokens, not USD. `cost_usd` stays null, so such runs do not count
 *    against the budget of a requirement.
 */
export function preflight(ws) {
  const bin = ws.runtime.codex?.command ?? 'codex';
  if (runShell(`${bin} --version`, { cwd: ws.root }).status !== 0) {
    throw new AiwsError(
      `The codex adapter needs the Codex CLI: \`${bin} --version\` does not run. Install it, or set \`codex.command\` in aiws/config/runtime.yaml.`
    );
  }
}

/** The Codex model of a run: `codex.phase_models.<phase>`, then `codex.agent_models.<agent>`, then `codex.models.<model_hint>`. */
export function modelFor(ws, agent, phase = null) {
  const cfg = ws.runtime.codex ?? {};
  const own = (phase && cfg.phase_models?.[phase]) || cfg.agent_models?.[agent.id];
  if (own) return own;
  return agent.model_hint ? (cfg.models?.[agent.model_hint] ?? null) : null;
}

function quoteArg(a) {
  return `"${String(a).replace(/"/g, '\\"')}"`;
}

export function runAgent(ws, { prompt, env, contract, agent }) {
  const cfg = ws.runtime.codex ?? {};
  const bin = cfg.command ?? 'codex';
  const tools = contract.tools ?? ['read'];
  const guarded = Boolean(cfg.guard_hook);
  const refuse = (stderr) => ({ ok: false, exitCode: 1, raw: '', stderr, report: { is_error: true, result: '' } });
  if (tools.includes('bash') && !guarded) {
    return refuse(
      `codex adapter: the contract of ${agent.id} allows a shell, which this adapter cannot limit to the project's commands without its guard hook. Use it for phases without 'bash' (review, analysis), or set codex.guard_hook: true in aiws/config/runtime.yaml and run \`aiws sync codex\`.`
    );
  }
  if (guarded && !hookSynced(ws)) {
    return refuse('codex adapter: codex.guard_hook is on but .codex/hooks.json has no aiws guard hook: run `aiws sync codex`.');
  }
  const writes = !contract.read_only && tools.some((t) => t === 'write' || t === 'edit');
  const lastMessage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aiws-codex-')), 'last-message.txt');
  // the guard counts its calls here: a run that used tools while this stays empty ran without the guard
  const canary = path.join(path.dirname(lastMessage), 'hook-calls.txt');
  const args = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '-C',
    ws.root,
    '-s',
    writes ? 'workspace-write' : 'read-only',
    '-o',
    lastMessage,
  ];
  const model = modelFor(ws, agent, env.AIWS_PHASE);
  if (model) args.push('-m', model);
  // aiws wrote the hook itself (`aiws sync codex`), so it runs without the trust Codex stores for hooks
  if (guarded) args.push('--dangerously-bypass-hook-trust');
  for (const extra of cfg.extra_args ?? []) args.push(extra);
  args.push('-'); // the prompt comes on stdin

  const cmdline = [bin, ...args.map(quoteArg)].join(' ');
  const started = Date.now();
  const res = spawnSync(cmdline, {
    cwd: ws.root,
    env: guarded ? { ...env, AIWS_HOOK_CANARY: canary } : env,
    input: prompt,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    timeout: (cfg.timeout_minutes ?? 30) * 60 * 1000,
  });
  const raw = res.stdout ?? '';
  const stderr = (res.stderr ?? '') + (res.error ? String(res.error) : '');
  let final = '';
  let hookCalls = 0;
  try {
    final = fs.readFileSync(lastMessage, 'utf8');
  } catch {
    // no final message: the run failed before it answered
  }
  try {
    hookCalls = fs.readFileSync(canary, 'utf8').split('\n').filter(Boolean).length;
  } catch {
    // no hook call at all
  } finally {
    fs.rmSync(path.dirname(lastMessage), { recursive: true, force: true });
  }
  const report = parse(raw, final);
  let unguarded = '';
  if (guarded && report.tool_calls > 0 && hookCalls === 0) {
    unguarded = `codex adapter: the aiws guard hook did not run in this codex run (${report.tool_calls} tool calls, 0 hook calls); its work is not trusted. Check that this Codex version runs project hooks under \`codex exec\`.\n`;
    report.is_error = true;
    report.error = report.error ?? 'the aiws guard hook did not run';
  }
  const ok = res.status === 0 && !report.is_error;
  return {
    ok,
    exitCode: res.status,
    stderr: unguarded + stderr,
    usageLimit: ok ? null : (usageLimit(report.result) ?? usageLimit(stderr) ?? usageLimit(report.error)),
    raw,
    report,
    command: cmdline,
    allowedTools: null,
    durationMs: Date.now() - started,
  };
}

/**
 * The evidence report from the JSONL events of `codex exec --json` and the final message. Only what the
 * evidence needs is kept: the answer, the model and the token counts; an `error` event marks the run failed.
 */
export function parse(raw, finalMessage = '') {
  let model = null;
  let usage = null;
  let error = null;
  let lastAgentMessage = '';
  let toolCalls = 0;
  const toolIds = new Set();
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const type = ev.type ?? ev.msg?.type ?? '';
    if (type === 'thread.started' || type === 'session_configured') model = ev.model ?? ev.msg?.model ?? model;
    if (type === 'turn.completed' || type === 'token_count') usage = ev.usage ?? ev.msg?.info?.total_token_usage ?? usage;
    if (type === 'error' || type === 'turn.failed') error = ev.message ?? ev.error?.message ?? ev.msg?.message ?? 'codex reported an error';
    if (type === 'item.completed' && ev.item?.type === 'agent_message') lastAgentMessage = ev.item.text ?? lastAgentMessage;
    if (type === 'agent_message') lastAgentMessage = ev.msg?.message ?? lastAgentMessage;
    // the calls a PreToolUse hook sees: shell commands and file edits (MCP tools as well)
    if ((type === 'item.started' || type === 'item.completed') && TOOL_ITEMS.has(ev.item?.type)) {
      if (ev.item.id) toolIds.add(ev.item.id);
      else if (type === 'item.completed') toolCalls++;
    }
  }
  const result = (finalMessage || lastAgentMessage || '').trim();
  return {
    is_error: Boolean(error),
    error,
    result,
    num_turns: null,
    cost_usd: null,
    session_id: null,
    model,
    tokens: usage,
    tool_calls: toolCalls + toolIds.size,
  };
}

export { shellCommand };

const BEGIN = '# aiws:begin (written by `aiws sync codex`; edit aiws/ and re-sync)';
const END = '# aiws:end';

/**
 * Generates what Codex reads of a project, from aiws/: one agent an agent in `.codex/agents/<id>.toml`, named in
 * a block of `.codex/config.toml` that leaves the rest of that file alone, and the skills under
 * `.agents/skills/`. Codex reads AGENTS.md by itself.
 *
 * An agent whose contract has no write tool runs in the read-only sandbox. Without `codex.guard_hook` there is no
 * guard hook under Codex: the sandbox and `aiws check diff-scope` are what checks a run.
 */
export function sync(ws) {
  const written = [];
  const dir = path.join(ws.root, '.codex', 'agents');
  const ids = ws.listAgents();
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.toml')) : [];
  removeStale(
    existing.filter((f) => !ids.includes(f.slice(0, -5))).map((f) => path.join(dir, f)),
    'codex'
  );
  const blocks = [];
  for (const id of ids) {
    const a = ws.agent(id);
    const tools = a.tools ?? ['read'];
    const readOnly = !tools.some((t) => t === 'write' || t === 'edit');
    const lines = [
      `# ${generatedNote('codex')}`,
      ...(readOnly ? ['sandbox_mode = "read-only"'] : []),
      `developer_instructions = ${tomlText(instructions(ws, a, { guarded: false }))}`,
    ];
    writeText(path.join(dir, `${id}.toml`), lines.join('\n') + '\n');
    written.push(`.codex/agents/${id}.toml`);
    blocks.push(`[agents.${id}]\ndescription = ${JSON.stringify(a.description ?? id)}\nconfig_file = "agents/${id}.toml"\n`);
  }
  written.push(...syncSkills(ws));

  const file = path.join(ws.root, '.codex', 'config.toml');
  const block = `${BEGIN}\n${blocks.join('\n')}${END}\n`;
  let config = '';
  try {
    config = fs.readFileSync(file, 'utf8');
  } catch {
    // no config yet
  }
  const from = config.indexOf(BEGIN);
  const to = config.indexOf(END, from);
  if (from >= 0 && to >= 0) config = config.slice(0, from) + block + config.slice(to + END.length).replace(/^\r?\n/, '');
  else config = config === '' ? block : `${config.replace(/\s*$/, '')}\n\n${block}`;
  writeText(file, config);
  written.push('.codex/config.toml');
  written.push(...syncHook(ws));
  return written;
}

/**
 * With `codex.guard_hook: true`, a PreToolUse entry in `.codex/hooks.json` that asks `aiws guard --from codex`
 * about every tool call; without it, that entry is taken out. The entries of others stay as they are.
 */
function syncHook(ws) {
  const file = path.join(ws.root, '.codex', 'hooks.json');
  const on = Boolean(ws.runtime.codex?.guard_hook);
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // no file yet, or one that is not JSON: written anew when the hook is on
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    if (!on) return [];
    doc = {};
  }
  const hooks = doc.hooks && typeof doc.hooks === 'object' && !Array.isArray(doc.hooks) ? doc.hooks : {};
  const before = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const others = before.filter((entry) => !JSON.stringify(entry).includes(HOOK_MARK));
  if (!on && others.length === before.length) return [];
  const own = { matcher: '', hooks: [{ type: 'command', command: guardCommand(ws), timeout: 30, statusMessage: 'aiws guard' }] };
  const pre = on ? [...others, own] : others;
  if (pre.length > 0) hooks.PreToolUse = pre;
  else delete hooks.PreToolUse;
  doc.hooks = hooks;
  writeText(file, JSON.stringify(doc, null, 2) + '\n');
  return ['.codex/hooks.json'];
}

/** Codex starts a hook in the session's folder, the workspace root; outside a workspace that carries the CLI, this CLI. */
export function guardCommand(ws) {
  const bin = hasLocalCli(ws) ? localCliFrom(0) : `"${path.join(PKG_ROOT, 'bin', 'aiws.js').replace(/\\/g, '/')}"`;
  return `node ${bin} ${HOOK_MARK}`;
}

function hookSynced(ws) {
  try {
    return fs.readFileSync(path.join(ws.root, '.codex', 'hooks.json'), 'utf8').includes(HOOK_MARK);
  } catch {
    return false;
  }
}

/** A multi-line TOML string: literal when the text allows it, otherwise basic with its escapes. */
function tomlText(text) {
  if (!text.includes("'''")) return `'''\n${text}'''`;
  return `"""\n${text.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}"""`;
}
