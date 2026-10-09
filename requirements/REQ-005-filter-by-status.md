# REQ-005 — Lọc danh sách khách hàng theo trạng thái

**Người yêu cầu:** Bộ phận CSKH · **Ưu tiên:** Trung bình

## Bối cảnh

Màn hình danh sách hiện mọi khách hàng. Từ khi có chức năng ngừng hoạt động (REQ-003), số khách hàng
ngừng hoạt động tăng dần, và nhân viên thường chỉ cần xem khách hàng đang hoạt động.

## Yêu cầu

- Nhân viên chọn được danh sách hiển thị: tất cả, chỉ khách hàng đang hoạt động, hoặc chỉ khách hàng
  ngừng hoạt động. Mặc định là tất cả, như hiện nay.
- Việc lọc do API thực hiện, không tải toàn bộ danh sách về rồi lọc ở trình duyệt.
- Gọi API với giá trị lọc không hợp lệ thì nhận lỗi rõ ràng, không lặng lẽ nhận về tất cả.
- Sau khi sửa thông tin hoặc đổi trạng thái một khách hàng, danh sách tải lại vẫn theo lựa chọn lọc
  đang chọn.

## Ngoài phạm vi

- Tìm kiếm theo họ tên, email hoặc số điện thoại.
- Phân trang và sắp xếp.
- Ghi nhớ lựa chọn lọc giữa các lần mở trang.
