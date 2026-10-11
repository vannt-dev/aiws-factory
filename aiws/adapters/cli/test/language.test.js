import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { makeWorkspace, aiws, ok, state, git, readFile, scenario, FIXTURES, SCRIPTED } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { sync } from '../src/adapters/claude.js';

const SCRIPTED_EN = path.join(FIXTURES, 'scripted-en');

/** A workspace whose documents come out in English, with the English scripted agents in front of the default ones. */
function englishWorkspace() {
  const root = makeWorkspace();
  const file = path.join(root, 'aiws', 'config', 'workflow.yaml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^language: vi$/m, 'language: en'));
  git(root, ['commit', '-q', '-am', 'documents in English']);
  const env = { AIWS_SCRIPTED_DIR: [SCRIPTED_EN, SCRIPTED].join(path.delimiter) };
  return { root, env };
}

test('with language: en the whole requirement runs on English templates and headings', () => {
  const { root, env } = englishWorkspace();
  assert.equal(new Workspace(root).language, 'en');

  ok(root, ['discover'], { env });
  assert.match(readFile(root, 'aiws/knowledge/system-map.md'), /^## Overview/m);
  const discoverPrompt = readFile(root, 'aiws/work/_discover/evidence/runs/run-0001.prompt.md');
  assert.match(discoverPrompt, /Language: write every document, finding and report in English/);
  assert.match(discoverPrompt, /required headings: Overview \| Components \| Main flows \| External dependencies/);
  assert.match(discoverPrompt, /## Components\n<!-- Each component: name, directory, responsibility, technology\. -->/);

  ok(root, ['new', 'REQ-001']);
  ok(root, ['run', 'REQ-001'], { env });
  let st = state(root);
  assert.equal(st.phase, 'design_approval', st.reason);
  const analysisPrompt = readFile(root, 'aiws/work/REQ-001/evidence/runs/run-0001.prompt.md');
  assert.match(analysisPrompt, /required headings: Goal \| Acceptance criteria \| Impact \| Reuse \| Open questions/);
  assert.match(analysisPrompt, /# REQ-001 — Requirement analysis/);
  assert.doesNotMatch(analysisPrompt, /Mục tiêu/);
  assert.match(readFile(root, 'aiws/work/REQ-001/02-design.md'), /^## Decisions to approve/m);

  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  st = state(root);
  assert.equal(st.phase, 'pr_approval', st.reason);
  assert.match(readFile(root, 'aiws/work/REQ-001/05-review.md'), /^## Against the api-contract/m);
  assert.match(readFile(root, 'aiws/work/REQ-001/trace.md'), /\| AC-1 \| TC-1 \| T1 \|/);
});

test('with language: en a Vietnamese document is sent back for its headings, and an answer is written under ## Answer', () => {
  const { root, env } = englishWorkspace();
  ok(root, ['discover'], { env });
  ok(root, ['new', 'REQ-001']);
  // the default (Vietnamese) analyst in an English workspace: wrong headings on every attempt
  const r = aiws(root, ['run', 'REQ-001'], { env: { AIWS_SCRIPTED_DIR: SCRIPTED } });
  assert.equal(r.status, 0, r.out);
  const st = state(root);
  assert.equal(st.status, 'blocked');
  assert.match(st.reason, /01-analysis\.md is missing headings: Goal, Open questions/);

  // the English analyst, then a developer question answered in English
  ok(root, ['resume', 'REQ-001', '--yes']);
  ok(root, ['run', 'REQ-001'], { env });
  ok(root, ['approve', 'REQ-001', 'design', '--yes']);
  const asking = scenario({
    'developer-T2.js': `
      import { write, read, work } from './_lib.js';
      if (!read(work('questions.md')).includes('## Answer')) {
        write(work('questions.md'), '## Q1\\nShow the nickname in the list too?\\n');
      } else {
        await import(${JSON.stringify(pathToFileURL(path.join(SCRIPTED, 'developer-T2.js')).href)});
      }
    `,
  });
  // the asking developer first, then the English agents, then the default ones
  const envAsk = { AIWS_SCRIPTED_DIR: [asking.AIWS_SCRIPTED_DIR.split(path.delimiter)[0], SCRIPTED_EN, SCRIPTED].join(path.delimiter) };
  ok(root, ['run', 'REQ-001'], { env: envAsk });
  assert.equal(state(root).phase, 'design_change_requested');
  ok(root, ['answer', 'REQ-001', '--yes', '-m', 'No, only on the profile.']);
  assert.match(readFile(root, 'aiws/work/REQ-001/questions.md'), /^## Answer \(tuan, /m);
  assert.doesNotMatch(readFile(root, 'aiws/work/REQ-001/questions.md'), /Trả lời/);
  ok(root, ['run', 'REQ-001'], { env: envAsk });
  assert.equal(state(root).phase, 'pr_approval', state(root).reason);
});

test('the default stays Vietnamese, and an unknown language falls back to it', () => {
  const root = makeWorkspace();
  const ws = new Workspace(root);
  assert.equal(ws.language, 'vi');
  assert.match(ws.template('01-analysis.md'), /^## Mục tiêu/m);
  ws._cache.workflow = { ...ws.workflow, language: 'EN' };
  assert.equal(ws.language, 'en');
  assert.match(ws.template('01-analysis.md'), /^## Goal/m);
  assert.match(ws.template('knowledge/glossary.md'), /^## Terms/m);
  ws._cache.workflow = { ...ws.workflow, language: 'fr' };
  assert.equal(ws.language, 'vi');
  assert.deepEqual(ws.headingsOf({ required_headings: ['A'], required_headings_en: ['B'] }), ['A']);
  ws._cache.workflow = { ...ws.workflow, language: 'en' };
  assert.deepEqual(ws.headingsOf({ required_headings: ['A'], required_headings_en: ['B'] }), ['B']);
  assert.deepEqual(ws.headingsOf({ required_headings: ['A'] }), ['A']);
});

test('aiws sync claude writes the generated agent notes in the workspace language', () => {
  const root = makeWorkspace();
  const ws = new Workspace(root);
  sync(ws);
  assert.match(readFile(root, '.claude/agents/analyst.md'), /Trước khi làm, đọc các skill/);
  ws._cache.workflow = { ...ws.workflow, language: 'en' };
  sync(ws);
  const agent = readFile(root, '.claude/agents/analyst.md');
  assert.match(agent, /Before you start, read the skills/);
  assert.match(agent, /# Language\nWrite every document, finding and report in English\./);
  assert.doesNotMatch(agent, /Trước khi làm/);
});

test('every English template has a Vietnamese twin, and the contracts name English headings for every Vietnamese list', () => {
  const kit = path.resolve(FIXTURES, '..', '..', '..', '..');
  const en = path.join(kit, 'templates', 'en');
  const walk = (d, rel = '') =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  const enFiles = walk(en).sort();
  const viFiles = walk(path.join(kit, 'templates'))
    .filter((f) => !f.startsWith('en/'))
    .sort();
  assert.deepEqual(enFiles, viFiles);
  for (const file of fs.readdirSync(path.join(kit, 'config', 'contracts'))) {
    const c = YAML.parse(fs.readFileSync(path.join(kit, 'config', 'contracts', file), 'utf8'));
    for (const out of c.outputs ?? []) {
      // a list that is already English (Endpoints; Frontend, Backend, Test) needs no twin
      const vietnamese = (out.required_headings ?? []).some((h) => /[À-ỹ]/.test(h));
      if (vietnamese) assert.ok(out.required_headings_en, `${file}: ${out.path} has no required_headings_en`);
      if (out.required_headings_en) assert.equal(out.required_headings_en.length, out.required_headings.length, `${file}: ${out.path}`);
    }
  }
});
