import fs from 'node:fs';
import path from 'node:path';
import { AiwsError, readYaml, writeYaml, nowIso } from './util.js';
import { commonDir } from './git.js';

// The source lock lives in the git common dir: shared by every worktree and never committed.
function lockFile(root) {
  return path.join(commonDir(root), 'aiws-source-lock.yaml');
}

export function readLock(root) {
  return readYaml(lockFile(root));
}

export function acquire(root, req) {
  const cur = readLock(root);
  if (cur && cur.req !== req) {
    throw new AiwsError(
      `Source lock is held by ${cur.req} since ${cur.at}. Only one REQ may write source at a time (release with \`aiws unlock\` if stale).`
    );
  }
  if (!cur) writeYaml(lockFile(root), { req, at: nowIso() });
}

export function release(root, req, { force = false } = {}) {
  const cur = readLock(root);
  if (!cur) return false;
  if (cur.req !== req && !force) throw new AiwsError(`Source lock is held by ${cur.req}, not ${req}`);
  fs.rmSync(lockFile(root), { force: true });
  return true;
}

// A stop request is a marker file next to the lock: `aiws stop` writes it from any terminal or worktree,
// and the running orchestrator picks it up between two steps. No process is killed, so it works the same
// on Windows, macOS and Linux.
function stopFile(root, req) {
  return path.join(commonDir(root), `aiws-stop-${req}`);
}

export function requestStop(root, req) {
  fs.writeFileSync(stopFile(root, req), nowIso() + '\n');
}

/** Removes a pending stop request. Returns true if there was one. */
export function takeStop(root, req) {
  const file = stopFile(root, req);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}
