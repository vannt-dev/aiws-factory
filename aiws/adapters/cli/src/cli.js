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
  aiws upgrade [--dry-run] [--force]   bring the kit of this workspace (config, agents, skills, templates, docs,
                                       AGENTS.md) to this CLI's: files you left alone are replaced, files you
                                       changed are kept, with the kit's version beside them as *.aiws-new when
                                       it changed too (--force replaces those instead); nothing is committed
  aiws detect [--write] [--force]      recognise the stack of each source-* dir (any language) and propose
                                       sides + build/test commands (and the optional api_contract_be for
                                       NestJS/Express/Fastify/Spring); --write merges them into policies.yaml
  aiws sync <claude|codex|opencode|antigravity>
                                       generate what the tool reads of a project from aiws/: its agents, the skills
                                       and the guard hook (claude: CLAUDE.md + .claude/; codex: .codex/, no hook;
                                       opencode: .opencode/; antigravity: .agents/). Default: claude
  aiws discover [--branch[=NAME]] [--since[=REV]]
                                       build aiws/knowledge/ from source-* (run once, and after big changes);
                                       --branch commits on a new branch, for a pull request; --since updates
                                       only for the source files changed since REV (default: the last
                                       knowledge commit), and skips the AI run when nothing changed

Requirement lifecycle
  aiws new REQ-001 [--worktree PATH] [--profile NAME]
                                       create aiws/work/REQ-001 and branch aiws/REQ-001; --profile runs it on
                                       aiws/config/workflow.NAME.yaml ("small": one design step, no separate
                                       test designer)
  aiws run REQ-001 [--once] [--wait[=MIN]]
                                       run phases until the next human gate / block / done; exit 75 when the
                                       AI usage limit paused it (run it again once the limit resets, or let
                                       --wait do that every MIN minutes, default 15)
  aiws stop REQ-001                    ask a running \`aiws run\` to stop after its current step
  aiws status [REQ-001]              phase, tasks, recent history, source lock
  aiws stats                           every requirement with its AI runs, time and cost; cost per phase across them
  aiws estimate                        cost and time of the finished requirements, as an order of magnitude for the next
  aiws prompt REQ-001 PHASE [--task T] print the prompt an agent would receive
  aiws report REQ-001 [--out FILE]     one HTML page: status, trace, tasks, approvals, runs, cost, documents
                                       (default aiws/work/REQ-001/report.html)

Human-only (refuse to run inside an AI session; confirm interactively or pass --yes)
  aiws gate REQ-001                    the decision that waits, as a menu: approve, reject, answer, open the
                                       report or decide later (also offered when \`aiws run\` stops at a gate in
                                       a terminal; --no-menu on run skips it)
  aiws approve REQ-001 design|pr [-m NOTE] [--sign] [--no-merge-check]
  aiws reject  REQ-001 design|pr -m FEEDBACK [--sign]
  aiws reject  REQ-001 pr --from-pr[=URL] [-m FEEDBACK]
                                       send the review comments of the draft pull request (inline ones with
                                       file:line, unresolved threads only) to the planner, after -m if given
  aiws answer  REQ-001 -m ANSWER       answer blocking questions / a developer question (design unchanged)
  aiws redesign REQ-001 -m REASON      developer question needs a design change -> back to design
  aiws resume  REQ-001 [-m NOTE] [--budget USD]
                                       continue after a block you have fixed, or raise the cost budget
                                       (with --budget also ahead of time, while waiting at a gate before the PR)
  aiws unlock                          release a stale source lock

Checks (for CI and debugging)
  aiws trace REQ-001                   AC -> TC -> task -> commit -> test matrix (exit 1 on gaps)
  aiws check diff-scope --req R [--phase P] [--task T] [--base REV]
  aiws check commit-trailer --req R [--range A..B]
  aiws check approvals --req R
  aiws check api-contract --req R      lint api-contract.yaml and compare it with the backend's OpenAPI document,
                                       and with its code when commands.api_contract_be is set (as the review does)
  aiws check build                     run every <side>_build and <side>_test command of policies.yaml
  aiws guard [--bash] [--from antigravity]
                                       the PreToolUse hook the tools call (reads the tool call as JSON on stdin)
`;

export function version() {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
}

const VALUE_FLAGS = new Set([
  '-m',
  '--message',
  '--task',
  '--req',
  '--phase',
  '--base',
  '--range',
  '--worktree',
  '--budget',
  '--out',
  '--profile',
  '--from',
]);

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
  const human = { yes: Boolean(flags.yes), message: flags.message, sign: Boolean(flags.sign), fromPr: flags['from-pr'] };

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
    case 'upgrade':
      C.upgrade({ dryRun: Boolean(flags['dry-run']), force: Boolean(flags.force) });
      return 0;
    case 'sync':
      C.sync(a1 ?? 'claude');
      return 0;
    case 'discover':
      C.discover({ branch: flags.branch, since: flags.since });
      return process.exitCode ?? 0;
    case 'detect':
      C.detect({ write: Boolean(flags.write), force: Boolean(flags.force) });
      return 0;
    case 'new':
      C.newReq(a1, { worktree: flags.worktree, profile: flags.profile });
      return 0;
    case 'run':
      await C.run(a1, { once: Boolean(flags.once), wait: flags.wait, menu: !flags['no-menu'] });
      return process.exitCode ?? 0;
    case 'stop':
      C.stop(a1);
      return 0;
    case 'status':
      C.status(a1);
      return 0;
    case 'stats':
      C.stats();
      return 0;
    case 'estimate':
      C.estimate();
      return 0;
    case 'prompt':
      C.prompt(a1, a2, { task: flags.task });
      return 0;
    case 'report':
      C.report(a1, { out: flags.out });
      return 0;
    case 'gate':
      await C.gate(a1);
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
      await C.resume(a1, { ...human, budget: flags.budget });
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
      else if (a1 === 'build') C.checkBuild();
      else if (a1 === 'api-contract') C.checkApiContractCmd(flags);
      else throw new AiwsError(`Unknown check '${a1}'. Use diff-scope | commit-trailer | approvals | build | api-contract`);
      return process.exitCode ?? 0;
    case 'guard': {
      let ws;
      try {
        ws = Workspace.open();
      } catch {
        return 0; // not an AIWS workspace: nothing to guard
      }
      return runHook(ws, { bash: Boolean(flags.bash), from: typeof flags.from === 'string' ? flags.from : 'claude' });
    }
    case 'where':
      C.where();
      return 0;
    default:
      throw new AiwsError(`Unknown command '${cmd}'. Run \`aiws help\`.`);
  }
}
