import { write, work, req, read } from './_lib.js';

// Scenario hook: AIWS_REVIEW_CRITICAL=1 makes the first review report a critical finding
// unless the fix (trim) is already in the code.
const critical = process.env.AIWS_REVIEW_CRITICAL && !read('source-be/src/users.js').includes('trim()');

write(work('05-review.md'), `
# ${req} — Review

## Tóm tắt
${critical ? 'Chưa sẵn sàng.' : 'Sẵn sàng tạo PR.'}

## Findings
${critical ? '- [critical] source-be/src/users.js — nickname chỉ gồm khoảng trắng vẫn được lưu — trim trước khi validate' : '- [minor] source-fe/src/view.js — có thể thêm JSDoc'}

## Đối chiếu design
Đúng D1.

## Đối chiếu api-contract
setNickname khớp PUT /users/{id}/nickname.
`);
console.log('review done');
