import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeWorkspace, aiws, ok, state, scenario, readFile, SCRIPTED } from './helpers.js';
import { Workspace } from '../src/workspace.js';

/** The scripted architect of the small profile: design, contract and test spec in one run. */
function smallArchitect() {
  const run = (name) => `await import(${JSON.stringify(pathToFileURL(path.join(SCRIPTED, name)).href)});`;
  return scenario({ 'architect.js': [run('architect.js'), run('test-designer.js')].join('\n') });
}

test('--profile small: one design step writes the design, the contract and the test spec; the rest is unchanged', () => {
  const root = makeWorkspace({ discover: true });
  const env = smallArchitect();
  const created = ok(root, ['new', 'REQ-001', '--profile', 'small']);
  assert.match(created.stdout, /on profile small/);
  assert.equal(state(root).profile, 'small');
  assert.match(readFile(root, 'aiws/work/REQ-001/state.yaml'), /^profile: small$/m);

  ok(root, ['run', 'REQ-001'], { env });
  let st = state(root);
  assert.equal(st.phase, 'design_approval', st.reason);
  const runs = fs.readdirSync(path.join(root, 'aiws/work/REQ-001/evidence/runs')).filter((f) => f.endsWith('.json'));
  assert.equal(runs.length, 2, 'analyst and architect: no test-designer run');
  const prompt = readFile(root, 'aiws/work/REQ-001/evidence/runs/run-0002.prompt.md');
  assert.match(prompt, /## Notes for this phase\n- This requirement runs on the "small" profile/);
  assert.match(prompt, /aiws\/work\/REQ-001\/03-test-spec\.md \(required headings: Chiến lược \| Test cases \| Ma trận AC\)/);
  assert.match(ok(root, ['status', 'REQ-001']).stdout, /profile: small/);

  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.ok(st.tasks.every((t) => t.status === 'done'));
  // the design gate still holds: a changed design invalidates the approval
  fs.appendFileSync(path.join(root, 'aiws/work/REQ-001/02-design.md'), '\nchanged\n');
  const r = aiws(root, ['check', 'approvals', '--req', 'REQ-001']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /design approval invalid/);
});

test('a small-profile architect that forgets the test spec is sent back with the missing file named', () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001', '--profile', 'small']);
  ok(root, ['run', 'REQ-001']); // the default architect writes no test spec
  const st = state(root);
  assert.equal(st.status, 'blocked');
  assert.match(st.reason, /architect failed 3 attempts: Missing required output aiws\/work\/REQ-001\/03-test-spec\.md/);
});

test('an unknown profile is refused before anything is created, and the profile follows the requirement', () => {
  const root = makeWorkspace({ discover: true });
  const r = aiws(root, ['new', 'REQ-001', '--profile', 'huge']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown profile 'huge'/);
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-001')));

  const ws = new Workspace(root);
  assert.deepEqual(ws.listProfiles(), ['small']);
  assert.equal(ws.profile, null);
  ws.useProfile('small');
  assert.equal(ws.profile, 'small');
  assert.equal(ws.workflow.name, 'software-project-small');
  assert.equal(ws.workflow.language, 'vi', 'keys the profile leaves out come from workflow.yaml');
  assert.deepEqual(ws.workflow.prerequisites, ['aiws/knowledge/system-map.md']);
  assert.equal(ws.phaseDef('design').steps.length, 1);
  ws.useProfile(null);
  assert.equal(ws.workflow.name, 'software-project-mvp');
  assert.equal(ws.phaseDef('design').steps.length, 2);
});
