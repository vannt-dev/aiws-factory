import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, readFile, writeFile, tempDir } from './helpers.js';

/**
 * A stand-in for document-reader: scripts/read_docx.py run by node (the configured "python"), printing the
 * JSON the real reader prints. A document is plain text here; one that says BROKEN fails as a missing module.
 */
function fakeReader() {
  const dir = tempDir('aiws-docreader-');
  fs.mkdirSync(path.join(dir, 'scripts'));
  const script =
    `const fs = require('fs');\n` +
    `const [doc, ...rest] = process.argv.slice(2);\n` +
    `fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls.json'))}, JSON.stringify(rest) + '\\n');\n` +
    `const text = fs.readFileSync(doc, 'utf8');\n` +
    `if (text.includes('BROKEN')) { process.stderr.write("ModuleNotFoundError: No module named 'docx2'\\n"); process.exit(1); }\n` +
    `process.stdout.write(JSON.stringify({ document: doc, type: 'docx', content: text, truncated: false }));\n`;
  fs.writeFileSync(path.join(dir, 'scripts', 'read_docx.py'), script);
  return dir;
}

function useReader(root, dir) {
  const rel = 'aiws/config/runtime.yaml';
  const rt = YAML.parse(readFile(root, rel));
  rt.document_reader = { path: dir, python: process.execPath };
  writeFile(root, rel, YAML.stringify(rt));
  git(root, ['commit', '-qam', 'document reader']);
}

function doc(text, name = 'spec.docx') {
  const file = path.join(tempDir('aiws-doc-'), name);
  fs.writeFileSync(file, text);
  return file;
}

const SPEC = '# Đổi nickname\nREQ-1: Người dùng đổi được nickname.\n## Acceptance\nNickname dài 3-20 ký tự.';

test('new --from-doc writes the requirement from a Word document and starts it', () => {
  const root = makeWorkspace();
  const reader = fakeReader();
  useReader(root, reader);
  const file = doc(SPEC);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

  const r = ok(root, ['new', 'REQ-002', '--from-doc', file]);
  assert.match(r.stdout, /requirements\/REQ-002-doi-nickname\.md written from spec\.docx/);
  const text = readFile(root, 'requirements/REQ-002-doi-nickname.md');
  assert.match(text, /^# REQ-002 — Đổi nickname\n/);
  assert.ok(text.includes(`\`spec.docx\` (sha256 ${sha.slice(0, 12)})`), text);
  assert.match(text, /REQ-1: Người dùng đổi được nickname\.\n## Acceptance\nNickname dài 3-20 ký tự\.\n$/);
  assert.doesNotMatch(text, /^# Đổi nickname$/m, 'the heading became the title');
  // the reader is asked for the whole document
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reader, 'calls.json'), 'utf8').trim()), ['--max-chars', '2000000']);

  // committed on the base branch before the requirement branch starts, like --from-issue
  assert.equal(git(root, ['log', '-1', '--format=%s', 'main']).trim(), 'docs(REQ-002): requirement from spec.docx');
  const st = state(root, 'REQ-002');
  assert.equal(st.requirement, 'requirements/REQ-002-doi-nickname.md');
  assert.equal(st.title, 'Đổi nickname');
  assert.deepEqual(st.source_doc, { file: 'spec.docx', sha256: sha });
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
});

test('new --from-doc refuses what it cannot read, and an AI session', () => {
  const root = makeWorkspace();
  const reader = fakeReader();
  useReader(root, reader);

  let r = aiws(root, ['new', 'REQ-002', '--from-doc', doc('x', 'spec.odt')]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /\.odt is not a format document-reader reads.*\.docx.*\.pdf.*\.xlsx/s);

  r = aiws(root, ['new', 'REQ-002', '--from-doc', path.join(reader, 'nope.docx')]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /nope\.docx not found/);

  r = aiws(root, ['new', 'REQ-002', '--from-doc', doc('BROKEN')]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /document-reader could not read spec\.docx.*No module named 'docx2'.*setup-python-env/s);

  r = aiws(root, ['new', 'REQ-001', '--from-doc', doc(SPEC)]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /requirements\/REQ-001-user-nickname\.md already exists/);

  r = aiws(root, ['new', 'REQ-002', '--from-doc', doc(SPEC), '--from-issue', '12']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /--from-doc or --from-issue, not both/);

  r = aiws(root, ['new', 'REQ-002', '--from-doc', doc(SPEC)], { env: { CLAUDECODE: '1' } });
  assert.equal(r.status, 3);
  assert.match(r.out, /--from-doc writes requirements\/, which only a person may do/);

  // nothing was left behind by the refusals
  assert.ok(!fs.existsSync(path.join(root, 'aiws/work/REQ-002')));
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
});

test('without document-reader installed, new --from-doc says where to get it', () => {
  const root = makeWorkspace();
  useReader(root, tempDir('aiws-empty-'));
  const r = aiws(root, ['new', 'REQ-002', '--from-doc', doc(SPEC)]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /document-reader is not installed.*setup-document-reader.*runtime\.yaml -> document_reader/s);
});

test('revise --from-doc reads the edited document into the requirement and reopens it', () => {
  const root = makeWorkspace({ discover: true });
  useReader(root, fakeReader());
  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001']);
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001']);
  assert.equal(state(root).phase, 'pr_approval');

  // human-only, like revise itself
  const v2 = doc('# User nickname\nNickname không được trùng với nickname của người khác.\n', 'spec-v2.docx');
  let r = aiws(root, ['revise', 'REQ-001', '--from-doc', v2, '--yes', '-m', 'x'], { env: { CLAUDECODE: '1' } });
  assert.equal(r.status, 3);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');

  r = ok(root, ['revise', 'REQ-001', '--from-doc', v2, '--yes', '-m', 'unique nicknames']);
  assert.match(r.stdout, /requirements\/REQ-001-user-nickname\.md written from spec-v2\.docx/);
  const after = readFile(root, 'requirements/REQ-001-user-nickname.md');
  assert.match(after, /Nickname không được trùng với nickname của người khác\./);
  const st = state(root);
  assert.equal(st.revision, 2);
  assert.equal(st.source_doc.file, 'spec-v2.docx');
  assert.equal(YAML.parse(readFile(root, 'aiws/work/REQ-001/approvals/design-02.yaml')).decision, 'revised');
  // the reworded text is what the analysis is shown
  assert.match(st.feedback.at(-1).text, /\+Nickname không được trùng/);
});
