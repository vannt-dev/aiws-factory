/**
 * The workflow as a row of steps, the way a person reads where a requirement stands: what is done, what
 * runs, what waits for them, with the runs, time and cost each step took and how many review rounds it
 * went through. Gates that only open on a question (design_change_requested) are side steps, not part of
 * the row.
 */

const SIDE_GATES = new Set(['question']);

/**
 * @param workflow the workflow of the requirement (phases in order)
 * @param st its state
 * @param stats runStats() of the requirement
 */
export function pipelineSteps(workflow, st, stats) {
  const phases = (workflow.phases ?? []).filter((p) => !SIDE_GATES.has(p.gate));
  const history = st.history ?? [];
  let current = phases.findIndex((p) => p.id === st.phase);
  if (current === -1 && st.status !== 'done') {
    // a side gate: the requirement stands where the side gate was entered from
    const from = (workflow.phases ?? []).find((p) => p.on_question === st.phase)?.id;
    current = Math.max(
      0,
      phases.findIndex((p) => p.id === from)
    );
  }
  return phases.map((p, i) => {
    const kind = p.type === 'human_gate' ? 'gate' : p.type === 'loop' ? 'loop' : 'agent';
    let status;
    if (st.status === 'done' || i < current) status = 'done';
    else if (i > current) status = 'not_started';
    else status = { running: 'running', waiting_human: 'waiting', blocked: 'blocked', done: 'done' }[st.status] ?? 'running';
    if (status === 'running' && st.paused) status = 'paused';

    const ofPhase = history.filter((h) => h.phase === p.id);
    const step = {
      id: p.id,
      kind,
      status,
      runs: stats.runs_by_phase?.[p.id] ?? 0,
      minutes: stats.duration_by_phase?.[p.id] ? Math.max(1, Math.round(stats.duration_by_phase[p.id] / 60000)) : 0,
      cost_usd: stats.by_phase?.[p.id] ?? null,
      note: '',
    };
    if (kind === 'gate') {
      const decided = ofPhase.filter((h) => ['approved', 'merged', 'rejected', 'changes_requested'].includes(h.result)).at(-1);
      if (decided && status === 'done') step.note = `${decided.result}${decided.by ? ` by ${decided.by}` : ''}`;
      else if (status === 'waiting') step.note = 'waiting for you';
    } else if (kind === 'loop') {
      const tasks = st.tasks ?? [];
      if (tasks.length) step.note = `${tasks.filter((t) => t.status === 'done').length}/${tasks.length} tasks`;
    }
    if (p.on_critical) {
      // a round ends in a pass, in findings that send the work back, or in findings left for a human
      const ended = ofPhase.filter((h) => ['ok', 'critical', 'critical_rounds_exhausted'].includes(h.result)).length;
      const rounds = ended + (status === 'running' ? 1 : 0);
      if (rounds > 1 || p.max_rounds) step.rounds = { count: Math.max(rounds, 1), max: p.max_rounds ?? null };
    }
    return step;
  });
}

const MARK = { done: '[x]', running: '[>]', paused: '[~]', waiting: '[?]', blocked: '[!]', not_started: '[ ]' };

function roundsText(r) {
  return r ? `round ${r.count}${r.max ? ` of ${r.max}` : ''}` : '';
}

/** Lines for `aiws status`. */
export function pipelineText(steps) {
  const width = Math.max(...steps.map((s) => s.id.length));
  return steps.map((s) => {
    const facts = [
      s.runs ? `${s.runs} run${s.runs === 1 ? '' : 's'}` : '',
      s.minutes ? `${s.minutes} min` : '',
      s.cost_usd !== null ? `${s.cost_usd.toFixed(2)} USD` : '',
      roundsText(s.rounds),
      s.note,
    ].filter(Boolean);
    return `${MARK[s.status]} ${s.id.padEnd(width)}  ${facts.join(' · ')}`.trimEnd();
  });
}

const LABEL = {
  done: 'done',
  running: 'running now',
  paused: 'paused',
  waiting: 'waiting on you',
  blocked: 'stopped',
  not_started: 'not started',
};

/** The row of boxes for the report page; `esc` escapes text for HTML. */
export function pipelineHtml(steps, esc) {
  const boxes = steps.map((s) => {
    const facts = [
      s.runs ? `${s.runs} run${s.runs === 1 ? '' : 's'}` : '',
      s.minutes ? `${s.minutes} min` : '',
      s.cost_usd !== null ? `${s.cost_usd.toFixed(2)} USD` : '',
    ].filter(Boolean);
    return [
      `<div class="step ${s.status}${s.kind === 'gate' ? ' gate' : ''}">`,
      `<b>${esc(s.id)}</b>`,
      s.note ? `<span>${esc(s.note)}</span>` : '',
      facts.length ? `<span>${esc(facts.join(' · '))}</span>` : '',
      s.rounds ? `<span class="rounds">${esc(roundsText(s.rounds))}</span>` : '',
      '</div>',
    ].join('');
  });
  const legend = Object.keys(LABEL)
    .map((k) => `<span class="step-key ${k}">${esc(LABEL[k])}</span>`)
    .join('');
  return `<div class="pipeline">${boxes.join('<span class="arrow">→</span>')}</div><div class="legend">${legend}</div>`;
}

export const PIPELINE_STYLE = `
  .pipeline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0 4px; }
  .pipeline .arrow { color: #8a8f98; }
  .step { border: 1px solid #c9ced6; border-radius: 8px; padding: 6px 10px; min-width: 110px; font-size: 13px; }
  .step b { display: block; }
  .step span { display: block; color: #555; font-size: 12px; }
  .step.gate { border-style: dashed; }
  .step.done { border-color: #2e7d32; background: #eef7ee; }
  .step.running, .step.paused { border-color: #1565c0; background: #eaf2fb; }
  .step.waiting { border-color: #b26a00; background: #fff5e5; }
  .step.blocked { border-color: #c62828; background: #fdecea; }
  .step.not_started { color: #8a8f98; }
  .legend { font-size: 12px; color: #555; margin-bottom: 12px; }
  .step-key { margin-right: 12px; }
  .step-key::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; border: 1px solid #c9ced6; }
  .step-key.done::before { background: #2e7d32; }
  .step-key.running::before, .step-key.paused::before { background: #1565c0; }
  .step-key.waiting::before { background: #b26a00; }
  .step-key.blocked::before { background: #c62828; }
`;
