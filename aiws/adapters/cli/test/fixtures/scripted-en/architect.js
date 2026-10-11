// The scripted architect, writing in English (workflow.yaml -> language: en).
import { write, work, req } from '../scripted/_lib.js';

write(
  work('02-design.md'),
  `
# ${req} — Design

## Overview
Add setNickname to the BE and prefer the nickname in displayName on the FE.

## Key decisions
- D1: Store the nickname as a field of the user — Reason: simplest.

## API
- PUT /users/{id}/nickname

## DB change
- users: add a nullable nickname column

## BE change
- source-be/src/users.js: setNickname(id, nickname)

## FE change
- source-fe/src/view.js: displayName prefers the nickname

## Migration
None

## Risks
Negligible

## Decisions to approve
- The 30-character limit
`
);

write(
  work('api-contract.yaml'),
  `
openapi: 3.0.3
info: {title: ${req}, version: 1.0.0}
paths:
  /users/{id}/nickname:
    put:
      parameters:
        - {name: id, in: path, required: true, schema: {type: string}}
      requestBody:
        content:
          application/json:
            schema: {type: object, required: [nickname], properties: {nickname: {type: string, minLength: 1, maxLength: 30}}}
      responses:
        "200": {description: OK}
        "400": {description: invalid nickname}
`
);
console.log('design done');
