// Helpers for scripted "agents": they behave like a well-behaved AI and write the phase outputs.
import fs from 'node:fs';
import path from 'node:path';

export const req = process.env.AIWS_REQ;
export const task = process.env.AIWS_TASK;
export const attempt = Number(process.env.AIWS_ATTEMPT ?? 1);

export function write(rel, content) {
  const abs = path.resolve(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content.replace(/^\n/, ''), 'utf8');
}

export function read(rel) {
  return fs.existsSync(rel) ? fs.readFileSync(rel, 'utf8') : '';
}

export const work = (f) => `aiws/work/${req}/${f}`;
