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

// ---------------------------------------------------------------- submodules
//
// A submodule is one path (a "gitlink") to the workspace repository, but its files are what the agents edit
// and what the scopes name. The functions below that take workspace paths therefore look inside every
// checked-out submodule and give its files as `<submodule>/<file>`; the gitlink path itself is never listed.
// What a submodule "was" at a workspace revision is the commit its gitlink records there.

// the empty tree of a SHA-1 repository (a SHA-256 one has another id)
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Paths of every gitlink in the index (checked out or not). */
export function gitlinks(root) {
  const out = git(root, ['ls-files', '--stage', '-z'], { allowFail: true }).stdout;
  return out
    .split('\0')
    .filter((e) => e.startsWith('160000 '))
    .map((e) => e.slice(e.indexOf('\t') + 1));
}

/** Gitlinks whose submodule is checked out (has its own .git), sorted. */
export function submodules(root) {
  return gitlinks(root)
    .filter((p) => fs.existsSync(path.join(root, p, '.git')))
    .sort();
}

/** The commit the gitlink `sub` records at workspace revision `rev`, or null when there is none. */
export function gitlinkAt(root, rev, sub) {
  return revParse(root, `${rev}:${sub}`);
}

/** Which repository a workspace path lives in: {sub: null|path, rel: path in that repository}. */
function locate(subs, file) {
  const sub = subs.find((s) => file.startsWith(s + '/'));
  return sub ? { sub, rel: file.slice(sub.length + 1) } : { sub: null, rel: file };
}

/** Groups workspace paths by repository: Map(sub|null -> paths relative to that repository). */
function byRepo(root, files) {
  const subs = submodules(root);
  const groups = new Map();
  for (const f of files) {
    const at = locate(subs, f);
    if (!groups.has(at.sub)) groups.set(at.sub, []);
    groups.get(at.sub).push(at.rel);
  }
  return groups;
}

/** The branch `remote` names as its default (refs/remotes/<remote>/HEAD), or null. */
export function remoteDefaultBranch(root, remote = 'origin') {
  const res = git(root, ['symbolic-ref', '--short', '-q', `refs/remotes/${remote}/HEAD`], { allowFail: true });
  return res.status === 0 ? res.stdout.trim().replace(`${remote}/`, '') : null;
}

/** `rev` when it is a commit the submodule has (fetched), else null. */
function known(subAbs, rev) {
  return rev && revParse(subAbs, `${rev}^{commit}`) ? rev : null;
}

/** Porcelain status entries (paths only), including every untracked file, and the files of each submodule. */
export function dirtyFiles(root) {
  const links = new Set(gitlinks(root));
  const files = ownDirty(root).filter((f) => !links.has(f));
  for (const sub of submodules(root)) {
    const abs = path.join(root, sub);
    // dirty means "differs from what the workspace HEAD records", so commits not yet in the gitlink count too
    const base = known(abs, gitlinkAt(root, 'HEAD', sub)) ?? 'HEAD';
    files.push(...ownChangedSince(abs, base).map((f) => `${sub}/${f}`));
  }
  return files;
}

function ownDirty(root) {
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
  const links = new Set(gitlinks(root));
  const files = ownChangedSince(root, base).filter((f) => !links.has(f));
  for (const sub of submodules(root)) {
    const abs = path.join(root, sub);
    const from = known(abs, gitlinkAt(root, base, sub)) ?? EMPTY_TREE; // added after base: every file is new
    files.push(...ownChangedSince(abs, from).map((f) => `${sub}/${f}`));
  }
  return [...new Set(files)].sort();
}

function ownChangedSince(root, base) {
  const tracked = git(root, ['diff', '--name-only', '--no-renames', '-z', base]).stdout.split('\0').filter(Boolean);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

/** Files that differ between two workspace revisions; a changed gitlink stands for the files it changed. */
export function diffNames(root, from, to) {
  const out = git(root, ['diff', '--name-only', '--no-renames', '-z', from, to], { allowFail: true }).stdout;
  const links = new Set(gitlinks(root));
  const files = [];
  for (const f of out.split('\0').filter(Boolean)) {
    if (links.has(f)) files.push(...subDiff(root, f, gitlinkAt(root, from, f), gitlinkAt(root, to, f)));
    else files.push(f);
  }
  return [...new Set(files)].sort();
}

/** The files of submodule `sub` that differ between two of its commits, as workspace paths. */
function subDiff(root, sub, a, b) {
  const abs = path.join(root, sub);
  if (!fs.existsSync(path.join(abs, '.git'))) return [sub];
  const to = known(abs, b);
  if (!to) return [sub];
  const from = known(abs, a) ?? EMPTY_TREE;
  return git(abs, ['diff', '--name-only', '--no-renames', '-z', from, to], { allowFail: true })
    .stdout.split('\0')
    .filter(Boolean)
    .map((f) => `${sub}/${f}`);
}

export function existsAt(root, rev, file) {
  return git(root, ['cat-file', '-e', `${rev}:${file}`], { allowFail: true }).status === 0;
}

/** Restores `files` to their content at `rev` (deleting those that did not exist). */
export function restoreFiles(root, rev, files) {
  for (const [sub, rels] of byRepo(root, files)) {
    if (!sub) ownRestore(root, rev, rels);
    else {
      const abs = path.join(root, sub);
      ownRestore(abs, known(abs, gitlinkAt(root, rev, sub)), rels);
    }
  }
}

/** `rev` null: none of the files existed. */
function ownRestore(root, rev, files) {
  for (const f of files) {
    if (rev && existsAt(root, rev, f)) {
      git(root, ['checkout', rev, '--', f]);
    } else {
      git(root, ['rm', '-q', '--cached', '--ignore-unmatch', '--', f], { allowFail: true });
      fs.rmSync(path.join(root, f), { force: true });
    }
  }
}

/**
 * Stages the given paths (or everything) and commits. Returns the new commit sha, or null if nothing to commit.
 * Paths inside a submodule are committed there first, with the same message; the workspace commit then
 * takes the moved gitlink.
 */
export function commit(root, message, paths = null, { sign = false } = {}) {
  if (paths) {
    const own = [];
    for (const [sub, rels] of byRepo(root, [...new Set(paths)])) {
      if (!sub) own.push(...rels);
      else if (ownCommit(path.join(root, sub), message, rels, { sign })) own.push(sub);
    }
    paths = own;
  }
  return ownCommit(root, message, paths, { sign });
}

function ownCommit(root, message, paths, { sign }) {
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

/** Files a commit changed; a moved gitlink stands for the files it changed in its submodule. */
export function filesInCommit(root, sha) {
  const files = git(root, ['show', '--name-only', '--format=', sha]).stdout.split(/\r?\n/).filter(Boolean);
  const links = new Set(gitlinks(root));
  return files.flatMap((f) => (links.has(f) ? subDiff(root, f, gitlinkAt(root, `${sha}^`, f), gitlinkAt(root, sha, f)) : [f]));
}
