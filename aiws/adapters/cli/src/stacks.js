import fs from 'node:fs';
import path from 'node:path';

// Language-agnostic stack detection: AIWS only needs to know how to build and test each source-* dir.
// Every suggestion is a starting point for a human to confirm in aiws/config/policies.yaml.

const SKIP = new Set([
  '.git',
  'node_modules',
  'target',
  'bin',
  'obj',
  'dist',
  'build',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.idea',
  '.next',
  'out',
]);

const has = (dir, f) => fs.existsSync(path.join(dir, f));
const glob1 = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : []);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Detectors in priority order. Each returns {stack, build, test} (strings or {windows, posix}) or null. */
const DETECTORS = [
  (d, rel) => {
    if (!has(d, 'pom.xml')) return null;
    if (has(d, 'mvnw')) {
      // `.\` is required on Windows: with NoDefaultCurrentDirectoryInExePath set (Claude Code sets it),
      // cmd.exe does not look up bare `mvnw.cmd` in the current directory.
      return {
        stack: 'java-maven',
        build: { windows: `cd ${rel} && .\\mvnw.cmd -q -DskipTests package`, posix: `cd ${rel} && ./mvnw -q -DskipTests package` },
        test: { windows: `cd ${rel} && .\\mvnw.cmd -q test`, posix: `cd ${rel} && ./mvnw -q test` },
      };
    }
    return { stack: 'java-maven', build: `mvn -q -f ${rel}/pom.xml -DskipTests package`, test: `mvn -q -f ${rel}/pom.xml test` };
  },
  (d, rel) => {
    if (!has(d, 'build.gradle') && !has(d, 'build.gradle.kts')) return null;
    if (has(d, 'gradlew')) {
      return {
        stack: 'jvm-gradle',
        build: { windows: `${rel}\\gradlew.bat -p ${rel} build -x test`, posix: `${rel}/gradlew -p ${rel} build -x test` },
        test: { windows: `${rel}\\gradlew.bat -p ${rel} test`, posix: `${rel}/gradlew -p ${rel} test` },
      };
    }
    return { stack: 'jvm-gradle', build: `gradle -p ${rel} build -x test`, test: `gradle -p ${rel} test` };
  },
  (d, rel) => {
    const sln = glob1(d, /\.sln$/i);
    const proj = glob1(d, /\.(cs|fs|vb)proj$/i);
    if (!sln.length && !proj.length) return null;
    const target = sln.length === 1 ? `${rel}/${sln[0]}` : proj.length === 1 && !sln.length ? `${rel}/${proj[0]}` : rel;
    return { stack: 'dotnet', build: `dotnet build ${target}`, test: `dotnet test ${target}` };
  },
  (d, rel) => (has(d, 'go.mod') ? { stack: 'go', build: `go -C ${rel} build ./...`, test: `go -C ${rel} test ./...` } : null),
  (d, rel) =>
    has(d, 'Cargo.toml')
      ? { stack: 'rust', build: `cargo build --manifest-path ${rel}/Cargo.toml`, test: `cargo test --manifest-path ${rel}/Cargo.toml` }
      : null,
  (d, rel) => {
    if (!has(d, 'pubspec.yaml')) return null;
    const flutter = /^\s*flutter\s*:/m.test(fs.readFileSync(path.join(d, 'pubspec.yaml'), 'utf8'));
    const tool = flutter ? 'flutter' : 'dart';
    return { stack: tool, build: `cd ${rel} && ${tool} analyze`, test: `cd ${rel} && ${tool} test` };
  },
  (d, rel) => {
    if (!has(d, 'package.json')) return null;
    const pkg = readJson(path.join(d, 'package.json')) ?? {};
    const scripts = pkg.scripts ?? {};
    const pm = has(d, 'pnpm-lock.yaml') ? 'pnpm' : has(d, 'yarn.lock') ? 'yarn' : 'npm';
    const runIn = (script) =>
      pm === 'pnpm'
        ? `pnpm --dir ${rel} ${script}`
        : pm === 'yarn'
          ? `yarn --cwd ${rel} ${script}`
          : script === 'test'
            ? `npm test --prefix ${rel}`
            : `npm run ${script} --prefix ${rel}`;
    return {
      stack: `node-${pm}`,
      build: scripts.build ? runIn('build') : null,
      test: scripts.test ? runIn('test') : null,
      note: scripts.test ? null : 'package.json has no "test" script',
    };
  },
  (d, rel) => {
    if (!has(d, 'pyproject.toml') && !has(d, 'requirements.txt') && !has(d, 'setup.py')) return null;
    return { stack: 'python', build: `python -m compileall -q ${rel}`, test: `python -m pytest -q ${rel}` };
  },
  (d, rel) =>
    has(d, 'composer.json')
      ? { stack: 'php', build: null, test: { windows: `cd ${rel} && vendor\\bin\\phpunit`, posix: `cd ${rel} && vendor/bin/phpunit` } }
      : null,
  (d, rel) => (has(d, 'Gemfile') ? { stack: 'ruby', build: null, test: `cd ${rel} && bundle exec rspec` } : null),
];

/** Extension histogram (top N) - a cheap "what language is this" for legacy code that has no build file. */
export function languageSummary(dir, top = 6) {
  const counts = new Map();
  let budget = 20000;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget-- <= 0) return;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name));
      } else {
        const ext = path.extname(e.name).toLowerCase() || e.name;
        if (['.gitkeep', '.md', '.txt', '.lock', '.log'].includes(ext)) continue;
        counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    }
  };
  walk(dir);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([ext, n]) => `${ext}:${n}`);
}

function detectDir(dir, rel) {
  for (const detect of DETECTORS) {
    const hit = detect(dir, rel);
    if (hit) return hit;
  }
  // monorepo-ish: a single sub-project one level down
  const subs = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !SKIP.has(e.name)) : [];
  const found = subs
    .map((s) => ({ s, hit: DETECTORS.map((f) => f(path.join(dir, s.name), `${rel}/${s.name}`)).find(Boolean) }))
    .filter((x) => x.hit);
  if (found.length === 1) return { ...found[0].hit, note: `detected in ${rel}/${found[0].s.name}` };
  if (found.length > 1)
    return {
      stack: 'multiple',
      build: null,
      test: null,
      note: `several projects: ${found.map((x) => `${x.s.name} (${x.hit.stack})`).join(', ')} - write a command that builds/tests all of them`,
    };
  return null;
}

/**
 * Looks at every source-* directory of the workspace.
 * Returns {sides: {name: glob}, commands: {name_build, name_test}, report: [{dir, side, stack, languages, note}]}.
 * source-legacy is reported (languages) but never becomes a side: it is read-only.
 */
export function detectStacks(root) {
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^source-/.test(e.name))
    .map((e) => e.name)
    .sort();
  const sides = {};
  const commands = {};
  const report = [];
  for (const name of dirs) {
    const abs = path.join(root, name);
    const languages = languageSummary(abs);
    if (name === 'source-legacy') {
      report.push({ dir: name, side: null, stack: 'legacy (read-only)', languages, note: null });
      continue;
    }
    const side = name.replace(/^source-/, '').replace(/[^A-Za-z0-9]/g, '_');
    sides[side] = `${name}/**`;
    const hit = detectDir(abs, name);
    if (hit?.build) commands[`${side}_build`] = hit.build;
    if (hit?.test) commands[`${side}_test`] = hit.test;
    report.push({ dir: name, side, stack: hit?.stack ?? (languages.length ? 'unknown' : 'empty'), languages, note: hit?.note ?? null });
  }
  return { sides, commands, report };
}

export function reportText(report) {
  if (!report.length) return 'No source-* directories found.';
  return report
    .map(
      (r) =>
        `- ${r.dir}${r.side ? ` (side '${r.side}')` : ''}: ${r.stack}${r.languages.length ? `; files ${r.languages.join(' ')}` : ''}${r.note ? `; ${r.note}` : ''}`
    )
    .join('\n');
}

/** Heuristic allow-prefixes for a shell command line, e.g. "cd x && ./mvnw -q test" -> ["cd", "./mvnw"]. */
export function commandPrefixes(cmd) {
  const out = [];
  for (const part of String(cmd).split(/&&|\|\||;|\|/)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const prefix = [tokens[0]];
    const second = tokens[1];
    if (second && /^[a-z][a-z0-9:-]*$/i.test(second) && !/[./\\]/.test(second)) prefix.push(second);
    out.push(prefix.join(' '));
  }
  return [...new Set(out)];
}
