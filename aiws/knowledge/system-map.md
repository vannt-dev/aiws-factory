# System map

## Tổng quan
Hệ thống CRM quản lý **khách hàng** (danh sách, thêm mới). Người dùng là nhân viên thao tác qua màn hình web tiếng Việt (`source-fe/index.html`, `lang="vi"`). [CẦN XÁC NHẬN] vai trò người dùng cụ thể: code không có đăng nhập hay phân quyền.

Kiến trúc hiện tại gồm ba phần:
- **source-fe**: trang web tĩnh viết bằng JavaScript ES modules thuần, gọi REST API qua đường dẫn tương đối `/api` (`source-fe/src/api/customerApi.js`: `API_BASE`).
- **source-be**: REST API Java 21 chạy trên `com.sun.net.httpserver.HttpServer` của JDK, không dùng framework (`source-be/src/main/java/com/example/crm/App.java`). Dữ liệu chỉ lưu trong bộ nhớ (`InMemoryCustomerRepository`). **Chưa có DB**, nên dữ liệu mất khi restart.
- **source-legacy**: CRM cũ viết bằng PHP 5.6 + MySQL 5.5 (`source-legacy/README.md`). Chỉ đọc; đang được thay bởi source-be + source-fe.

```
Trình duyệt ── index.html + src/main.js
      │ fetch /api/customers (JSON; lỗi theo RFC 9457)
      ▼
CustomerHandler ─► CustomerService ─► CustomerRepository (InMemoryCustomerRepository)

Legacy: customer_list.php / customer_save.php ─► lib/db.php (mysqli) ─► MySQL `customers`
```

`source-be/target/` và `source-fe/dist/` là output build (đã gitignore trong `source-be/.gitignore` và `source-fe/.gitignore`), không phải source.

## Thành phần
| Thành phần | Đường dẫn | Trách nhiệm | Công nghệ |
| --- | --- | --- | --- |
| FE: trang chính | `source-fe/index.html` | Form thêm khách hàng (`name`, `email`), vùng thông báo lỗi `#message`, vùng danh sách `#customers` | HTML5 + CSS inline |
| FE: entry | `source-fe/src/main.js` | Gắn DOM, submit form, tải lại danh sách, hiển thị lỗi | JS ES modules (trình duyệt) |
| FE: API client | `source-fe/src/api/customerApi.js` | `request()`, `ApiError`, `listCustomers`, `createCustomer` | `fetch` |
| FE: component | `source-fe/src/components/customerTable.js` | `renderCustomerTable` trả về chuỗi HTML của bảng, nhãn trạng thái tiếng Việt | JS thuần |
| FE: tiện ích | `source-fe/src/utils/escapeHtml.js` | Escape HTML cho dữ liệu động | JS thuần |
| FE: build | `source-fe/scripts/build.mjs` | Chạy `node --check` cho mọi `src/**/*.js`, rồi chép `index.html` và `src/` vào `dist/` | Node.js ≥ 22 (`source-fe/package.json`) |
| BE: khởi động | `source-be/src/main/java/com/example/crm/App.java` | Tạo `HttpServer`, đăng ký context `/api/customers`, đọc biến môi trường `PORT` (mặc định 8080), seed 2 khách hàng | Java 21, JDK HttpServer |
| BE: HTTP | `source-be/src/main/java/com/example/crm/api/` | `CustomerHandler` (định tuyến, map exception sang HTTP), `CreateCustomerRequest`, `Problem` (RFC 9457) | Jackson `jackson-databind` 2.22.3 |
| BE: nghiệp vụ | `source-be/src/main/java/com/example/crm/service/CustomerService.java` | Validation và quy tắc nghiệp vụ (tên, email, trùng email) | Java |
| BE: lưu trữ | `source-be/src/main/java/com/example/crm/repository/` | Interface `CustomerRepository` và bản cài đặt in-memory thread-safe `InMemoryCustomerRepository` | `ConcurrentSkipListMap`, `AtomicLong` |
| BE: domain | `source-be/src/main/java/com/example/crm/domain/` | `Customer` (record bất biến), `CustomerStatus` (enum) | Java record/enum |
| BE: lỗi | `source-be/src/main/java/com/example/crm/error/` | `ValidationException` (400, lỗi theo field), `NotFoundException` (404) | Java |
| Legacy: danh sách | `source-legacy/customer_list.php` | Màn hình HTML danh sách khách hàng | PHP 5.6 |
| Legacy: lưu | `source-legacy/customer_save.php` | Thêm hoặc sửa khách hàng qua POST form, validation, kiểm tra trùng số điện thoại | PHP 5.6 |
| Legacy: số điện thoại | `source-legacy/lib/phone.php` | Chuẩn hoá, kiểm tra, định dạng số điện thoại Việt Nam (BR-07) | PHP |
| Legacy: DB | `source-legacy/lib/db.php`, `source-legacy/sql/schema.sql` | Kết nối mysqli (cấu hình trong `config.ini`, không có trong repo), DDL bảng `customers` | MySQL 5.5, InnoDB |

## Luồng chính
1. **Xem danh sách khách hàng (hệ thống mới)**
   `source-fe/src/main.js:refresh` → `source-fe/src/api/customerApi.js:listCustomers` → `GET /api/customers` → `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.list` → `InMemoryCustomerRepository.findAll` (thứ tự tăng dần theo `id` vì dùng `ConcurrentSkipListMap`) → FE render bằng `source-fe/src/components/customerTable.js:renderCustomerTable`. Khi lỗi, FE hiển thị "Không tải được danh sách khách hàng."
2. **Thêm khách hàng (hệ thống mới)**
   Submit `#create-form` trong `source-fe/src/main.js` → `createCustomer({name, email})` → `POST /api/customers` → `CustomerHandler.route` đọc `CreateCustomerRequest` → `CustomerService.create` (trim, kiểm tra tên và email, kiểm tra trùng email không phân biệt hoa thường) → `InMemoryCustomerRepository.insert` (gán `id` tăng dần, `status = ACTIVE`) → trả 201. FE reset form và tải lại danh sách. Khi lỗi 400, FE hiển thị `fieldErrors` dạng `field: msg; ...`. Các lỗi khác hiển thị "Không lưu được khách hàng."
3. **Xem chi tiết một khách hàng (chỉ BE)**
   `GET /api/customers/{id}` → `CustomerHandler.route` (regex `^/api/customers/(\d+)$`) → `CustomerService.get` → 404 `NotFoundException` nếu không có. FE hiện **không gọi** endpoint này.
4. **Xử lý lỗi (hệ thống mới)**
   `CustomerHandler.handle` bắt exception và trả `Problem` với `Content-Type: application/problem+json`: `ValidationException` → 400 kèm `errors`; `NotFoundException` → 404; `JsonProcessingException` → 400 "Malformed JSON"; `RuntimeException` khác → 500. `source-fe/src/api/customerApi.js:ApiError` đọc `errors` vào `fieldErrors`.
5. **Danh sách khách hàng (legacy)**
   `source-legacy/customer_list.php`: `SELECT id, full_name, email, phone, status FROM customers ORDER BY id`, render bảng HTML. Số điện thoại hiển thị qua `phone_format`; nếu trống thì hiện "—". `status` hiển thị là "Đang hoạt động"/"Ngừng hoạt động".
6. **Thêm/sửa khách hàng (legacy)**
   `source-legacy/customer_save.php` nhận POST `id` (tuỳ chọn; có thì là sửa), `full_name`, `email`, `phone` (tuỳ chọn). Validation → lỗi trả 400 JSON `{"errors": {...}}` bằng tiếng Việt. Thành công → `INSERT` (`status = 1`, `created_at = NOW()`) hoặc `UPDATE` (không đổi `status`), rồi chuyển hướng `Location: customer_list.php`.

## Phụ thuộc ngoài
- **Hệ thống mới**: không có dịch vụ ngoài, hàng đợi, storage hay DB. Không có xác thực/phân quyền, không có CORS header (`CustomerHandler.send` chỉ set `Content-Type`). BE không phục vụ file tĩnh: chỉ đăng ký context `/api/customers` (`App.start`).
- [CẦN XÁC NHẬN] **Cách phục vụ FE cùng origin với BE**: FE gọi đường dẫn tương đối `/api/...` (`source-fe/src/api/customerApi.js`), nhưng repo không có dev server, reverse proxy hay cấu hình CORS.
- [CẦN XÁC NHẬN] **Cách chạy BE**: `source-be/pom.xml` không có shade/assembly plugin, không có `Main-Class` và không có exec plugin. Jar `crm-api-0.1.0-SNAPSHOT.jar` không chứa Jackson, nên không chạy trực tiếp bằng `java -jar` được.
- **Build-time**: Maven 3.9.16 tải qua Maven Wrapper 3.3.4 (`source-be/.mvn/wrapper/maven-wrapper.properties`, `distributionType=only-script`); dependency Maven Central (`jackson-databind`, `junit-bom`). FE không có dependency npm (`source-fe/package.json` không có `dependencies`).
- **Legacy**: MySQL 5.5 qua `mysqli`, charset `utf8` (`source-legacy/lib/db.php`). Thông tin kết nối đọc từ `source-legacy/config.ini`, không có trong repo.

## Legacy
`source-legacy/README.md` ghi rõ dữ liệu `customers` sẽ được migrate sang hệ thống mới và **quy tắc nghiệp vụ legacy phải được giữ nguyên**. Bảng dưới so sánh legacy với hệ thống mới dựa trên code hiện có.

### Dữ liệu
| Legacy (`source-legacy/sql/schema.sql`) | Hệ thống mới (`source-be/src/main/java/com/example/crm/domain/Customer.java`) | Ghi chú |
| --- | --- | --- |
| `id INT UNSIGNED AUTO_INCREMENT` | `long id` (gán bởi `InMemoryCustomerRepository.insert`, `AtomicLong`) | Tương đương |
| `full_name VARCHAR(100) NOT NULL` | `String name` | Khác tên cột/field |
| `email VARCHAR(150) NOT NULL`, `UNIQUE uq_customers_email` | `String email`, service kiểm tra trùng (`existsByEmail`, `equalsIgnoreCase`) | BE mới **không giới hạn độ dài** email |
| `phone VARCHAR(11) NULL`, `KEY idx_customers_phone` | — | **Chưa có** ở hệ thống mới |
| `status TINYINT(1)` 1 = active, 0 = inactive, mặc định 1 | `CustomerStatus` `ACTIVE` / `INACTIVE` | Mapping 1 → `ACTIVE`, 0 → `INACTIVE` |
| `created_at DATETIME NOT NULL` | — | **Chưa có** ở hệ thống mới |

### Hành vi
| Legacy | Hệ thống mới | Trạng thái |
| --- | --- | --- |
| Danh sách (`source-legacy/customer_list.php`), có cột Điện thoại | `GET /api/customers` + `source-fe/src/components/customerTable.js:renderCustomerTable` (không có cột điện thoại) | Đã thay một phần (thiếu điện thoại) |
| Thêm mới (`source-legacy/customer_save.php`, không có `id`) | `POST /api/customers` | Đã thay một phần (thiếu `phone`, `created_at`) |
| Sửa (`source-legacy/customer_save.php`, có `id`) | — | **Chưa có** |
| Chuẩn hoá/kiểm tra/định dạng số điện thoại (`source-legacy/lib/phone.php`, BR-07) | — | **Chưa có** |
| Không cho số điện thoại trùng với khách hàng **đang hoạt động** khác (BR-09, `source-legacy/customer_save.php`) | — | **Chưa có** |
| Kiểm tra email: `filter_var(FILTER_VALIDATE_EMAIL)` (`source-legacy/customer_save.php`) | Regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` (`source-be/src/main/java/com/example/crm/service/CustomerService.java`) | **Khác nhau**, [CẦN XÁC NHẬN] quy tắc nào là chuẩn |
| Trùng email: chỉ dựa vào `UNIQUE` của DB. Code không kiểm tra giá trị trả về của `$stmt->execute()` | Service kiểm tra trước, trả 400 `is already used by another customer` | [CẦN XÁC NHẬN] hành vi legacy khi trùng email (phụ thuộc error mode của mysqli). [CẦN XÁC NHẬN] có phân biệt hoa thường hay không (phụ thuộc collation MySQL) |
| Độ dài tên: `strlen($name) > 100` | `trimmedName.length() > 100` (đơn vị UTF-16) | **Khác nhau**. [CẦN XÁC NHẬN] `strlen` trên PHP 5.6 đếm **byte** (trừ khi bật `mbstring.func_overload`), nên tên tiếng Việt có dấu chạm giới hạn 100 sớm hơn **ở legacy**. Hệ thống mới đếm theo đơn vị UTF-16 nên nới hơn. Cần chốt đơn vị đo |
| Lỗi validation: `{"errors": {...}}`, tiếng Việt, key `full_name`/`email`/`phone` | RFC 9457 `Problem` + `errors`, tiếng Anh, key `name`/`email` | Khác format và ngôn ngữ |
| Thành công: redirect về `source-legacy/customer_list.php` | 201 + JSON khách hàng vừa tạo | Khác (REST) |
| Đổi `status` | — | [CẦN XÁC NHẬN] cả legacy lẫn hệ thống mới đều không có code đổi trạng thái sang inactive |
