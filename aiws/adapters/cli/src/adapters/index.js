import { AiwsError } from '../util.js';
import * as claude from './claude.js';
import * as scripted from './scripted.js';
import * as codex from './codex.js';

// Every adapter implements {sync, runAgent}; preflight, shellCommand are optional. A gemini adapter would go here too.
const ADAPTERS = { claude, scripted, codex };

/** Runs the preflight of every adapter the given phases use, before any agent starts. Throws on the first problem. */
export function preflightAdapters(ws, phases) {
  const names = new Set(phases.map((p) => adapterName(ws, p)));
  for (const name of names) getAdapter(name).preflight?.(ws);
}

export function adapterName(ws, phase) {
  const rt = ws.runtime;
  return process.env.AIWS_ADAPTER ?? rt.phases?.[phase]?.adapter ?? rt.default_adapter ?? 'claude';
}

export function getAdapter(name) {
  const a = ADAPTERS[name];
  if (!a) throw new AiwsError(`Unknown adapter '${name}'. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  return a;
}
