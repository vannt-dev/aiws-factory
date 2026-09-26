import { write, work, read } from './_lib.js';

// When review/PR feedback exists, the planner adds a fix task (T3) and keeps T1/T2 unchanged.
const needsFix = read(work('05-review.md')).includes('[critical]') || read(work('04-plan.yaml')).includes('T3');

write(
  work('04-plan.yaml'),
  `
tasks:
  - id: T1
    title: BE setNickname
    description: add setNickname with validation
    allowed_files: [source-be/src/users.js, source-be/test/nickname.test.js]
    tests: [TC-1, TC-2]
    depends_on: []
  - id: T2
    title: FE displayName uses nickname
    description: prefer nickname
    allowed_files: [source-fe/src/view.js, source-fe/test/nickname.test.js]
    tests: [TC-3]
    depends_on: [T1]
${
  needsFix
    ? `  - id: T3
    type: fix
    title: BE trim nickname (review fix)
    description: trim whitespace before validation
    allowed_files: [source-be/src/users.js, source-be/test/trim.test.js]
    tests: []
    depends_on: [T1]
`
    : ''
}`
);
console.log('plan done');
