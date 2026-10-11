import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import { makeWorkspace, writeFile } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { validatePlan } from '../src/validate.js';

/** Problems validatePlan reports for one task that allows the given files. */
function problems(root, files) {
  const plan = YAML.stringify({
    tasks: [{ id: 'T1', type: 'feat', title: 'be - x', description: 'x', allowed_files: files, tests: [], depends_on: [] }],
  });
  return validatePlan(new Workspace(root), plan, []);
}

test('files in the existing structure, new files, new folders and globs are accepted', () => {
  const root = makeWorkspace();
  const files = [
    'source-be/src/users.js',
    'source-be/src/nickname.js',
    'source-be/src/orders/dto/create-order.js',
    'source-be/test/*.test.js',
  ];
  assert.deepEqual(problems(root, files), []);
});

test('a file under a git-ignored path is rejected, because its commit would be empty', () => {
  const root = makeWorkspace();
  writeFile(root, 'source-be/.gitignore', 'generated/\n');
  const found = problems(root, ['source-be/node_modules/pkg/index.js', 'source-be/generated/client.js']);
  assert.equal(found.length, 2);
  assert.match(found[0], /T1: allowed file source-be\/node_modules\/pkg\/index\.js is ignored by git/);
  assert.match(found[1], /source-be\/generated\/client\.js is ignored by git/);
});

test('a path that climbs out of its folder is rejected', () => {
  const root = makeWorkspace();
  const found = problems(root, ['source-be/../aiws/config/policies.yaml', 'source-be/src/../../README.md']);
  assert.equal(found.length, 2);
  for (const message of found) assert.match(message, /must not contain '\.\.'/);
});

test('a folder named without a glob is rejected with the glob to use', () => {
  const root = makeWorkspace();
  const found = problems(root, ['source-be/src']);
  assert.equal(found.length, 1);
  assert.match(found[0], /source-be\/src is a folder/);
  assert.match(found[0], /source-be\/src\/\*\*/);
});

test('a workspace that is not a git repository skips the ignore check', () => {
  const root = makeWorkspace();
  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
  assert.deepEqual(problems(root, ['source-be/node_modules/pkg/index.js']), []);
});
