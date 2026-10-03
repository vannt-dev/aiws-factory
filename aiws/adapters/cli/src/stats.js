import fs from 'node:fs';
import path from 'node:path';

/**
 * Totals over the evidence of a requirement (evidence/runs/run-NNNN.json): number of AI runs,
 * wall time and cost. Cost is the list-price equivalent reported by the adapter; it is null when
 * no run reported one (for example with the scripted adapter).
 */
export function runStats(ws, req) {
  const dir = path.join(ws.workDir(req), 'evidence', 'runs');
  const stats = { runs: 0, duration_ms: 0, cost_usd: null, by_phase: {} };
  if (!fs.existsSync(dir)) return stats;
  for (const file of fs.readdirSync(dir).filter((f) => /^run-\d+\.json$/.test(f))) {
    let ev;
    try {
      ev = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue; // a run that was interrupted while writing its evidence
    }
    stats.runs += 1;
    stats.duration_ms += ev.duration_ms ?? 0;
    const cost = ev.report?.cost_usd;
    if (typeof cost === 'number') {
      stats.cost_usd = (stats.cost_usd ?? 0) + cost;
      const phase = ev.phase ?? 'unknown';
      stats.by_phase[phase] = (stats.by_phase[phase] ?? 0) + cost;
    }
  }
  return stats;
}

/** One status line, e.g. "AI runs: 5 (40 min), cost 14.10 USD list-price equivalent (analysis 2.65, design 7.06)". */
export function statsLine(stats) {
  if (!stats.runs) return null;
  const minutes = Math.max(1, Math.round(stats.duration_ms / 60000));
  let line = `AI runs: ${stats.runs} (${minutes} min)`;
  if (stats.cost_usd !== null) {
    const phases = Object.entries(stats.by_phase)
      .map(([phase, cost]) => `${phase} ${cost.toFixed(2)}`)
      .join(', ');
    line += `, cost ${stats.cost_usd.toFixed(2)} USD list-price equivalent (${phases})`;
  }
  return line;
}
