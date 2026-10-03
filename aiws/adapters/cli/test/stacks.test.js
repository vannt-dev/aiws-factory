import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { detectStacks, commandPrefixes } from '../src/stacks.js';
import { tcPattern } from '../src/engine.js';
import { allowedTools } from '../src/adapters/claude.js';
import { replaceYamlBlock } from '../src/util.js';
import { tempDir, makeWorkspace, ok, readFile, git } from './helpers.js';

function tree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
}

test('detectStacks recognises many languages and treats legacy as read-only', () => {
  const root = tempDir('aiws-stk-');
  tree(root, {
    'source-be/pom.xml': '<project/>',
    'source-be/mvnw': '',
    'source-api/Api.sln': '',
    'source-api/src/Api.csproj': '',
    'source-worker/go.mod': 'module w',
    'source-ml/pyproject.toml': '[project]',
    'source-fe/package.json': JSON.stringify({ scripts: { build: 'vite build', test: 'vitest run' } }),
    'source-fe/pnpm-lock.yaml': '',
    'source-mobile/pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter\n',
    'source-portal/composer.json': '{}',
    'source-legacy/PAYROLL.cbl': '',
    'source-legacy/CUST.cbl': '',
    'source-legacy/screens/main.frm': '',
  });
  const { sides, commands, report } = detectStacks(root);
  assert.deepEqual(Object.keys(sides).sort(), ['api', 'be', 'fe', 'ml', 'mobile', 'portal', 'worker']);
  assert.equal(sides.legacy, undefined);
  // tests run without -q so the evidence keeps the "Tests run: N" summary; the build stays quiet
  assert.deepEqual(commands.be_test, { windows: 'cd source-be && .\\mvnw.cmd -B -ntp test', posix: 'cd source-be && ./mvnw -B -ntp test' });
  assert.equal(commands.be_build.posix, 'cd source-be && ./mvnw -q -DskipTests package');
  assert.equal(commands.api_test, 'dotnet test source-api/Api.sln');
  assert.equal(commands.worker_test, 'go -C source-worker test ./...');
  assert.equal(commands.ml_test, 'python -m pytest -q source-ml');
  assert.equal(commands.fe_test, 'pnpm --dir source-fe test');
  assert.equal(commands.mobile_test, 'cd source-mobile && flutter test');
  assert.ok(commands.portal_test.posix.includes('phpunit'));
  const legacy = report.find((r) => r.dir === 'source-legacy');
  assert.equal(legacy.side, null);
  assert.equal(legacy.languages[0], '.cbl:2');
});

test('aiws detect --write merges into policies.yaml, keeps comments and existing commands', () => {
  const root = makeWorkspace();
  tree(root, { 'source-be/go.mod': 'module x' });
  const before = readFile(root, 'aiws/config/policies.yaml');
  assert.match(before, /be_test: node --test/);
  ok(root, ['detect']);
  assert.equal(readFile(root, 'aiws/config/policies.yaml'), before, 'without --write nothing changes');
  ok(root, ['detect', '--write']);
  let pol = YAML.parse(readFile(root, 'aiws/config/policies.yaml'));
  assert.match(pol.commands.be_test, /node --test/, 'existing command kept');
  ok(root, ['detect', '--write', '--force']);
  pol = YAML.parse(readFile(root, 'aiws/config/policies.yaml'));
  assert.equal(pol.commands.be_test, 'go -C source-be test ./...');
  assert.deepEqual(pol.sides, { be: 'source-be/**', fe: 'source-fe/**' });
  git(root, ['checkout', '--', 'aiws/config/policies.yaml']);
  // the real kit file: only the commands block changes, every other line stays byte-for-byte
  const kit = tempDir('aiws-kit-');
  ok(kit, ['init']);
  const kitBefore = readFile(kit, 'aiws/config/policies.yaml');
  tree(kit, { 'source-be/Svc.csproj': '' });
  ok(kit, ['detect', '--write']);
  const text = readFile(kit, 'aiws/config/policies.yaml');
  const untouched = kitBefore.split('\n').filter((l) => !/^commands:/.test(l));
  for (const line of untouched) assert.ok(text.split('\n').includes(line), `line changed or lost: ${line}`);
  assert.match(text, /^commands:\n {2}be_build: dotnet build source-be\/Svc\.csproj\n {2}be_test: dotnet test source-be\/Svc\.csproj$/m);
  assert.match(text, /^protected_paths: {12}# không agent nào được ghi, ở mọi phase$/m, 'aligned inline comment kept');
  // idempotent: a second run writes nothing
  const again = ok(kit, ['detect', '--write']);
  assert.match(again.stdout, /already up to date/);
  assert.equal(readFile(kit, 'aiws/config/policies.yaml'), text);
});

test('replaceYamlBlock replaces one top-level block and keeps everything else', () => {
  const src = ['# header', 'a: 1   # keep me', 'list:', '  - x   # old', '', '# about b', 'b: [ 1,2 ]', ''].join('\n');
  assert.equal(
    replaceYamlBlock(src, 'list', ['y', 'z']),
    ['# header', 'a: 1   # keep me', 'list:', '  - y', '  - z', '', '# about b', 'b: [ 1,2 ]', ''].join('\n')
  );
  assert.equal(replaceYamlBlock(src, 'a', 2).split('\n')[1], 'a: 2   # keep me');
  assert.ok(replaceYamlBlock(src, 'c', { k: 'v' }).endsWith('b: [ 1,2 ]\n\nc:\n  k: v\n'));
});

test('headless Bash permissions are derived from the project commands, for any language', () => {
  const ws = {
    policies: {
      sides: { be: 'source-be/**', fe: 'source-fe/**' },
      commands: {
        be_build: 'dotnet build source-be',
        be_test: 'dotnet test source-be',
        fe_test: { windows: 'cd source-fe && npm test', posix: 'cd source-fe && npm test' },
      },
      bash_allow_extra: ['ls'],
    },
  };
  const tools = allowedTools(ws, { tools: ['read', 'edit', 'write', 'bash'], bash_allow: ['{side}_build', '{side}_test'] });
  assert.ok(tools.includes('Bash(dotnet build *)'));
  assert.ok(tools.includes('Bash(dotnet test *)'));
  assert.ok(tools.includes('Bash(npm test *)'));
  assert.ok(tools.includes('Bash(ls *)'));
  assert.ok(!tools.includes('Bash'), 'never unrestricted Bash');
  const none = allowedTools({ policies: { sides: {}, commands: {} } }, { tools: ['read', 'bash'], bash_allow: ['{side}_test'] });
  assert.ok(!none.some((t) => t.startsWith('Bash')), 'no commands configured -> no shell');
  assert.deepEqual(commandPrefixes('mvn -q -f source-be/pom.xml test'), ['mvn']);
  assert.deepEqual(commandPrefixes('go -C source-be test ./...'), ['go']);
  assert.deepEqual(commandPrefixes('cd source-be && ./mvnw -q test'), ['cd source-be', './mvnw']);
});

test('headless Bash permissions include both OS variants of a command', () => {
  const ws = {
    policies: {
      sides: { be: 'source-be/**' },
      commands: { be_test: { windows: 'cd source-be && .\\mvnw.cmd -q test', posix: 'cd source-be && ./mvnw -q test' } },
    },
  };
  const tools = allowedTools(ws, { tools: ['read', 'bash'], bash_allow: ['{side}_test'] });
  // the orchestrator runs the windows form in cmd.exe; the agent types the posix form in Git Bash
  assert.ok(tools.includes('Bash(.\\mvnw.cmd *)'));
  assert.ok(tools.includes('Bash(./mvnw *)'));
  assert.ok(tools.includes('Bash(cd source-be *)'));
});

test('TC ids are recognised in every language naming style', () => {
  const p = tcPattern('TC-3');
  for (const s of [
    "test('TC-3: x')",
    '@DisplayName("TC-3: x")',
    'def test_tc_3_returns_404():',
    'func TestTC3_Returns404(t *testing.T)',
    'public void TC3_Works()',
    '# tc-3',
    'fn tc_3_ok()',
  ]) {
    assert.ok(p.test(s), s);
  }
  for (const s of ["test('TC-30: x')", 'def test_tc_31():', 'ATC3']) assert.ok(!p.test(s), s);
});
