// The scripted discovery agent, writing in English (workflow.yaml -> language: en).
import { write, read } from '../scripted/_lib.js';

const incremental = Boolean(process.env.AIWS_REQ && process.env.AIWS_REQ !== '_discover');

write(
  'aiws/knowledge/system-map.md',
  `
# System map

## Overview
Sample user app: source-fe (view helpers), source-be (in-memory user store).

## Components
| Component | Path | Responsibility | Technology |
| --- | --- | --- | --- |
| BE users | source-be/src/users.js | user store | Node ESM |
| FE view | source-fe/src/view.js | display helpers | Node ESM |

## Main flows
- Showing a user: FE displayName(user) <- BE getUser(id)

## External dependencies
None.
`
);

write(
  'aiws/knowledge/api-inventory.md',
  `
# API inventory

## Endpoints
| Method | Path | Handler | Description | FE |
| --- | --- | --- | --- | --- |
| GET | /users/{id} | source-be/src/users.js:getUser | get user | source-fe/src/view.js |
${incremental ? '| PUT | /users/{id}/nickname | source-be/src/users.js:setNickname | set nickname | source-fe/src/view.js |\n' : ''}`
);

write(
  'aiws/knowledge/db-schema.md',
  `
# DB schema

## Tables
- users (in-memory): id, name${incremental || read('source-be/src/users.js').includes('nickname') ? ', nickname' : ''}
`
);

write(
  'aiws/knowledge/glossary.md',
  `
# Glossary

## Terms
| Term | Meaning | Name in code |
| --- | --- | --- |
| User | a person with an account | user |
`
);

write(
  'aiws/knowledge/conventions.md',
  `
# Conventions

## Frontend
Pure functions in source-fe/src, tests in source-fe/test/*.test.js.

## Backend
Functions in source-be/src; errors carry .status.

## Test
node:test, test names contain TC ids.
`
);
console.log('knowledge written');
