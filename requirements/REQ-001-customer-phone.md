# REQ-001 — Số điện thoại khách hàng

**Người yêu cầu:** Bộ phận CSKH · **Ưu tiên:** Cao

## Bối cảnh

Hệ thống mới chưa lưu số điện thoại của khách hàng, trong khi hệ thống cũ (`source-legacy`) đã có.
Dữ liệu khách hàng sẽ được chuyển từ hệ thống cũ sang, nên cách xử lý số điện thoại phải **giống
hệt hệ thống cũ**: cùng cách chuẩn hoá, cùng quy tắc hợp lệ, cùng quy tắc trùng số và cùng cách
hiển thị.

## Yêu cầu

- Khi thêm khách hàng, nhân viên có thể nhập số điện thoại (không bắt buộc).
- Số điện thoại không hợp lệ hoặc đã được khách hàng khác sử dụng thì báo lỗi rõ ràng và không lưu.
- API trả về số điện thoại của khách hàng.
- Màn hình danh sách khách hàng có thêm cột số điện thoại, hiển thị theo định dạng của hệ thống cũ.

## Ngoài phạm vi

- Sửa khách hàng đã có (sẽ làm ở requirement khác).
- Migrate dữ liệu thật từ hệ thống cũ.
