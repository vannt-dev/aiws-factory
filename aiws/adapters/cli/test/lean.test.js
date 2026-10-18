import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { makeWorkspace } from './helpers.js';
import { Workspace } from '../src/workspace.js';
import { claudeArgs } from '../src/adapters/claude.js';

const after = (args, flag) => args[args.indexOf(flag) + 1];
const argsOf = (ws, opts) => claudeArgs(ws, opts).args;

test('a headless run loads only the tools it may use, the project settings and no MCP server', () => {
  const ws = new Workspace(makeWorkspace());
  const args = argsOf(ws, { contract: { tools: ['read', 'write'] }, agent: { id: 'architect' }, phase: 'design' });
  const allowed = after(args, '--allowedTools').split(',');
  // --tools takes tool names: the Bash(...) patterns of --allowedTools become one Bash
  assert.deepEqual(after(args, '--tools').split(','), [...new Set(allowed.map((t) => t.replace(/\(.*$/, '')))]);
  assert.equal(after(args, '--setting-sources'), 'project,local');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.deepEqual(JSON.parse(after(args, '--mcp-config')), { mcpServers: {} });
});

test('the Bash patterns of a phase with a shell collapse into one Bash tool', () => {
  const root = makeWorkspace();
  const ws = new Workspace(root);
  const args = argsOf(ws, {
    contract: { tools: ['read', 'write', 'bash'], bash_allow: ['git status'] },
    agent: { id: 'developer' },
    phase: 'implementation',
  });
  assert.match(after(args, '--allowedTools'), /Bash\(git status\)/);
  assert.equal(
    after(args, '--tools')
      .split(',')
      .filter((t) => t === 'Bash').length,
    1
  );
});

test('lean: false in runtime.yaml keeps the full Claude Code setup of the machine', () => {
  const root = makeWorkspace();
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.claude.lean = false;
  fs.writeFileSync(file, YAML.stringify(rt));
  const args = argsOf(new Workspace(root), { contract: { tools: ['read'] }, agent: { id: 'analyst' }, phase: 'analysis' });
  for (const flag of ['--tools', '--setting-sources', '--strict-mcp-config', '--mcp-config']) assert.ok(!args.includes(flag), flag);
  assert.ok(args.includes('--allowedTools'));
});

function withMcp(root, mcp) {
  const file = path.join(root, 'aiws', 'config', 'runtime.yaml');
  const rt = YAML.parse(fs.readFileSync(file, 'utf8'));
  rt.claude.mcp = mcp;
  fs.writeFileSync(file, YAML.stringify(rt));
  return new Workspace(root);
}

const GRAPH = {
  servers: { crg: { type: 'stdio', command: 'uvx', args: ['code-review-graph@2.3.6', 'serve'] } },
  tools: ['mcp__crg__query_graph_tool', 'mcp__crg__get_impact_radius_tool'],
  phases: ['analysis', 'design'],
};

test('claude.mcp adds its servers and the named tools to the phases it lists, and to no other', () => {
  const ws = withMcp(makeWorkspace(), GRAPH);
  const design = argsOf(ws, { contract: { tools: ['read', 'write'] }, agent: { id: 'architect' }, phase: 'design' });
  assert.deepEqual(JSON.parse(after(design, '--mcp-config')), { mcpServers: GRAPH.servers });
  for (const flag of ['--tools', '--allowedTools']) {
    const listed = after(design, flag).split(',');
    for (const t of GRAPH.tools) assert.ok(listed.includes(t), `${flag} ${t}`);
  }
  const review = argsOf(ws, { contract: { tools: ['read', 'write'] }, agent: { id: 'reviewer' }, phase: 'review' });
  assert.deepEqual(JSON.parse(after(review, '--mcp-config')), { mcpServers: {} });
  assert.doesNotMatch(after(review, '--tools'), /mcp__/);
});

test('claude.mcp without phases applies to every phase', () => {
  const ws = withMcp(makeWorkspace(), { ...GRAPH, phases: undefined });
  const args = argsOf(ws, { contract: { tools: ['read'] }, agent: { id: 'reviewer' }, phase: 'review' });
  assert.match(after(args, '--tools'), /mcp__crg__query_graph_tool/);
});

test('claude.mcp refuses a tool given by server name only, so no write tool of a server comes along', () => {
  const ws = withMcp(makeWorkspace(), { ...GRAPH, tools: ['mcp__crg'] });
  assert.throws(
    () => argsOf(ws, { contract: { tools: ['read'] }, agent: { id: 'analyst' }, phase: 'analysis' }),
    /claude\.mcp\.tools.*full name.*not mcp__crg$/
  );
});
