// `aiws gate REQ`: the decision at a human gate as a menu in the terminal, instead of typing the command.
// Choosing an option is the confirmation. Like every human-only command it refuses inside an AI session and
// without an interactive terminal, so an agent cannot use it.
import fs from 'node:fs';
import readline from 'node:readline';
import { AiwsError, run } from './util.js';
import { inAiSession } from './gate.js';
import { runStats } from './stats.js';
import * as P from './parse.js';

/** What the menu shows and offers for the requirement's current stop; null when nothing waits for a person. */
export function gateChoices(ws, st) {
  if (st.status !== 'waiting_human') return null;
  const def = ws.phaseDef(st.phase) ?? {};
  const req = st.req_id;
  const read = (name) => {
    const file = ws.abs(ws.workRel(req, name));
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  };
  const lines = [];
  const stats = runStats(ws, req);
  if (stats.cost_usd !== null) lines.push(`Cost so far: ${stats.cost_usd.toFixed(2)} USD list-price equivalent`);
  const report = { key: 'report', label: 'Open the report in the browser' };
  const later = { key: 'later', label: 'Decide later' };

  if (def.type === 'human_gate' && def.gate === 'design') {
    const review = P.reviewFindings(read('02-design-review.md'));
    if (review.length) {
      const open = (sev) => review.filter((f) => f.severity === sev && !f.resolved).length;
      lines.push(`Design review: ${open('critical')} critical, ${open('major')} major, ${open('minor')} minor open`);
    }
    const design = read('02-design.md');
    const decisions = P.findSection(design, 'Quyết định cần duyệt') ?? P.findSection(design, 'Decisions to approve');
    const items = (decisions?.lines ?? []).map((l) => l.trim()).filter((l) => /^[-*\d]/.test(l));
    if (items.length) {
      lines.push('Decisions to approve (02-design.md):');
      for (const item of items.slice(0, 8)) lines.push(`  ${item.length > 110 ? `${item.slice(0, 107)}...` : item}`);
      if (items.length > 8) lines.push(`  ... ${items.length - 8} more`);
    }
    return {
      title: `${req}: the design waits for your decision`,
      lines,
      options: [
        { key: 'approve', label: 'Approve the design', command: ['approve', 'design'] },
        { key: 'reject', label: 'Reject it, with what must change', command: ['reject', 'design'], ask: 'What must change?' },
        report,
        later,
      ],
    };
  }
  if (def.type === 'human_gate' && def.gate === 'pr') {
    const done = (st.tasks ?? []).filter((t) => t.status === 'done').length;
    lines.push(`Tasks done: ${done} of ${(st.tasks ?? []).length}`);
    if (st.pr_url) lines.push(`Pull request: ${st.pr_url}`);
    for (const [sub, s] of Object.entries(st.submodules ?? {})) {
      if (s.pr_url && !s.done) lines.push(`Pull request of submodule ${sub} (merge it first): ${s.pr_url}`);
    }
    const review = P.reviewFindings(read('05-review.md')).filter((f) => !f.resolved);
    if (review.length) {
      const count = (sev) => review.filter((f) => f.severity === sev).length;
      lines.push(`Review: ${count('critical')} critical, ${count('major')} major, ${count('minor')} minor open`);
    }
    lines.push('Approve only after the pull request is merged.');
    return {
      title: `${req}: the pull request waits for you`,
      lines,
      options: [
        { key: 'approve', label: 'The pull request is merged: approve', command: ['approve', 'pr'] },
        { key: 'reject', label: 'Request changes', command: ['reject', 'pr'], ask: 'What must change?' },
        // the review is already written on the host: send its comments (`aiws reject REQ pr --from-pr`)
        ...(st.pr_url || Object.values(st.submodules ?? {}).some((s) => s.pr_url)
          ? [
              {
                key: 'reject-from-pr',
                label: 'Request changes: send the review comments of the pull request',
                command: ['reject', 'pr'],
                fromPr: true,
              },
            ]
          : []),
        report,
        later,
      ],
    };
  }
  if (st.reason) lines.push(st.reason);
  const options = [{ key: 'answer', label: 'Answer', command: ['answer'], ask: 'Your answer:' }];
  if (def.type === 'human_gate' && def.gate === 'question' && def.on_design_change) {
    options.push({ key: 'redesign', label: 'The design must change', command: ['redesign'], ask: 'What must change?' });
  }
  if (def.type === 'human_gate' && def.gate !== 'question') return null; // a gate this menu does not know
  return { title: `${req}: a question waits for your answer`, lines, options: [...options, report, later] };
}

/**
 * Lets the person pick one option with the arrow keys (or its number) and Enter; Esc or q means the last
 * option. `input` must emit keypress events (a TTY in raw mode, or a test stream).
 */
export function select(options, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve) => {
    let index = 0;
    const draw = (first) => {
      if (!first) output.write(`\x1b[${options.length}A`);
      options.forEach((o, i) => output.write(`\x1b[2K${i === index ? '> ' : '  '}${i + 1}. ${o.label}\n`));
    };
    readline.emitKeypressEvents(input);
    const raw = typeof input.setRawMode === 'function' && input.isTTY;
    if (raw) input.setRawMode(true);
    const done = (i) => {
      input.off('keypress', onKey);
      if (raw) input.setRawMode(false);
      if (typeof input.pause === 'function') input.pause();
      resolve(options[i]);
    };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return done(options.length - 1);
      if (key.name === 'up') index = (index + options.length - 1) % options.length;
      else if (key.name === 'down') index = (index + 1) % options.length;
      else if (key.name === 'return' || key.name === 'enter') return done(index);
      else if (key.name === 'escape' || str === 'q') return done(options.length - 1);
      else if (/^[1-9]$/.test(str ?? '') && Number(str) <= options.length) return done(Number(str) - 1);
      else return;
      draw(false);
    };
    draw(true);
    input.on('keypress', onKey);
    // a second pick (after the report, or a request that found nothing to send) reads a stream paused by the first
    if (typeof input.resume === 'function') input.resume();
  });
}

async function askText(question, { input = process.stdin, output = process.stdout } = {}) {
  const rl = (await import('node:readline/promises')).createInterface({ input, output });
  const answer = await rl.question(`${question} `);
  rl.close();
  return answer.trim();
}

function openInBrowser(file) {
  if (process.platform === 'win32') run('cmd', ['/c', 'start', '""', file]);
  else run(process.platform === 'darwin' ? 'open' : 'xdg-open', [file]);
}

/** True when a person sits at this terminal: the place where `aiws run` may offer the menu by itself. */
export function interactive(env = process.env) {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !inAiSession(env) && !env.CI);
}

/**
 * The menu for one requirement. `actions` runs a chosen command: { approve, reject, answer, redesign, report }
 * from commands.js, passed in to keep this module free of a circular import.
 */
export async function gateMenu(ws, st, actions, io = {}) {
  if (inAiSession()) throw new AiwsError("'gate' is a human-only command and refuses to run inside an AI session.", 3);
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  if (!io.input && !input.isTTY) {
    throw new AiwsError("'gate' needs an interactive terminal. Use the commands instead, e.g. `aiws approve`.", 3);
  }
  const choice = gateChoices(ws, st);
  if (!choice) {
    output.write(`${st.req_id} does not wait for a decision (phase ${st.phase}, status ${st.status}).\n`);
    return null;
  }
  output.write(`\n${choice.title}\n`);
  for (const line of choice.lines) output.write(`  ${line}\n`);
  output.write('\n');
  for (;;) {
    const picked = await select(choice.options, { input, output });
    if (picked.key === 'later') {
      output.write(`Nothing changed. Decide later with \`aiws gate ${st.req_id}\`.\n`);
      return picked.key;
    }
    if (picked.key === 'report') {
      const file = actions.report(st.req_id);
      if (file && !io.input) openInBrowser(file);
      continue;
    }
    let message;
    if (picked.ask) {
      message = await askText(picked.ask, { input, output });
      if (!message) {
        output.write('No text given; nothing changed.\n');
        continue;
      }
    }
    const [command, gate] = picked.command;
    const opts = { yes: true, message, ...(picked.fromPr ? { fromPr: true } : {}) };
    if (picked.fromPr) {
      // nothing to read (no comments yet, gh signed out): say why and offer the menu again
      try {
        await actions[command](st.req_id, gate, opts);
      } catch (e) {
        if (!(e instanceof AiwsError)) throw e;
        output.write(`${e.message}\n`);
        continue;
      }
    } else if (gate) await actions[command](st.req_id, gate, opts);
    else await actions[command](st.req_id, opts);
    return picked.key;
  }
}
