import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AiwsError, runShell } from '../util.js';
import { usageLimit, shellCommand } from './claude.js';
import { generatedNote, instructions, removeStale, syncSkills, writeText } from './shared.js';

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
  if (tools.includes('bash')) {
    return {
      ok: false,
      exitCode: 1,
      raw: '',
      stderr: `codex adapter: the contract of ${agent.id} allows a shell, which this adapter cannot limit to the project's commands. Use it for phases without 'bash' (review, analysis).`,
      report: { is_error: true, result: '' },
    };
  }
  const writes = tools.some((t) => t === 'write' || t === 'edit');
  const lastMessage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aiws-codex-')), 'last-message.txt');
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
  for (const extra of cfg.extra_args ?? []) args.push(extra);
  args.push('-'); // the prompt comes on stdin

  const cmdline = [bin, ...args.map(quoteArg)].join(' ');
  const started = Date.now();
  const res = spawnSync(cmdline, {
    cwd: ws.root,
    env,
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
  try {
    final = fs.readFileSync(lastMessage, 'utf8');
  } catch {
    // no final message: the run failed before it answered
  } finally {
    fs.rmSync(path.dirname(lastMessage), { recursive: true, force: true });
  }
  const report = parse(raw, final);
  const ok = res.status === 0 && !report.is_error;
  return {
    ok,
    exitCode: res.status,
    stderr,
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
 * An agent whose contract has no write tool runs in the read-only sandbox. There is no guard hook under Codex:
 * the sandbox and `aiws check diff-scope` are what checks a run.
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
  return written;
}

/** A multi-line TOML string: literal when the text allows it, otherwise basic with its escapes. */
function tomlText(text) {
  if (!text.includes("'''")) return `'''\n${text}'''`;
  return `"""\n${text.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}"""`;
}
