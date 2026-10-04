import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

// sysexits.h EX_TEMPFAIL: a temporary failure, the caller is invited to retry later. `aiws run` and
// `aiws discover` exit with it when the AI usage limit pauses them.
export const EXIT_TEMPFAIL = 75;

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

/**
 * Replaces one top-level `key:` block of a YAML text with `value`, leaving every other line
 * (comments, alignment, flow style) byte-for-byte unchanged. Appends the block if the key is missing.
 * The block spans the key line and the indented or blank lines after it.
 */
export function replaceYamlBlock(text, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let rendered = YAML.stringify({ [key]: value }, { lineWidth: 0 })
    .trimEnd()
    .split('\n');
  const start = lines.findIndex((l) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(l));
  if (start === -1) {
    const body = text.replace(/\s*$/, '');
    return body + eol + eol + rendered.join(eol) + eol;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  // keep a trailing comment of the key line, e.g. `protected_paths:   # ...`
  const comment = /^[^#"']*:[^#"']*?(\s+#.*)$/.exec(lines[start])?.[1];
  if (comment) rendered = [rendered[0] + comment, ...rendered.slice(1)];
  return [...lines.slice(0, start), ...rendered, ...lines.slice(end)].join(eol);
}

/** sha256 of file content with line endings normalised, so autocrlf never invalidates an approval. */
export function hashFile(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Resolves symlinks/junctions of the longest existing prefix of `p` (the file itself may not exist yet),
 * so /var/... vs /private/var/... (macOS) or junctioned Windows paths compare equal.
 */
export function realpathBest(p) {
  let head = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) return path.resolve(p);
    tail.unshift(path.basename(head));
    head = parent;
  }
  try {
    return path.join(fs.realpathSync.native(head), ...tail);
  } catch {
    return path.resolve(p);
  }
}

/** Converts an absolute or relative path to a repo-relative, forward-slash path. Returns null if outside root. */
export function toRepoRel(root, p) {
  if (!p) return null;
  const realRoot = realpathBest(root);
  const abs = realpathBest(path.resolve(root, p));
  let rel = path.relative(realRoot, abs);
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
  return process.platform === 'win32' ? (value.windows ?? value.posix) : (value.posix ?? value.windows);
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
