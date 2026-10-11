// The scripted test designer, writing in English (workflow.yaml -> language: en).
import { write, work, req } from '../scripted/_lib.js';

write(
  work('03-test-spec.md'),
  `
# ${req} — Test specification

## Strategy
node:test unit tests for the BE and the FE.

## Test cases

### TC-1: setNickname stores a valid nickname
- covers: AC-1
- side: be

### TC-2: setNickname refuses an invalid nickname
- covers: AC-2
- side: be

### TC-3: displayName prefers the nickname
- covers: AC-3
- side: fe

## AC matrix
| AC | Test cases |
| --- | --- |
| AC-1 | TC-1 |
| AC-2 | TC-2 |
| AC-3 | TC-3 |
`
);
console.log('test spec done');
