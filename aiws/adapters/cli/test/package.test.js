import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir, cleanEnv, ok, aiws, makeWorkspace, git, CLI_ROOT } from './helpers.js';
import { Workspace } from '../src/workspace.js';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: cleanEnv(), shell: process.platform === 'win32' });

/**
 * What a person gets from npm: the package packed from this repository (prepack bundles the kit), installed
 * into an empty folder, and `aiws init` run from that installation and nowhere near the repository.
 */
test('the packed package carries the kit, and aiws init from it creates a whole workspace', () => {
  const packDir = tempDir('aiws-pack-');
  const packed = run(npm, ['pack', '--pack-destination', packDir, '--json'], CLI_ROOT);
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  const [info] = JSON.parse(packed.stdout);
  const files = info.files.map((f) => f.path);
  for (const p of [
    'bin/aiws.js',
    'src/cli.js',
    'src/kit-manifests/0.5.0.json',
    'kit/config/workflow.yaml',
    'kit/agents/developer.md',
    'kit/templates/en/01-analysis.md',
    'kit/docs/handbook.md',
    'kit/AGENTS.md',
    'kit/VERSION',
    'README.md',
  ]) {
    assert.ok(files.includes(p), `${p} is not in the package`);
  }
  assert.ok(!files.some((f) => f.startsWith('test/') || f.startsWith('kit/work')), 'no tests, no work directory');
  // the bundled kit is not left in the working tree
  assert.ok(!fs.existsSync(path.join(CLI_ROOT, 'kit')), 'postpack removes kit/');

  const installDir = tempDir('aiws-install-');
  fs.writeFileSync(path.join(installDir, 'package.json'), '{"name":"consumer","private":true}\n');
  const installed = run(npm, ['install', '--no-audit', '--no-fund', path.join(packDir, info.filename)], installDir);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const bin = path.join(installDir, 'node_modules', 'aiws-factory', 'bin', 'aiws.js');
  const project = tempDir('aiws-from-npm-');
  const init = spawnSync(process.execPath, [bin, 'init'], { cwd: project, encoding: 'utf8', env: cleanEnv() });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  for (const p of [
    'aiws/config/workflow.yaml',
    'aiws/config/workflow.small.yaml',
    'aiws/agents/analyst.md',
    'aiws/skills/unit-testing/SKILL.md',
    'aiws/templates/en/05-review.md',
    'aiws/docs/handbook.vi.md',
    'AGENTS.md',
    'aiws/config/kit-version',
    'aiws/config/kit-manifest.json',
  ]) {
    assert.ok(fs.existsSync(path.join(project, p)), p);
  }
  const version = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8')).version;
  assert.equal(fs.readFileSync(path.join(project, 'aiws/config/kit-version'), 'utf8').trim(), version);
  assert.ok(!fs.existsSync(path.join(project, 'aiws/config/VERSION')), 'the bundle marker is not copied');
  const v = spawnSync(process.execPath, [bin, '--version'], { cwd: project, encoding: 'utf8', env: cleanEnv() });
  assert.equal(v.stdout.trim(), version);
});

test('a workspace whose kit is another release than the CLI is told so, once per command', () => {
  const root = makeWorkspace({ discover: true });
  const ws = new Workspace(root);
  assert.equal(ws.kitVersion, null, 'the repository itself records no kit version');
  fs.writeFileSync(path.join(root, 'aiws/config/kit-version'), '0.1.0\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'an old kit']);
  const r = ok(root, ['status']);
  assert.match(r.stderr, /kit 0\.1\.0 but the CLI is \d+\.\d+\.\d+/);
  assert.match(r.stderr, /aiws upgrade/);
  ok(root, ['new', 'REQ-001']);
  const run1 = ok(root, ['run', 'REQ-001']);
  assert.match(run1.stderr, /kit 0\.1\.0/);
  // same release: nothing said
  const version = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(root, 'aiws/config/kit-version'), `${version}\n`);
  git(root, ['commit', '-q', '-am', 'kit of this release']);
  assert.doesNotMatch(aiws(root, ['status']).stderr, /kit /);
});
