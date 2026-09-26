import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, run } from './util.js';

export function git(root, args, { allowFail = false, env } = {}) {
  const res = run('git', args, { cwd: root, env });
  if (res.status !== 0 && !allowFail) {
    throw new AiwsError(`git ${args.join(' ')} failed:\n${res.stderr.trim() || res.stdout.trim()}`);
  }
  return res;
}

export function isRepo(root) {
  return run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root }).status === 0;
}

export function head(root) {
  return git(root, ['rev-parse', 'HEAD']).stdout.trim();
}

export function hasCommits(root) {
  return git(root, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true }).status === 0;
}

export function currentBranch(root) {
  const res = git(root, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  return res.status === 0 ? res.stdout.trim() : null;
}

export function branchExists(root, name) {
  return git(root, ['rev-parse', '--verify', '-q', `refs/heads/${name}`], { allowFail: true }).status === 0;
}

/** Porcelain status entries (paths only), including every untracked file. */
export function dirtyFiles(root) {
  const out = git(root, ['status', '--porcelain', '-z', '--untracked-files=all']).stdout;
  const files = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const code = entry.slice(0, 2);
    files.push(entry.slice(3));
    if (code.startsWith('R') || code.startsWith('C')) i++; // skip rename source
  }
  return files;
}

/** Files that differ between `base` and the working tree: committed, staged, unstaged and untracked. */
export function changedSince(root, base) {
  const tracked = git(root, ['diff', '--name-only', '--no-renames', '-z', base]).stdout.split('\0').filter(Boolean);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

export function existsAt(root, rev, file) {
  return git(root, ['cat-file', '-e', `${rev}:${file}`], { allowFail: true }).status === 0;
}

/** Restores `files` to their content at `rev` (deleting those that did not exist). */
export function restoreFiles(root, rev, files) {
  for (const f of files) {
    if (existsAt(root, rev, f)) {
      git(root, ['checkout', rev, '--', f]);
    } else {
      git(root, ['rm', '-q', '--cached', '--ignore-unmatch', '--', f], { allowFail: true });
      fs.rmSync(path.join(root, f), { force: true });
    }
  }
}

/** Stages the given paths (or everything) and commits. Returns the new commit sha, or null if nothing to commit. */
export function commit(root, message, paths = null, { sign = false } = {}) {
  if (paths) {
    // pathspecs that neither exist nor are tracked make `git add` fail
    paths = [...new Set(paths)].filter((p) => fs.existsSync(path.join(root, p)) || isTracked(root, p));
    if (paths.length === 0) return null;
  }
  git(root, ['add', '-A', '--', ...(paths ?? ['.'])]);
  const staged = git(root, ['diff', '--cached', '--name-only']).stdout.trim();
  if (!staged) return null;
  const res = run('git', ['commit', '-q', ...(sign ? ['-S'] : []), '-F', '-'], { cwd: root, input: message });
  if (res.status !== 0) throw new AiwsError(`git commit failed:\n${res.stderr.trim() || res.stdout.trim()}`);
  return head(root);
}

export function isTracked(root, p) {
  return git(root, ['ls-files', '--error-unmatch', '--', p], { allowFail: true }).status === 0;
}

export function commonDir(root) {
  const dir = git(root, ['rev-parse', '--git-common-dir']).stdout.trim();
  return path.resolve(root, dir);
}

export function isAncestor(root, a, b) {
  return git(root, ['merge-base', '--is-ancestor', a, b], { allowFail: true }).status === 0;
}

export function revParse(root, rev) {
  const res = git(root, ['rev-parse', '--verify', '-q', rev], { allowFail: true });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** Commits reachable from `range` whose message contains `grep`, with parsed trailers. */
export function commitsWithTrailers(root, range, grep) {
  const args = ['log', '--format=%H%x1f%B%x1e'];
  if (grep) args.push(`--grep=${grep}`, '-F');
  if (range) args.push(range);
  const out = git(root, args, { allowFail: true }).stdout;
  return out
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, body] = chunk.split('\x1f');
      return { sha, body, trailers: parseTrailers(body) };
    });
}

export function parseTrailers(body) {
  const trailers = {};
  for (const line of (body ?? '').split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/.exec(line.trim());
    if (m) trailers[m[1]] = m[2].trim();
  }
  return trailers;
}

export function filesInCommit(root, sha) {
  return git(root, ['show', '--name-only', '--format=', sha]).stdout.split(/\r?\n/).filter(Boolean);
}
