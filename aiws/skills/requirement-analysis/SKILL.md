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

## Độ chi tiết của acceptance criteria
Mỗi AC kéo theo ít nhất một test case, một phần design và công review, nên số AC quyết định chi phí của cả requirement.

- Một AC mô tả một **hành vi** quan sát được, không phải một bộ dữ liệu. Các biến thể dữ liệu của cùng một hành vi (nhiều định dạng đầu vào hợp lệ, nhiều giá trị biên, nhiều kiểu đầu vào sai cho cùng một lỗi) gộp vào **một** AC và liệt kê ngay trong AC đó. Test-designer sẽ biến chúng thành các dòng dữ liệu của một test tham số hoá.
- Tách thành AC riêng khi kết quả quan sát khác nhau về bản chất (lưu được, báo lỗi, hiển thị), khi quy tắc nghiệp vụ khác nhau, hoặc khi hành vi thuộc side khác nhau (BE, FE).
- Tự kiểm: hai AC chỉ khác nhau ở giá trị đầu vào và có cùng kết quả mong đợi thì gộp lại.
- Điều requirement không yêu cầu thì đưa vào "Ngoài phạm vi" hoặc "Câu hỏi mở", không viết thành AC.
- Nếu sau khi gộp vẫn còn rất nhiều AC, hãy ghi nhận xét trong "Câu hỏi mở" (non-blocking) rằng requirement nên được tách nhỏ.

Ví dụ gộp:
- Nên: `AC-2: Given số điện thoại viết ở bất kỳ dạng nào sau đây: "0912 345 678", "0912.345.678", "+84 912 345 678", "84912345678"; when tạo khách hàng; then số được lưu là "0912345678".`
- Không nên: bốn AC riêng cho bốn cách viết trên.

## Impact
- Tra aiws/knowledge/api-inventory.md, db-schema.md, system-map.md trước; mở file source để xác nhận.
- Ghi đường dẫn cụ thể: `source-be/src/user/UserService.java`, không ghi "phần user".

## Câu hỏi mở
- `[blocking]`: không biết thì thiết kế sai (vd. quy tắc nghiệp vụ mâu thuẫn, thiếu định nghĩa trạng thái). Orchestrator sẽ dừng chờ người trả lời.
- `[non-blocking]`: có giả định hợp lý; ghi giả định để người duyệt design thấy.
- Đừng biến mọi thứ thành blocking. Chỉ blocking khi hai cách hiểu dẫn tới hai thiết kế khác nhau đáng kể.

## Reuse
Liệt kê component/service/util có sẵn giải quyết một phần yêu cầu, kèm đường dẫn.
