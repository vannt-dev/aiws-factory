import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KIT_DIR, KIT_AGENTS_MD, PKG_ROOT, cliVersion } from './workspace.js';

// The kit is what `aiws init` copies into a project and `aiws upgrade` later brings up to date: the config,
// agents, skills, templates and docs of a release, and AGENTS.md. A project edits those files (its build
// commands live in policies.yaml), so an upgrade has to tell a file the project changed from one that is
// merely the previous release's. The manifest is what makes that possible: the hash of every kit file as it
// was installed.

export const KIT_PARTS = ['config', 'agents', 'skills', 'templates', 'docs'];
export const MANIFEST_REL = 'aiws/config/kit-manifest.json';
export const VERSION_REL = 'aiws/config/kit-version';
/** Written beside a file the project changed, when the kit changed it too: the kit's version, to merge by hand. */
export const NEW_SUFFIX = '.aiws-new';

// written by the CLI into a workspace, or by the bundler into kit/: never part of the kit itself
const NOT_KIT = new Set(['config/kit-version', 'config/kit-manifest.json']);

/** The hash of a file with its line endings set aside: a checkout with CRLF is still the same file. */
export function hashOf(buffer) {
  const text = buffer.toString('latin1').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text, 'latin1').digest('hex');
}

function walk(dir, rel, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, child, out);
    else if (!NOT_KIT.has(child) && !entry.name.endsWith(NEW_SUFFIX)) out.set(child, abs);
  }
  return out;
}

/** The files of the kit this CLI carries: path in a workspace (`aiws/agents/developer.md`) -> where it is read from. */
export function kitFiles(kitDir = KIT_DIR, agentsMd = KIT_AGENTS_MD) {
  const files = new Map();
  for (const part of KIT_PARTS) {
    const src = path.join(kitDir, part);
    if (!fs.existsSync(src)) continue;
    for (const [rel, abs] of walk(src, part, new Map())) files.set(`aiws/${rel}`, abs);
  }
  if (fs.existsSync(agentsMd)) files.set('AGENTS.md', agentsMd);
  return files;
}

/** What a workspace records of the kit it holds: the release, and the hash of every file as the kit has it. */
export function manifestOf(files = kitFiles(), version = cliVersion()) {
  const hashes = {};
  for (const rel of [...files.keys()].sort()) hashes[rel] = hashOf(fs.readFileSync(files.get(rel)));
  return { version, files: hashes };
}

export function readManifest(root) {
  const file = path.join(root, MANIFEST_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data.files === 'object' && data.files !== null ? data : null;
  } catch {
    return null; // an unreadable manifest is no manifest: every changed file is then left to the person
  }
}

/** The manifest of a release that wrote none into its workspaces, when this CLI carries it. */
export function bundledManifest(version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ''))) return null;
  const file = path.join(PKG_ROOT, 'src', 'kit-manifests', `${version}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * What an upgrade would do with each file, without doing it.
 *
 *   add       in the kit, not in the workspace, and never installed there
 *   update    in the workspace as the previous kit had it: replaced by the kit's
 *   same      already as the kit has it
 *   keep      changed in the workspace, unchanged in the kit: the workspace's stays
 *   conflict  changed in the workspace and in the kit, or nothing says how it was installed: the workspace's
 *             stays and the kit's is written beside it
 *   deleted   installed once and removed from the workspace since: stays removed
 *   remove    no longer in the kit, and in the workspace as it was installed: removed
 *   orphan    no longer in the kit, but changed in the workspace: stays
 */
export function planUpgrade(root, base, files = kitFiles()) {
  const known = base?.files ?? {};
  const plan = [];
  for (const rel of [...files.keys()].sort()) {
    const target = path.join(root, rel);
    const next = hashOf(fs.readFileSync(files.get(rel)));
    if (!fs.existsSync(target)) {
      plan.push({ path: rel, action: known[rel] ? 'deleted' : 'add' });
      continue;
    }
    const current = hashOf(fs.readFileSync(target));
    let action;
    if (current === next) action = 'same';
    else if (known[rel] === undefined) action = 'conflict';
    else if (current === known[rel]) action = 'update';
    else if (next === known[rel]) action = 'keep';
    else action = 'conflict';
    plan.push({ path: rel, action });
  }
  for (const rel of Object.keys(known).sort()) {
    if (files.has(rel)) continue;
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) continue;
    plan.push({ path: rel, action: hashOf(fs.readFileSync(target)) === known[rel] ? 'remove' : 'orphan' });
  }
  return plan;
}

/** Carries a plan out and records the new kit. With `force`, a conflict is settled for the kit. */
export function applyUpgrade(root, plan, { force = false, files = kitFiles() } = {}) {
  const write = (rel, target) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(files.get(rel), target);
  };
  for (const step of plan) {
    const target = path.join(root, step.path);
    if (step.action === 'add' || step.action === 'update') write(step.path, target);
    else if (step.action === 'conflict') {
      if (force) {
        write(step.path, target);
        fs.rmSync(target + NEW_SUFFIX, { force: true });
      } else write(step.path, target + NEW_SUFFIX);
    } else if (step.action === 'remove') fs.rmSync(target, { force: true });
  }
  writeKitRecord(root, files);
}

/** Records which release the workspace's kit is, and how each of its files was installed. */
export function writeKitRecord(root, files = kitFiles()) {
  const manifest = manifestOf(files);
  fs.mkdirSync(path.join(root, 'aiws', 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(root, VERSION_REL), `${manifest.version}\n`);
}

/** Files left from an earlier upgrade that nobody merged yet. */
export function pendingMerges(root) {
  const found = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.name.endsWith(NEW_SUFFIX)) found.push(path.relative(root, abs).replace(/\\/g, '/'));
    }
  };
  for (const part of KIT_PARTS) visit(path.join(root, 'aiws', part));
  if (fs.existsSync(path.join(root, `AGENTS.md${NEW_SUFFIX}`))) found.push(`AGENTS.md${NEW_SUFFIX}`);
  return found.sort();
}
