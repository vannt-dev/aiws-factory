import fs from 'node:fs';
import os from 'node:os';
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

// A run marker says that an `aiws run` works on a requirement right now: written when the run starts working
// (before its first AI run, whose evidence is written only at its end) and removed when it returns. It lives
// next to the lock, so the board of any worktree sees it. A run that crashed or was killed leaves it behind:
// it records the process and the computer, and a marker whose process is gone is not a run under way.
const RUN_MARKER = /^aiws-running-(REQ-[A-Za-z0-9_-]+)\.yaml$/;

function runFile(root, req) {
  return path.join(commonDir(root), `aiws-running-${req}.yaml`);
}

/** Records that this process runs `req`. Never fails the run: returns false when nothing could be written. */
export function markRunning(root, req) {
  try {
    writeYaml(runFile(root, req), { req, pid: process.pid, host: os.hostname(), at: nowIso(), root });
    return true;
  } catch {
    return false;
  }
}

/** Removes the marker of `req` when this process wrote it. */
export function clearRunning(root, req) {
  try {
    const file = runFile(root, req);
    if (readYaml(file)?.pid === process.pid) fs.rmSync(file, { force: true });
  } catch {
    // best effort: a marker left behind is not alive once this process ends
  }
}

// another computer's process cannot be checked: its marker counts for a day at most
const OTHER_HOST_MS = 24 * 3600 * 1000;

/** Whether the process a marker names still runs. */
export function runAlive(marker, now = Date.now()) {
  if (!marker || !Number.isInteger(marker.pid) || marker.pid <= 0) return false;
  if (marker.host && marker.host !== os.hostname()) return now - Date.parse(marker.at) < OTHER_HOST_MS;
  try {
    process.kill(marker.pid, 0); // signal 0 only checks that the process exists, on Windows too
    return true;
  } catch (e) {
    return e?.code === 'EPERM'; // it exists, under another user
  }
}

/** The runs under way in every worktree of the repository of `root`, by requirement; {} outside git. */
export function liveRuns(root) {
  let dir;
  try {
    dir = commonDir(root);
  } catch {
    return {};
  }
  const out = {};
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const req = RUN_MARKER.exec(name)?.[1];
    if (!req) continue;
    let marker;
    try {
      marker = readYaml(path.join(dir, name));
    } catch {
      continue;
    }
    if (marker?.req === req && runAlive(marker)) out[req] = marker;
  }
  return out;
}
