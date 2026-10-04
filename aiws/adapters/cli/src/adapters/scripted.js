import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT_TEMPFAIL } from '../util.js';

/**
 * Deterministic adapter for tests and demos: instead of calling an AI, it runs a Node script.
 * Script dirs come from AIWS_SCRIPTED_DIR (path-delimiter separated, first match wins) or
 * `runtime.yaml -> scripted.dir`. Lookup order inside each dir:
 *   <agent>-<task>-<attempt>.js, <agent>-<task>.js, <agent>-<attempt>.js, <agent>.js
 * The script runs at the workspace root with the same AIWS_* env an AI would get.
 * A script that exits 75 (EX_TEMPFAIL) simulates an AI that refuses the run because of its usage limit.
 */
export function runAgent(ws, { env, agent, task, attempt }) {
  const dirs = (env.AIWS_SCRIPTED_DIR ?? ws.runtime.scripted?.dir ?? 'aiws/scripted')
    .split(path.delimiter)
    .filter(Boolean)
    .map((d) => path.resolve(ws.root, d));
  const names = [
    task && `${agent.id}-${task.id}-${attempt}.js`,
    task && `${agent.id}-${task.id}.js`,
    `${agent.id}-${attempt}.js`,
    `${agent.id}.js`,
  ].filter(Boolean);
  let script = null;
  for (const dir of dirs) {
    script = names.map((n) => path.join(dir, n)).find((f) => fs.existsSync(f));
    if (script) break;
  }
  if (!script) {
    return {
      ok: false,
      exitCode: 1,
      raw: '',
      stderr: `scripted adapter: no script for agent ${agent.id} in ${dirs.join(', ')}`,
      report: { is_error: true },
    };
  }
  const started = Date.now();
  const res = spawnSync(process.execPath, [script], { cwd: ws.root, env, encoding: 'utf8', windowsHide: true });
  return {
    ok: res.status === 0,
    exitCode: res.status,
    raw: res.stdout ?? '',
    stderr: res.stderr ?? '',
    usageLimit: res.status === EXIT_TEMPFAIL ? (res.stdout ?? '').trim() || 'usage limit reached' : null,
    report: { is_error: res.status !== 0, result: (res.stdout ?? '').trim(), script: path.basename(script) },
    command: `node ${path.basename(script)}`,
    durationMs: Date.now() - started,
  };
}

export function sync() {
  return [];
}
