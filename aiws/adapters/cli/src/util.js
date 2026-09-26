import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

export class AiwsError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.exitCode = code;
  }
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function readTextIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

export function readYaml(file) {
  const text = readTextIfExists(file);
  if (text === null) return null;
  return YAML.parse(text) ?? {};
}

export function writeYaml(file, data) {
  writeText(file, YAML.stringify(data, { lineWidth: 0 }));
}

/** sha256 of file content with line endings normalised, so autocrlf never invalidates an approval. */
export function hashFile(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Converts an absolute or relative path to a repo-relative, forward-slash path. Returns null if outside root. */
export function toRepoRel(root, p) {
  if (!p) return null;
  const abs = path.resolve(root, p);
  let rel = path.relative(root, abs);
  if (process.platform === 'win32' && path.isAbsolute(rel)) {
    // different drive: path.relative returns absolute
    return null;
  }
  rel = rel.split(path.sep).join('/');
  if (rel.startsWith('../') || rel === '..') return null;
  return rel;
}

/** Substitutes {req}, {task}, {NN}... placeholders. Unknown placeholders are left as is. */
export function fill(template, vars) {
  return String(template).replace(/\{([a-zA-Z_.]+)\}/g, (m, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : m
  );
}

/** Runs a command without a shell. Returns {status, stdout, stderr}. */
export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Runs a shell command line (cmd.exe on Windows, /bin/sh elsewhere). */
export function runShell(command, opts = {}) {
  const res = spawnSync(command, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    input: opts.input,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    timeout: opts.timeout,
  });
  return {
    status: res.error ? -1 : res.status,
    stdout: res.stdout ?? '',
    stderr: (res.stderr ?? '') + (res.error ? String(res.error) : ''),
  };
}

/** Picks the OS-specific variant of a configured command: either a string or {windows, posix}. */
export function osCommand(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return process.platform === 'win32' ? value.windows ?? value.posix : value.posix ?? value.windows;
}

export function log(msg = '') {
  process.stdout.write(msg + '\n');
}

export function warn(msg) {
  process.stderr.write(msg + '\n');
}

export function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

export function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

export function copyDir(src, dest, { overwrite = false, filter } = {}) {
  const written = [];
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (filter && !filter(s)) continue;
    if (entry.isDirectory()) {
      written.push(...copyDir(s, d, { overwrite, filter }));
    } else {
      if (!overwrite && fs.existsSync(d)) continue;
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      written.push(d);
    }
  }
  return written;
}

/** Splits markdown front matter. Returns {data, body}. */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  return { data: YAML.parse(m[1]) ?? {}, body: m[2] };
}
