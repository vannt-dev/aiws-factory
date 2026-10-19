import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockingQuestions } from '../src/parse.js';

test('blocking questions: only open [blocking] markers, not the marker named in inline code', () => {
  const md = [
    '## Open questions',
    'There is no `[blocking]` question; the defaults below are assumed.',
    '- [blocking] Q1: may a URL use an IP address?',
    '- [blocking] [answered] Q2: ports? Answer: yes',
    '- [non-blocking] Q3: IDN? Assumed yes',
    '- [blocking] Q4: the `localhost` host too?',
  ].join('\n');
  assert.deepEqual(blockingQuestions(md), ['- [blocking] Q1: may a URL use an IP address?', '- [blocking] Q4: the `localhost` host too?']);
});
