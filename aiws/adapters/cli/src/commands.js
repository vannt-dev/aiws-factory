import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, log, writeText, readTextIfExists, copyDir, nowIso, replaceYamlBlock, runShell, osCommand } from './util.js';
import { Workspace, KIT_DIR, assertReqId, findRoot } from './workspace.js';
import * as G from './git.js';
import * as Lock from './lock.js';
import { loadState, saveState, setPhase, addHistory, addFeedback, listReqs, statePath } from './state.js';
import { enterPhase, runReq, runDiscover, budgetStatus } from './engine.js';
import YAML from 'yaml';
import { detectStacks, reportText } from './stacks.js';
import { requireHuman, inAiSession, currentUser, recordApproval, hashArtifacts, listApprovals, designApprovalStatus } from './gate.js';
import { buildPrompt } from './prompt.js';
import { buildTrace, traceMarkdown } from './trace.js';
import { runStats, statsLine } from './stats.js';
import { getAdapter, preflightAdapters } from './adapters/index.js';
import * as DS from './diffscope.js';
import { writeScope, orchestratorPaths, classify, matcher } from './scope.js';

// ---------------------------------------------------------------- init / sync

const SKELETON_DIRS = ['requirements', 'source-fe', 'source-be', 'source-legacy', 'aiws/knowledge', 'aiws/work'];
const KIT_PARTS = ['config', 'agents', 'skills', 'templates', 'docs'];

/**
 * `aiws init [dir]`: prepares a workspace. In a new project it copies the reference aiws/ kit
 * (config, agents, skills, templates, docs); existing files are never overwritten.
 */
export function init(dir = process.cwd()) {
  const root = path.resolve(dir);
  const created = [];
  const kitIsHere = path.resolve(KIT_DIR) === path.join(root, 'aiws');
  if (!kitIsHere) {
    for (const part of KIT_PARTS) {
      const src = path.join(KIT_DIR, part);
      if (fs.existsSync(src)) created.push(...copyDir(src, path.join(root, 'aiws', part)));
    }
    const agentsMd = path.join(KIT_DIR, '..', 'AGENTS.md');
    if (fs.existsSync(agentsMd) && !fs.existsSync(path.join(root, 'AGENTS.md'))) {
      fs.copyFileSync(agentsMd, path.join(root, 'AGENTS.md'));
      created.push(path.join(root, 'AGENTS.md'));
    }
  }
  for (const d of SKELETON_DIRS) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      writeText(path.join(abs, '.gitkeep'), '');
      created.push(abs);
    }
  }
  if (!G.isRepo(root)) log('Note: this folder is not a git repository yet. Run `git init` - AIWS keeps all state in git.');
  log(created.length ? `Created ${created.length} file(s)/folder(s).` : 'Workspace already initialised; nothing to create.');
  log('Next: `aiws sync claude`, then `aiws discover`.');
}

export function sync(target = 'claude') {
  const ws = Workspace.open();
  const written = getAdapter(target).sync(ws);
  log(`Generated for ${target}:`);
  for (const f of written) log(`  ${f}`);
}

// ---------------------------------------------------------------- REQ lifecycle

function findRequirement(ws, req) {
  const dir = ws.abs('requirements');
  const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f === `${req}.md` || f.startsWith(`${req}-`)) : null;
  return hit ? `requirements/${hit}` : null;
}

function titleOf(ws, rel, req) {
  const text = readTextIfExists(ws.abs(rel)) ?? '';
  const h = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
  return h ? h.replace(new RegExp(`^${req}\\s*[-:—]?\\s*`), '') : req;
}

export function newReq(req, { worktree } = {}) {
  assertReqId(req);
  let ws = Workspace.open();
  if (!G.isRepo(ws.root) || !G.hasCommits(ws.root)) throw new AiwsError('The workspace must be a git repository with at least one commit.');
  const requirement = findRequirement(ws, req);
  if (!requirement) throw new AiwsError(`No requirement file requirements/${req}-*.md found. Write the requirement first.`);
  const branch = `aiws/${req}`;
  if (G.branchExists(ws.root, branch)) throw new AiwsError(`Branch ${branch} already exists.`);
  const dirty = G.dirtyFiles(ws.root);
  if (dirty.length) throw new AiwsError(`Working tree is not clean:\n  ${dirty.join('\n  ')}`);
  if (fs.existsSync(statePath(ws, req))) throw new AiwsError(`${req} already exists.`);

  const baseBranch = G.currentBranch(ws.root);
  const baseCommit = G.head(ws.root);
  if (worktree) {
    const wt = path.resolve(worktree);
    G.git(ws.root, ['worktree', 'add', '-q', '-b', branch, wt]);
    ws = new Workspace(wt);
    log(`Worktree created at ${wt}. Run further commands for ${req} from there.`);
    installWorktreeCli(wt);
  } else {
    G.git(ws.root, ['switch', '-q', '-c', branch]);
  }
  const st = {
    req_id: req,
    title: titleOf(ws, requirement, req),
    requirement,
    branch,
    base_branch: baseBranch,
    base_commit: baseCommit,
    phase: null,
    status: 'running',
    history: [],
    tasks: [],
    feedback: [],
    attempts: {},
    last_failure: {},
  };
  enterPhase(ws, st, ws.workflow.phases[0].id);
  addHistory(st, { phase: 'new', result: 'created', by: currentUser(ws.root) });
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): start ${st.title}\n\nREQ-ID: ${req}\n`, [ws.workRel(req)]);
  log(`${req} created on branch ${branch} (base ${baseBranch} @ ${baseCommit.slice(0, 7)}). Next: aiws run ${req}`);
}

/**
 * A worktree gets its own copy of aiws/adapters/cli but not its node_modules (git-ignored). The guard hook of
 * agents running there starts from that copy, so its dependencies are installed right away.
 */
function installWorktreeCli(wt) {
  const cli = path.join(wt, 'aiws', 'adapters', 'cli');
  if (!fs.existsSync(path.join(cli, 'package.json')) || fs.existsSync(path.join(cli, 'node_modules', 'yaml'))) return;
  const res = runShell('npm ci --omit=dev --no-audit --no-fund', { cwd: cli, timeout: 5 * 60 * 1000 });
  if (res.status === 0) log('Installed the CLI dependencies of the worktree (needed by the guard hook).');
  else log(`Could not install the CLI dependencies of the worktree. Run \`npm ci --omit=dev\` in ${cli} before \`aiws run\`.`);
}

export function run(req, opts) {
  assertReqId(req);
  const ws = Workspace.open();
  const st = runReq(ws, req, opts);
  printStop(ws, st);
}

function printStop(ws, st) {
  log('');
  log(`${st.req_id}: phase=${st.phase} status=${st.status}`);
  if (st.reason) log(`  ${st.reason}`);
}

/**
 * `aiws discover [--branch[=NAME]]`: builds aiws/knowledge/. By default the result is committed on the
 * current branch. With --branch it goes to a new branch (default aiws/discover-YYYYMMDD), to be merged
 * through a pull request: the way to use discovery when the base branch is protected.
 */
export function discover({ branch } = {}) {
  const ws = Workspace.open();
  let target = null;
  if (branch) {
    preflightAdapters(ws, ['discover']); // fail before creating a branch nobody will use
    const from = G.currentBranch(ws.root);
    target = branch === true ? `aiws/discover-${nowIso().slice(0, 10).replace(/-/g, '')}` : String(branch);
    if (G.branchExists(ws.root, target)) throw new AiwsError(`Branch ${target} already exists. Pass another name: --branch=NAME.`);
    G.git(ws.root, ['switch', '-q', '-c', target]);
    log(`Discovery runs on the new branch ${target} (from ${from}).`);
  }
  const r = runDiscover(ws);
  if (!r.ok) throw new AiwsError('Discovery failed; see aiws/work/_discover/evidence/runs/.');
  if (target) {
    log(
      `Next: review aiws/knowledge/, push ${target} and open a pull request. Merge it before \`aiws new\`, which needs the knowledge base.`
    );
  }
}

// ---------------------------------------------------------------- status

export function status(req) {
  const ws = Workspace.open();
  const reqs = req ? [assertReqId(req)] : listReqs(ws);
  const lock = G.isRepo(ws.root) ? Lock.readLock(ws.root) : null;
  if (!reqs.length) {
    log('No REQs on this branch. Create one with `aiws new REQ-001`.');
    const branches = G.git(ws.root, ['branch', '--list', 'aiws/*', '--format=%(refname:short)'], { allowFail: true }).stdout.trim();
    if (branches) log(`AIWS branches:\n  ${branches.split('\n').join('\n  ')}`);
  }
  for (const r of reqs) {
    const st = loadState(ws, r);
    log(`${st.req_id}  ${st.title}`);
    log(`  branch: ${st.branch}   phase: ${st.phase}   status: ${st.status}`);
    if (st.reason) log(`  reason: ${st.reason}`);
    const usage = statsLine(runStats(ws, r));
    if (usage) log(`  ${usage}`);
    const budget = budgetStatus(ws, st);
    if (budget.limit !== null) log(`  budget: ${budget.spent.toFixed(2)} of ${budget.limit.toFixed(2)} USD used`);
    if (st.tasks.length) {
      log('  tasks:');
      for (const t of st.tasks) {
        const extra = [
          t.commit && `commit ${t.commit.slice(0, 7)}`,
          t.attempts && `attempts ${t.attempts}`,
          t.test_result && `tests ${t.test_result}`,
        ]
          .filter(Boolean)
          .join(', ');
        log(`    ${t.id.padEnd(6)} ${t.status.padEnd(8)} ${t.title ?? ''}${extra ? `  (${extra})` : ''}`);
        if (t.last_failure && t.status !== 'done') log(`           last failure: ${t.last_failure.split('\n')[0].slice(0, 160)}`);
      }
    }
    const last = st.history.slice(-3);
    if (last.length) {
      log('  recent:');
      for (const h of last)
        log(
          `    ${h.at} ${h.phase}${h.agent ? '/' + h.agent : ''}${h.task ? '/' + h.task : ''} -> ${h.result}${h.run ? ` (${h.run})` : ''}`
        );
    }
  }
  if (lock) log(`source lock: held by ${lock.req} since ${lock.at}`);
}

// ---------------------------------------------------------------- human gates

function gateDef(ws, gate) {
  const def = ws.workflow.phases.find((p) => p.type === 'human_gate' && p.gate === gate);
  if (!def) throw new AiwsError(`No human gate '${gate}' in workflow.yaml`);
  return def;
}

function openForHuman(req) {
  assertReqId(req);
  const ws = Workspace.open();
  const st = loadState(ws, req);
  return { ws, st };
}

function assertAt(st, def) {
  if (st.phase !== def.id) throw new AiwsError(`${st.req_id} is in phase '${st.phase}', not '${def.id}'.`);
}

export async function approve(req, gate, opts = {}) {
  await requireHuman(`approve ${gate}`, req, opts);
  if (gate === 'design') return approveDesign(req, opts);
  if (gate === 'pr') return approvePr(req, opts);
  throw new AiwsError(`Unknown gate '${gate}'. Use: design | pr`);
}

function approveDesign(req, opts) {
  const { ws, st } = openForHuman(req);
  const def = gateDef(ws, 'design');
  assertAt(st, def);
  const by = currentUser(ws.root);
  const artifacts = hashArtifacts(ws, req, def.artifacts);
  const file = recordApproval(ws, req, { gate: 'design', decision: 'approved', by, notes: opts.message, artifacts });
  addHistory(st, { phase: def.id, result: 'approved', by, record: path.basename(file) });
  enterPhase(ws, st, def.on_approve);
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): design approved by ${by}\n\nREQ-ID: ${req}\nAIWS-Approval: ${file}\n`, [ws.workRel(req)], {
    sign: opts.sign,
  });
  log(`Design approved (${file}). Next: aiws run ${req}`);
}

function approvePr(req, opts) {
  let { ws, st } = openForHuman(req);
  const def = gateDef(ws, 'pr');
  assertAt(st, def);
  const branchHead = G.revParse(ws.root, st.branch);
  const base = st.base_branch ?? ws.baseBranch();
  if (!branchHead) throw new AiwsError(`Branch ${st.branch} not found.`);
  const merged = opts.mergeCheck === false ? 'not checked' : mergedInto(ws.root, branchHead, base, st.base_commit);
  if (!merged) {
    throw new AiwsError(
      `${st.branch} is not merged into ${base} yet: it is not an ancestor of ${base}, and the files it changed differ on ${base}. ` +
        `Merge the PR and update your local ${base} first (or pass --no-merge-check).`
    );
  }
  const dirty = G.dirtyFiles(ws.root);
  if (dirty.length) throw new AiwsError(`Working tree is not clean:\n  ${dirty.join('\n  ')}`);

  // The knowledge update happens on its own branch cut from the merged base. The base itself is never
  // checked out here, so this also works when it is checked out in another worktree.
  const kBranch = `aiws/${req}-knowledge`;
  G.git(ws.root, ['switch', '-q', '-c', kBranch, base]);
  ({ ws, st } = openForHuman(req));
  const by = currentUser(ws.root);
  const file = recordApproval(ws, req, { gate: 'pr', decision: 'merged', by, notes: opts.message, artifacts: undefined });
  st.code_head = branchHead;
  st.branch = kBranch;
  addHistory(st, { phase: def.id, result: 'merged', by, record: path.basename(file), head: branchHead.slice(0, 7), merge: merged });
  if (def.release_lock) Lock.release(ws.root, req, { force: true });
  enterPhase(ws, st, def.on_approve);
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): PR merged, approved by ${by}\n\nREQ-ID: ${req}\nAIWS-Approval: ${file}\n`, [ws.workRel(req)], {
    sign: opts.sign,
  });
  log(`PR approval recorded (merge: ${merged}). Switched to ${kBranch} for the knowledge update. Next: aiws run ${req}`);
}

/**
 * How a requirement branch reached its base, or null when it has not:
 *  - 'merge commit': the branch head is an ancestor of the base (merge commit or fast-forward);
 *  - 'squash or rebase': the commit ids differ, but every file the requirement changed has the same
 *    content on the base as on the branch head.
 */
export function mergedInto(root, branchHead, base, baseCommit) {
  if (G.isAncestor(root, branchHead, base)) return 'merge commit';
  if (!baseCommit) return null;
  const files = G.git(root, ['diff', '--name-only', '--no-renames', '-z', baseCommit, branchHead], { allowFail: true })
    .stdout.split('\0')
    .filter(Boolean);
  if (!files.length) return null;
  const same = G.git(root, ['diff', '--quiet', base, branchHead, '--', ...files], { allowFail: true }).status === 0;
  return same ? 'squash or rebase' : null;
}

/** `aiws stop REQ`: asks a running `aiws run` to stop after its current step. Changes no state. */
export function stop(req) {
  assertReqId(req);
  const ws = Workspace.open();
  Lock.requestStop(ws.root, req);
  log(`Stop requested: ${req} stops after its current step. Continue later with \`aiws run ${req}\`.`);
}

export async function reject(req, gate, opts = {}) {
  if (!opts.message) throw new AiwsError('reject needs feedback: -m "what must change"');
  await requireHuman(`reject ${gate}`, req, opts);
  const { ws, st } = openForHuman(req);
  const def = gateDef(ws, gate);
  assertAt(st, def);
  const by = currentUser(ws.root);
  const target = gate === 'pr' ? def.on_changes_requested : def.on_reject;
  const decision = gate === 'pr' ? 'changes_requested' : 'rejected';
  const artifacts = gate === 'design' ? hashArtifacts(ws, req, def.artifacts) : undefined;
  const file = recordApproval(ws, req, { gate, decision, by, notes: opts.message, artifacts });
  addFeedback(st, target, `${gate} ${decision} by ${by}`, opts.message);
  addHistory(st, { phase: def.id, result: decision, by, record: path.basename(file) });
  enterPhase(ws, st, target);
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): ${gate} ${decision} by ${by}\n\nREQ-ID: ${req}\nAIWS-Approval: ${file}\n`, [ws.workRel(req)], {
    sign: opts.sign,
  });
  log(`${gate} ${decision}; feedback recorded for phase '${target}'. Next: aiws run ${req}`);
}

/** Answers blocking questions (analysis) or a developer's design question (keeps the design). */
export async function answer(req, opts = {}) {
  if (!opts.message) throw new AiwsError('answer needs text: -m "..."');
  await requireHuman('answer', req, opts);
  const { ws, st } = openForHuman(req);
  const by = currentUser(ws.root);
  const def = ws.phaseDef(st.phase);
  if (def.type === 'human_gate' && def.gate === 'question') {
    const q = ws.abs(ws.workRel(req, 'questions.md'));
    fs.appendFileSync(q, `\n\n## Trả lời (${by}, ${nowIso()})\n\n${opts.message}\n`);
    addFeedback(st, def.on_answer, `answer by ${by}`, opts.message);
    addHistory(st, { phase: def.id, result: 'answered', by });
    enterPhase(ws, st, def.on_answer);
  } else if (st.status === 'waiting_human' && def.type !== 'human_gate') {
    addFeedback(st, st.phase, `answer by ${by}`, opts.message);
    addHistory(st, { phase: st.phase, result: 'answered', by });
    setPhase(st, st.phase, 'running');
  } else {
    throw new AiwsError(`${req} is not waiting for an answer (phase ${st.phase}, status ${st.status}).`);
  }
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): answered by ${by}\n\nREQ-ID: ${req}\n`, [ws.workRel(req)]);
  log(`Answer recorded. Next: aiws run ${req}`);
}

/** The developer's question shows the design must change: back to design (re-approval required). */
export async function redesign(req, opts = {}) {
  if (!opts.message) throw new AiwsError('redesign needs the reason: -m "..."');
  await requireHuman('redesign', req, opts);
  const { ws, st } = openForHuman(req);
  const def = ws.phaseDef(st.phase);
  if (!(def.type === 'human_gate' && def.gate === 'question'))
    throw new AiwsError(`${req} is not at a design question (phase ${st.phase}).`);
  const by = currentUser(ws.root);
  addFeedback(st, def.on_design_change, `design change requested by ${by}`, opts.message);
  for (const t of st.tasks) if (t.status === 'running') t.status = 'pending';
  addHistory(st, { phase: def.id, result: 'redesign', by });
  enterPhase(ws, st, def.on_design_change);
  saveState(ws, st);
  G.commit(ws.root, `chore(${req}): design change requested by ${by}\n\nREQ-ID: ${req}\n`, [ws.workRel(req)]);
  log(`Back to ${st.phase}; the new design must be approved again. Next: aiws run ${req}`);
}

export async function resume(req, opts = {}) {
  await requireHuman('resume', req, opts);
  const { ws, st } = openForHuman(req);
  if (st.status !== 'blocked') throw new AiwsError(`${req} is not blocked (status ${st.status}).`);
  const by = currentUser(ws.root);
  for (const k of Object.keys(st.attempts)) if (k.startsWith(`${st.phase}:`)) delete st.attempts[k];
  for (const t of st.tasks) {
    if (t.status === 'blocked') {
      t.status = 'running';
      t.attempts = 0;
    }
  }
  // Only a human raises the budget: explicitly with --budget, or by one more configured budget
  // (counted from what is already spent) when the block was a budget block.
  let budgetNote = '';
  if (opts.budget !== undefined || st.blocked_by === 'budget') {
    const b = budgetStatus(ws, st);
    const limit = opts.budget !== undefined ? Number(opts.budget) : b.spent + (b.configured ?? b.limit ?? 0);
    if (!(limit > b.spent)) {
      throw new AiwsError(`--budget must be a number of USD above what is already spent (${b.spent.toFixed(2)}).`);
    }
    st.budget_usd = Math.round(limit * 100) / 100;
    budgetNote = ` Budget is now ${st.budget_usd.toFixed(2)} USD (spent ${b.spent.toFixed(2)}).`;
  }
  delete st.blocked_by;
  if (opts.message) addFeedback(st, st.phase, `resume note by ${by}`, opts.message);
  addHistory(st, { phase: st.phase, result: 'resumed', by, ...(st.budget_usd ? { budget_usd: st.budget_usd } : {}) });
  setPhase(st, st.phase, 'running');
  saveState(ws, st);
  log(`${req} resumed at ${st.phase}.${budgetNote} Next: aiws run ${req}`);
}

export async function unlock(opts = {}) {
  await requireHuman('unlock', 'UNLOCK', opts);
  const ws = Workspace.open();
  const cur = Lock.readLock(ws.root);
  if (!cur) return log('No source lock held.');
  Lock.release(ws.root, cur.req, { force: true });
  log(`Released source lock held by ${cur.req}.`);
}

// ---------------------------------------------------------------- inspection / checks

export function prompt(req, phase, { task } = {}) {
  assertReqId(req);
  const ws = Workspace.open();
  const st = loadState(ws, req);
  const def = ws.phaseDef(phase);
  const steps = def.steps ?? [{ agent: def.agent, contract: def.contract }];
  const step = steps.find((s) => s.agent) ?? steps[0];
  const t = task ? st.tasks.find((x) => x.id === task) : null;
  if (task && !t) throw new AiwsError(`Task ${task} not found in ${req}.`);
  process.stdout.write(buildPrompt(ws, st, { phase, agentId: step.agent, contract: ws.contract(step.contract), task: t }));
}

export function trace(req, { write = true } = {}) {
  assertReqId(req);
  const ws = Workspace.open();
  const st = loadState(ws, req);
  const tr = buildTrace(ws, st);
  const md = traceMarkdown(req, tr);
  if (write) writeText(path.join(ws.workDir(req), 'trace.md'), md);
  process.stdout.write(md);
  if (tr.problems.length) process.exitCode = 1;
}

/** `aiws check diff-scope --req R [--phase P] [--task T] [--base REV]`: CI-friendly scope verification. */
export function checkDiffScope({ req, phase, task, base }) {
  const ws = Workspace.open();
  assertReqId(req);
  const st = loadState(ws, req);
  const ph = phase ?? st.phase;
  const t = task ? st.tasks.find((x) => x.id === task) : null;
  const rev = base ?? t?.base ?? 'HEAD';
  const snap = { head: G.revParse(ws.root, rev) ?? rev, dirty: {} };
  const files = DS.changedByRun(ws.root, snap);
  const allowed = [...writeScope(ws.policies, ph, { req, task: t }), ...orchestratorPaths(req)];
  const { violations } = classify(files, { allowed, protectedPaths: ws.policies.protected_paths });
  if (violations.length) {
    log(`diff-scope FAILED for ${req} ${ph}${t ? ' ' + t.id : ''}:`);
    for (const v of violations) log(`  ${v}`);
    process.exitCode = 1;
  } else log(`diff-scope ok (${files.length} changed file(s) within scope)`);
}

/** `aiws check commit-trailer --req R [--range A..B]`: every non-orchestrator commit touching source must carry trailers. */
export function checkCommitTrailers({ req, range }) {
  const ws = Workspace.open();
  assertReqId(req);
  const st = loadState(ws, req);
  const r = range ?? `${st.base_commit}..HEAD`;
  const commits = G.commitsWithTrailers(ws.root, r, null);
  const isSource = matcher(ws.policies.source_paths ?? []);
  const bad = [];
  for (const c of commits) {
    const touchesSource = G.filesInCommit(ws.root, c.sha).some((f) => isSource(f));
    if (!touchesSource) continue;
    if (c.trailers['REQ-ID'] !== req || !c.trailers.Task) bad.push(`${c.sha.slice(0, 7)} ${c.body.split('\n')[0]}`);
  }
  if (bad.length) {
    log('Commits touching source without REQ-ID/Task trailers:');
    bad.forEach((b) => log(`  ${b}`));
    process.exitCode = 1;
  } else log(`commit trailers ok (${commits.length} commit(s) checked)`);
}

/** `aiws check approvals --req R`: approval files must be added by signed commits (when policy requires). */
export function checkApprovals({ req }) {
  const ws = Workspace.open();
  assertReqId(req);
  const requireSigned = ws.policies.approvals?.require_signed ?? false;
  const out = G.git(ws.root, ['log', '--format=%H %G? %an', '--', ws.workRel(req, 'approvals')], { allowFail: true }).stdout.trim();
  const bad = [];
  for (const line of out ? out.split('\n') : []) {
    const [sha, sig, ...who] = line.split(' ');
    if (requireSigned && !['G', 'U'].includes(sig)) bad.push(`${sha.slice(0, 7)} by ${who.join(' ')} is not signed (status ${sig})`);
  }
  const st = loadState(ws, req);
  const def = ws.workflow.phases.find((p) => p.gate === 'design');
  const past = !['analysis', 'design', def?.id].includes(st.phase);
  if (past && def) {
    const ap = designApprovalStatus(ws, req, def.artifacts);
    if (!ap.valid) bad.push(`design approval invalid: ${ap.reason}`);
  }
  if (bad.length) {
    bad.forEach((b) => log(b));
    process.exitCode = 1;
  } else log(`approvals ok (${listApprovals(ws, req, 'design').length} design record(s))`);
}

/**
 * `aiws check build`: runs every configured `<side>_build` and `<side>_test` command of policies.yaml,
 * the same commands the orchestrator runs after each task. Meant for CI on requirement pull requests,
 * so merged code is rebuilt and retested outside the AI run. Does nothing when no command is configured.
 */
export function checkBuild() {
  const ws = Workspace.open();
  const pol = ws.policies;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // set by an outer `node --test`; it would make a project's own node tests always pass
  const failed = [];
  let ran = 0;
  for (const side of Object.keys(pol.sides ?? {})) {
    for (const kind of ['build', 'test']) {
      const name = `${side}_${kind}`;
      const cmd = osCommand(pol.commands?.[name]);
      if (!cmd) continue;
      ran += 1;
      log(`> ${name}: ${cmd}`);
      const res = runShell(cmd, { cwd: ws.root, env, timeout: 30 * 60 * 1000 });
      const output = (res.stdout + '\n' + res.stderr).trim();
      if (res.status === 0) {
        log(`  ok${output ? `\n${indentTail(output, 15)}` : ''}`);
      } else {
        failed.push(name);
        log(`  FAILED (exit ${res.status})\n${indentTail(output, 60)}`);
      }
    }
  }
  if (!ran) return log('No <side>_build or <side>_test command in aiws/config/policies.yaml; nothing to run.');
  if (failed.length) {
    log(`\nbuild check FAILED: ${failed.join(', ')}`);
    process.exitCode = 1;
  } else log(`\nbuild check ok (${ran} command(s))`);
}

function indentTail(text, lines) {
  return text
    .split(/\r?\n/)
    .slice(-lines)
    .map((l) => `    ${l}`)
    .join('\n');
}

/**
 * `aiws detect [--write] [--force]`: recognises the stack of every source-* dir (any language) and
 * proposes sides / source_paths / build+test commands. --write merges them into policies.yaml
 * (existing commands are kept unless --force); comments in the file are preserved.
 */
export function detect({ write = false, force = false } = {}) {
  const ws = Workspace.open();
  const { sides, commands, report } = detectStacks(ws.root);
  log('Detected:');
  log(reportText(report));
  const proposal = { source_paths: Object.values(sides), sides, commands };
  log('\nProposed policies.yaml entries:');
  log(YAML.stringify(proposal, { lineWidth: 0 }).trimEnd());
  if (!write) {
    log('\nNothing written. Re-run with --write to merge into aiws/config/policies.yaml.');
    return;
  }
  if (inAiSession()) throw new AiwsError('`aiws detect --write` changes human-owned config and refuses to run inside an AI session.', 3);
  const file = path.join(ws.configDir, 'policies.yaml');
  const original = fs.readFileSync(file, 'utf8');
  const current = YAML.parse(original) ?? {};

  // Merge, never drop: existing sides, paths and commands stay (commands are replaced only with --force).
  const merged = {
    source_paths: [...new Set([...(current.source_paths ?? []), ...proposal.source_paths])],
    sides: { ...(current.sides ?? {}), ...sides },
    commands: { ...(current.commands ?? {}) },
  };
  for (const [k, v] of Object.entries(commands)) {
    if (merged.commands[k] === undefined || force) merged.commands[k] = v;
  }

  // Rewrite only the blocks that really change; the rest of the file keeps its comments and layout.
  let text = original;
  const changed = [];
  for (const key of ['source_paths', 'sides', 'commands']) {
    if (sameValue(current[key], merged[key])) continue;
    text = replaceYamlBlock(text, key, merged[key]);
    changed.push(key);
  }
  if (!changed.length) {
    log('\naiws/config/policies.yaml already up to date; nothing written.');
    return;
  }
  fs.writeFileSync(file, text);
  log(
    `\nUpdated ${changed.join(', ')} in aiws/config/policies.yaml${force ? '' : ' (kept existing commands; --force to overwrite)'}. ` +
      'Review it, then `aiws sync claude`.'
  );
}

/** Deep equality for YAML values; array order and object key order are ignored. */
function sameValue(a, b) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, norm(v[k])])
      );
    return v;
  };
  return JSON.stringify(norm(a ?? null)) === JSON.stringify(norm(b ?? null));
}

export function where() {
  const root = findRoot();
  log(root ?? 'not inside an AIWS workspace');
}
