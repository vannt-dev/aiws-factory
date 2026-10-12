import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, ok, aiws, git, readFile, writeFile, KIT, CLI_ROOT } from './helpers.js';
import { bundledManifest, hashOf, kitFiles, manifestOf, planUpgrade } from '../src/kit.js';

const MANIFEST = 'aiws/config/kit-manifest.json';
const version = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8')).version;
const kit = (rel) => fs.readFileSync(path.join(KIT, rel.replace(/^aiws\//, '')), 'utf8');
const hash = (text) => hashOf(Buffer.from(text));

/** A project made by `aiws init`, committed, as a person would have it after the first day. */
function project() {
  const root = tempDir('aiws-up-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Tester']);
  git(root, ['config', 'user.email', 'tester@example.com']);
  git(root, ['config', 'core.autocrlf', 'false']);
  ok(root, ['init']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'aiws init']);
  return root;
}

/** Rewrites the manifest and the kit version, as an older release would have left them, and commits. */
function asOlderRelease(root, change) {
  const manifest = JSON.parse(readFile(root, MANIFEST));
  change(manifest.files);
  manifest.version = '0.1.0';
  writeFile(root, MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  writeFile(root, 'aiws/config/kit-version', '0.1.0\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'as an older release left it']);
}

test('aiws init records the kit it installed: every file with its hash', () => {
  const root = project();
  const manifest = JSON.parse(readFile(root, MANIFEST));
  assert.equal(manifest.version, version);
  assert.equal(manifest.files['aiws/agents/developer.md'], hash(kit('aiws/agents/developer.md')));
  assert.ok(manifest.files['AGENTS.md'], 'AGENTS.md is part of the kit');
  assert.ok(!manifest.files[MANIFEST] && !manifest.files['aiws/config/kit-version'], 'the record does not list itself');
  for (const rel of Object.keys(manifest.files)) assert.ok(fs.existsSync(path.join(root, rel)), rel);

  const upToDate = ok(root, ['upgrade']);
  assert.match(upToDate.stdout, new RegExp(`The kit is already that of this CLI \\(${version.replace(/\./g, '\\.')}\\)`));
  assert.equal(git(root, ['status', '--porcelain']), '', 'an upgrade with nothing to do writes nothing');
});

test('aiws upgrade: updates what the project left alone, keeps what it changed, and puts aside what both changed', () => {
  const root = project();
  const untouched = 'aiws/agents/developer.md';
  const mine = 'aiws/config/policies.yaml';
  const both = 'aiws/templates/en/01-analysis.md';
  const added = 'aiws/skills/unit-testing/SKILL.md';
  const retired = 'aiws/skills/retired/SKILL.md';
  const retiredEdited = 'aiws/skills/retired-edited/SKILL.md';
  const removedByMe = 'aiws/docs/handbook.vi.md';

  writeFile(root, untouched, 'the developer of an older release\n');
  writeFile(root, mine, readFile(root, mine) + '\n# our build commands\n');
  writeFile(root, both, 'our own analysis template\n');
  fs.rmSync(path.join(root, added));
  writeFile(root, retired, 'a skill a later release dropped\n');
  writeFile(root, retiredEdited, 'a dropped skill we had changed\n');
  fs.rmSync(path.join(root, removedByMe));
  asOlderRelease(root, (files) => {
    files[untouched] = hash('the developer of an older release\n');
    files[both] = hash('the analysis template of an older release\n');
    delete files[added]; // that release had no such file
    files[retired] = hash('a skill a later release dropped\n');
    files[retiredEdited] = hash('as that release shipped it\n');
  });
  const before = git(root, ['rev-parse', 'HEAD']);

  // --dry-run says what would happen and changes nothing
  const dry = ok(root, ['upgrade', '--dry-run']);
  assert.match(dry.stdout, new RegExp(`Kit 0\\.1\\.0 -> ${version.replace(/\./g, '\\.')} \\(dry run`));
  assert.match(dry.stdout, /Updated \(1\)[^]*aiws\/agents\/developer\.md/);
  assert.equal(git(root, ['status', '--porcelain']), '');
  assert.equal(readFile(root, untouched), 'the developer of an older release\n');

  const r = ok(root, ['upgrade']);
  assert.match(r.stdout, /Added \(1\):\n {2}aiws\/skills\/unit-testing\/SKILL\.md/);
  assert.match(r.stdout, /Updated \(1\):\n {2}aiws\/agents\/developer\.md/);
  assert.match(r.stdout, /Removed, no longer in the kit \(1\):\n {2}aiws\/skills\/retired\/SKILL\.md/);
  assert.match(r.stdout, /Yours, kept as they are \(\d+\):[^]*aiws\/config\/policies\.yaml/);
  assert.match(
    r.stdout,
    /Changed here and in the kit \(1\): yours is kept, the kit's is beside it as \*\.aiws-new\n {2}aiws\/templates\/en\/01-analysis\.md/
  );
  assert.match(r.stdout, /No longer in the kit, changed here, kept \(1\):\n {2}aiws\/skills\/retired-edited\/SKILL\.md/);
  assert.match(r.stdout, /Removed here earlier, left out \(1\):\n {2}aiws\/docs\/handbook\.vi\.md/);
  assert.match(r.stdout, /git diff/);
  assert.match(r.stdout, /aiws sync claude/);

  assert.equal(readFile(root, untouched), kit(untouched));
  assert.equal(readFile(root, added), kit(added));
  assert.match(readFile(root, mine), /# our build commands/);
  assert.equal(readFile(root, both), 'our own analysis template\n');
  assert.equal(readFile(root, `${both}.aiws-new`), kit(both));
  assert.ok(!fs.existsSync(path.join(root, retired)));
  assert.ok(fs.existsSync(path.join(root, retiredEdited)));
  assert.ok(!fs.existsSync(path.join(root, removedByMe)));
  assert.equal(readFile(root, 'aiws/config/kit-version').trim(), version);
  assert.equal(git(root, ['rev-parse', 'HEAD']), before, 'the upgrade commits nothing: the person reviews the diff');

  // the record is now that of this release, so a second run has nothing to do but remind of the merge
  const manifest = JSON.parse(readFile(root, MANIFEST));
  assert.equal(manifest.version, version);
  assert.ok(!manifest.files[retired] && !manifest.files[retiredEdited]);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'upgrade the kit']);
  const again = ok(root, ['upgrade']);
  assert.match(again.stdout, /The kit is already that of this CLI/);
  assert.match(again.stdout, /Still to merge by hand \(1\):\n {2}aiws\/templates\/en\/01-analysis\.md\.aiws-new/);
  assert.equal(git(root, ['status', '--porcelain']), '');
  // and the other commands no longer speak of a kit of another release
  assert.doesNotMatch(aiws(root, ['status']).stderr, /kit /);
});

test('aiws upgrade: without a record of how the kit was installed, a changed file is never overwritten unless forced', () => {
  const root = project();
  fs.rmSync(path.join(root, MANIFEST));
  writeFile(root, 'aiws/config/kit-version', '0.1.0\n');
  writeFile(root, 'aiws/agents/developer.md', 'who knows whose change this is\n');
  writeFile(root, 'AGENTS.md', 'our own rules\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'a workspace from before the record']);

  const r = ok(root, ['upgrade']);
  assert.match(r.stdout, /No record of how this kit was installed/);
  assert.match(r.stdout, /Changed here and in the kit \(2\)/);
  assert.equal(readFile(root, 'aiws/agents/developer.md'), 'who knows whose change this is\n');
  assert.equal(readFile(root, 'aiws/agents/developer.md.aiws-new'), kit('aiws/agents/developer.md'));
  assert.equal(readFile(root, 'AGENTS.md.aiws-new'), fs.readFileSync(path.join(KIT, '..', 'AGENTS.md'), 'utf8'));

  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'first upgrade']);
  writeFile(root, 'aiws/config/kit-version', '0.1.0\n');
  fs.rmSync(path.join(root, MANIFEST));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'forget it again']);
  const forced = ok(root, ['upgrade', '--force']);
  assert.match(forced.stdout, /Replaced by the kit's, because of --force \(2\)/);
  assert.equal(readFile(root, 'aiws/agents/developer.md'), kit('aiws/agents/developer.md'));
  assert.ok(!fs.existsSync(path.join(root, 'aiws/agents/developer.md.aiws-new')), 'a settled conflict leaves nothing beside the file');
});

test('aiws upgrade: refuses a working tree with changes, and the repository that is the kit itself', () => {
  const root = project();
  writeFile(root, 'aiws/config/kit-version', '0.1.0\n');
  const dirty = aiws(root, ['upgrade']);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.out, /Working tree is not clean/);
  assert.equal(ok(root, ['upgrade', '--dry-run']).status, 0, 'looking is always allowed');

  const repo = path.resolve(KIT, '..');
  const own = aiws(repo, ['upgrade', '--dry-run']);
  assert.notEqual(own.status, 0);
  assert.match(own.out, /is the kit itself/);
});

test('a kit of another release points to aiws upgrade', () => {
  const root = project();
  writeFile(root, 'aiws/config/kit-version', '0.1.0\n');
  git(root, ['commit', '-q', '-am', 'an old kit']);
  assert.match(ok(root, ['status']).stderr, /kit 0\.1\.0 but the CLI is \d+\.\d+\.\d+\. Run `aiws upgrade`/);
});

test('planUpgrade: line endings are not a change, and the manifest of 0.5.0 travels with the CLI', () => {
  const root = tempDir('aiws-plan-');
  const files = kitFiles();
  for (const [rel, abs] of files) writeFile(root, rel, fs.readFileSync(abs, 'utf8').replace(/\r?\n/g, '\r\n'));
  const plan = planUpgrade(root, manifestOf(files), files);
  assert.deepEqual([...new Set(plan.map((step) => step.action))], ['same']);

  // 0.5.0 wrote no record into its workspaces; the CLI carries it instead
  const old = bundledManifest('0.5.0');
  assert.equal(old.version, '0.5.0');
  assert.ok(Object.keys(old.files).length > 40);
  assert.match(old.files['aiws/agents/developer.md'], /^[0-9a-f]{64}$/);
  assert.ok(old.files['AGENTS.md']);
  assert.equal(bundledManifest('0.0.1'), null);
  assert.equal(bundledManifest('../../package'), null);
});
