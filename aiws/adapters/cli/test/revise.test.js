import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, readFile, writeFile, mergeToMain } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { resolveContext } from '../src/guard.js';

const REQUIREMENT = 'requirements/REQ-001-user-nickname.md';
const record = (root, name) => YAML.parse(readFile(root, `aiws/work/REQ-001/approvals/${name}`));

function editRequirement(root, line = '- Nickname không được trùng với nickname của người khác.\n') {
  writeFile(root, REQUIREMENT, readFile(root, REQUIREMENT) + line);
}

/** A requirement whose design is approved and whose tasks are done, waiting for its pull request. */
function atPrGate() {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval');
  return root;
}

test('revise reopens an approved requirement: recorded, the approval no longer counts, the design gate applies again', () => {
  const root = atPrGate();
  const approvedIn = git(root, ['log', '-1', '--format=%H', '--', 'aiws/work/REQ-001/approvals/design-01.yaml']);

  // the reason is required, and so is a change of the text
  let r = aiws(root, ['revise', 'REQ-001', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /revise needs the reason: -m/);
  r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /is the text that design-01\.yaml approved .*Edit the file first/);
  assert.equal(state(root).phase, 'pr_approval');

  editRequirement(root);
  r = ok(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);
  assert.match(r.out, /REQ-001 revision 2 opened by tuan/);
  assert.match(r.out, /design-01\.yaml covered the earlier text and no longer counts/);
  assert.match(r.out, new RegExp(`git diff ${approvedIn.slice(0, 7)} HEAD -- ${REQUIREMENT}`));
  // what hangs off the earlier text, listed as a whole
  assert.match(r.out, /cannot tell which of these the change touches/);
  assert.match(r.out, /documents: 01-analysis\.md, 02-design\.md, 03-test-spec\.md, api-contract\.yaml, .*04-plan\.yaml, 05-review\.md/);
  assert.match(r.out, /task T1 \(done\) .*commit [0-9a-f]{7}, tests TC-1, TC-2/);
  assert.match(r.out, /task T2 \(done\)/);

  let st = state(root);
  assert.equal(st.revision, 2);
  assert.equal(st.phase, 'analysis');
  assert.equal(st.status, 'running');
  assert.equal(st.branch, 'aiws/REQ-001');
  assert.deepEqual(
    st.tasks.map((t) => [t.id, t.status, t.before_revision]),
    [
      ['T1', 'done', 2],
      ['T2', 'done', 2],
    ]
  );
  const h = st.history.at(-1);
  assert.equal(h.result, 'revised');
  assert.equal(h.by, 'tuan');
  assert.equal(h.revision, 2);
  assert.equal(h.reason, 'unique nicknames');
  assert.equal(h.record, 'design-02.yaml');
  assert.equal(h.supersedes, 'design-01.yaml');
  assert.equal(h.approved_text, `${approvedIn}:${REQUIREMENT}`);
  assert.deepEqual(h.recheck.tasks, ['T1', 'T2']);
  assert.ok(h.recheck.documents.includes('02-design.md'));

  // the record: a design decision that is not an approval, with the commit of the text the approval covered
  const rec = record(root, 'design-02.yaml');
  assert.equal(rec.decision, 'revised');
  assert.equal(rec.by, 'tuan');
  assert.equal(rec.notes, 'unique nicknames');
  assert.equal(rec.revision, 2);
  assert.equal(rec.supersedes, 'design-01.yaml');
  assert.deepEqual(rec.requirement, { file: REQUIREMENT, approved_in: approvedIn });
  // the earlier text is still there, at that commit
  assert.doesNotMatch(git(root, ['show', `${approvedIn}:${REQUIREMENT}`]), /không được trùng/);

  // one commit holds the new text, the record and the state
  assert.match(git(root, ['log', '-1', '--format=%s']), /chore\(REQ-001\): requirement revised by tuan \(revision 2\)/);
  const files = git(root, ['show', '--name-only', '--format=', 'HEAD']);
  assert.match(files, /requirements\/REQ-001-user-nickname\.md/);
  assert.match(files, /approvals\/design-02\.yaml/);
  assert.equal(git(root, ['status', '--porcelain']), '');

  assert.match(ok(root, ['status', 'REQ-001']).out, /revision: 2 \(opened by tuan at .*: unique nicknames; record design-02\.yaml\)/);
  assert.match(ok(root, ['status', 'REQ-001']).out, /done before revision 2, re-check/);

  // the run starts over at the analysis, which is told what changed, and stops at the design gate
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'design_approval');
  assert.equal(st.status, 'waiting_human');
  const runs = path.join(root, 'aiws/work/REQ-001/evidence/runs');
  const analysis = st.history.findLast((x) => x.phase === 'analysis' && x.result === 'ok');
  const prompt = fs.readFileSync(path.join(runs, `${analysis.run}.prompt.md`), 'utf8');
  assert.match(prompt, /Revision 2 of the requirement, opened by tuan: unique nicknames/);
  assert.match(prompt, /\+- Nickname không được trùng với nickname của người khác\./);

  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  assert.equal(record(root, 'design-03.yaml').decision, 'approved');
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.phase, 'pr_approval');
  // the plan did not change, so the done tasks are kept, still marked as done for the earlier text
  assert.deepEqual(
    st.tasks.map((t) => [t.id, t.status, t.before_revision]),
    [
      ['T1', 'done', 2],
      ['T2', 'done', 2],
    ]
  );
  ok(root, ['check', 'approvals', '--req', 'REQ-001']);
});

test('the earlier approval cannot be used for the revised text, even with the state put back by hand', () => {
  const root = atPrGate();
  editRequirement(root);
  ok(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);

  const file = path.join(root, 'aiws/work/REQ-001/state.yaml');
  const st = state(root);
  st.phase = 'planning';
  fs.writeFileSync(file, YAML.stringify(st));
  git(root, ['commit', '-q', '-am', 'tamper']);
  const r = aiws(root, ['check', 'approvals', '--req', 'REQ-001']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /design approval invalid: latest design decision is 'revised'/);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'design_approval');
  assert.match(state(root).reason, /approval no longer valid/);
});

test('revise refuses a draft, an AI session and another branch', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'design_approval');
  editRequirement(root);

  // not approved yet: plain editing is all it takes
  let r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'x']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /REQ-001 is still a draft: its design has not been approved/);
  assert.match(r.out, /Edit requirements\/REQ-001-user-nickname\.md directly/);
  assert.equal(state(root).revision, undefined);
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-001/approvals')));
  git(root, ['checkout', '--', REQUIREMENT]);

  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  editRequirement(root);
  r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'x'], { env: { CLAUDECODE: '1' } });
  assert.equal(r.status, 3);
  assert.match(r.out, /'revise' is a human-only command/);

  // other uncommitted changes are not swept into the revision
  writeFile(root, 'source-be/src/stray.js', 'export const x = 1;\n');
  r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'x']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Working tree has changes other than requirements\/REQ-001-user-nickname\.md/);
  fs.rmSync(path.join(root, 'source-be/src/stray.js'));

  git(root, ['stash', '-q']);
  git(root, ['switch', '-q', 'main']);
  r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'x']);
  assert.notEqual(r.status, 0);
  git(root, ['switch', '-q', 'aiws/REQ-001']);
  git(root, ['stash', 'pop', '-q']);

  // approved, work not started: revised in place, on its branch
  ok(root, ['revise', 'REQ-001', '--yes', '-m', 'x']);
  assert.equal(state(root).phase, 'analysis');
  assert.equal(state(root).revision, 2);

  // a second change before the new approval: revision 3, still against the last approved text
  editRequirement(root, '- Nickname đổi được tối đa một lần mỗi ngày.\n');
  r = ok(root, ['revise', 'REQ-001', '--yes', '-m', 'y']);
  assert.match(r.out, /REQ-001 revision 3 opened/);
  assert.equal(record(root, 'design-03.yaml').supersedes, 'design-01.yaml');
  const fb = state(root).feedback.findLast((f) => f.phase === 'analysis').text;
  assert.match(fb, /\+- Nickname không được trùng/);
  assert.match(fb, /\+- Nickname đổi được tối đa một lần mỗi ngày\./);
});

test('revise reopens a finished requirement on a new branch, up to done again', () => {
  const root = atPrGate();
  mergeToMain(root);
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);

  // not during the knowledge update
  editRequirement(root);
  let r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /is in its knowledge update\. Finish it first/);
  git(root, ['checkout', '--', REQUIREMENT]);

  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).status, 'done');

  // finished: from the base branch, with the knowledge update merged
  editRequirement(root);
  r = aiws(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /REQ-001 is finished\. Revise it from its base branch main/);
  git(root, ['checkout', '--', REQUIREMENT]);
  mergeToMain(root, 'aiws/REQ-001-knowledge');
  const base = git(root, ['rev-parse', 'HEAD']);

  editRequirement(root);
  r = ok(root, ['revise', 'REQ-001', '--yes', '-m', 'unique nicknames']);
  assert.match(r.out, /reopened on the new branch aiws\/REQ-001-r2 \(from main @ /);
  assert.match(r.out, /the code merged for the earlier text/);
  assert.equal(git(root, ['branch', '--show-current']), 'aiws/REQ-001-r2');
  let st = state(root);
  assert.equal(st.branch, 'aiws/REQ-001-r2');
  assert.equal(st.base_commit, base);
  assert.equal(st.phase, 'analysis');
  assert.equal(st.status, 'running');
  assert.equal(st.code_head, undefined);
  assert.equal(st.history.at(-1).branch, 'aiws/REQ-001-r2');
  // main is untouched: the revision is a commit of the new branch
  assert.equal(git(root, ['rev-parse', 'main']), base);

  // an interactive session on the revision branch is guarded as REQ-001
  const ctx = resolveContext(new Workspace(root), {});
  assert.equal(ctx.req, 'REQ-001');
  assert.equal(ctx.phase, 'analysis');

  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'design_approval');
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval');
  ok(root, ['check', 'commit-trailer', '--req', 'REQ-001']);
  ok(root, ['check', 'approvals', '--req', 'REQ-001']);
  assert.match(ok(root, ['trace', 'REQ-001']).stdout, /- none/);

  mergeToMain(root, 'aiws/REQ-001-r2');
  ok(root, ['approve', 'REQ-001', 'pr', '--yes']);
  assert.equal(git(root, ['branch', '--show-current']), 'aiws/REQ-001-r2-knowledge');
  ok(root, ['run', 'REQ-001']);
  st = state(root);
  assert.equal(st.status, 'done');
  assert.match(st.reason, /knowledge updated on aiws\/REQ-001-r2-knowledge/);
  assert.equal(st.revision, 2);
});
