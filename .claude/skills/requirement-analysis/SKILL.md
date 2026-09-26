---
name: requirement-analysis
description: Cách biến một requirement viết tự do thành acceptance criteria kiểm chứng được, impact có dẫn chứng và câu hỏi mở phân loại blocking/non-blocking.
---

# Requirement analysis

## Acceptance criteria tốt
- Kiểm chứng được bằng một unit test: có đầu vào, hành động, kết quả quan sát được.
- Một hành vi mỗi AC. Tách "tạo và sửa" thành 2 AC.
- Có cả đường lỗi: validation, không tìm thấy, trùng lặp, không có quyền (nếu requirement ngụ ý).
- Dạng Gherkin: `- AC-n: Given <bối cảnh>, when <hành động>, then <kết quả quan sát được>.`
- Đạt tiêu chí chất lượng yêu cầu của ISO/IEC/IEEE 29148: cần thiết, rõ nghĩa (một cách hiểu), kiểm chứng được, khả thi, nhất quán, truy vết được về requirement.

## Impact
- Tra aiws/knowledge/api-inventory.md, db-schema.md, system-map.md trước; mở file source để xác nhận.
- Ghi đường dẫn cụ thể: `source-be/src/user/UserService.java`, không ghi "phần user".

## Câu hỏi mở
- `[blocking]`: không biết thì thiết kế sai (vd. quy tắc nghiệp vụ mâu thuẫn, thiếu định nghĩa trạng thái). Orchestrator sẽ dừng chờ người trả lời.
- `[non-blocking]`: có giả định hợp lý; ghi giả định để người duyệt design thấy.
- Đừng biến mọi thứ thành blocking. Chỉ blocking khi hai cách hiểu dẫn tới hai thiết kế khác nhau đáng kể.

## Reuse
Liệt kê component/service/util có sẵn giải quyết một phần yêu cầu, kèm đường dẫn.
