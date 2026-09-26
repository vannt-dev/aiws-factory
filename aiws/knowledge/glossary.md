# Glossary

## Thuật ngữ
| Thuật ngữ | Nghĩa | Tên trong code |
| --- | --- | --- |
| Khách hàng | Đối tượng nghiệp vụ duy nhất của CRM | BE: `Customer` (`source-be/src/main/java/com/example/crm/domain/Customer.java`). API: `/api/customers`. FE: `customers`, `listCustomers`, `createCustomer`, `renderCustomerTable`. Legacy: bảng `customers` (`source-legacy/sql/schema.sql`) |
| Mã khách hàng (ID) | Khoá số tự tăng, do hệ thống gán | BE: `Customer.id` (`long`). Legacy: `customers.id` |
| Họ tên | Tên đầy đủ của khách hàng, tối đa 100 ký tự | BE/FE/API: `name`. Legacy: `full_name`. Nhãn UI: "Họ tên" (`source-fe/index.html`, `source-fe/src/components/customerTable.js`) |
| Email | Email liên hệ, không được trùng giữa các khách hàng | `email` (mọi phía). BE: `CustomerService.EMAIL`, `CustomerRepository.existsByEmail`. Legacy: `uq_customers_email` |
| Số điện thoại | Số điện thoại Việt Nam, không bắt buộc. **Chỉ có ở legacy** | Legacy: `customers.phone`, `$_POST['phone']`. Nhãn UI legacy: "Điện thoại" (`source-legacy/customer_list.php`) |
| Trạng thái | Khách hàng đang hoạt động hay đã ngừng | BE: `CustomerStatus`, `Customer.status`. FE: `STATUS_LABELS`. Legacy: `customers.status` (`TINYINT`). Nhãn UI: "Trạng thái" |
| Đang hoạt động | Trạng thái mặc định của khách hàng mới | BE: `CustomerStatus.ACTIVE`. Legacy: `status = 1`. Nhãn UI: "Đang hoạt động" |
| Ngừng hoạt động | Khách hàng không còn hoạt động. Legacy không tính số điện thoại của khách hàng này khi kiểm tra trùng | BE: `CustomerStatus.INACTIVE`. Legacy: `status = 0`. Nhãn UI: "Ngừng hoạt động" |
| Ngày tạo | Thời điểm khách hàng được tạo. **Chỉ có ở legacy** | Legacy: `customers.created_at` (`NOW()` trong `source-legacy/customer_save.php`) |
| Chuẩn hoá số điện thoại | Bỏ khoảng trắng, `.`, `-`, `(`, `)`; đổi `+84` thành `0`; đổi `84` thành `0` khi chuỗi dài 11 chữ số. Ví dụ `"+84 912.345.678"` → `"0912345678"` | Legacy: `phone_normalize` (`source-legacy/lib/phone.php`) |
| Số di động | Sau chuẩn hoá: 10 chữ số, đầu số `03`, `05`, `07`, `08`, `09` | Legacy: `phone_is_valid`, regex `0[35789][0-9]{8}` (`source-legacy/lib/phone.php`) |
| Số cố định | Sau chuẩn hoá: 11 chữ số, đầu số `02` | Legacy: `phone_is_valid`, regex `02[0-9]{9}` (`source-legacy/lib/phone.php`) |
| Định dạng hiển thị số điện thoại | Di động dạng 4-3-3 (`0912 345 678`), cố định dạng 3-4-4 (`024 3825 1234`). Số trống hiển thị "—" | Legacy: `phone_format` (`source-legacy/lib/phone.php`), dùng trong `source-legacy/customer_list.php` |
| BR-07 | Quy tắc nghiệp vụ (cập nhật 2018, sau khi đổi đầu số di động): đầu số di động hợp lệ là 03, 05, 07, 08, 09 | Comment trong `source-legacy/lib/phone.php` |
| BR-09 | Quy tắc nghiệp vụ: số điện thoại không được trùng với khách hàng **đang hoạt động** khác. Khách hàng đã ngừng hoạt động không giữ số, vì nhà mạng thu hồi và cấp lại số | Comment và truy vấn trong `source-legacy/customer_save.php` |
| Lỗi theo field | Danh sách lỗi validation theo từng trường nhập | BE: `ValidationException.errors()`, `Problem.errors`. FE: `ApiError.fieldErrors`. Legacy: JSON `{"errors": {...}}` |
| Problem details | Body lỗi HTTP theo RFC 9457 (`application/problem+json`) | BE: `Problem` (`source-be/src/main/java/com/example/crm/api/Problem.java`). FE: tham số `problem` trong `ApiError` |
| Không tìm thấy | Tài nguyên không tồn tại (HTTP 404) | BE: `NotFoundException` |
