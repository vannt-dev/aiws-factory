import { runShell, warn, osCommand } from './util.js';

/**
 * Tells a person that a run stopped, so nobody has to watch it. `runtime.yaml -> notify`:
 *
 *   notify:
 *     events: [gate, blocked, budget, paused]      # default: all four
 *     command: 'notify-send AIWS "{message}"'      # a shell command; {message}, {req}, {event} are filled in,
 *                                                  # and AIWS_NOTIFY_MESSAGE / _REQ / _EVENT / _PHASE are in its env
 *     webhook: ${AIWS_WEBHOOK_URL}                 # POST {text, content, req, event, phase, status} as JSON;
 *                                                  # ${VAR} is read from the environment, so no secret sits in git
 *
 * A notification that fails only warns: it never changes what the run did.
 */
const EVENTS = ['gate', 'blocked', 'budget', 'paused'];

/** The event a stopped run is, or null when the run ended in a way nobody needs to hear about. */
export function stopEvent(st, { budgetWarning = false } = {}) {
  if (st.paused) return 'paused';
  if (st.status === 'blocked') return 'blocked';
  if (st.status === 'waiting_human') return budgetWarning ? 'budget' : 'gate';
  return null;
}

/** `${VAR}` in a configured value, taken from the environment; a missing variable leaves the value unusable. */
export function expandEnv(value, env = process.env) {
  if (typeof value !== 'string') return value;
  let missing = null;
  const out = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) => {
    if (env[name] === undefined || env[name] === '') {
      missing ??= name;
      return whole;
    }
    return env[name];
  });
  return missing ? { missing } : out;
}

function enabled(cfg, event) {
  const events = Array.isArray(cfg.events) && cfg.events.length ? cfg.events : EVENTS;
  return events.includes(event);
}

/** Sends one notification through every configured channel. Resolves when all have been tried. */
export async function notify(ws, { event, req, phase, status, message }) {
  const cfg = ws.runtime.notify;
  if (!cfg || !enabled(cfg, event)) return [];
  const sent = [];
  const text = `${req}: ${message}`;
  const command = osCommand(cfg.command);
  if (command) {
    const line = command
      .replace(/\{message\}/g, text.replace(/["\r\n]+/g, ' '))
      .replace(/\{req\}/g, req)
      .replace(/\{event\}/g, event);
    const res = runShell(line, {
      cwd: ws.root,
      env: { ...process.env, AIWS_NOTIFY_MESSAGE: text, AIWS_NOTIFY_REQ: req, AIWS_NOTIFY_EVENT: event, AIWS_NOTIFY_PHASE: phase ?? '' },
      timeout: 30 * 1000,
    });
    if (res.status === 0) sent.push('command');
    else warn(`notify command failed (exit ${res.status}): ${(res.stderr || res.stdout).trim().slice(0, 300)}`);
  }
  if (cfg.webhook) {
    const url = expandEnv(cfg.webhook);
    if (url?.missing) {
      warn(`notify webhook not sent: environment variable ${url.missing} is not set`);
    } else {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, content: text, req, event, phase: phase ?? null, status: status ?? null }),
          signal: AbortSignal.timeout(15 * 1000),
        });
        if (res.ok) sent.push('webhook');
        else warn(`notify webhook answered ${res.status}`);
      } catch (e) {
        warn(`notify webhook failed: ${e?.message ?? e}`);
      }
    }
  }
  return sent;
}
