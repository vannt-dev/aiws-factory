# DB schema

## Bảng

### Hệ thống mới (source-be): chưa có DB
source-be không có DB, ORM hay JDBC (`source-be/pom.xml` chỉ có `jackson-databind` và `junit-jupiter`). Dữ liệu nằm trong bộ nhớ và mất khi restart:

| Kho | Cấu trúc | Khoá | File định nghĩa |
| --- | --- | --- | --- |
| Khách hàng (in-memory) | `Map<Long, Customer>` (`ConcurrentSkipListMap`), sinh `id` bằng `AtomicLong.incrementAndGet()` (bắt đầu từ 1) | `id` | `source-be/src/main/java/com/example/crm/repository/InMemoryCustomerRepository.java` |

Model lưu trữ là `Customer(long id, String name, String email, String phone, CustomerStatus status)` (`source-be/src/main/java/com/example/crm/domain/Customer.java`).
- `phone` là `null` khi khách hàng không có số. Khi có, `CustomerService.create` và `CustomerService.update` chỉ lưu dạng đã chuẩn hoá: chỉ chữ số, bắt đầu bằng `0`, dài 10 hoặc 11 chữ số (`source-be/src/main/java/com/example/crm/service/PhoneNumbers.java`).
- `status` là `ACTIVE` hoặc `INACTIVE`. Repository lưu đúng `phone` và `status` được truyền vào `insert` mà không tự kiểm tra; `CustomerService.create` luôn truyền `ACTIVE`. `update` không nhận `status` và giữ nguyên `status` đang lưu. **(REQ-003)** `CustomerRepository.updateStatus(id, status)` / `CustomerService.updateStatus(id, status)` là đường duy nhất đổi `status` sau khi `insert`, qua `PUT /api/customers/{id}/status`; thao tác này chỉ đổi `status`, giữ nguyên `id`/`name`/`email`/`phone`.

Không có ràng buộc lưu trữ nào. Tính duy nhất được kiểm tra ở tầng service (hàm private `source-be/src/main/java/com/example/crm/service/CustomerService.java:check`, dùng chung cho `create` và `update`; riêng `updateStatus` (REQ-003) không gọi `check` nhưng tự kiểm tra lại BR-09 khi kích hoạt lại, xem dưới), kiểm tra rồi mới `insert`/`update`/`updateStatus` nên không nguyên tử: hai request đồng thời có thể cùng lấy một email hoặc một số, hoặc một `PUT /api/customers/{id}` đổi số chen giữa bước đọc và ghi của `updateStatus` (`aiws/work/REQ-002/02-design.md` R3; `aiws/work/REQ-003/02-design.md` R2).
- **Email**: không phân biệt hoa thường (`equalsIgnoreCase`), bất kể trạng thái. Thêm mới: `CustomerRepository.existsByEmail(email)`. Sửa: `existsByEmailAndIdNot(email, id)`, bỏ qua khách hàng có `id` đó. Không kiểm tra khi đổi trạng thái.
- **Số điện thoại** (BR-09): so sánh chính xác bằng `phone.equals(c.phone())`. Thêm mới: `CustomerRepository.existsByPhoneAndStatus(phone, CustomerStatus.ACTIVE)` trên số đã chuẩn hoá. Sửa: `existsByPhoneAndStatusAndIdNot(phone, CustomerStatus.ACTIVE, id)` trên số đã chuẩn hoá, bỏ qua khách hàng có `id` đó. **Kích hoạt lại** (`CustomerService.updateStatus`, REQ-003): cùng truy vấn `existsByPhoneAndStatusAndIdNot(current.phone(), CustomerStatus.ACTIVE, id)`, nhưng trên số **nguyên văn đang lưu**, không chuẩn hoá lại và không kiểm tra định dạng — chỉ chạy khi `current.phone() != null` và trạng thái đích là `ACTIVE`; đặt lại đúng trạng thái đang có thì bỏ qua kiểm tra này. Chỉ khách hàng `ACTIVE` giữ số; số của khách hàng `INACTIVE` dùng lại được. Nhiều khách hàng cùng có `phone = null` là hợp lệ.

Cả bốn truy vấn trùng đều duyệt tuyến tính toàn bộ map, không có index.

Interface lưu trữ: `source-be/src/main/java/com/example/crm/repository/CustomerRepository.java`.

| Method | Hành vi của `InMemoryCustomerRepository` | Câu SQL legacy tương ứng (`source-legacy/customer_save.php`, `source-legacy/customer_list.php`) |
| --- | --- | --- |
| `findAll()` | Mọi khách hàng, tăng dần theo `id` | `SELECT ... FROM customers ORDER BY id` |
| `findAllByStatus(status)` (REQ-005) | Chỉ khách hàng có đúng `status`, tăng dần theo `id`; duyệt tuyến tính như `findAll()` | `SELECT ... FROM customers WHERE status = ? ORDER BY id` (chưa có; `customers.status` chưa có index) |
| `findById(id)` | `Optional<Customer>` | — |
| `existsByEmail(email)` | Có khách hàng nào dùng email, không phân biệt hoa thường | — (legacy dựa vào `uq_customers_email`) |
| `existsByPhoneAndStatus(phone, status)` | Có khách hàng nào có đúng số và đúng trạng thái | `WHERE phone = ? AND status = 1` (legacy luôn kèm `AND id <> ?`, với `id = 0` khi thêm mới) |
| `existsByEmailAndIdNot(email, id)` | Như `existsByEmail`, bỏ qua khách hàng `id` | — |
| `existsByPhoneAndStatusAndIdNot(phone, status, id)` | Như `existsByPhoneAndStatus`, bỏ qua khách hàng `id` | `WHERE phone = ? AND status = 1 AND id <> ?` |
| `insert(name, email, phone, status)` | Gán `id` mới, lưu đúng giá trị nhận được | `INSERT INTO customers (...)` |
| `update(id, name, email, phone)` | `computeIfPresent`: thay `name`, `email`, `phone`; giữ `id` và `status` đang lưu. Trả `Optional<Customer>` sau khi sửa, hoặc `Optional.empty()` khi không có `id` đó. **Không bao giờ thêm mới** | `UPDATE customers SET full_name = ?, email = ?, phone = ? WHERE id = ?` |
| `updateStatus(id, status)` (REQ-003) | `computeIfPresent`: thay `status`; giữ `id`, `name`, `email`, `phone` đang lưu (chép từ giá trị `c` trong map lúc ghi, không phải lần đọc trước đó của service). Trả `Optional<Customer>` sau khi đổi, hoặc `Optional.empty()` khi không có `id` đó. **Không bao giờ thêm mới** | `UPDATE customers SET status = ? WHERE id = ?` (chưa có; không có code nào đổi `status` ở legacy) |

Hiện chưa có delete. Thao tác đổi `status` có từ REQ-003 (`CustomerRepository.updateStatus`, gọi qua `CustomerService.updateStatus` và `PUT /api/customers/{id}/status`). Truy vấn lọc theo `status` (`findAllByStatus`) có từ REQ-005, gọi qua `CustomerService.list(List<String>)` và `GET /api/customers?status=...` (`aiws/knowledge/api-inventory.md` → Endpoints).

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
  - [CẦN XÁC NHẬN] dữ liệu `customers.phone` đang có ở legacy có khớp quy tắc BR-07 hiện tại hay không: quy tắc đầu số được cập nhật năm 2018 (`source-legacy/lib/phone.php`), nên có thể còn số lưu theo quy tắc cũ. `aiws/work/REQ-001/api-contract.yaml` không đặt `pattern` cho `phone` trong response vì lý do này. Hệ quả từ REQ-002: `CustomerService.update` kiểm tra lại số đang lưu ở mọi lần sửa, nên khách hàng được migrate với số theo quy tắc cũ (vd. `01234567890`) **không lưu được bất kỳ thay đổi nào**, kể cả chỉ đổi họ tên, cho tới khi số được sửa hoặc xoá (`source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` TC-54; `aiws/knowledge/api-inventory.md` → Endpoints → riêng `PUT`). Hành vi này giống legacy và được giữ có chủ ý (`aiws/work/REQ-002/02-design.md` D7(d)). **(REQ-003)** `CustomerService.updateStatus` không kiểm tra lại định dạng số, nên một khách hàng migrate với số theo quy tắc cũ **vẫn** ngừng hoạt động và kích hoạt lại được bình thường — chỉ `PUT /api/customers/{id}` (sửa họ tên/email/số) bị chặn, không phải đổi trạng thái (`aiws/work/REQ-003/02-design.md` D5).
  - Thao tác sửa và đổi trạng thái không cần cột hay index mới: khi có DB thật, `update`/`updateStatus` và các truy vấn `…AndIdNot` tương ứng với các câu SQL legacy đang chạy trên `uq_customers_email` và `idx_customers_phone` (`aiws/work/REQ-002/02-design.md` → DB change; `aiws/work/REQ-003/02-design.md` → DB change).
