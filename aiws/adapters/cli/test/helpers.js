import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT = path.resolve(HERE, '..');
export const BIN = path.join(CLI_ROOT, 'bin', 'aiws.js');
export const KIT = path.resolve(CLI_ROOT, '..', '..'); // the real aiws/ folder of this repo
export const FIXTURES = path.join(HERE, 'fixtures');
export const SCRIPTED = path.join(FIXTURES, 'scripted');

// Temp workspaces are removed when the test process exits (set AIWS_KEEP_TMP=1 to inspect them).
const tempDirs = [];
export function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
process.on('exit', () => {
  if (process.env.AIWS_KEEP_TMP) return;
  for (const d of tempDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // best effort (Windows may still hold a handle)
    }
  }
});

/** Env for child processes: no Claude/AIWS session markers, deterministic git identity. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith('AIWS_') || k.startsWith('CLAUDE') || k === 'CODEX_SANDBOX' || k === 'GEMINI_CLI') delete env[k];
  }
  // inherited from the outer `node --test`; it makes the sample project's own `node --test` always exit 0
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, {
    GIT_AUTHOR_NAME: 'Tester',
    GIT_AUTHOR_EMAIL: 'tester@example.com',
    GIT_COMMITTER_NAME: 'Tester',
    GIT_COMMITTER_EMAIL: 'tester@example.com',
    AIWS_USER: 'tuan',
  });
  return { ...env, ...extra };
}

export function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * Creates a throwaway workspace: sample FE/BE/legacy + the real aiws/ kit of this repo,
 * with sample build/test commands and the scripted adapter. Returns its root.
 */
export function makeWorkspace({ discover = false } = {}) {
  const root = tempDir('aiws-ws-');
  fs.cpSync(path.join(FIXTURES, 'sample'), root, { recursive: true });
  for (const part of ['config', 'agents', 'skills', 'templates']) {
    fs.cpSync(path.join(KIT, part), path.join(root, 'aiws', part), { recursive: true });
  }
  fs.copyFileSync(path.join(KIT, '..', 'AGENTS.md'), path.join(root, 'AGENTS.md'));

  const polFile = path.join(root, 'aiws', 'config', 'policies.yaml');
  const pol = YAML.parse(fs.readFileSync(polFile, 'utf8'));
  pol.commands = {
    fe_build: 'node --check source-fe/src/view.js',
    fe_test: 'node --test "source-fe/test/*.test.js"',
    be_build: 'node --check source-be/src/users.js',
    be_test: 'node --test "source-be/test/*.test.js"',
  };
  fs.writeFileSync(polFile, YAML.stringify(pol));

  const rtFile = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(rtFile, 'utf8'));
  rt.default_adapter = 'scripted';
  rt.scripted = { dir: SCRIPTED };
  fs.writeFileSync(rtFile, YAML.stringify(rt));

  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Tester']);
  git(root, ['config', 'user.email', 'tester@example.com']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'initial']);
  if (discover) {
    const r = aiws(root, ['discover']);
    if (r.status !== 0) throw new Error(`discover failed: ${r.stderr}${r.stdout}`);
  }
  return root;
}

export function aiws(root, args, { env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env: cleanEnv(env), input });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Runs aiws and fails the test with full output when the exit code differs. */
export function ok(root, args, opts) {
  const r = aiws(root, args, opts);
  if (r.status !== 0) throw new Error(`aiws ${args.join(' ')} exited ${r.status}\n${r.out}`);
  return r;
}

export function state(root, req = 'REQ-001') {
  return YAML.parse(fs.readFileSync(path.join(root, 'aiws', 'work', req, 'state.yaml'), 'utf8'));
}

export function readFile(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

export function writeFile(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

/** A scenario dir layered over the default scripted agents. */
export function scenario(files) {
  const dir = tempDir('aiws-scn-');
  fs.copyFileSync(path.join(SCRIPTED, '_lib.js'), path.join(dir, '_lib.js'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return { AIWS_SCRIPTED_DIR: [dir, SCRIPTED].join(path.delimiter) };
}

export function mergeToMain(root, branch = 'aiws/REQ-001') {
  git(root, ['switch', '-q', 'main']);
  git(root, ['merge', '-q', '--no-ff', '-m', `Merge ${branch}`, branch]);
}
