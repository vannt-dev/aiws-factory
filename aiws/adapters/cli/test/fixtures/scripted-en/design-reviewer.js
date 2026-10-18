// The scripted design reviewer, writing in English (workflow.yaml -> language: en).
import { write, work, req } from '../scripted/_lib.js';

write(
  work('02-design-review.md'),
  `
# ${req} — Design review

## Summary
Ready for the human approval.

## Findings
- [minor] 02-design.md#Risks — the length limit could be named

## Against the requirement
AC-1 and AC-2 are met by D1.

## Against the test specification
Every AC has a test case.
`
);
console.log('design review done');
