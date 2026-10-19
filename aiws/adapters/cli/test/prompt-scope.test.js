import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, ok, state, readFile } from './helpers.js';

/** The "Write scope" block of a prompt. */
const scopeOf = (prompt) => prompt.split('## Write scope (enforced)')[1].split('\n## ')[0];

test("an agent's prompt lists its own outputs, not those of the other step of its phase", () => {
  const root = makeWorkspace({ discover: true });
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  const runs = state(root).history.filter((h) => h.phase === 'design' && h.run);
  const byAgent = Object.fromEntries(runs.map((h) => [h.agent, readFile(root, `aiws/work/REQ-001/evidence/runs/${h.run}.prompt.md`)]));
  const architect = scopeOf(byAgent.architect);
  assert.match(architect, /02-design\.md/);
  assert.match(architect, /api-contract\.yaml/);
  assert.doesNotMatch(architect, /03-test-spec\.md/);
  const testDesigner = scopeOf(byAgent['test-designer']);
  assert.match(testDesigner, /03-test-spec\.md/);
  assert.doesNotMatch(testDesigner, /02-design\.md/);
});
