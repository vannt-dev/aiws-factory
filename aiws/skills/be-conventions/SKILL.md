---
name: be-conventions
description: Convention THẬT của source-be (layering, controller/service/repository, validation, lỗi, logging, đặt tên, test). Dùng khi thiết kế, code hoặc review BE.
---

# BE conventions

> [CẦN XÁC NHẬN] File này là khung. Khi source-be/ đã có code, chạy trong Claude Code:
> "Đọc source-be/, điền aiws/skills/be-conventions/SKILL.md bằng convention THẬT đang dùng, mỗi ý kèm file ví dụ; chỗ không chắc đánh dấu [CẦN XÁC NHẬN]."
> Sau đó NGƯỜI chốt nội dung, rồi `aiws sync claude`.

## Stack
- Ngôn ngữ / framework / version: [CẦN XÁC NHẬN] (bất kỳ: Java/Spring, .NET, Node, Python, Go, PHP, Ruby...)
- Build / test: xem aiws/config/policies.yaml -> commands.be_build, be_test (`aiws detect` gợi ý)

## Layering
- [CẦN XÁC NHẬN] vd. controller -> service -> repository; DTO ở đâu; mapping.

## Validation & lỗi
- [CẦN XÁC NHẬN] cách validate input, exception handler chung, format body lỗi.

## Persistence
- [CẦN XÁC NHẬN] ORM, transaction, migration.

## Logging & bảo mật
- [CẦN XÁC NHẬN]

## Đặt tên
- [CẦN XÁC NHẬN] package, lớp, hàm, endpoint.

## Test
- [CẦN XÁC NHẬN] framework, vị trí file, mock, tên test chứa mã TC.
