# API inventory

## Endpoints
Nguồn: `source-be/src/main/java/com/example/crm/api/CustomerHandler.java` (`route`). Context duy nhất được đăng ký là `/api/customers`, trong `source-be/src/main/java/com/example/crm/App.java:start`.

| Method | Path | Handler (file:hàm) | Mô tả | Được FE gọi ở |
| --- | --- | --- | --- | --- |
| GET | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.list` | Trả mảng JSON `Customer[]`, thứ tự tăng dần theo `id`, 200. Không phân trang, không lọc | `source-fe/src/api/customerApi.js:listCustomers` (dùng trong `source-fe/src/main.js:refresh`) |
| POST | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.create` | Body `CreateCustomerRequest {name, email}`, field lạ bị bỏ qua. Thành công trả 201 + `Customer` với `status = "ACTIVE"`. Validation lỗi trả 400 Problem kèm `errors`. JSON hỏng trả 400 "Malformed JSON" | `source-fe/src/api/customerApi.js:createCustomer` (dùng trong submit handler của `source-fe/src/main.js`) |
| GET | `/api/customers/{id}` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.get` | `id` khớp `\d+`. Trả 200 + `Customer`, hoặc 404 Problem với detail `Customer {id} not found` | Không được FE gọi |
| * | `/api/customers...` (method/path khác) | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` (fallback) | 404 Problem, detail `No route for <METHOD> <path>`. Method sai (vd. `PUT /api/customers`) cũng trả **404**, không phải 405. `id` không phải số cũng rơi vào đây | — |

Schema `Customer` (`source-be/src/main/java/com/example/crm/domain/Customer.java`), serialize bằng Jackson theo tên component của record:
```json
{ "id": 1, "name": "Nguyen Van An", "email": "an.nguyen@example.com", "status": "ACTIVE" }
```
`status` là một trong `ACTIVE`, `INACTIVE` (`source-be/src/main/java/com/example/crm/domain/CustomerStatus.java`).

Quy tắc validation của `POST` (`source-be/src/main/java/com/example/crm/service/CustomerService.java:create`). Mọi giá trị được `trim()` trước khi kiểm tra:
| Field | Quy tắc | Thông điệp trong `errors` |
| --- | --- | --- |
| `name` | Không rỗng | `must not be blank` |
| `name` | ≤ 100 ký tự (`NAME_MAX_LENGTH`) | `must be at most 100 characters` |
| `email` | Khớp `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `must be a valid email address` |
| `email` | Chưa được khách hàng khác dùng, không phân biệt hoa thường (`InMemoryCustomerRepository.existsByEmail`) | `is already used by another customer` |

### Legacy (source-legacy, read-only)
Legacy không có REST API. Đây là các trang PHP xử lý trực tiếp.

| Method | Path | Handler (file:hàm) | Mô tả | Được FE gọi ở |
| --- | --- | --- | --- | --- |
| GET | `/customer_list.php` | `source-legacy/customer_list.php` (script) | Trang HTML danh sách khách hàng | Trình duyệt (legacy) |
| POST | `/customer_save.php` | `source-legacy/customer_save.php` (script) | Form `id?`, `full_name`, `email`, `phone?`. Lỗi trả 400 `application/json` `{"errors": {...}}`. Thành công chuyển hướng `Location: customer_list.php` | [CẦN XÁC NHẬN] repo không có form HTML nào gửi tới trang này |

## Quy ước
- **Prefix**: `/api`, resource số nhiều (`/api/customers`). FE ghép `API_BASE = '/api'` với path (`source-fe/src/api/customerApi.js`).
- **Versioning**: không có.
- **Format**: JSON, field camelCase theo tên component của record. Response thành công có `Content-Type: application/json` (`CustomerHandler.send`). Request được đọc bằng Jackson với `FAIL_ON_UNKNOWN_PROPERTIES = false` (`CustomerHandler.JSON`).
- **Format lỗi**: RFC 9457, `Content-Type: application/problem+json`, record `source-be/src/main/java/com/example/crm/api/Problem.java`: `type` (luôn `about:blank`), `title`, `status`, `detail`, `errors` (map field → message; bị bỏ khỏi JSON khi `null`, do `@JsonInclude(NON_NULL)`). Bảng map exception nằm ở `CustomerHandler.handle`:
  | Exception | HTTP | `title` |
  | --- | --- | --- |
  | `ValidationException` | 400 | `Validation failed` (kèm `errors`) |
  | `NotFoundException` | 404 | `Not Found` |
  | `JsonProcessingException` | 400 | `Malformed JSON` |
  | `RuntimeException` khác | 500 | `Internal Server Error` |
- **Mã thành công**: tạo mới trả 201 kèm object vừa tạo, không có header `Location`. Đọc trả 200.
- **Ngoài context `/api/customers`**: request tới path khác không đi qua `CustomerHandler`, nên nhận 404 mặc định của JDK `HttpServer`, không phải `problem+json`.
- **Auth**: không có. **CORS**: không có header CORS.
- **Phân trang**: không có. `GET /api/customers` trả toàn bộ danh sách.
- **Client FE**: mọi lỗi non-2xx ném `ApiError { status, fieldErrors }`, trong đó `fieldErrors` lấy từ `problem.errors` (`source-fe/src/api/customerApi.js`).
