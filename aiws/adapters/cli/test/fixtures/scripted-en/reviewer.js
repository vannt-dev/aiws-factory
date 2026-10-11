// The scripted reviewer, writing in English (workflow.yaml -> language: en).
import { write, work, req, read } from '../scripted/_lib.js';

const critical = process.env.AIWS_REVIEW_CRITICAL && !read('source-be/src/users.js').includes('trim()');

write(
  work('05-review.md'),
  `
# ${req} — Review

## Summary
${critical ? 'Not ready.' : 'Ready for a pull request.'}

## Findings
${critical ? '- [critical] source-be/src/users.js — a nickname made of spaces only is stored — trim before validating' : '- [minor] source-fe/src/view.js — a JSDoc comment would help'}

## Against the design
D1 as designed.

## Against the api-contract
setNickname matches PUT /users/{id}/nickname.
`
);
console.log('review done');
