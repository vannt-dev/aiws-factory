# Legacy CRM (PHP 5.6) — READ-ONLY

Hệ thống quản lý khách hàng cũ, viết năm 2014, chạy trên PHP 5.6 + MySQL 5.5.
Đang được thay thế bởi `source-be` (Java) và `source-fe` (web). Dữ liệu `customers`
sẽ được migrate sang hệ thống mới, nên **quy tắc nghiệp vụ ở đây phải được giữ nguyên**.

| File | Vai trò |
| --- | --- |
| `sql/schema.sql` | Cấu trúc bảng `customers` |
| `lib/db.php` | Kết nối MySQL (mysqli) |
| `lib/phone.php` | Chuẩn hoá, kiểm tra và hiển thị số điện thoại |
| `customer_list.php` | Màn hình danh sách khách hàng |
| `customer_save.php` | Thêm/sửa khách hàng (POST) |
