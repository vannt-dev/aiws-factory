import { readTextIfExists } from './util.js';
import * as P from './parse.js';
import { commitsWithTrailers } from './git.js';

/**
 * Builds the REQ -> AC -> TC -> Task -> Commit -> test result matrix.
 * Returns {rows, problems}. Any problem blocks the review phase.
 */
export function buildTrace(ws, st) {
  const req = st.req_id;
  const work = (f) => readTextIfExists(ws.abs(ws.workRel(req, f)));
  const acs = P.acceptanceCriteria(work('01-analysis.md'));
  const tcs = P.testCases(work('03-test-spec.md'));
  const tasks = st.tasks ?? [];
  const commits = commitsWithTrailers(ws.root, null, `REQ-ID: ${req}`);
  const commitBySha = new Map(commits.map((c) => [c.sha, c]));

  const problems = [];
  const rows = [];
  for (const ac of acs) {
    const covering = tcs.filter((t) => t.covers.includes(ac));
    if (!covering.length) {
      problems.push(`${ac} has no test case`);
      rows.push({ ac, tc: '-', task: '-', commit: '-', result: 'MISSING' });
      continue;
    }
    for (const tc of covering) {
      const task = tasks.find((t) => (t.tests ?? []).includes(tc.id));
      if (!task) {
        problems.push(`${tc.id} is not assigned to a task`);
        rows.push({ ac, tc: tc.id, task: '-', commit: '-', result: 'MISSING' });
        continue;
      }
      const c = task.commit ? (commitBySha.get(task.commit) ?? findByPrefix(commits, task.commit)) : null;
      const result = task.test_result ?? 'not run';
      if (task.status !== 'done') problems.push(`${task.id} (${tc.id}) is ${task.status}`);
      else if (!c) problems.push(`${task.id} commit ${task.commit ?? '(none)'} not found with trailer REQ-ID: ${req}`);
      else if (c.trailers.Task !== task.id) problems.push(`${task.id} commit ${c.sha.slice(0, 7)} has trailer Task: ${c.trailers.Task}`);
      if (result !== 'pass') problems.push(`${task.id} tests: ${result}`);
      rows.push({ ac, tc: tc.id, task: task.id, commit: c ? c.sha.slice(0, 7) : '-', result });
    }
  }
  if (!acs.length) problems.push('No acceptance criteria found in 01-analysis.md');
  return { rows, problems: [...new Set(problems)] };
}

function findByPrefix(commits, sha) {
  return commits.find((c) => c.sha.startsWith(sha)) ?? null;
}

export function traceMarkdown(req, { rows, problems }) {
  const lines = [`# Trace ${req}`, '', '| AC | Test case | Task | Commit | Test result |', '| --- | --- | --- | --- | --- |'];
  for (const r of rows) lines.push(`| ${r.ac} | ${r.tc} | ${r.task} | ${r.commit} | ${r.result} |`);
  lines.push('', problems.length ? '## Problems (block review)' : '## Problems', '');
  lines.push(...(problems.length ? problems.map((p) => `- ${p}`) : ['- none']));
  return lines.join('\n') + '\n';
}
