import { spawnSync } from 'node:child_process';
import { AiwsError } from './util.js';

/**
 * `aiws new REQ --from-issue <ref>`: the requirement comes from a GitHub issue, read with the GitHub CLI
 * (`runtime.yaml -> pull_request.gh`, default `gh`). gh runs with an argument list, never through a shell, and
 * only reads the issue: nothing is posted back to it.
 */

const FIELDS = 'number,title,body,url,labels';
const NUMBER = /^#?([1-9]\d*)$/;
const REPO_NUMBER = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/;
const ISSUE_URL = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*\/?$/;

/** The `gh` arguments that read the issue `ref`: `12`, `#12`, `owner/repo#12` or the issue's URL. */
export function issueViewArgs(ref) {
  const s = typeof ref === 'string' ? ref.trim() : '';
  const json = ['--json', FIELDS];
  let m;
  if ((m = NUMBER.exec(s))) return ['issue', 'view', m[1], ...json];
  if ((m = REPO_NUMBER.exec(s))) return ['issue', 'view', m[2], '-R', m[1], ...json];
  if (ISSUE_URL.test(s)) return ['issue', 'view', s, ...json];
  throw new AiwsError(
    `'${ref}' is not an issue: give its number (12), owner/repo#12, or its URL (https://github.com/owner/repo/issues/12).`
  );
}

/** Splits a configured command (`gh`, `/opt/gh/bin/gh`, `node "C:\\x y\\gh.cjs"`) on spaces outside quotes. */
export function splitCommand(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(line)))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Reads the issue through gh in `cwd`: {number, title, body, url, labels}. Throws a clear AiwsError on failure. */
export function fetchIssue(ref, { gh = 'gh', cwd } = {}) {
  const args = issueViewArgs(ref);
  const [bin, ...pre] = splitCommand(gh);
  const res = spawnSync(bin, [...pre, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 2 * 60 * 1000 });
  if (res.error?.code === 'ENOENT') {
    throw new AiwsError(
      'GitHub CLI (gh) not found: install it (https://cli.github.com) and run `gh auth login`, or set runtime.yaml -> ' +
        'pull_request.gh to its path.'
    );
  }
  if (res.error) throw new AiwsError(`gh issue view ${args[2]} failed: ${res.error.message}`);
  const err = `${res.stderr ?? ''}\n${res.stdout ?? ''}`.trim();
  if (res.status !== 0) {
    if (/gh auth login|not logged in|authentication required|HTTP 401|GH_TOKEN/i.test(err)) {
      throw new AiwsError(`gh is not signed in to the host of the issue: run \`gh auth login\` (or set GH_TOKEN).\n${err}`);
    }
    throw new AiwsError(`gh issue view ${args[2]} failed (exit ${res.status}):\n${err}`);
  }
  let issue;
  try {
    issue = JSON.parse(res.stdout);
  } catch {
    throw new AiwsError(`gh issue view ${args[2]} printed no JSON:\n${err}`);
  }
  if (!issue?.title || !issue?.url) throw new AiwsError(`gh issue view ${args[2]} returned no title or URL.`);
  return issue;
}

/** `owner/repo#12` for a GitHub issue URL, else `#12`. */
export function issueLabel(issue) {
  const m = /\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(issue.url ?? '');
  return m ? `${m[1]}/${m[2]}#${m[3]}` : `#${issue.number}`;
}

/** The title as a file name: ASCII letters and digits joined by `-`, at most 50 characters, cut between words. */
function slug(title) {
  const s = String(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = s.slice(0, 51);
  return s.length <= 50 ? s : cut.includes('-') ? cut.replace(/-[^-]*$/, '') : s.slice(0, 50);
}

/** The requirement file written from an issue: {file, text}, file relative to the workspace root. */
export function requirementFromIssue(req, issue) {
  const title = String(issue.title).trim();
  const name = slug(title) || `issue-${issue.number}`;
  const labels = (issue.labels ?? []).map((l) => l?.name ?? l).filter(Boolean);
  const body = String(issue.body ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const head = [`Source: [${issueLabel(issue)}](${issue.url})`, ...(labels.length ? [`Labels: ${labels.join(', ')}`] : [])];
  const text = `# ${req} — ${title}\n\n${head.join('  \n')}\n\n${body || '_The issue has no description._'}\n`;
  return { file: `requirements/${req}-${name}.md`, text };
}
