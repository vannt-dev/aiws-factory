# REQ-004 — Nút đổi trạng thái: chống bấm đúp và trạng thái lạ

**Người yêu cầu:** Bộ phận CSKH và nhóm phát triển · **Ưu tiên:** Thấp

## Bối cảnh

REQ-003 đã thêm nút đổi trạng thái vào màn hình danh sách khách hàng. Lần review của REQ-003 ghi nhận
bốn điểm chưa chặt (`aiws/work/REQ-003/05-review.md`, mục Findings). Chúng không chặn việc đưa REQ-003
vào dùng, nhưng cần được xử lý.

## Yêu cầu

- Bấm đúp (hai lần liên tiếp nhanh) vào nút đổi trạng thái của một khách hàng chỉ đổi trạng thái của
  khách hàng đó **một lần**. Hiện nay lần bấm thứ hai có thể đảo ngược chính thao tác vừa làm.
- Khách hàng có trạng thái không phải "đang hoạt động" hay "ngừng hoạt động" thì không có nút đổi
  trạng thái, kể cả khi giá trị trạng thái trùng tên một thuộc tính có sẵn của object trong JavaScript
  (ví dụ `constructor`, `toString`). Hiện nay các giá trị như vậy vẫn hiện một nút mang nhãn `undefined`.
- Test của bảng khách hàng kiểm đủ kỳ vọng của test case TC-105 trong test spec của REQ-003: dòng của
  khách hàng có trạng thái lạ vẫn có đúng 6 ô, và ca "thiếu trường trạng thái" dùng dữ liệu thật sự
  không có trường đó.
- Các test của REQ-003 ở backend dùng cùng một kiểu tham số hoá với những test khác trong cùng lớp
  test, đúng như plan của REQ-003 đã yêu cầu. Việc này không được làm đổi hành vi được kiểm.

## Ngoài phạm vi

- Thay đổi API hoặc quy tắc đổi trạng thái ở backend.
- Hỏi xác nhận trước khi ngừng hoạt động một khách hàng.
- Trạng thái "đang lưu" cho form sửa thông tin khách hàng (ghi nhận từ REQ-002).
