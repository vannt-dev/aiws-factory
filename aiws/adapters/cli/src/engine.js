import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { AiwsError, log, nowIso, writeText, writeYaml, readTextIfExists, runShell, osCommand, fill } from './util.js';
import * as G from './git.js';
import * as DS from './diffscope.js';
import * as Lock from './lock.js';
import { loadState, saveState, setPhase, addHistory, nextRunId, addFeedback } from './state.js';
import { writeScope, orchestratorPaths, matcher } from './scope.js';
import { buildPrompt } from './prompt.js';
import { validateOutputs, loadPlan } from './validate.js';
import { designApprovalStatus } from './gate.js';
import { buildTrace, traceMarkdown } from './trace.js';
import { adapterName, getAdapter } from './adapters/index.js';
import { detectStacks, reportText } from './stacks.js';

// Phases that are only legal while the design approval is valid (hash unchanged).
const AFTER_APPROVAL = new Set(['planning', 'implementation', 'design_change_requested', 'review', 'pr_approval']);

// ---------------------------------------------------------------- transitions

export function gateMessage(def, req) {
  switch (def.gate) {
    case 'design':
      return `design ready for review: ${(def.artifacts ?? []).join(', ')}. Then run \`aiws approve ${req} design\` or \`aiws reject ${req} design -m "..."\``;
    case 'pr':
      return `open a PR for the branch; after it is merged run \`aiws approve ${req} pr\` (or \`aiws reject ${req} pr -m "..."\`)`;
    case 'question':
      return `developer asked questions in questions.md. Run \`aiws answer ${req} -m "..."\` or \`aiws redesign ${req} -m "..."\``;
    default:
      return `waiting for a human at ${def.id}`;
  }
}

/** Moves the REQ into phase `id`, setting the status that phase starts with. */
export function enterPhase(ws, st, id) {
  st.step_index = 0;
  if (id === 'done') {
    setPhase(st, 'done', 'done');
    return;
  }
  const def = ws.phaseDef(id);
  if (def.type === 'human_gate') setPhase(st, id, 'waiting_human', gateMessage(def, st.req_id));
  else setPhase(st, id, 'running');
}

function commitWork(ws, st, subject, extraPaths = [], trailers = {}) {
  saveState(ws, st);
  const lines = [subject, '', `REQ-ID: ${st.req_id}`];
  for (const [k, v] of Object.entries(trailers)) if (v) lines.push(`${k}: ${v}`);
  return G.commit(ws.root, lines.join('\n') + '\n', [ws.workRel(st.req_id), ...extraPaths]);
}

// ---------------------------------------------------------------- agent execution

function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  // a nested `claude -p` must not believe it runs inside the caller's session
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  for (const k of Object.keys(env)) if (env[k] === undefined || env[k] === null) delete env[k];
  return env;
}

/**
 * One AI run: build prompt -> snapshot -> adapter -> diff-scope (revert violations) -> evidence.
 * `counter` is the object holding run_seq (the REQ state, or the discovery pseudo-state).
 */
export function executeAgent(ws, counter, { req, phase, agentId, contract, task = null, attempt = 1, failure = null, extra = null }) {
  const agent = ws.agent(agentId);
  const runId = nextRunId(counter);
  const prompt = buildPrompt(ws, counter, { phase, agentId, contract, task, failure, extra });
  const evidenceDir = path.join(ws.workDir(req), 'evidence', 'runs');
  writeText(path.join(evidenceDir, `${runId}.prompt.md`), prompt);

  const snap = DS.snapshot(ws.root);
  const env = cleanEnv({
    AIWS_REQ: req,
    AIWS_PHASE: phase,
    AIWS_TASK: task?.id,
    AIWS_ATTEMPT: String(attempt),
    AIWS_RUN: runId,
    AIWS_ROOT: ws.root,
  });
  const name = adapterName(ws, phase);
  const startedAt = nowIso();
  const res = getAdapter(name).runAgent(ws, { prompt, env, contract, agent, task, attempt });

  const allowed = writeScope(ws.policies, phase, { req, task });
  const scope = DS.enforce(ws.root, snap, {
    allowed,
    protectedPaths: ws.policies.protected_paths,
    ignore: orchestratorPaths(req),
  });

  const evidence = {
    run_id: runId,
    req,
    phase,
    agent: agentId,
    task: task?.id ?? null,
    attempt,
    adapter: name,
    command: res.command ?? null,
    allowed_tools: res.allowedTools ?? null,
    prompt_file: `${runId}.prompt.md`,
    prompt_sha256: crypto.createHash('sha256').update(prompt).digest('hex'),
    started_at: startedAt,
    duration_ms: res.durationMs ?? null,
    exit_code: res.exitCode,
    report: res.report ?? null,
    stderr_tail: (res.stderr ?? '').slice(-2000) || null,
    files_changed: scope.changed,
    scope_violations_reverted: scope.violations,
  };
  const errors = [];
  if (!res.ok) {
    errors.push({
      kind: 'invalid',
      message: `agent run failed (exit ${res.exitCode}): ${tail(res.report?.result || res.stderr || '', 800)}`,
    });
  }
  if (scope.violations.length) {
    errors.push({
      kind: 'invalid',
      message: `wrote outside the allowed scope; these changes were reverted: ${scope.violations.join(', ')}. Allowed: ${allowed.join(', ')}`,
    });
  }
  return { runId, res, scope, evidence, errors };
}

function writeEvidence(ws, req, evidence) {
  writeText(path.join(ws.workDir(req), 'evidence', 'runs', `${evidence.run_id}.json`), JSON.stringify(evidence, null, 2) + '\n');
}

function tail(s, n) {
  s = String(s ?? '').trim();
  return s.length > n ? '...' + s.slice(-n) : s;
}

function formatErrors(errors) {
  return errors.map((e) => `- ${e.message}`).join('\n');
}

const INTERRUPTED_NOTE =
  '- The previous attempt was interrupted before it finished (no error). The files of this task may contain ' +
  'partial work: read them first, then complete or correct them.';

// ---------------------------------------------------------------- run loop

/** Runs a REQ until the next human gate, a block, or done. Returns the final state. */
export function runReq(ws, req, { once = false, maxSteps = 500 } = {}) {
  let st = loadState(ws, req);
  assertOnBranch(ws, st);
  assertCleanEnough(ws, st);
  Lock.takeStop(ws.root, req); // a stop request left over from an earlier run does not apply to this one

  for (let i = 0; i < maxSteps; i++) {
    st = loadState(ws, req);
    if (st.status !== 'running') break;
    if (Lock.takeStop(ws.root, req)) {
      log(`[${req}] stop requested: stopped before the next step. Continue with \`aiws run ${req}\`.`);
      break;
    }

    if (AFTER_APPROVAL.has(st.phase)) {
      const gateDef = ws.workflow.phases.find((p) => p.gate === 'design');
      const ap = designApprovalStatus(ws, req, gateDef?.artifacts);
      if (!ap.valid) {
        addHistory(st, { phase: st.phase, result: 'approval_invalidated', reason: ap.reason });
        enterPhase(ws, st, gateDef.id);
        st.reason = `approval no longer valid (${ap.reason}); re-approve the design`;
        commitWork(ws, st, `chore(${req}): design approval invalidated`);
        break;
      }
    }

    const def = ws.phaseDef(st.phase);
    if (def.type === 'human_gate') {
      enterPhase(ws, st, def.id);
      commitWork(ws, st, `chore(${req}): waiting at ${def.id}`);
      break;
    }
    if (def.type === 'loop') stepLoop(ws, st, def);
    else stepAgentPhase(ws, st, def);
    if (once) break;
  }
  return loadState(ws, req);
}

function assertOnBranch(ws, st) {
  const cur = G.currentBranch(ws.root);
  if (st.branch && cur !== st.branch) {
    throw new AiwsError(
      `${st.req_id} runs on branch ${st.branch} but you are on ${cur}. Run \`git switch ${st.branch}\` (or use its worktree).`
    );
  }
}

function assertCleanEnough(ws, st) {
  const allowed = [`${ws.workRel(st.req_id)}/**`];
  if (st.phase === 'implementation') {
    const t = st.tasks.find((x) => x.status === 'running' || x.status === 'blocked');
    if (t) allowed.push(...(t.allowed_files ?? []));
  }
  const ok = matcher(allowed);
  const stray = G.dirtyFiles(ws.root).filter((f) => !ok(f));
  if (stray.length) {
    throw new AiwsError(
      `Working tree has uncommitted changes outside ${st.req_id}'s scope:\n  ${stray.join('\n  ')}\nCommit or stash them first.`
    );
  }
}

// ---------------------------------------------------------------- agent phases

function stepAgentPhase(ws, st, def) {
  const req = st.req_id;
  if (def.id === ws.workflow.phases[0].id) {
    const missing = (ws.workflow.prerequisites ?? []).filter((p) => !fs.existsSync(ws.abs(p)));
    if (missing.length) {
      setPhase(st, def.id, 'blocked', `missing prerequisites ${missing.join(', ')}; run \`aiws discover\` first`);
      commitWork(ws, st, `chore(${req}): blocked on prerequisites`);
      return;
    }
  }
  if (def.require_trace) {
    const tr = buildTrace(ws, st);
    writeText(path.join(ws.workDir(req), 'trace.md'), traceMarkdown(req, tr));
    if (tr.problems.length) {
      setPhase(st, def.id, 'blocked', `traceability gaps: ${tr.problems.join('; ')}`);
      commitWork(ws, st, `chore(${req}): ${def.id} blocked by trace`);
      return;
    }
  }

  const steps = def.steps ?? [{ agent: def.agent, contract: def.contract }];
  const idx = st.step_index ?? 0;
  const step = steps[idx];
  const contract = ws.contract(step.contract);
  const key = `${def.id}:${step.agent}`;
  const attempt = (st.attempts[key] ?? 0) + 1;
  const maxAttempts = contract.max_attempts ?? 3;

  log(`[${req}] ${def.id} / ${step.agent} (attempt ${attempt}/${maxAttempts})`);
  const r = executeAgent(ws, st, {
    req,
    phase: def.id,
    agentId: step.agent,
    contract,
    attempt,
    failure: st.last_failure[key],
    extra: phaseExtra(ws, st, def),
  });
  let errors = r.errors;
  if (!errors.length) errors = validateOutputs(ws, contract, { req }).errors;
  if (!errors.length && def.checks)
    errors = runNamedChecks(ws, def.checks, null).map((m) => ({ kind: def.checks_severity ?? 'critical', message: m }));

  r.evidence.validation = errors;
  const invalid = errors.filter((e) => e.kind === 'invalid');
  const human = errors.filter((e) => e.kind === 'needs_human');
  const critical = errors.filter((e) => e.kind === 'critical');
  st.attempts[key] = attempt;

  if (invalid.length) {
    r.evidence.outcome = 'failed';
    writeEvidence(ws, req, r.evidence);
    st.last_failure[key] = formatErrors(invalid);
    addHistory(st, { phase: def.id, agent: step.agent, result: 'fail', run: r.runId, attempt });
    log(`  failed:\n${indent(st.last_failure[key])}`);
    if (attempt >= maxAttempts) {
      setPhase(st, def.id, 'blocked', `${step.agent} failed ${attempt} attempts: ${invalid[0].message}`);
      commitWork(ws, st, `chore(${req}): ${def.id} blocked`, [], { 'AIWS-Run': r.runId });
    } else {
      saveState(ws, st);
    }
    return;
  }

  const outputs = r.scope.allowed.filter((f) => !f.startsWith(ws.workRel(req) + '/'));
  delete st.attempts[key];
  delete st.last_failure[key];

  if (human.length) {
    r.evidence.outcome = 'needs_human';
    writeEvidence(ws, req, r.evidence);
    addHistory(st, { phase: def.id, agent: step.agent, result: 'questions', run: r.runId });
    setPhase(
      st,
      def.id,
      'waiting_human',
      `blocking questions - answer with \`aiws answer ${req} -m "..."\`: ${human.map((h) => h.message).join(' | ')}`
    );
    commitWork(ws, st, `chore(${req}): ${def.id} has blocking questions`, outputs, { 'AIWS-Run': r.runId });
    return;
  }

  if (critical.length) {
    r.evidence.outcome = 'critical_findings';
    writeEvidence(ws, req, r.evidence);
    const target = def.on_critical ?? 'planning';
    addFeedback(st, target, `${def.id} critical findings`, `Add fix tasks for: ${critical.map((c) => c.message).join(' | ')}`);
    addHistory(st, { phase: def.id, agent: step.agent, result: 'critical', run: r.runId, findings: critical.length });
    enterPhase(ws, st, target);
    commitWork(ws, st, `chore(${req}): ${def.id} found ${critical.length} critical issue(s)`, outputs, { 'AIWS-Run': r.runId });
    log(`  ${critical.length} critical finding(s) -> ${target}`);
    return;
  }

  r.evidence.outcome = 'ok';
  writeEvidence(ws, req, r.evidence);
  addHistory(st, { phase: def.id, agent: step.agent, result: 'ok', run: r.runId });
  if (def.id === 'planning' || contract.produces_plan) mergePlan(ws, st);

  if (idx + 1 < steps.length) {
    st.step_index = idx + 1;
  } else {
    if (!def.keep_feedback) st.feedback = st.feedback.filter((f) => f.phase !== def.id);
    enterPhase(ws, st, def.next);
  }
  commitWork(ws, st, `chore(${req}): ${def.id} / ${step.agent} ok`, outputs, { 'AIWS-Run': r.runId });
  log(`  ok -> ${st.phase}${st.status !== 'running' ? ` (${st.status})` : ''}`);
}

function indent(s) {
  return s
    .split('\n')
    .map((l) => '    ' + l)
    .join('\n');
}

/** Phase-specific context appended to the prompt. */
function phaseExtra(ws, st, def) {
  if (def.id === 'planning' && st.tasks.length) {
    return [
      '## Existing tasks (re-plan)',
      'A plan already exists. Keep the id, allowed_files and tests of every DONE task that is unaffected, so it stays done.',
      'Change or add tasks (new ids) only for what the new design / feedback requires.',
      '```yaml',
      YAML.stringify(st.tasks.map((t) => ({ id: t.id, status: t.status, allowed_files: t.allowed_files, tests: t.tests }))).trim(),
      '```',
    ].join('\n');
  }
  if (def.id === 'review') {
    const isSource = matcher(ws.policies.source_paths ?? ['**']);
    const files = G.git(ws.root, ['diff', '--name-only', st.base_commit, 'HEAD'], { allowFail: true })
      .stdout.split(/\r?\n/)
      .filter((f) => f && isSource(f));
    const logOut = G.git(ws.root, ['log', '--format=%h %s', `--grep=REQ-ID: ${st.req_id}`, '-F', `${st.base_commit}..HEAD`], {
      allowFail: true,
    }).stdout.trim();
    return [
      '## Diff under review',
      `Source files changed on ${st.branch} since ${String(st.base_commit).slice(0, 7)} (read them all):`,
      '```',
      files.join('\n') || '(none)',
      '```',
      'Commits:',
      '```',
      logOut || '(none)',
      '```',
    ].join('\n');
  }
  if (def.mode === 'incremental') {
    const from = st.base_commit;
    const to = st.code_head ?? 'HEAD';
    const files = G.git(ws.root, ['diff', '--name-only', from, to], { allowFail: true }).stdout.trim();
    const logOut = G.git(ws.root, ['log', '--oneline', `${from}..${to}`], { allowFail: true }).stdout.trim();
    return [
      '## Incremental mode',
      `Update aiws/knowledge/ ONLY for what changed in ${st.req_id} (${from.slice(0, 7)}..${String(to).slice(0, 7)}).`,
      'Changed files:',
      '```',
      files || '(none)',
      '```',
      'Commits:',
      '```',
      logOut || '(none)',
      '```',
    ].join('\n');
  }
  return null;
}

/** Loads 04-plan.yaml into state.tasks, keeping done tasks whose definition did not change. */
export function mergePlan(ws, st) {
  const planned = loadPlan(readTextIfExists(path.join(ws.workDir(st.req_id), '04-plan.yaml')));
  const old = new Map(st.tasks.map((t) => [t.id, t]));
  const sig = (t) => JSON.stringify({ f: [...(t.allowed_files ?? [])].sort(), t: [...(t.tests ?? [])].sort() });
  const next = planned.map((p) => {
    const task = {
      id: p.id,
      title: p.title ?? p.description ?? p.id,
      type: p.type ?? 'feat', // Conventional Commits type of the task commit
      allowed_files: p.allowed_files ?? [],
      tests: p.tests ?? [],
      depends_on: p.depends_on ?? [],
      status: 'pending',
    };
    const prev = old.get(p.id);
    if (prev && prev.status === 'done' && sig(prev) === sig(task)) {
      Object.assign(task, { status: 'done', commit: prev.commit, test_result: prev.test_result });
    }
    return task;
  });
  // done work that the new plan dropped keeps its record for traceability
  for (const prev of st.tasks) {
    if (prev.status === 'done' && !next.some((t) => t.id === prev.id)) next.push({ ...prev, dropped_from_plan: true });
  }
  st.tasks = next;
}

// ---------------------------------------------------------------- implementation loop

function pickTask(tasks) {
  const done = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const inFlight = tasks.find((t) => t.status === 'running');
  if (inFlight) return inFlight;
  return tasks.find((t) => t.status === 'pending' && (t.depends_on ?? []).every((d) => done.has(d))) ?? null;
}

function sidesOf(ws, task) {
  const sides = ws.policies.sides ?? {};
  return Object.keys(sides).filter((side) => (task.allowed_files ?? []).some((f) => matcher([sides[side]])(f)));
}

function whenMatches(ws, when, task) {
  if (!when) return true;
  const m = /^touches_(\w+)$/.exec(when);
  if (m) return task ? sidesOf(ws, task).includes(m[1]) : false;
  return true;
}

/** `{side}_build` -> one check per side the task touches (every side when there is no task). */
function expandChecks(ws, checks, task) {
  const out = [];
  for (const c of checks ?? []) {
    const entry = typeof c === 'string' ? { command: c } : c;
    if (!entry.command.includes('{side}')) {
      out.push(entry);
      continue;
    }
    const sides = task ? sidesOf(ws, task) : Object.keys(ws.policies.sides ?? {});
    for (const side of sides) out.push({ ...entry, command: entry.command.replace('{side}', side), when: undefined });
  }
  return out;
}

/** Runs configured shell checks. Each entry: {command: <policies.commands key or literal>, when, optional}. Returns failure messages. */
function runNamedChecks(ws, checks, task) {
  const failures = [];
  for (const entry of expandChecks(ws, checks, task)) {
    if (!whenMatches(ws, entry.when, task)) continue;
    const configured = ws.policies.commands?.[entry.command];
    const cmd = osCommand(configured) ?? (configured === undefined && entry.optional ? null : entry.command);
    if (!cmd) continue;
    const res = runShell(fill(cmd, { task: task?.id }), { cwd: ws.root, env: cleanEnv({}) });
    if (res.status !== 0)
      failures.push(`check '${entry.command}' failed (exit ${res.status}):\n${tail(res.stdout + '\n' + res.stderr, 3000)}`);
  }
  return failures;
}

function stepLoop(ws, st, def) {
  const req = st.req_id;
  if (def.requires_lock) Lock.acquire(ws.root, req);
  if (!st.tasks.length) {
    setPhase(st, def.id, 'blocked', 'plan has no tasks');
    saveState(ws, st);
    return;
  }
  const task = pickTask(st.tasks);
  if (!task) {
    if (st.tasks.every((t) => t.status === 'done')) {
      addHistory(st, { phase: def.id, result: 'all_tasks_done' });
      enterPhase(ws, st, def.next);
      commitWork(ws, st, `chore(${req}): all tasks done`);
    } else {
      setPhase(st, def.id, 'blocked', 'no runnable task (blocked tasks or unmet dependencies)');
      saveState(ws, st);
    }
    return;
  }

  const devStep = def.steps.find((s) => s.agent);
  const testStep = def.steps.find((s) => s.builtin === 'unit_test');
  const contract = ws.contract(devStep.contract);
  const maxAttempts = def.on_fail?.retry ?? contract.max_attempts ?? 3;
  // The task is saved as running BEFORE the agent starts. If this process is killed mid-task, the next
  // `aiws run` finds it, accepts the partly written files of the task and tells the developer about them.
  const interrupted = task.status === 'running' && task.in_progress === true;
  task.status = 'running';
  task.base ??= G.head(ws.root);
  task.in_progress = true;
  saveState(ws, st);
  const attempt = (task.attempts ?? 0) + 1;
  log(`[${req}] implementation / ${task.id} (attempt ${attempt}/${maxAttempts})${interrupted ? ' - resuming an interrupted attempt' : ''}`);

  const qRel = ws.workRel(req, 'questions.md');
  const qBefore = readTextIfExists(ws.abs(qRel));
  const failure = interrupted ? [INTERRUPTED_NOTE, task.last_failure].filter(Boolean).join('\n') : task.last_failure;
  const r = executeAgent(ws, st, { req, phase: def.id, agentId: devStep.agent, contract, task, attempt, failure });
  delete task.in_progress;
  const errors = [...r.errors];

  const qAfter = readTextIfExists(ws.abs(qRel));
  if (!errors.length && qAfter && qAfter.trim() && qAfter !== qBefore) {
    r.evidence.outcome = 'question';
    writeEvidence(ws, req, r.evidence);
    addHistory(st, { phase: def.id, task: task.id, result: 'question', run: r.runId });
    enterPhase(ws, st, def.on_question ?? 'design_change_requested');
    commitWork(ws, st, `chore(${req}): ${task.id} raised a design question`, [], { 'AIWS-Run': r.runId });
    log(`  developer raised a question -> ${st.phase}`);
    return;
  }

  let testsRan = false;
  if (!errors.length) {
    errors.push(...runNamedChecks(ws, contract.checks, task).map((m) => ({ kind: 'invalid', message: m })));
  }
  if (!errors.length && testStep) {
    testsRan = true;
    errors.push(...runUnitTests(ws, st, task, attempt, r.runId).map((m) => ({ kind: 'invalid', message: m })));
  }

  r.evidence.validation = errors;
  task.attempts = attempt;
  if (errors.length) {
    r.evidence.outcome = 'failed';
    writeEvidence(ws, req, r.evidence);
    task.last_failure = formatErrors(errors);
    if (testsRan) task.test_result = 'fail';
    addHistory(st, { phase: def.id, task: task.id, result: 'fail', run: r.runId, attempt });
    log(`  failed:\n${indent(task.last_failure)}`);
    if (attempt >= maxAttempts) {
      task.status = 'blocked';
      setPhase(st, def.id, 'blocked', `${task.id} failed ${attempt} attempts; fix it by hand then \`aiws resume ${req}\``);
    }
    saveState(ws, st);
    return;
  }

  const inTask = matcher(task.allowed_files);
  const codeFiles = G.changedSince(ws.root, task.base).filter((f) => inTask(f));
  if (!codeFiles.length) {
    task.last_failure = '- the task produced no changes in its allowed_files';
    addHistory(st, { phase: def.id, task: task.id, result: 'fail', run: r.runId, attempt });
    r.evidence.outcome = 'failed';
    writeEvidence(ws, req, r.evidence);
    if (attempt >= maxAttempts) {
      task.status = 'blocked';
      setPhase(st, def.id, 'blocked', `${task.id} produced no changes`);
    }
    saveState(ws, st);
    return;
  }

  r.evidence.outcome = 'ok';
  writeEvidence(ws, req, r.evidence);
  task.test_result = 'pass';
  delete task.last_failure;
  saveState(ws, st);
  const message = [
    `${task.type ?? 'feat'}(${req}): ${task.id} ${task.title ?? ''}`.trim(),
    '',
    `REQ-ID: ${req}`,
    `Task: ${task.id}`,
    `Tests: ${(task.tests ?? []).join(', ') || '-'}`,
    `AIWS-Run: ${r.runId}`,
  ].join('\n');
  const sha = G.commit(ws.root, message + '\n', [...codeFiles, ws.workRel(req)]);
  task.status = 'done';
  task.commit = sha;
  delete task.base;
  addHistory(st, { phase: def.id, task: task.id, result: 'done', run: r.runId, commit: sha?.slice(0, 7) });
  commitWork(ws, st, `chore(${req}): ${task.id} done`);
  log(`  ${task.id} done (${sha?.slice(0, 7)})`);
}

/**
 * Matches a TC id however a test framework carries it: `"TC-3"` in a display name / tag / trait / marker,
 * `test_tc_3` (snake_case), `TestTC3` (camel/Pascal case), `// TC-3` comments. Never `TC-30` for `TC-3`.
 */
export function tcPattern(tc) {
  const n = /^TC-(\d+)$/i.exec(tc)?.[1];
  if (!n) return new RegExp(`\\b${tc}\\b`);
  const standalone = new RegExp(`(?<![A-Za-z0-9])tc[-_ ]?${n}(?![0-9])`, 'i');
  const camel = new RegExp(`(?<=[a-z_])TC[-_]?${n}(?![0-9])`); // TestTC3_..., shouldPassTC3
  return { test: (s) => standalone.test(s) || camel.test(s) };
}

/** Runs the full test suite of every side the task touches, records evidence, checks TC ids are referenced. */
function runUnitTests(ws, st, task, attempt, runId) {
  const req = st.req_id;
  const failures = [];
  const results = [];
  const sides = sidesOf(ws, task);
  for (const side of sides) {
    const cmd = osCommand(ws.policies.commands?.[`${side}_test`]);
    if (!cmd) {
      failures.push(
        `no '${side}_test' command configured in aiws/config/policies.yaml (a human runs \`aiws detect --write\` or fills it in)`
      );
      continue;
    }
    const started = Date.now();
    const res = runShell(cmd, { cwd: ws.root, env: cleanEnv({}), timeout: 30 * 60 * 1000 });
    results.push({
      side,
      command: cmd,
      exit_code: res.status,
      duration_ms: Date.now() - started,
      output_tail: tail(res.stdout + '\n' + res.stderr, 4000),
    });
    if (res.status !== 0) failures.push(`${side} tests failed (${cmd}):\n${tail(res.stdout + '\n' + res.stderr, 3000)}`);
  }

  // every test case of the task must be referenced (by id) in a file the task changed
  const inTask = matcher(task.allowed_files);
  const files = G.changedSince(ws.root, task.base).filter((f) => inTask(f));
  const text = files.map((f) => readTextIfExists(ws.abs(f)) ?? '').join('\n');
  for (const tc of task.tests ?? []) {
    if (!tcPattern(tc).test(text))
      failures.push(`${tc} is not referenced in any test changed by ${task.id} (put the TC id in the test name or an adjacent comment)`);
  }

  writeYaml(path.join(ws.workDir(req), 'evidence', 'test-results', `${task.id}-attempt-${attempt}.yaml`), {
    req,
    task: task.id,
    attempt,
    run: runId,
    at: nowIso(),
    tests: task.tests ?? [],
    result: failures.length ? 'fail' : 'pass',
    suites: results,
    problems: failures,
  });
  return failures;
}

// ---------------------------------------------------------------- discovery

/** `aiws discover`: builds (or incrementally refreshes) aiws/knowledge/ outside any REQ. */
export function runDiscover(ws, { maxAttempts } = {}) {
  const req = '_discover';
  const contract = ws.contract('contracts/discover.yaml');
  const max = maxAttempts ?? contract.max_attempts ?? 2;
  const seqFile = path.join(ws.workDir(req), 'seq.yaml');
  const counter = {
    req_id: req,
    requirement: '(none - repository discovery)',
    feedback: [],
    ...(YAML.parse(readTextIfExists(seqFile) ?? '') ?? {}),
  };
  const { report } = detectStacks(ws.root);
  const extra = [
    '## Detected stacks (heuristic - verify against the code)',
    reportText(report),
    'The workspace may use any language. Describe each source-* directory in its own terms (framework, build tool, test framework).',
  ].join('\n');
  let failure = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    log(`[discover] attempt ${attempt}/${max}`);
    const r = executeAgent(ws, counter, {
      req,
      phase: 'discover',
      agentId: contract.agent ?? 'discovery',
      contract,
      attempt,
      failure,
      extra,
    });
    writeYaml(seqFile, { run_seq: counter.run_seq });
    let errors = r.errors;
    if (!errors.length) errors = validateOutputs(ws, contract, { req }).errors;
    r.evidence.validation = errors;
    r.evidence.outcome = errors.length ? 'failed' : 'ok';
    writeEvidence(ws, req, r.evidence);
    if (!errors.length) {
      const sha = G.commit(ws.root, `docs(knowledge): discover knowledge base\n\nAIWS-Run: ${r.runId}\n`, [
        'aiws/knowledge',
        ws.workRel(req),
      ]);
      log(`  knowledge written${sha ? ` (${sha.slice(0, 7)})` : ''}. Review aiws/knowledge/ and correct it before the first REQ.`);
      return { ok: true };
    }
    failure = formatErrors(errors);
    log(`  failed:\n${indent(failure)}`);
  }
  return { ok: false, failure };
}
