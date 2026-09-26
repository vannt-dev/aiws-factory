---
name: api-design
description: Quy tắc thiết kế và review API REST cùng API contract OpenAPI 3 làm cầu nối FE-BE.
---

# API design

## Quy tắc chung
- Theo quy ước đã có trong aiws/knowledge/api-inventory.md (prefix, versioning, format lỗi). Không phát minh quy ước mới nếu chưa có quyết định được duyệt.
- Danh từ số nhiều cho resource: `/users`, `/users/{id}`, sub-resource `/users/{id}/roles`.
- Method: GET đọc, POST tạo, PUT thay thế, PATCH sửa một phần, DELETE xoá.
- Mã trạng thái: 200/201/204; 400 validation; 401/403 auth; 404 không tìm thấy; 409 xung đột.
- Body lỗi theo format đang có của dự án. Nếu dự án chưa có format thì dùng **RFC 9457 Problem Details** (`application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, kèm field mở rộng như `errors`).
- Thời gian theo ISO 8601 / RFC 3339 (UTC); tên field nhất quán với API hiện có (camelCase hoặc snake_case, không trộn lẫn).
- Thay đổi phá tương thích phải nằm trong "Quyết định cần duyệt".

## api-contract.yaml
- OpenAPI 3.0.x; mọi endpoint mới/đổi có request schema, response schema cho từng mã trạng thái, ví dụ.
- Dùng `components/schemas` cho model dùng lại; `required` đầy đủ.
- Không đổi API: `paths: {}`.

## Review
- BE: path/method/schema/mã lỗi khớp contract.
- FE: gọi đúng path/method, gửi đúng body, xử lý mọi mã lỗi được khai báo.
