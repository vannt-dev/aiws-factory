---
name: db-design
description: Quy tắc thiết kế thay đổi DB - bảng, cột, index, migration an toàn và rollback.
---

# DB design

- Theo công cụ migration đang dùng (aiws/knowledge/db-schema.md, mục Migration). Không đổi công cụ.
- Migration chỉ tiến, có rollback mô tả được. Không sửa migration đã chạy.
- Thêm cột NOT NULL vào bảng có dữ liệu: thêm nullable -> backfill -> đặt NOT NULL (hoặc có default).
- Đổi tên/xoá cột: tách nhiều bước để bản code cũ và mới cùng chạy được (expand/contract).
- Index cho cột dùng trong WHERE/JOIN mới; unique constraint cho ràng buộc nghiệp vụ.
- Quan hệ n-n dùng bảng nối (vd. `user_roles`) thay vì cột chuỗi phân tách.
- Mọi thay đổi schema liệt kê trong "DB change" và "Quyết định cần duyệt" của 02-design.md.
- Không đọc/ghi DB thật trong unit test; dùng repository giả hoặc DB in-memory theo convention dự án.
