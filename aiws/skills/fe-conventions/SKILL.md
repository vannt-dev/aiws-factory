---
name: fe-conventions
description: Convention THẬT của source-fe (JavaScript ES modules thuần, không framework, node:test) - cấu trúc thư mục, gọi API, render, xử lý lỗi, đặt tên, test. Dùng khi thiết kế, code hoặc review FE.
---

# FE conventions (source-fe)

## Stack
- JavaScript ES modules chạy thẳng trên trình duyệt (`<script type="module">`), không framework, không bundler, không dependency.
- Node.js ≥ 22 chỉ dùng cho build và test. Lệnh: `aiws/config/policies.yaml` -> `commands.fe_build` (`npm run build`), `fe_test` (`npm test` = `node --test`).
- `scripts/build.mjs`: kiểm cú pháp mọi file `src/**/*.js` (`node --check`) rồi chép `index.html` + `src/` vào `dist/` (gitignored).

## Cấu trúc
| Thư mục | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `src/api/` | Gọi HTTP tới BE, một file mỗi resource | `src/api/customerApi.js` |
| `src/components/` | Hàm thuần trả về chuỗi HTML | `src/components/customerTable.js` |
| `src/utils/` | Hàm tiện ích thuần | `src/utils/escapeHtml.js` |
| `src/main.js` | Gắn DOM, sự kiện, gọi API và component | `src/main.js` |
| `test/` | Unit test, `<module>.test.js` | `test/customerTable.test.js` |

## Gọi API
- Mọi request đi qua `request()` trong `src/api/customerApi.js`, base `API_BASE = '/api'`.
- Lỗi non-2xx ném `ApiError` với `status` và `fieldErrors` (lấy từ `errors` của problem RFC 9457). UI hiển thị `fieldErrors` theo từng field.
- Hàm API nhận `options.fetchImpl` để test không cần mạng.

## Render
- Component là hàm thuần `render...(data) -> string`; **mọi dữ liệu động phải qua `escapeHtml`**.
- Nhãn hiển thị tiếng Việt đặt trong component (vd. `STATUS_LABELS` trong `customerTable.js`).

## Đặt tên
- File camelCase `.js`; hàm camelCase, động từ trước (`listCustomers`, `renderCustomerTable`); hằng `UPPER_SNAKE_CASE`.
- Chuỗi dùng nháy đơn; chấm phẩy cuối câu lệnh; thụt lề 2 dấu cách.

## Test
- `node:test` + `node:assert/strict`; Arrange-Act-Assert.
- Mã TC đặt đầu tên test: `test('TC-n: ...', ...)`.
- Test component bằng cách so khớp chuỗi HTML (`assert.match`); test API bằng `fetchImpl` giả (xem `test/customerApi.test.js`).
