import path from 'node:path';
import { AiwsError, runShell, osCommand, fill } from './util.js';

/**
 * `aiws reject REQ pr --from-pr`: the review comments of the requirement's pull requests (the workspace one and
 * those of its submodules, as `pull_request` opened them, or the URL given) as feedback for the planner.
 *
 * With GitHub it asks the GitHub CLI: `gh pr view <url> --json url,number,reviews,comments` for the review
 * bodies and the conversation, and the review threads through GraphQL (sent on stdin, so no shell reads the
 * query) for the inline comments with their file and line; resolved threads are left out. A host without
 * GraphQL gets the inline comments of the REST API instead, resolved or not. Comments of bots are left out.
 * `runtime.yaml -> pull_request.feedback_command` replaces all of this for another host: its output is the
 * feedback. Throws when there is nothing to read, so a rejection never goes on with empty feedback.
 */
export function pullRequestFeedback(ws, st, { url } = {}) {
  const req = st.req_id;
  const targets = url
    ? [{ url, dir: '' }]
    : [
        ...(st.pr_url ? [{ url: st.pr_url, dir: '' }] : []),
        ...Object.entries(st.submodules ?? {})
          .filter(([, s]) => s.pr_url)
          .map(([sub, s]) => ({ url: s.pr_url, dir: sub })),
      ];
  if (!targets.length) {
    throw new AiwsError(
      `No pull request is recorded for ${req}: state.yaml has no pr_url (runtime.yaml -> pull_request opens a draft one at ` +
        'the PR gate). Pass its URL with --from-pr=<url>, or give the feedback with -m.'
    );
  }
  const cfg = ws.runtime.pull_request ?? {};
  const custom = osCommand(cfg.feedback_command);
  const sections = [];
  for (const t of targets) {
    const cwd = path.join(ws.root, t.dir);
    if (!SAFE_URL.test(t.url)) throw new AiwsError(`${t.url} is not a pull request URL aiws can pass to a command.`);
    if (custom) {
      const number = /(\d+)\/?$/.exec(t.url)?.[1] ?? '';
      const res = runShell(fill(custom, { url: t.url, number, req, branch: st.branch }), { cwd, timeout: 2 * 60 * 1000 });
      if (res.status !== 0) {
        throw new AiwsError(`pull_request.feedback_command exited ${res.status} for ${t.url}: ${(res.stderr || res.stdout).trim()}`);
      }
      const text = res.stdout.trim();
      if (text) sections.push(`Review comments of the pull request ${t.url}:\n${text}`);
      continue;
    }
    const gh = ghRunner(cfg.gh ?? 'gh', cwd);
    const { text, count } = reviewComments(t, gh);
    if (count) sections.push(text);
  }
  if (!sections.length) {
    throw new AiwsError(
      `No review comments on ${targets.map((t) => t.url).join(', ')}: nothing to send to the planner, so nothing was recorded. ` +
        'Submit the review on the pull request first (a pending review is visible to its author only), or give the feedback ' +
        'with -m and without --from-pr.'
    );
  }
  return sections.join('\n\n');
}

// Only these characters reach the shell from a URL; anything else is refused before gh runs.
const SAFE_URL = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9._~/-]+$/;

/** Runs the GitHub CLI (`pull_request.gh`, default `gh`) with plain arguments; `input` goes to its stdin. */
function ghRunner(bin, cwd) {
  return (args, input) => {
    const res = runShell([bin, ...args].join(' '), { cwd, input, timeout: 2 * 60 * 1000 });
    if (res.status !== 0) {
      const err = `${res.stderr}\n${res.stdout}`.trim();
      if (res.status === 127 || /is not recognized as an internal or external command|command not found/i.test(err)) {
        throw new AiwsError(
          'GitHub CLI (gh) not found: install it (https://cli.github.com) and run `gh auth login`, set runtime.yaml -> ' +
            'pull_request.gh to its path, or pull_request.feedback_command for another host.'
        );
      }
      if (/gh auth login|not logged in|authentication required|HTTP 401|GH_TOKEN/i.test(err)) {
        throw new AiwsError(`gh is not signed in to the host of the pull request: run \`gh auth login\` (or set GH_TOKEN).\n${err}`);
      }
    }
    return res;
  };
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes { isResolved isOutdated path line originalLine comments(first: 50) { nodes { body author { login } } } }
      }
    }
  }
}`;

const isBot = (login, type) => type === 'Bot' || /\[bot\]$|^app\//.test(String(login ?? ''));
const STATES = { CHANGES_REQUESTED: 'changes requested', COMMENTED: 'comment', APPROVED: 'approved' };

/** `- head: body`, the body's further lines indented under it. */
function item(head, body, indent = '') {
  const lines = String(body).trim().split(/\r?\n/);
  return [`${indent}- ${head}: ${lines[0]}`, ...lines.slice(1).map((l) => `${indent}  ${l}`)].join('\n');
}

function where(dir, file, line, outdated) {
  const p = dir ? `${dir}/${file}` : file;
  return `${p}${line ? `:${line}` : ''}${outdated ? ' (outdated, the line of an earlier version)' : ''}`;
}

/**
 * The review comments of one pull request as planner feedback: {text, count}, count being the number of items
 * (a thread with its replies is one). `gh(args, input)` runs the GitHub CLI and returns {status, stdout, stderr}.
 * Paths of a submodule's pull request (`target.dir`) get the submodule's folder in front.
 */
export function reviewComments(target, gh) {
  const { url, dir } = target;
  const m = SAFE_URL.test(url) ? /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url) : null;
  if (!m) throw new AiwsError(`${url} is not the URL of a GitHub pull request (https://<host>/<owner>/<repo>/pull/<number>).`);
  const [, host, owner, name, num] = m;
  const hostArgs = host === 'github.com' ? [] : ['--hostname', host];

  const viewRes = gh(['pr', 'view', url, '--json', 'url,number,reviews,comments']);
  if (viewRes.status !== 0)
    throw new AiwsError(`gh pr view ${url} failed (exit ${viewRes.status}): ${(viewRes.stderr || viewRes.stdout).trim()}`);
  const view = parseJson(viewRes.stdout, `gh pr view ${url}`);

  const items = [];
  for (const r of view.reviews ?? []) {
    if (!String(r.body ?? '').trim() || isBot(r.author?.login) || !STATES[r.state]) continue;
    items.push(item(`Review by @${r.author?.login ?? 'unknown'} (${STATES[r.state]})`, r.body));
  }

  const input = JSON.stringify({ query: THREADS_QUERY, variables: { owner, name, number: Number(num) } });
  const threadsRes = gh(['api', 'graphql', '--input', '-', ...hostArgs], input);
  const threads =
    threadsRes.status === 0 ? parseJson(threadsRes.stdout, 'gh api graphql').data?.repository?.pullRequest?.reviewThreads?.nodes : null;
  if (threads) {
    for (const t of threads) {
      const comments = (t.comments?.nodes ?? []).filter((c) => String(c.body ?? '').trim() && !isBot(c.author?.login));
      if (t.isResolved || !comments.length) continue;
      const [first, ...replies] = comments;
      const line = t.line ?? t.originalLine;
      items.push(
        [
          item(`${where(dir, t.path, line, t.isOutdated || !t.line)} (@${first.author?.login ?? 'unknown'})`, first.body),
          ...replies.map((c) => item(`reply by @${c.author?.login ?? 'unknown'}`, c.body, '  ')),
        ].join('\n')
      );
    }
  } else {
    // no GraphQL (an older GitHub Enterprise Server): the inline comments of the REST API, resolved or not
    const restRes = gh(['api', `repos/${owner}/${name}/pulls/${num}/comments`, '--paginate', ...hostArgs]);
    if (restRes.status !== 0)
      throw new AiwsError(`gh api could not read the inline comments of ${url}: ${(restRes.stderr || restRes.stdout).trim()}`);
    const all = jsonArrays(restRes.stdout, 'gh api pulls comments');
    const keep = all.filter((c) => String(c.body ?? '').trim() && !isBot(c.user?.login, c.user?.type));
    for (const c of keep.filter((x) => !x.in_reply_to_id)) {
      const line = c.line ?? c.original_line;
      items.push(
        [
          item(`${where(dir, c.path, line, !c.line)} (@${c.user?.login ?? 'unknown'})`, c.body),
          ...keep.filter((x) => x.in_reply_to_id === c.id).map((x) => item(`reply by @${x.user?.login ?? 'unknown'}`, x.body, '  ')),
        ].join('\n')
      );
    }
  }

  for (const c of view.comments ?? []) {
    if (!String(c.body ?? '').trim() || isBot(c.author?.login)) continue;
    items.push(item(`Comment by @${c.author?.login ?? 'unknown'}`, c.body));
  }
  return { text: [`Review comments of the pull request ${url}:`, ...items].join('\n'), count: items.length };
}

/** The elements of the JSON arrays `gh api --paginate` prints one after the other, one a page. */
function jsonArrays(text, what) {
  const out = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') {
      if (depth++ === 0) start = i;
    } else if ((ch === ']' || ch === '}') && --depth === 0) {
      out.push(...[].concat(parseJson(text.slice(start, i + 1), what)));
    }
  }
  return out;
}

function parseJson(text, what) {
  try {
    return JSON.parse(String(text).trim() || 'null') ?? {};
  } catch {
    throw new AiwsError(`${what} did not print JSON: ${String(text).trim().slice(0, 300)}`);
  }
}
