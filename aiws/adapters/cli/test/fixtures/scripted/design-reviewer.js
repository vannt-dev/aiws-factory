import fs from 'node:fs';
import path from 'node:path';
import { write, work, req } from './_lib.js';

// Scenario hook: AIWS_DESIGN_REVIEW_CRITICAL=N makes the first N design reviews of this workspace report a
// blocking finding. The count lives in .git, which is not part of the work the review is checked on.
const wanted = Number(process.env.AIWS_DESIGN_REVIEW_CRITICAL ?? 0);
let critical = false;
if (wanted > 0) {
  const counter = path.join(process.cwd(), '.git', 'aiws-design-reviews');
  const done = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
  fs.writeFileSync(counter, String(done + 1));
  critical = done < wanted;
}

write(
  work('02-design-review.md'),
  `
# ${req} — Review thiết kế

## Tóm tắt
${critical ? 'Chưa sẵn sàng cho người duyệt.' : 'Sẵn sàng cho người duyệt.'}

## Findings
${critical ? '- [critical] 02-design.md#API — chưa nói nickname rỗng trả lỗi gì — ghi rõ 400 và test case' : '- [minor] 02-design.md#Rủi ro — có thể nêu giới hạn độ dài'}

## Đối chiếu requirement
AC-1 và AC-2 có trong D1.

## Đối chiếu test spec
Mọi AC có test case.
`
);
console.log('design review done');
