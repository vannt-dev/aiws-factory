import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiwsError, readYaml, parseFrontMatter, readText } from './util.js';

// The CLI lives in <workspace>/aiws/adapters/cli; the aiws/ folder around it is the reference kit
// that `aiws init` copies into another project.
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_DIR = path.resolve(PKG_ROOT, '..', '..');
export const BIN_PATH = path.join(PKG_ROOT, 'bin', 'aiws.js');

/** Walks up from `start` to the directory that holds aiws/config/workflow.yaml. */
export function findRoot(start = process.cwd()) {
  if (process.env.AIWS_ROOT) return path.resolve(process.env.AIWS_ROOT);
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'aiws', 'config', 'workflow.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot(start) {
  const root = findRoot(start);
  if (!root) throw new AiwsError('Not inside an AIWS workspace (aiws/config/workflow.yaml not found). Run `aiws init` first.');
  return root;
}

/** Everything the orchestrator needs about one workspace, loaded lazily. */
export class Workspace {
  constructor(root) {
    this.root = root;
    this.aiwsDir = path.join(root, 'aiws');
    this.configDir = path.join(this.aiwsDir, 'config');
    this._cache = {};
  }

  static open(start) {
    return new Workspace(requireRoot(start));
  }

  abs(rel) {
    return path.join(this.root, rel);
  }

  get workflow() {
    return (this._cache.workflow ??= this._loadConfig('workflow.yaml'));
  }

  get policies() {
    return (this._cache.policies ??= this._loadConfig('policies.yaml'));
  }

  get runtime() {
    return (this._cache.runtime ??= readYaml(path.join(this.configDir, 'runtime.yaml')) ?? { default_adapter: 'claude' });
  }

  _loadConfig(name) {
    const data = readYaml(path.join(this.configDir, name));
    if (!data) throw new AiwsError(`Missing aiws/config/${name}`);
    return data;
  }

  phaseDef(id) {
    const def = this.workflow.phases.find((p) => p.id === id);
    if (!def) throw new AiwsError(`Phase '${id}' is not defined in workflow.yaml`);
    return def;
  }

  contract(rel) {
    const file = path.join(this.configDir, rel);
    const data = readYaml(file);
    if (!data) throw new AiwsError(`Missing contract aiws/config/${rel}`);
    return data;
  }

  agent(id) {
    const file = path.join(this.aiwsDir, 'agents', `${id}.md`);
    if (!fs.existsSync(file)) throw new AiwsError(`Missing agent aiws/agents/${id}.md`);
    const { data, body } = parseFrontMatter(readText(file));
    return { id, ...data, body };
  }

  skill(name) {
    const file = path.join(this.aiwsDir, 'skills', name, 'SKILL.md');
    if (!fs.existsSync(file)) return null;
    return { name, file, text: readText(file) };
  }

  template(name) {
    const file = path.join(this.aiwsDir, 'templates', name);
    return fs.existsSync(file) ? readText(file) : null;
  }

  listAgents() {
    const dir = path.join(this.aiwsDir, 'agents');
    return fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.slice(0, -3))
      : [];
  }

  listSkills() {
    const dir = path.join(this.aiwsDir, 'skills');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'SKILL.md'))) : [];
  }

  workDir(req) {
    return path.join(this.aiwsDir, 'work', req);
  }

  workRel(req, file = '') {
    return `aiws/work/${req}${file ? '/' + file : ''}`;
  }

  baseBranch() {
    return this.workflow.base_branch ?? 'main';
  }
}

export function assertReqId(req) {
  if (!/^REQ-[A-Za-z0-9_-]+$/.test(req ?? '')) throw new AiwsError(`Invalid requirement id '${req}'. Expected e.g. REQ-001.`);
  return req;
}
