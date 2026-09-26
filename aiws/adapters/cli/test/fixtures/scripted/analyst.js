import { write, work, req } from './_lib.js';

write(
  work('01-analysis.md'),
  `
# ${req} — Phân tích requirement

## Mục tiêu
Cho phép người dùng đặt nickname hiển thị.

## Acceptance criteria
- AC-1: Khi đặt nickname hợp lệ (1-30 ký tự) thì nickname được lưu cho user.
- AC-2: Khi nickname rỗng hoặc dài hơn 30 ký tự thì báo lỗi 400 và không lưu.
- AC-3: Khi user có nickname thì giao diện hiển thị nickname, không có thì hiển thị tên.

## Impact
- BE: source-be/src/users.js
- FE: source-fe/src/view.js

## Reuse
- getUser trong source-be/src/users.js

## Câu hỏi mở
Không có
`
);
console.log('analysis done');
