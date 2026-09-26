import { AiwsError } from '../util.js';
import * as claude from './claude.js';
import * as scripted from './scripted.js';

// V2: codex and gemini adapters implement the same {sync, runAgent} interface.
const ADAPTERS = { claude, scripted };

export function adapterName(ws, phase) {
  const rt = ws.runtime;
  return process.env.AIWS_ADAPTER ?? rt.phases?.[phase]?.adapter ?? rt.default_adapter ?? 'claude';
}

export function getAdapter(name) {
  const a = ADAPTERS[name];
  if (!a) throw new AiwsError(`Unknown adapter '${name}'. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  return a;
}
