import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as G from './git.js';
import { classify } from './scope.js';

function fileDigest(abs) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  } catch {
    return null; // deleted
  }
}

/**
 * Captures the repository state before an AI run: HEAD plus the content of every file
 * that is already dirty, so changes left by earlier attempts are not attributed to this run.
 */
export function snapshot(root) {
  const headSha = G.head(root);
  const dirty = {};
  for (const f of G.dirtyFiles(root)) {
    const abs = path.join(root, f);
    const exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
    dirty[f] = { digest: exists ? fileDigest(abs) : null, content: exists ? fs.readFileSync(abs) : null };
  }
  return { head: headSha, dirty };
}

/** Files changed by the run that happened after `snap` (committed or not). */
export function changedByRun(root, snap) {
  const candidates = G.changedSince(root, snap.head);
  const committedSince = new Set();
  const now = G.head(root);
  if (now !== snap.head) {
    const out = G.git(root, ['diff', '--name-only', '--no-renames', '-z', snap.head, now]).stdout;
    out
      .split('\0')
      .filter(Boolean)
      .forEach((f) => committedSince.add(f));
  }
  const changed = [];
  for (const f of candidates) {
    const before = snap.dirty[f];
    if (!before || committedSince.has(f)) {
      changed.push(f);
      continue;
    }
    if (fileDigest(path.join(root, f)) !== before.digest) changed.push(f);
  }
  return changed;
}

/** Puts each file back to how it was when `snap` was taken. */
export function revert(root, snap, files) {
  const fromHead = [];
  for (const f of files) {
    const before = snap.dirty[f];
    if (before) {
      const abs = path.join(root, f);
      if (before.content === null) fs.rmSync(abs, { force: true });
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, before.content);
      }
    } else {
      fromHead.push(f);
    }
  }
  if (fromHead.length) G.restoreFiles(root, snap.head, fromHead);
}

/**
 * Full diff-scope check: classify run changes and revert every violation.
 * Returns {changed, allowed, violations}.
 */
export function enforce(root, snap, { allowed, protectedPaths, ignore }) {
  const changed = changedByRun(root, snap);
  const { allowed: ok, violations } = classify(changed, { allowed, protectedPaths, ignore });
  if (violations.length) revert(root, snap, violations);
  return { changed, allowed: ok, violations };
}
