import fs from 'node:fs';
import path from 'node:path';
import { generatedNote, hasLocalCli, instructions, interactiveOnly, removeStale, syncSkills, writeText } from './shared.js';

const TARGET = 'opencode';

/**
 * Generates what OpenCode reads of a project, from aiws/: one subagent an agent under `.opencode/agents/`, the
 * skills under `.agents/skills/`, and a plugin under `.opencode/plugins/` that asks `aiws guard` before a file
 * is read or written and before a command runs. OpenCode reads AGENTS.md by itself.
 *
 * An agent's `permission` follows its contract: it may edit when the contract has a write tool, and a shell is
 * asked about when the contract has one and denied otherwise. The write scope of a phase is the guard's.
 */
export function sync(ws) {
  const written = [];
  const dir = path.join(ws.root, '.opencode', 'agents');
  const ids = ws.listAgents();
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  removeStale(
    existing.filter((f) => !ids.includes(f.slice(0, -3))).map((f) => path.join(dir, f)),
    TARGET
  );
  for (const id of ids) {
    const a = ws.agent(id);
    const tools = a.tools ?? ['read'];
    const front = [
      '---',
      `description: ${JSON.stringify(a.description ?? id)}`,
      'mode: subagent',
      'permission:',
      `  edit: ${tools.some((t) => t === 'write' || t === 'edit') ? 'allow' : 'deny'}`,
      `  bash: ${tools.includes('bash') ? 'ask' : 'deny'}`,
      '---',
    ];
    writeText(path.join(dir, `${id}.md`), `${front.join('\n')}\n<!-- ${generatedNote(TARGET)} -->\n\n${instructions(ws, a)}`);
    written.push(`.opencode/agents/${id}.md`);
  }
  written.push(...syncSkills(ws));
  writeText(path.join(ws.root, '.opencode', 'plugins', 'aiws-guard.js'), plugin(ws));
  written.push('.opencode/plugins/aiws-guard.js');
  return written;
}

/**
 * The plugin: OpenCode's tool call in the words `aiws guard` reads, and a refusal thrown as OpenCode expects.
 * It finds the workspace by its own place in it, and runs the workspace's own CLI when there is one.
 */
function plugin(ws) {
  // `node`, by name: a plugin runs inside OpenCode, whose own executable is not Node
  const command = hasLocalCli(ws) ? '\'node "\' + join(ROOT, "aiws/adapters/cli/bin/aiws.js") + \'" guard\'' : '"aiws guard"';
  return `// ${generatedNote(TARGET)}
//
// Before OpenCode reads or writes a file, or runs a command, \`aiws guard\` is asked: the same rules as under
// Claude Code (the write scope of the phase, protected paths, secrets, commands only a human runs).
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// \`.opencode/plugins/\` is two folders below the workspace root, wherever OpenCode was started.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMAND = process.env.AIWS_GUARD_COMMAND || ${command};

// OpenCode's tool, as the tool and the arguments the guard reads.
const REQUESTS = {
  bash: (args) => ({ tool_name: "Bash", tool_input: { command: String(args.command ?? "") } }),
  read: (args) => ({ tool_name: "Read", tool_input: { file_path: args.filePath ?? args.path } }),
  edit: (args) => ({ tool_name: "Edit", tool_input: { file_path: args.filePath ?? args.path } }),
  write: (args) => ({ tool_name: "Write", tool_input: { file_path: args.filePath ?? args.path } }),
  multiedit: (args) => ({ tool_name: "MultiEdit", tool_input: { file_path: args.filePath ?? args.path } }),
};

export const AiwsGuard = async () => ({
  "tool.execute.before": async (input, output) => {
    const translate = REQUESTS[input?.tool];
    if (!translate) return;
    const request = translate(output?.args ?? {});
    const result = spawnSync(COMMAND + (request.tool_name === "Bash" ? " --bash" : ""), {
      cwd: ROOT,
      input: JSON.stringify({ cwd: ROOT, ...request }),
      encoding: "utf8",
      shell: true,
      timeout: 20000,
      windowsHide: true,
    });
    if (result.status === 0) return;
    const reason = String(result.stderr ?? "").trim();
    // exit 2 is the guard's refusal; anything else is a guard that did not run, which is not a pass
    throw new Error(result.status === 2 && reason ? reason : "AIWS guard: the guard hook did not run (" + (reason || result.error?.message || "exit " + result.status) + ")");
  },
});
`;
}

export const { preflight, runAgent } = interactiveOnly(TARGET);
