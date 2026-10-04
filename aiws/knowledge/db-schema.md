# DB schema

## Bảng

### Hệ thống mới (source-be): chưa có DB
source-be không có DB, ORM hay JDBC (`source-be/pom.xml` chỉ có `jackson-databind` và `junit-jupiter`). Dữ liệu nằm trong bộ nhớ và mất khi restart:

| Kho | Cấu trúc | Khoá | File định nghĩa |
| --- | --- | --- | --- |
| Khách hàng (in-memory) | `Map<Long, Customer>` (`ConcurrentSkipListMap`), sinh `id` bằng `AtomicLong.incrementAndGet()` (bắt đầu từ 1) | `id` | `source-be/src/main/java/com/example/crm/repository/InMemoryCustomerRepository.java` |

Model lưu trữ là `Customer(long id, String name, String email, String phone, CustomerStatus status)` (`source-be/src/main/java/com/example/crm/domain/Customer.java`).
- `phone` là `null` khi khách hàng không có số. Khi có, `CustomerService.create` chỉ lưu dạng đã chuẩn hoá: chỉ chữ số, bắt đầu bằng `0`, dài 10 hoặc 11 chữ số (`source-be/src/main/java/com/example/crm/service/PhoneNumbers.java`).
- `status` là `ACTIVE` hoặc `INACTIVE`. Repository lưu đúng `phone` và `status` được truyền vào `insert` mà không tự kiểm tra; `CustomerService.create` luôn truyền `ACTIVE`.

Không có ràng buộc lưu trữ nào. Tính duy nhất được kiểm tra ở tầng service (`source-be/src/main/java/com/example/crm/service/CustomerService.java:create`), kiểm tra rồi mới `insert` nên không nguyên tử:
- **Email**: `CustomerRepository.existsByEmail`, không phân biệt hoa thường (`equalsIgnoreCase`).
- **Số điện thoại** (BR-09): `CustomerRepository.existsByPhoneAndStatus(phone, CustomerStatus.ACTIVE)`, so sánh chính xác bằng `phone.equals(c.phone())` trên số đã chuẩn hoá. Chỉ khách hàng `ACTIVE` giữ số; số của khách hàng `INACTIVE` dùng lại được. Nhiều khách hàng cùng có `phone = null` là hợp lệ.

Cả hai truy vấn đều duyệt tuyến tính toàn bộ map, không có index.

Interface lưu trữ: `source-be/src/main/java/com/example/crm/repository/CustomerRepository.java` (`findAll`, `findById`, `existsByEmail`, `existsByPhoneAndStatus`, `insert(name, email, phone, status)`). Hiện chưa có update/delete.

Dữ liệu seed khi chạy `App.main`: 2 khách hàng, đều `phone = null` (`source-be/src/main/java/com/example/crm/App.java`).

### Legacy (source-legacy): MySQL 5.5
Nguồn: `source-legacy/sql/schema.sql`, `ENGINE=InnoDB DEFAULT CHARSET=utf8`.

**`customers`**
| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| `id` | `INT UNSIGNED` | NOT NULL | `AUTO_INCREMENT` | PK |
| `full_name` | `VARCHAR(100)` | NOT NULL | | Họ tên |
| `email` | `VARCHAR(150)` | NOT NULL | | Duy nhất (`uq_customers_email`) |
| `phone` | `VARCHAR(11)` | NULL | | Lưu dạng đã chuẩn hoá: chỉ chữ số, bắt đầu bằng 0 (`source-legacy/lib/phone.php:phone_normalize`) |
| `status` | `TINYINT(1)` | NOT NULL | `1` | 1 = đang hoạt động, 0 = ngừng hoạt động |
| `created_at` | `DATETIME` | NOT NULL | | Gán `NOW()` khi insert (`source-legacy/customer_save.php`) |

- **Khoá**: `PRIMARY KEY (id)`, `UNIQUE KEY uq_customers_email (email)`, `KEY idx_customers_phone (phone)`.
- **Quan hệ**: không có bảng khác và không có foreign key.
- **Ràng buộc nghiệp vụ không nằm trong DB**: số điện thoại chỉ được trùng giữa các khách hàng khi khách hàng kia đã ngừng hoạt động (BR-09). Quy tắc này được kiểm tra trong code bằng `SELECT id FROM customers WHERE phone = ? AND status = 1 AND id <> ?` (`source-legacy/customer_save.php`), không phải bằng unique index.
- [CẦN XÁC NHẬN] Collation của bảng: DDL không khai báo, nên dùng mặc định của charset `utf8` trên server. Collation quyết định `uq_customers_email` có phân biệt hoa thường hay không.

## Migration
- **Hệ thống mới**: Không có (chưa có DB và chưa có công cụ migration).
- **Legacy**: không có công cụ migration. Chỉ có một file DDL `source-legacy/sql/schema.sql`.
- **Migrate dữ liệu legacy → mới**: `source-legacy/README.md` nói dữ liệu `customers` sẽ được migrate, nhưng repo chưa có script hay kế hoạch nào. Mapping cột xem `aiws/knowledge/system-map.md` → Legacy → Dữ liệu.
  - `customers.phone` và `Customer.phone` lưu cùng dạng (chuỗi chữ số đã chuẩn hoá hoặc null), và `CustomerRepository.insert` nhận `status` nên nhập được cả dòng `status = 0` (`INACTIVE`).
  - [CẦN XÁC NHẬN] dữ liệu `customers.phone` đang có ở legacy có khớp quy tắc BR-07 hiện tại hay không: quy tắc đầu số được cập nhật năm 2018 (`source-legacy/lib/phone.php`), nên có thể còn số lưu theo quy tắc cũ. `aiws/work/REQ-001/api-contract.yaml` không đặt `pattern` cho `phone` trong response vì lý do này.
