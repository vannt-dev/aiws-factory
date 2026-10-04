# REQ-002 — Sửa thông tin khách hàng

**Người yêu cầu:** Bộ phận CSKH · **Ưu tiên:** Trung bình

## Bối cảnh

Hệ thống mới chỉ tạo được khách hàng, chưa sửa được. Hệ thống cũ (`source-legacy`) cho phép sửa
họ tên, email và số điện thoại của khách hàng đã có. Cách xử lý khi sửa phải **giống hệ thống cũ**.

## Yêu cầu

- Nhân viên sửa được họ tên, email và số điện thoại của một khách hàng đã có.
- Các quy tắc kiểm tra dữ liệu giống lúc tạo khách hàng. Khi kiểm tra trùng, không tính chính khách
  hàng đang được sửa.
- Việc sửa không làm thay đổi trạng thái hoạt động của khách hàng.
- Màn hình danh sách có cách để sửa một khách hàng, và hiển thị lỗi theo từng trường khi dữ liệu
  không hợp lệ.

## Ngoài phạm vi

- Đổi trạng thái hoạt động của khách hàng.
- Xoá khách hàng.
