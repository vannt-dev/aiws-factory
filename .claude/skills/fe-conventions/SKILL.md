---
name: fe-conventions
description: Convention THẬT của source-fe (cấu trúc thư mục, gọi API, state, xử lý lỗi, đặt tên, test). Dùng khi thiết kế, code hoặc review FE.
---

# FE conventions

> [CẦN XÁC NHẬN] File này là khung. Khi source-fe/ đã có code, chạy trong Claude Code:
> "Đọc source-fe/, điền aiws/skills/fe-conventions/SKILL.md bằng convention THẬT đang dùng, mỗi ý kèm file ví dụ; chỗ không chắc đánh dấu [CẦN XÁC NHẬN]."
> Sau đó NGƯỜI chốt nội dung, rồi `aiws sync claude`.

## Stack
- Ngôn ngữ / framework / version: [CẦN XÁC NHẬN] (bất kỳ: React, Angular, Vue, Blazor, Flutter, Razor, JSP...)
- Build / test: xem aiws/config/policies.yaml -> commands.fe_build, fe_test (`aiws detect` gợi ý)

## Cấu trúc thư mục
- [CẦN XÁC NHẬN] vd. `src/pages`, `src/components`, `src/api`, `src/store`, `test/`

## Gọi API
- [CẦN XÁC NHẬN] client dùng chung ở đâu, base URL, xử lý lỗi HTTP, kiểu dữ liệu sinh từ api-contract hay viết tay.

## State & dữ liệu
- [CẦN XÁC NHẬN]

## Xử lý lỗi & hiển thị
- [CẦN XÁC NHẬN]

## Đặt tên
- [CẦN XÁC NHẬN] file, component, hook, biến.

## Test
- [CẦN XÁC NHẬN] framework, vị trí file, tên test chứa mã TC.
