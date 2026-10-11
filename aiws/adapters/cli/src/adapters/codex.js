import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AiwsError, runShell } from '../util.js';
import { usageLimit, shellCommand } from './claude.js';

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

export function sync() {
  return [];
}
