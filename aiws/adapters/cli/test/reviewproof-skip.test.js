import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace, ok, writeFile } from './helpers.js';

function withReviewGate(root) {
  const wfFile = path.join(root, 'aiws/config/workflow.yaml');
  const wf = YAML.parse(fs.readFileSync(wfFile, 'utf8'));
  wf.review_gate = 'reviewproof';
  fs.writeFileSync(wfFile, YAML.stringify(wf));
}

const read = (root) => JSON.parse(fs.readFileSync(path.join(root, '.reviewproof.json'), 'utf8'));

test('sync with review_gate reviewproof: .reviewproof.json leaves the aiws run records out of coverage', () => {
  const root = makeWorkspace();
  withReviewGate(root);
  const r = ok(root, ['sync', 'claude']);
  assert.match(r.out, /\.reviewproof\.json/);
  assert.deepEqual(read(root), {
    // reviewproof's own defaults are kept: the file replaces them whole
    skip: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '**/*.snap', 'aiws/work/*/evidence/**', 'aiws/work/_discover/**'],
  });
  // a second sync changes nothing
  const before = fs.readFileSync(path.join(root, '.reviewproof.json'), 'utf8');
  ok(root, ['sync', 'claude']);
  assert.equal(fs.readFileSync(path.join(root, '.reviewproof.json'), 'utf8'), before);
});

test('sync: an existing .reviewproof.json keeps its keys and entries, the aiws patterns are added', () => {
  const root = makeWorkspace();
  withReviewGate(root);
  writeFile(root, '.reviewproof.json', JSON.stringify({ requiredGates: ['tests'], skip: ['docs/**'], evidence: ['*.png'] }));
  ok(root, ['sync', 'claude']);
  assert.deepEqual(read(root), {
    requiredGates: ['tests'],
    skip: ['docs/**', 'aiws/work/*/evidence/**', 'aiws/work/_discover/**'],
    evidence: ['*.png'],
  });
});

test('sync: a .reviewproof.json that is not JSON is left alone and said', () => {
  const root = makeWorkspace();
  withReviewGate(root);
  writeFile(root, '.reviewproof.json', '{ not json');
  const r = ok(root, ['sync', 'claude']);
  assert.match(r.out, /\.reviewproof\.json is not valid JSON: left as it is/);
  assert.equal(fs.readFileSync(path.join(root, '.reviewproof.json'), 'utf8'), '{ not json');
});

test('sync without review_gate writes no .reviewproof.json', () => {
  const root = makeWorkspace();
  ok(root, ['sync', 'claude']);
  assert.equal(fs.existsSync(path.join(root, '.reviewproof.json')), false);
});
