// Drives `gateMenu` with keys from a fake terminal, for the tests: node gate-driver.mjs <workspace> <REQ> <keys...>
// Each key is written after a short pause: ENTER, DOWN, UP, ESC, a digit, or TEXT:<a line to type>.
import { PassThrough } from 'node:stream';
import { Workspace } from '../../src/workspace.js';
import { loadState } from '../../src/state.js';
import { gateMenu } from '../../src/gatemenu.js';
import * as C from '../../src/commands.js';

const [root, req, ...keys] = process.argv.slice(2);
process.chdir(root);
const input = new PassThrough();
const SEQ = { ENTER: '\r', DOWN: '\x1b[B', UP: '\x1b[A', ESC: '\x1b' };
(async () => {
  for (const k of keys) {
    await new Promise((r) => setTimeout(r, 150));
    input.write(k.startsWith('TEXT:') ? `${k.slice(5)}\n` : (SEQ[k] ?? k));
  }
})();
const ws = Workspace.open();
const picked = await gateMenu(ws, loadState(ws, req), C, { input, output: process.stdout });
console.log(`PICKED ${picked}`);
process.exit(0);
