import YAML from 'yaml';
import { fill } from './util.js';
import { writeScope } from './scope.js';
import { feedbackFor } from './state.js';

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

  const outs = contract.outputs ?? [];
  if (outs.length) {
    const lines = ['## Required outputs'];
    for (const o of outs) {
      lines.push(`- ${fill(o.path, vars)}${o.required_headings ? ` (required headings: ${o.required_headings.join(' | ')})` : ''}`);
    }
    for (const o of outs) {
      const tpl = o.template ? ws.template(o.template) : null;
      if (tpl) lines.push('', `### Template for ${fill(o.path, vars)} (keep headings and ID formats exactly)`, '```', fill(tpl, vars).trim(), '```');
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
    [
      '## When you finish',
      'Reply with a short report: files written, key decisions, and anything a reviewer must know.',
    ].join('\n')
  );

  return parts.join('\n\n') + '\n';
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + `\n...[truncated ${s.length - n} chars]` : s;
}
