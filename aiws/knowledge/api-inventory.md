# API inventory

## Endpoints
Nguồn: `source-be/src/main/java/com/example/crm/api/CustomerHandler.java` (`route`). Context duy nhất được đăng ký là `/api/customers`, trong `source-be/src/main/java/com/example/crm/App.java:start`. Mô tả OpenAPI 3 của ba endpoint (viết ở REQ-001): `aiws/work/REQ-001/api-contract.yaml`.

| Method | Path | Handler (file:hàm) | Mô tả | Được FE gọi ở |
| --- | --- | --- | --- | --- |
| GET | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.list` | Trả mảng JSON `Customer[]`, thứ tự tăng dần theo `id`, 200. Không phân trang, không lọc | `source-fe/src/api/customerApi.js:listCustomers` (dùng trong `source-fe/src/main.js:refresh`) |
| POST | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.create` | Body `CreateCustomerRequest {name, email, phone}`; `phone` tuỳ chọn (thiếu field hoặc `null` đều được) và là giá trị thô người dùng nhập. Field lạ bị bỏ qua. Thành công trả 201 + `Customer` với `status = "ACTIVE"` và `phone` đã chuẩn hoá hoặc `null`. Validation lỗi trả 400 Problem kèm `errors`. JSON hỏng trả 400 "Malformed JSON" | `source-fe/src/api/customerApi.js:createCustomer` (dùng trong submit handler của `source-fe/src/main.js`) |
| GET | `/api/customers/{id}` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.get` | `id` khớp `\d+`. Trả 200 + `Customer`, hoặc 404 Problem với detail `Customer {id} not found` | Không được FE gọi |
| * | `/api/customers...` (method/path khác) | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` (fallback) | 404 Problem, detail `No route for <METHOD> <path>`. Method sai (vd. `PUT /api/customers`) cũng trả **404**, không phải 405. `id` không phải số cũng rơi vào đây | — |

Schema `Customer` (`source-be/src/main/java/com/example/crm/domain/Customer.java`), serialize bằng Jackson theo tên component của record:
```json
{ "id": 1, "name": "Nguyen Van An", "email": "an.nguyen@example.com", "phone": "0912345678", "status": "ACTIVE" }
```
- `status` là một trong `ACTIVE`, `INACTIVE` (`source-be/src/main/java/com/example/crm/domain/CustomerStatus.java`).
- `phone` là số điện thoại **đã chuẩn hoá, chưa định dạng hiển thị** (vd. `"0912345678"`, `"02438251234"`), hoặc `null` khi khách hàng không có số. Field luôn có mặt trong JSON của cả ba endpoint: `Customer` không có `@JsonInclude` và `CustomerHandler.JSON` không cấu hình bỏ `null` (kiểm chứng ở `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`, TC-27, TC-31). FE định dạng khi hiển thị (`source-fe/src/utils/formatPhone.js`).

Quy tắc validation của `POST` (`source-be/src/main/java/com/example/crm/service/CustomerService.java:create`). `name` và `email` được `String.trim()` trước khi kiểm tra. `phone` được trim bằng `PhoneNumbers.trim`, chỉ bỏ space, `\t`, `\n`, `\r`, NUL, VT ở hai đầu (tập ký tự của `trim()` PHP, hẹp hơn `String.trim()`). `null` được coi là chuỗi rỗng ở cả ba field. Lỗi của mọi field được gom vào **một** response 400; nhánh `phone` chạy bất kể `name`/`email` có lỗi hay không:
| Field | Quy tắc | Thông điệp trong `errors` |
| --- | --- | --- |
| `name` | Không rỗng | `must not be blank` |
| `name` | ≤ 100 ký tự (`NAME_MAX_LENGTH`) | `must be at most 100 characters` |
| `email` | Khớp `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `must be a valid email address` |
| `email` | Chưa được khách hàng khác dùng, không phân biệt hoa thường (`InMemoryCustomerRepository.existsByEmail`) | `is already used by another customer` |
| `phone` | Rỗng sau `PhoneNumbers.trim` (thiếu field, `null`, `""`, `"   "`) nghĩa là không có số | Không lỗi; lưu `phone = null` |
| `phone` | Sau `PhoneNumbers.normalize`, cả chuỗi phải là di động `0[35789][0-9]{8}` (10 chữ số) hoặc cố định `02[0-9]{9}` (11 chữ số) (`PhoneNumbers.isValid`) | `must be a valid phone number` |
| `phone` | Số đã chuẩn hoá chưa được khách hàng `ACTIVE` nào dùng (`InMemoryCustomerRepository.existsByPhoneAndStatus`); khách hàng `INACTIVE` không giữ số (BR-09). Chỉ kiểm tra khi số hợp lệ | `is already used by another customer` |

Chuẩn hoá `phone` (`source-be/src/main/java/com/example/crm/service/PhoneNumbers.java:normalize`, port từ `source-legacy/lib/phone.php:phone_normalize`):
1. Trim như trên.
2. Xoá mọi ký tự thuộc `[ \t\n\x0B\f\r.()-]` ở bất kỳ vị trí nào.
3. Nếu bắt đầu bằng `+84`: thay `+84` bằng `0`. Ngược lại, nếu bắt đầu bằng `84` **và** dài đúng 11 ký tự: thay `84` bằng `0`.
4. Ký tự khác (chữ cái, `/`, `_`, NBSP...) được giữ nguyên, nên số chứa chúng không hợp lệ.

| `phone` gửi lên | Sau chuẩn hoá | Kết quả |
| --- | --- | --- |
| `" 0912.345-678 "` | `0912345678` | 201, `phone: "0912345678"` |
| `"+84 24 3825 1234"` | `02438251234` | 201, `phone: "02438251234"` |
| `"84 912 345 678"` | `0912345678` | 201, `phone: "0912345678"` |
| `"84 24 3825 1234"` | `842438251234` (12 ký tự, không đổi `84`) | 400 `must be a valid phone number` |
| `"+84 0912 345 678"` | `00912345678` | 400 `must be a valid phone number` |
| `"-"`, `"()"`, `" . "` | chuỗi rỗng | 400 `must be a valid phone number` (không được coi là "không có số") |

Dẫn chứng cho bảng trên: `source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java` (TC-3..TC-7) và `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` (TC-17..TC-23).

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
- **Format lỗi**: RFC 9457, `Content-Type: application/problem+json`, record `source-be/src/main/java/com/example/crm/api/Problem.java`: `type` (luôn `about:blank`), `title`, `status`, `detail`, `errors` (map field → message; bị bỏ khỏi JSON khi `null`, do `@JsonInclude(NON_NULL)`; key hiện có: `name`, `email`, `phone`). Bảng map exception nằm ở `CustomerHandler.handle`:
  | Exception | HTTP | `title` |
  | --- | --- | --- |
  | `ValidationException` | 400 | `Validation failed` (kèm `errors`) |
  | `NotFoundException` | 404 | `Not Found` |
  | `JsonProcessingException` | 400 | `Malformed JSON` |
  | `RuntimeException` khác | 500 | `Internal Server Error` |
- **Giá trị thô và giá trị hiển thị**: request nhận giá trị thô người dùng nhập, BE chuẩn hoá rồi lưu, response trả giá trị đã chuẩn hoá. Việc định dạng để hiển thị thuộc về FE: `phone` qua `formatPhone` (`source-fe/src/utils/formatPhone.js`), `status` qua `STATUS_LABELS` (`source-fe/src/components/customerTable.js`).
- **Mã thành công**: tạo mới trả 201 kèm object vừa tạo, không có header `Location`. Đọc trả 200.
- **Ngoài context `/api/customers`**: request tới path khác không đi qua `CustomerHandler`, nên nhận 404 mặc định của JDK `HttpServer`, không phải `problem+json`.
- **Auth**: không có. **CORS**: không có header CORS.
- **Phân trang**: không có. `GET /api/customers` trả toàn bộ danh sách.
- **Client FE**: mọi lỗi non-2xx ném `ApiError { status, fieldErrors }`, trong đó `fieldErrors` lấy từ `problem.errors` (`source-fe/src/api/customerApi.js`).
