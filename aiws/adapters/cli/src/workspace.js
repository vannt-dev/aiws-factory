import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiwsError, readYaml, parseFrontMatter, readText } from './util.js';

// The CLI lives in <workspace>/aiws/adapters/cli; the aiws/ folder around it is the reference kit that
// `aiws init` copies into another project. A package installed from npm carries that kit in kit/ instead
// (bundled by tool/bundle-kit.mjs on pack).
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_KIT = path.join(PKG_ROOT, 'kit');
export const KIT_DIR = fs.existsSync(path.join(BUNDLED_KIT, 'config', 'workflow.yaml')) ? BUNDLED_KIT : path.resolve(PKG_ROOT, '..', '..');
/** AGENTS.md of the kit: beside aiws/ in the repository, inside kit/ in the package. */
export const KIT_AGENTS_MD = fs.existsSync(path.join(KIT_DIR, 'AGENTS.md'))
  ? path.join(KIT_DIR, 'AGENTS.md')
  : path.join(KIT_DIR, '..', 'AGENTS.md');

/** The version of this CLI, from its package.json. */
export function cliVersion() {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
}
export const BIN_PATH = path.join(PKG_ROOT, 'bin', 'aiws.js');
export const LANGUAGES = ['vi', 'en'];

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

  /** The workflow profile in use (`aiws new --profile NAME`), or null for workflow.yaml itself. */
  get profile() {
    return this._profile ?? null;
  }

  /**
   * Switches to the workflow of a profile: aiws/config/workflow.<name>.yaml, whose keys sit on top of
   * workflow.yaml (phases usually; language, prerequisites and the rest come from the default when the profile
   * leaves them out). `loadState` calls this for the profile a requirement was created with.
   */
  useProfile(name) {
    if (!name) {
      this._profile = null;
      this._cache.workflow = this._loadConfig('workflow.yaml');
      return this.workflow;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new AiwsError(`Invalid profile name '${name}'.`);
    const base = this._loadConfig('workflow.yaml');
    const own = readYaml(path.join(this.configDir, `workflow.${name}.yaml`));
    if (!own) throw new AiwsError(`Unknown profile '${name}': aiws/config/workflow.${name}.yaml is missing.`);
    this._profile = name;
    this._cache.workflow = { ...base, ...own };
    return this.workflow;
  }

  /** The profiles this workspace offers: the NAME of every aiws/config/workflow.NAME.yaml. */
  listProfiles() {
    return fs
      .readdirSync(this.configDir)
      .map((f) => /^workflow\.([A-Za-z0-9_-]+)\.yaml$/.exec(f)?.[1])
      .filter(Boolean)
      .sort();
  }

  get policies() {
    return (this._cache.policies ??= this._loadConfig('policies.yaml'));
  }

  get runtime() {
    return (this._cache.runtime ??= readYaml(path.join(this.configDir, 'runtime.yaml')) ?? { default_adapter: 'claude' });
  }

  /** The release the kit of this workspace came from (`aiws/config/kit-version`, written by `aiws init`), or null. */
  get kitVersion() {
    const file = path.join(this.configDir, 'kit-version');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() || null : null;
  }

  /**
   * Says, on stderr, when the kit of the workspace and this CLI are different releases: agents, contracts and
   * templates move with the CLI. Nothing is said for a workspace that records no version (the repository).
   */
  warnKitVersion() {
    const kit = this.kitVersion;
    const cli = cliVersion();
    if (!kit || kit === cli) return false;
    process.stderr.write(
      `aiws: this workspace has kit ${kit} but the CLI is ${cli}. Run \`aiws upgrade\` (first with --dry-run to see what it ` +
        'would change): it replaces the files you left alone and keeps the ones you changed.\n'
    );
    return true;
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

  /** The language the documents come out in: `workflow.yaml -> language` (vi or en), Vietnamese by default. */
  get language() {
    const l = String(this.workflow.language ?? 'vi').toLowerCase();
    return LANGUAGES.includes(l) ? l : 'vi';
  }

  /**
   * The language of what lands in the repositories: commit subjects (task titles) and pull requests.
   * `workflow.yaml -> git_language` (vi or en), the document language by default. English source repositories
   * set `git_language: en` and keep their documents in Vietnamese.
   */
  get gitLanguage() {
    const l = String(this.workflow.git_language ?? this.language).toLowerCase();
    return l === 'en' ? 'en' : 'vi';
  }

  /** A template in the workspace language: aiws/templates/<lang>/<name> when it exists, else aiws/templates/<name>. */
  template(name) {
    const own = path.join(this.aiwsDir, 'templates', this.language, name);
    if (this.language !== 'vi' && fs.existsSync(own)) return readText(own);
    const file = path.join(this.aiwsDir, 'templates', name);
    return fs.existsSync(file) ? readText(file) : null;
  }

  /** The required headings of a contract output in the workspace language: `required_headings_<lang>`, else `required_headings`. */
  headingsOf(output) {
    return output[`required_headings_${this.language}`] ?? output.required_headings ?? null;
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
