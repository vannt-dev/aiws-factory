import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, EXIT_TEMPFAIL, log, warn, writeText, writeYaml, readYaml, nowIso } from './util.js';
import { assertReqId } from './workspace.js';
import { loadState, listReqs } from './state.js';
import { executeAgent, writeEvidence } from './engine.js';
import { buildPrompt } from './prompt.js';
import { preflightAdapters } from './adapters/index.js';
import * as G from './git.js';

// `aiws drift [REQ...]`: for requirements that are done, a fresh read-only agent compares the claims of their
// design documents with the code as it is today, and answers with the claims that no longer hold. The
// orchestrator writes that answer to aiws/work/<REQ>/drift/<date>.md. Exit 0: no drift; 1: drift found;
// 2: a requirement could not be checked; 75: paused by the AI usage limit.

export const EXIT_DRIFT = 1;
export const EXIT_DRIFT_ERROR = 2;

const PHASE = 'drift';
const PSEUDO_REQ = '_drift'; // where the runs leave their evidence, apart from the requirements' own runs
/** The documents whose claims are checked, and those the agent reads to find its way, in aiws/work/<REQ>/. */
const CLAIM_DOCS = ['02-design.md', '03-test-spec.md', 'api-contract.yaml'];
const CONTEXT_DOCS = ['01-analysis.md', '04-plan.yaml'];

/** A file:line location, with / or \ separators: `source-be/src/users.js:12`. */
const LOCATION = /([\w.@-]+(?:[/\\][\w.@-]+)*\.[A-Za-z0-9]+):(\d+)/g;

/**
 * The findings and the summary line of a drift checker's answer, or `{error}` when the answer cannot be trusted:
 * no summary line, a finding without a file:line in the code, or a summary that reports drift with no finding.
 */
export function parseDriftAnswer(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim());
  const findings = lines.filter((l) => /^[-*]\s*\[drift\]/i.test(l)).map((l) => l.replace(/^[-*]\s*/, '- '));
  const summary = lines.findLast((l) => /^(\*\*)?summary(\*\*)?\s*:/i.test(l))?.replace(/\*\*/g, '');
  if (!summary) return { error: 'the answer has no `Summary:` line' };
  const unproven = findings.filter((f) => ![...f.matchAll(LOCATION)].some((m) => !/^aiws[/\\]/i.test(m[1])));
  if (unproven.length) {
    return {
      error: `these findings give no file:line evidence in the code (a location outside aiws/):\n${unproven.join('\n')}`,
    };
  }
  if (!findings.length && !/\bno drift\b/i.test(summary)) {
    return { error: `the summary (${summary}) reports drift but the answer lists no [drift] finding` };
  }
  return { findings, summary };
}

function driftContract(ws) {
  try {
    const contract = ws.contract('contracts/drift.yaml');
    ws.agent(contract.agent ?? 'drift-checker');
    // the knowledge base is optional here: a file the workspace does not have is not offered to read
    const reads = (contract.reads ?? []).filter((r) => fs.existsSync(ws.abs(String(r).replace(/#.*$/, '').trim())));
    return { ...contract, reads };
  } catch (err) {
    throw new AiwsError(`${err.message}. This workspace's kit predates \`aiws drift\`: run \`aiws upgrade\` to add it.`, EXIT_DRIFT_ERROR);
  }
}

/** The requirements to check: the ones named (each must be done), else every done requirement of aiws/work/. */
export function driftTargets(ws, reqs = []) {
  if (!reqs.length)
    return listReqs(ws)
      .map((r) => loadState(ws, r))
      .filter((st) => st.status === 'done');
  return reqs.map((r) => {
    let st;
    try {
      st = loadState(ws, assertReqId(r));
    } catch (err) {
      throw new AiwsError(err.message, EXIT_DRIFT_ERROR);
    }
    if (st.status !== 'done') {
      throw new AiwsError(
        `${st.req_id} is not finished (phase ${st.phase}, status ${st.status}): \`aiws drift\` checks the design of a finished requirement against the code.`,
        EXIT_DRIFT_ERROR
      );
    }
    return st;
  });
}

function present(ws, req, names) {
  return names.map((n) => ws.workRel(req, n)).filter((rel) => fs.existsSync(ws.abs(rel)));
}

/** What the prompt says of the requirement under check: its documents and where its code lives. */
function driftExtra(ws, st) {
  const claims = present(ws, st.req_id, CLAIM_DOCS);
  if (!claims.length) {
    throw new AiwsError(`${st.req_id} has no design document to check (${CLAIM_DOCS.join(', ')}).`, EXIT_DRIFT_ERROR);
  }
  const context = [st.requirement, ...present(ws, st.req_id, CONTEXT_DOCS)].filter(Boolean);
  const code = Object.values(ws.policies.sides ?? {}).map((g) => String(g).replace(/\/\*\*$/, '/'));
  return [
    '## Drift check',
    `${st.req_id} (${st.title ?? ''}) was finished earlier; the code may have changed since. Compare every claim of its design documents with the code as it is now.`,
    'Claims to check:',
    ...claims.map((c) => `- ${c}`),
    'Context (what was asked, and the files its tasks changed):',
    ...context.map((c) => `- ${c}`),
    `The code: ${code.length ? code.join(', ') : 'the source-* directories'} (source-legacy/ is not checked).`,
  ].join('\n');
}

function counterFor(st, seq) {
  return { req_id: st.req_id, requirement: st.requirement, feedback: [], run_seq: seq.run_seq ?? 0 };
}

function reportText(ws, st, { findings, summary, runId, docs }) {
  const en = ws.language === 'en';
  const head = G.isRepo(ws.root) ? G.revParse(ws.root, 'HEAD') : null;
  const branch = G.isRepo(ws.root) ? G.currentBranch(ws.root) : null;
  const at = nowIso();
  return [
    `# ${st.req_id} — Drift report ${at.slice(0, 10)}`,
    '',
    `- ${en ? 'Checked' : 'Kiểm tra lúc'}: ${at}${head ? ` (${en ? 'commit' : 'commit'} ${head.slice(0, 7)}${branch ? `, ${branch}` : ''})` : ''}`,
    `- ${en ? 'Design documents' : 'Tài liệu design'}: ${docs.join(', ')}`,
    `- ${en ? 'Run' : 'Lượt chạy'}: ${runId} (aiws/work/${PSEUDO_REQ}/evidence/runs/${runId}.json)`,
    '',
    `## ${en ? 'Summary' : 'Tóm tắt'}`,
    findings.length
      ? en
        ? `DRIFT: ${findings.length} claim(s) of the design no longer match the code.`
        : `DRIFT: ${findings.length} khẳng định của design không còn khớp với code.`
      : en
        ? 'No drift: every claim checked still matches the code.'
        : 'Không có drift: mọi khẳng định đã kiểm vẫn khớp với code.',
    '',
    summary,
    '',
    '## Findings',
    ...(findings.length ? findings : [en ? 'None.' : 'Không có.']),
    '',
  ].join('\n');
}

/**
 * Checks each requirement in turn, up to the contract's max_attempts each. Returns the exit code: the worst of
 * 0 (no drift), 1 (drift), 2 (a requirement could not be checked); 75 stops at once (AI usage limit).
 */
export function runDrift(ws, reqs = [], { dryRun = false } = {}) {
  const contract = driftContract(ws);
  const agentId = contract.agent ?? 'drift-checker';
  const targets = driftTargets(ws, reqs);
  if (!targets.length) {
    log('No finished requirement to check: `aiws drift` compares the design of requirements that are done with the code.');
    return 0;
  }
  const seqFile = path.join(ws.workDir(PSEUDO_REQ), 'seq.yaml');
  const seq = readYaml(seqFile) ?? {};
  if (dryRun) {
    for (const st of targets) {
      const extra = driftExtra(ws, st);
      log(buildPrompt(ws, counterFor(st, seq), { phase: PHASE, agentId, contract, extra }));
    }
    return 0;
  }
  preflightAdapters(ws, [PHASE]);
  const max = contract.max_attempts ?? 2;
  let code = 0;
  for (const st of targets) {
    const extra = driftExtra(ws, st);
    const docs = present(ws, st.req_id, CLAIM_DOCS);
    let failure = null;
    let done = false;
    for (let attempt = 1; attempt <= max && !done; attempt++) {
      log(`[drift] ${st.req_id} attempt ${attempt}/${max}`);
      const counter = counterFor(st, seq);
      const r = executeAgent(ws, counter, { req: PSEUDO_REQ, phase: PHASE, agentId, contract, attempt, failure, extra });
      seq.run_seq = counter.run_seq;
      writeYaml(seqFile, { run_seq: seq.run_seq });
      r.evidence.checked_req = st.req_id;
      if (r.usageLimit) {
        r.evidence.outcome = 'usage_limit';
        writeEvidence(ws, PSEUDO_REQ, r.evidence);
        log(`Drift check paused by the AI usage limit (${r.usageLimit}). Run \`aiws drift\` again once the limit resets.`);
        return EXIT_TEMPFAIL;
      }
      let errors = r.errors.map((e) => e.message);
      const answer = errors.length ? null : parseDriftAnswer(r.res.report?.result ?? r.res.raw);
      if (answer?.error) errors = [answer.error];
      r.evidence.validation = errors.map((message) => ({ kind: 'invalid', message }));
      r.evidence.outcome = errors.length ? 'failed' : 'ok';
      writeEvidence(ws, PSEUDO_REQ, r.evidence);
      if (errors.length) {
        failure = errors.join('\n');
        log(`  failed: ${failure.split('\n').join('\n    ')}`);
        continue;
      }
      done = true;
      const rel = ws.workRel(st.req_id, `drift/${nowIso().slice(0, 10)}.md`);
      writeText(ws.abs(rel), reportText(ws, st, { ...answer, runId: r.runId, docs }));
      const n = answer.findings.length;
      log(`${st.req_id}: ${n ? `${n} drift finding(s)` : 'no drift'}. Report: ${rel}`);
      if (n) code = Math.max(code, EXIT_DRIFT);
    }
    if (!done) {
      warn(`${st.req_id}: could not be checked; see aiws/work/${PSEUDO_REQ}/evidence/runs/.`);
      code = Math.max(code, EXIT_DRIFT_ERROR);
    }
  }
  return code;
}
