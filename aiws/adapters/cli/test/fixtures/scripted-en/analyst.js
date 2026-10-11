// The scripted analyst, writing in English (workflow.yaml -> language: en).
import { write, work, req } from '../scripted/_lib.js';

write(
  work('01-analysis.md'),
  `
# ${req} — Requirement analysis

## Goal
Let a user set a display nickname.

## Acceptance criteria
- AC-1: Given a valid nickname (1-30 characters), when it is set, then it is stored for the user.
- AC-2: Given an empty nickname or one longer than 30 characters, when it is set, then the API answers 400 and stores nothing.
- AC-3: Given a user with a nickname, when the user is displayed, then the nickname is shown; without one, the name.

## Impact
- BE: source-be/src/users.js
- FE: source-fe/src/view.js

## Reuse
- getUser in source-be/src/users.js

## Open questions
None
`
);
console.log('analysis done');
