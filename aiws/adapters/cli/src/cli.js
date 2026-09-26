import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, log } from './util.js';
import { Workspace, PKG_ROOT } from './workspace.js';
import * as C from './commands.js';
import { runHook } from './guard.js';

const HELP = `aiws - AI Software Factory orchestrator (V1, Claude Code first)

Usage: aiws <command> [options]        aiws --version | --help

Setup
  aiws init [dir]                      create workspace skeleton (copies the aiws/ kit into a new project)
  aiws detect [--write] [--force]      recognise the stack of each source-* dir (any language) and propose
                                       sides + build/test commands; --write merges them into policies.yaml
  aiws sync claude                     generate CLAUDE.md + .claude/ (agents, skills, settings, hooks) from aiws/
  aiws discover                       build aiws/knowledge/ from source-* (run once, and after big changes)

Requirement lifecycle
  aiws new REQ-001 [--worktree PATH]   create aiws/work/REQ-001 and branch aiws/REQ-001
  aiws run REQ-001 [--once]            run phases until the next human gate / block / done
  aiws status [REQ-001]                phase, tasks, recent history, source lock
  aiws prompt REQ-001 PHASE [--task T] print the prompt an agent would receive

Human-only (refuse to run inside an AI session; confirm interactively or pass --yes)
  aiws approve REQ-001 design|pr [-m NOTE] [--sign] [--no-merge-check]
  aiws reject  REQ-001 design|pr -m FEEDBACK [--sign]
  aiws answer  REQ-001 -m ANSWER       answer blocking questions / a developer question (design unchanged)
  aiws redesign REQ-001 -m REASON      developer question needs a design change -> back to design
  aiws resume  REQ-001 [-m NOTE]       continue after a block you have fixed
  aiws unlock                          release a stale source lock

Checks (for CI and debugging)
  aiws trace REQ-001                   AC -> TC -> task -> commit -> test matrix (exit 1 on gaps)
  aiws check diff-scope --req R [--phase P] [--task T] [--base REV]
  aiws check commit-trailer --req R [--range A..B]
  aiws check approvals --req R
  aiws guard [--bash]                  Claude Code PreToolUse hook (reads tool JSON on stdin)
`;

export function version() {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
}

const VALUE_FLAGS = new Set(['-m', '--message', '--task', '--req', '--phase', '--base', '--range', '--worktree']);

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      if (i + 1 >= argv.length) throw new AiwsError(`${a} needs a value`);
      flags[a === '-m' ? 'message' : a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? true;
    } else pos.push(a);
  }
  return { pos, flags };
}

export async function main(argv) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, a1, a2] = pos;
  if (!cmd && flags.version) {
    log(version());
    return 0;
  }
  const human = { yes: Boolean(flags.yes), message: flags.message, sign: Boolean(flags.sign) };

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      log(HELP);
      return 0;
    case 'version':
    case '--version':
    case '-v':
      log(version());
      return 0;
    case 'init':
      C.init(a1);
      return 0;
    case 'sync':
      C.sync(a1 ?? 'claude');
      return 0;
    case 'discover':
      C.discover();
      return 0;
    case 'detect':
      C.detect({ write: Boolean(flags.write), force: Boolean(flags.force) });
      return 0;
    case 'new':
      C.newReq(a1, { worktree: flags.worktree });
      return 0;
    case 'run':
      C.run(a1, { once: Boolean(flags.once) });
      return 0;
    case 'status':
      C.status(a1);
      return 0;
    case 'prompt':
      C.prompt(a1, a2, { task: flags.task });
      return 0;
    case 'approve':
      await C.approve(a1, a2, { ...human, mergeCheck: !flags['no-merge-check'] });
      return 0;
    case 'reject':
      await C.reject(a1, a2, human);
      return 0;
    case 'answer':
      await C.answer(a1, human);
      return 0;
    case 'redesign':
      await C.redesign(a1, human);
      return 0;
    case 'resume':
      await C.resume(a1, human);
      return 0;
    case 'unlock':
      await C.unlock(human);
      return 0;
    case 'trace':
      C.trace(a1);
      return process.exitCode ?? 0;
    case 'check':
      if (a1 === 'diff-scope') C.checkDiffScope(flags);
      else if (a1 === 'commit-trailer') C.checkCommitTrailers(flags);
      else if (a1 === 'approvals') C.checkApprovals(flags);
      else throw new AiwsError(`Unknown check '${a1}'. Use diff-scope | commit-trailer | approvals`);
      return process.exitCode ?? 0;
    case 'guard': {
      let ws;
      try {
        ws = Workspace.open();
      } catch {
        return 0; // not an AIWS workspace: nothing to guard
      }
      return runHook(ws, { bash: Boolean(flags.bash) });
    }
    case 'where':
      C.where();
      return 0;
    default:
      throw new AiwsError(`Unknown command '${cmd}'. Run \`aiws help\`.`);
  }
}
