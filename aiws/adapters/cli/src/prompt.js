import YAML from 'yaml';
import { fill, osCommand } from './util.js';
import { writeScope, matcher } from './scope.js';
import { feedbackFor } from './state.js';
import { adapterName, getAdapter } from './adapters/index.js';

/**
 * Builds the full prompt for one agent step from core definitions:
 * agent role + contract (reads / write scope / outputs / templates) + task + feedback + skills.
 */
export function buildPrompt(ws, st, { phase, agentId, contract, task = null, failure = null, extra = null }) {
  const req = st.req_id;
  const vars = { req, task: task?.id, requirement: st.requirement };
  const agent = ws.agent(agentId);
  const scope = writeScope(ws.policies, phase, { req, task });
  const parts = [];

  parts.push(`# AIWS run - ${req} - phase: ${phase} - agent: ${agentId}${task ? ` - task: ${task.id}` : ''}`);
  parts.push(fill(agent.body.trim(), vars));

  parts.push(
    [
      '## Context',
      `- Requirement file: ${st.requirement}`,
      `- Work directory: ${ws.workRel(req)}/`,
      `- Knowledge base: aiws/knowledge/`,
      `- This run is non-interactive. Nobody will answer questions during the run; follow the rules below for questions.`,
    ].join('\n')
  );

  const reads = (contract.reads ?? []).map((r) => fill(r, vars).replace(/#.*$/, ''));
  if (reads.length) parts.push(['## Inputs to read', ...reads.map((r) => `- ${r}`)].join('\n'));

  parts.push(
    [
      '## Write scope (enforced)',
      'You may create or modify ONLY these paths:',
      ...scope.map((s) => `- ${s}`),
      'Any other change is detected by `aiws check diff-scope`, automatically reverted, and the run is marked FAILED.',
      'Do not run git commands that change history or branches; the orchestrator commits for you.',
    ].join('\n')
  );

  const commands = shellCommands(ws, phase, contract, task);
  if (commands.length) {
    const extra = ws.policies.bash_allow_extra ?? [];
    parts.push(
      [
        '## Shell commands (enforced)',
        'Your shell tool accepts only the project commands below. Run each from the workspace root, exactly as written, one per call:',
        ...commands.map((c) => `- ${c.key}: \`${c.command}\``),
        ...(extra.length ? [`Read-only helpers are allowed too: ${extra.map((e) => `\`${e}\``).join(', ')}.`] : []),
        'Other spellings are likely to be denied in this run: another name for the same program (a `.cmd` wrapper, ' +
          'a full path), `$?` or other variables, or more commands chained to one of these.',
        'Your shell keeps its working directory between calls: after `cd X && ...` you are inside X, so leave out `cd X &&` the next time.',
        'If a command is denied, do not look for a way around it; say so in your report. ' +
          'The orchestrator builds and runs the full test suites after you in any case.',
      ].join('\n')
    );
  }

  const outs = contract.outputs ?? [];
  if (outs.length) {
    const lines = ['## Required outputs'];
    for (const o of outs) {
      lines.push(`- ${fill(o.path, vars)}${o.required_headings ? ` (required headings: ${o.required_headings.join(' | ')})` : ''}`);
    }
    for (const o of outs) {
      const tpl = o.template ? ws.template(o.template) : null;
      if (tpl)
        lines.push(
          '',
          `### Template for ${fill(o.path, vars)} (keep headings and ID formats exactly)`,
          '```',
          fill(tpl, vars).trim(),
          '```'
        );
    }
    parts.push(lines.join('\n'));
  }

  if (task) {
    parts.push(['## Your task (from the approved plan)', '```yaml', YAML.stringify(task).trim(), '```'].join('\n'));
  }

  const fb = feedbackFor(st, phase);
  if (fb.length) {
    parts.push(
      [
        '## Feedback from humans and previous rounds (address ALL of it)',
        ...fb.map((f, i) => `${i + 1}. [${f.source}, ${f.at}] ${f.text}`),
      ].join('\n')
    );
  }

  if (failure) {
    parts.push(['## Previous attempt failed - fix these problems', '```', truncate(failure, 6000), '```'].join('\n'));
  }

  if (extra) parts.push(extra);

  const skills = contract.skills ?? agent.skills ?? [];
  for (const name of skills) {
    const s = ws.skill(name);
    if (s) parts.push(`## Skill: ${name}\n\n${s.text.replace(/^---[\s\S]*?---\s*/, '').trim()}`);
  }

  parts.push(
    ['## When you finish', 'Reply with a short report: files written, key decisions, and anything a reviewer must know.'].join('\n')
  );

  return parts.join('\n\n') + '\n';
}

/**
 * The build/test commands of the contract (`bash_allow`), in the form the agent's shell accepts. With a task,
 * only the sides the task touches. Empty when the agent has no shell or nothing is configured.
 */
function shellCommands(ws, phase, contract, task) {
  if (!(contract.tools ?? []).includes('bash')) return [];
  const pol = ws.policies;
  const globs = pol.sides ?? {};
  const sides = Object.keys(globs).filter((s) => !task || (task.allowed_files ?? []).some((f) => matcher([globs[s]])(f)));
  const toShell = getAdapter(adapterName(ws, phase)).shellCommand ?? osCommand;
  const out = [];
  for (const entry of contract.bash_allow ?? []) {
    const keys = entry.includes('{side}') ? sides.map((s) => entry.replace('{side}', s)) : [entry];
    for (const key of keys) {
      const command = toShell(pol.commands?.[key]);
      if (command) out.push({ key, command });
    }
  }
  return out;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + `\n...[truncated ${s.length - n} chars]` : s;
}
