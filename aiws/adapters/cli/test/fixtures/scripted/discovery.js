import { write, read } from './_lib.js';

const incremental = Boolean(process.env.AIWS_REQ && process.env.AIWS_REQ !== '_discover');

write('aiws/knowledge/system-map.md', `
# System map

## Tổng quan
Sample user app: source-fe (view helpers), source-be (in-memory user store).

## Thành phần
| Thành phần | Đường dẫn | Trách nhiệm | Công nghệ |
| --- | --- | --- | --- |
| BE users | source-be/src/users.js | user store | Node ESM |
| FE view | source-fe/src/view.js | display helpers | Node ESM |

## Luồng chính
- Hiển thị user: FE displayName(user) <- BE getUser(id)

## Phụ thuộc ngoài
Không có.
`);

write('aiws/knowledge/api-inventory.md', `
# API inventory

## Endpoints
| Method | Path | Handler | Mô tả | FE |
| --- | --- | --- | --- | --- |
| GET | /users/{id} | source-be/src/users.js:getUser | get user | source-fe/src/view.js |
${incremental ? '| PUT | /users/{id}/nickname | source-be/src/users.js:setNickname | set nickname | source-fe/src/view.js |\n' : ''}`);

write('aiws/knowledge/db-schema.md', `
# DB schema

## Bảng
- users (in-memory): id, name${incremental || read('source-be/src/users.js').includes('nickname') ? ', nickname' : ''}
`);

write('aiws/knowledge/glossary.md', `
# Glossary

## Thuật ngữ
| Thuật ngữ | Nghĩa | Tên trong code |
| --- | --- | --- |
| Người dùng | user | user |
`);

write('aiws/knowledge/conventions.md', `
# Conventions

## Frontend
Pure functions in source-fe/src, tests in source-fe/test/*.test.js.

## Backend
Functions in source-be/src; errors carry .status.

## Test
node:test, test names contain TC ids.
`);
console.log('knowledge written');
