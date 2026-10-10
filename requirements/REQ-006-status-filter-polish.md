# REQ-006 — Hoàn thiện bộ lọc trạng thái

**Người yêu cầu:** Bộ phận CSKH và nhóm phát triển · **Ưu tiên:** Thấp

## Bối cảnh

REQ-005 đã thêm bộ lọc theo trạng thái vào màn hình danh sách khách hàng. Design của REQ-005 chấp nhận
ba điểm chưa trọn vẹn về trải nghiệm (`aiws/work/REQ-005/02-design.md`, mục "Quyết định cần duyệt"), và
lần review của REQ-005 ghi nhận bốn điểm chưa chặt trong test (`aiws/work/REQ-005/05-review.md`, mục
Findings). Chúng không chặn việc đưa REQ-005 vào dùng, nhưng cần được xử lý.

## Yêu cầu

- Khi đang lọc mà không khách hàng nào khớp lựa chọn, màn hình hiện một câu nói rõ là không có khách
  hàng nào khớp lựa chọn lọc. Câu "Chưa có khách hàng." chỉ còn dùng khi đang xem tất cả và hệ thống
  chưa có khách hàng nào.
- Khi đang lọc, bấm đúp (hai lần liên tiếp nhanh) vào nút đổi trạng thái chỉ đổi trạng thái của **một**
  khách hàng. Hiện nay sau lần bấm đầu, dòng đó biến khỏi danh sách và dòng kế tiếp trồi lên đúng chỗ,
  nên lần bấm thứ hai có thể đổi trạng thái của một khách hàng khác.
- Sau khi thêm một khách hàng mới mà khách hàng đó không thuộc lựa chọn lọc đang chọn, nhân viên vẫn
  thấy một thông báo cho biết đã thêm thành công.
- Các test của REQ-005 được làm chặt đúng theo bốn finding của lần review REQ-005, không đổi hành vi
  được kiểm.

## Ngoài phạm vi

- Thay đổi API hoặc quy tắc lọc ở backend.
- Tìm kiếm, phân trang, sắp xếp.
- Định dạng lỗi của yêu cầu có URL mã hoá hỏng.
