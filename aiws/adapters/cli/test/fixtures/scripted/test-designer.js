import { write, work, req } from './_lib.js';

write(
  work('03-test-spec.md'),
  `
# ${req} — Test spec

## Chiến lược
Unit test node:test cho BE và FE.

## Test cases

### TC-1: setNickname lưu nickname hợp lệ
- covers: AC-1
- side: be

### TC-2: setNickname từ chối nickname không hợp lệ
- covers: AC-2
- side: be

### TC-3: displayName ưu tiên nickname
- covers: AC-3
- side: fe

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-1 |
| AC-2 | TC-2 |
| AC-3 | TC-3 |
`
);
console.log('test spec done');
