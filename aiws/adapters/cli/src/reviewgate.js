// review_gate (workflow.yaml): an outside review that `aiws approve REQ pr` asks for before it records the
// merge. The aiws review phase reads code and documents; a reviewproof round also runs the gates (tests, CI
// checks) at the pull request's head and measures what was read. With `review_gate: reviewproof`, the PR
// gate needs the round of that head to end with verdict pass.
//
// reviewproof keeps one ledger per pull request in its own git repository, REVIEWPROOF_HOME (default
// ~/.reviewproof): <host>/<owner>/<repo>/<number>/ledger.json, schemaVersion 1 (its README, "Ledger").
// aiws only reads it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiwsError } from './util.js';

const KNOWN = ['reviewproof'];

/** Where reviewproof keeps its ledgers. */
export function reviewproofHome(env = process.env) {
  return env.REVIEWPROOF_HOME || path.join(os.homedir(), '.reviewproof');
}

/**
 * The ledger file of a pull request URL (GitHub .../owner/repo/pull/N, GitLab .../group/repo/-/merge_requests/N),
 * or null when the URL is neither. A port's colon becomes `_`, as reviewproof names the folder.
 */
export function ledgerFile(home, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^\/(.+?)\/(?:pull|-\/merge_requests)\/(\d+)\/?$/.exec(u.pathname);
  if (!m) return null;
  return path.join(home, u.host.replace(/:/g, '_'), ...m[1].split('/'), m[2], 'ledger.json');
}

/** The review gate of the workflow, or null when there is none. Throws on a value aiws does not know. */
export function reviewGateOf(ws) {
  const g = ws.workflow.review_gate;
  if (g === undefined || g === null || g === false || g === 'none') return null;
  if (!KNOWN.includes(String(g))) {
    throw new AiwsError(`review_gate ${g} is not known: use reviewproof, or leave it out (workflow.yaml).`);
  }
  return String(g);
}

/**
 * Checks the review of the pull request for the PR gate. `heads` are the commits the pull request may have
 * had at its head (the local branch and its remote-tracking copy). Returns a short line for the history;
 * throws, before anything is recorded, when the review is missing or does not cover the head with a pass.
 */
export function checkReviewGate(ws, st, { branch, heads, env = process.env }) {
  const gate = reviewGateOf(ws);
  if (!gate) return null;
  const req = st.req_id;
  if (!st.pr_url) {
    throw new AiwsError(
      `review_gate reviewproof: ${req} has no pull request URL, so its review cannot be found. ` +
        `Set pull_request in runtime.yaml so aiws opens the pull request, or leave review_gate out.`
    );
  }
  const home = reviewproofHome(env);
  const file = ledgerFile(home, st.pr_url);
  if (!file) throw new AiwsError(`review_gate reviewproof: ${st.pr_url} is not a GitHub or GitLab pull request URL.`);
  if (!fs.existsSync(file)) {
    throw new AiwsError(
      `review_gate reviewproof: no reviewproof ledger for ${st.pr_url} (looked for ${file}). ` +
        `Review the pull request with reviewproof (npm i -g reviewproof; reviewproof start ${st.pr_url}) in a ` +
        `checkout at its head, or set REVIEWPROOF_HOME to where its ledgers are.`
    );
  }
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new AiwsError(`review_gate reviewproof: ${file} cannot be read: ${e.message}`);
  }
  if (ledger.schemaVersion !== 1) {
    throw new AiwsError(`review_gate reviewproof: ${file} has schema ${ledger.schemaVersion}; this aiws reads schema 1.`);
  }
  const round = (ledger.rounds ?? []).at(-1);
  if (!round) throw new AiwsError(`review_gate reviewproof: the ledger of ${st.pr_url} has no round yet.`);
  const short = (sha) => String(sha ?? '').slice(0, 7);
  if (!heads.includes(round.head)) {
    throw new AiwsError(
      `review_gate reviewproof: round ${round.n} reviewed ${short(round.head)}, the head of ${branch} is ` +
        `${short(heads[0])}. Start a new round at the head (reviewproof start ${st.pr_url}) and finish it.`
    );
  }
  if (!round.verdict) {
    throw new AiwsError(`review_gate reviewproof: round ${round.n} has no verdict yet. Finish it with reviewproof verdict.`);
  }
  if (round.verdict.value !== 'pass') {
    throw new AiwsError(
      `review_gate reviewproof: round ${round.n} has verdict ${round.verdict.value} (${round.verdict.summary}). ` +
        `The PR gate needs verdict pass at the head.`
    );
  }
  const posted = round.post ? `, posted ${round.post.url}` : ', not posted';
  return {
    line: `reviewproof round ${round.n} pass at ${short(round.head)}`,
    detail: `round ${round.n}, verdict pass at ${short(round.head)}${posted}`,
  };
}

// reviewproof's own skip list: a .reviewproof.json is used whole, so writing `skip` must keep these
const REVIEWPROOF_DEFAULT_SKIP = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '**/*.snap'];
// what aiws commits with every requirement and nobody reviews line by line: prompts, run logs, reports
export const AIWS_SKIP = ['aiws/work/*/evidence/**', 'aiws/work/_discover/**'];

/**
 * With review_gate reviewproof, makes sure .reviewproof.json at the workspace root leaves the aiws run
 * records out of review coverage: adds the missing AIWS_SKIP patterns, keeps every other key and entry.
 * Returns what happened, for the sync output.
 */
export function syncReviewproofSkip(ws) {
  if (reviewGateOf(ws) !== 'reviewproof') return null;
  const file = path.join(ws.root, '.reviewproof.json');
  let cfg = {};
  if (fs.existsSync(file)) {
    try {
      cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {
        file: '.reviewproof.json',
        note: '.reviewproof.json is not valid JSON: left as it is (add the aiws skip patterns yourself)',
      };
    }
    if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
      return { file: '.reviewproof.json', note: '.reviewproof.json does not hold a JSON object: left as it is' };
    }
  }
  const skip = Array.isArray(cfg.skip) ? [...cfg.skip] : [...REVIEWPROOF_DEFAULT_SKIP];
  const missing = AIWS_SKIP.filter((p) => !skip.includes(p));
  if (Array.isArray(cfg.skip) && !missing.length) return { file: '.reviewproof.json', note: 'up to date' };
  cfg.skip = [...skip, ...missing];
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { file: '.reviewproof.json', note: 'aiws run records left out of reviewproof coverage' };
}
