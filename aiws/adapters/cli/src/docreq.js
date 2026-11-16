// A requirement written in Word, PDF, Excel, PowerPoint or HTML, read into requirements/ with document-reader
// (https://github.com/vannt-dev/document-reader-skill-ai). Optional: aiws installs nothing, and only a person runs
// it (`aiws new --from-doc`, `aiws revise --from-doc`), as requirements/ is theirs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { AiwsError } from './util.js';

const WHOLE = { chars: ['--max-chars', '2000000'], rows: ['--max-rows', '1000000'] };

/** The reader script of each format, and the limits that make it return the whole document. */
const READERS = {
  '.docx': { script: 'read_docx.py', args: WHOLE.chars },
  '.pdf': { script: 'read_pdf.py', args: [...WHOLE.chars, ...WHOLE.rows] },
  '.xlsx': { script: 'read_excel.py', args: WHOLE.rows },
  '.xlsm': { script: 'read_excel.py', args: WHOLE.rows },
  '.pptx': { script: 'read_pptx.py', args: WHOLE.chars },
  '.html': { script: 'read_html.py', args: WHOLE.chars },
  '.htm': { script: 'read_html.py', args: WHOLE.chars },
  '.txt': { script: 'read_txt.py', args: WHOLE.chars },
  '.csv': { script: 'read_csv.py', args: WHOLE.rows },
  '.tsv': { script: 'read_csv.py', args: WHOLE.rows },
};

const HOME_INSTALLS = ['.agents', '.claude', '.gemini'].map((d) => path.join(d, 'skills', 'document-reader'));

/** A configured path: `~/` is the home folder, a relative one is from the workspace root. */
const expand = (ws, p) => path.resolve(ws.root, String(p).replace(/^~(?=$|[\\/])/, os.homedir()));

/** Where document-reader is: runtime.yaml `document_reader` (a folder, or {path, python}), else a home install. */
function findReader(ws) {
  const cfg = ws.runtime?.document_reader;
  const configured = typeof cfg === 'string' ? cfg : cfg?.path;
  const dirs = configured ? [expand(ws, configured)] : HOME_INSTALLS.map((d) => path.join(os.homedir(), d));
  const dir = dirs.find((d) => fs.existsSync(path.join(d, 'scripts', 'read_docx.py')));
  if (!dir) {
    throw new AiwsError(
      `document-reader is not installed (looked in ${dirs.join(', ')}). Install it from ` +
        'https://github.com/vannt-dev/document-reader-skill-ai (setup-document-reader.sh / .bat, then ' +
        'setup-python-env for PDF, Excel and PowerPoint), or point runtime.yaml -> document_reader at its folder.'
    );
  }
  // a bare command name (python3) is looked up on PATH; a path is expanded like the folder
  const python = cfg?.python ? (/[\\/]/.test(cfg.python) ? expand(ws, cfg.python) : cfg.python) : findPython();
  return { dir, python };
}

function findPython() {
  const names = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  const hit = names.find((n) => spawnSync(n, ['--version'], { encoding: 'utf8' }).status === 0);
  if (!hit)
    throw new AiwsError(`document-reader needs Python 3 (tried ${names.join(', ')}); or set runtime.yaml -> document_reader.python.`);
  return hit;
}

/** Reads a document with document-reader: its text as Markdown, and the sha256 of the file. */
export function readDocument(ws, file) {
  const abs = path.resolve(file);
  const name = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const reader = READERS[ext];
  if (!reader) {
    throw new AiwsError(`${ext || name} is not a format document-reader reads: ${Object.keys(READERS).join(', ')}.`);
  }
  if (!fs.existsSync(abs)) throw new AiwsError(`${file} not found.`);
  const { dir, python } = findReader(ws);
  const res = spawnSync(python, [path.join(dir, 'scripts', reader.script), abs, ...reader.args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  let out = null;
  try {
    out = res.status === 0 ? JSON.parse(res.stdout) : null;
  } catch {
    // not the reader's JSON
  }
  if (typeof out?.content !== 'string') {
    const said = `${res.error?.message ?? ''}\n${res.stderr ?? ''}`.trim();
    throw new AiwsError(
      `document-reader could not read ${name} (exit ${res.status}):\n${said.slice(-2000)}\n` +
        'A missing module means its Python environment is not set up: run its setup-python-env script.'
    );
  }
  if (out.truncated) throw new AiwsError(`document-reader cut ${name} short; it is too large to be one requirement.`);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  return { name, sha256, content: out.content.replace(/\r\n?/g, '\n').trim() };
}

/**
 * The requirement file of a document: titled by its first heading (or its file name), with a line saying where
 * it came from. `file` keeps a requirement's own path on a revision.
 */
export function requirementFromDoc(req, docText, { slugOf, file = null } = {}) {
  const { name, sha256 } = docText;
  let body = docText.content;
  const heading = /^#\s+(.+)$/m.exec(body);
  const first = body.split('\n').find((l) => l.trim());
  let title = path.basename(name, path.extname(name));
  if (heading && first === heading[0]) {
    title = heading[1].trim();
    body = body.slice(body.indexOf(heading[0]) + heading[0].length).trim();
  }
  const source =
    `Source: \`${name}\` (sha256 ${sha256.slice(0, 12)}), read with ` +
    '[document-reader](https://github.com/vannt-dev/document-reader-skill-ai). ' +
    `Edit the document, then \`aiws revise ${req} --from-doc <file> -m "..."\`.`;
  const text = `# ${req} — ${title}\n\n${source}\n\n${body}\n`;
  return { file: file ?? `requirements/${req}-${slugOf(title) || 'document'}.md`, text, title };
}
