import fs from 'node:fs';
import path from 'node:path';
import { generatedNote, hasLocalCli, instructions, interactiveOnly, localCliFrom, removeStale, syncSkills, writeText } from './shared.js';

const TARGET = 'antigravity';
/** The name of this workspace's entry in `.agents/hooks.json`; the other entries are somebody else's. */
export const HOOK_NAME = 'aiws-guard';
/** The tools of Antigravity that run a command or read or write a file. */
const GUARDED_TOOLS = ['run_command', 'view_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content'];

/**
 * Generates what Antigravity reads of a project, from aiws/: one agent an agent under
 * `.agents/agents/<id>/agent.md`, the skills under `.agents/skills/`, and a `PreToolUse` hook in
 * `.agents/hooks.json` that asks `aiws guard --from antigravity`. Antigravity reads AGENTS.md by itself.
 *
 * An Antigravity agent file has a name and a description and no permission keys, so an agent's limits are its
 * instructions there; the write scope of a phase is the guard's, for every agent.
 */
export function sync(ws) {
  const written = [];
  const dir = path.join(ws.root, '.agents', 'agents');
  const ids = ws.listAgents();
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];
  for (const e of existing) {
    if (ids.includes(e.name)) continue;
    removeStale([path.join(dir, e.name, 'agent.md')], TARGET);
    if (fs.readdirSync(path.join(dir, e.name)).length === 0) fs.rmdirSync(path.join(dir, e.name));
  }
  for (const id of ids) {
    const a = ws.agent(id);
    const front = ['---', `name: ${id}`, `description: ${JSON.stringify(a.description ?? id)}`, '---'];
    writeText(path.join(dir, id, 'agent.md'), `${front.join('\n')}\n<!-- ${generatedNote(TARGET)} -->\n\n${instructions(ws, a)}`);
    written.push(`.agents/agents/${id}/agent.md`);
  }
  written.push(...syncSkills(ws));

  // the file is shared: only this workspace's entry is written
  const file = path.join(ws.root, '.agents', 'hooks.json');
  let hooks = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) hooks = parsed;
  } catch {
    // no file yet, or one that is not JSON: written anew
  }
  hooks[HOOK_NAME] = {
    PreToolUse: [{ matcher: GUARDED_TOOLS.join('|'), hooks: [{ type: 'command', command: guardCommand(ws), timeout: 30 }] }],
  };
  writeText(file, JSON.stringify(hooks, null, 2) + '\n');
  written.push('.agents/hooks.json');
  return written;
}

/** Antigravity starts a hook in the folder of its hooks.json, `.agents/`: the workspace's own CLI is one level up. */
export function guardCommand(ws) {
  return `${hasLocalCli(ws) ? `node ${localCliFrom(1)}` : 'aiws'} guard --from antigravity`;
}

export const { preflight, runAgent } = interactiveOnly(TARGET);
