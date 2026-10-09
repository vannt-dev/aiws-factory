# API inventory

## Endpoints
Nguồn: `source-be/src/main/java/com/example/crm/api/CustomerHandler.java` (`route`). Context duy nhất được đăng ký là `/api/customers`, trong `source-be/src/main/java/com/example/crm/App.java:start` (bao gồm cả path con `/status`). Mô tả OpenAPI 3: `aiws/work/REQ-001/api-contract.yaml` (ba endpoint `GET`/`POST`, viết ở REQ-001), `aiws/work/REQ-002/api-contract.yaml` (`PUT /api/customers/{id}`, kèm bản chép lại không đổi của `GET /api/customers/{id}`), `aiws/work/REQ-003/api-contract.yaml` (`PUT /api/customers/{id}/status`, mới).

| Method | Path | Handler (file:hàm) | Mô tả | Được FE gọi ở |
| --- | --- | --- | --- | --- |
| GET | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.list` | Trả mảng JSON `Customer[]`, thứ tự tăng dần theo `id`, 200. Không phân trang, không lọc | `source-fe/src/api/customerApi.js:listCustomers` (dùng trong `source-fe/src/main.js:refresh`) |
| POST | `/api/customers` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.create` | Body `CreateCustomerRequest {name, email, phone}`; `phone` tuỳ chọn (thiếu field hoặc `null` đều được) và là giá trị thô người dùng nhập. Field lạ bị bỏ qua. Thành công trả 201 + `Customer` với `status = "ACTIVE"` và `phone` đã chuẩn hoá hoặc `null`. Validation lỗi trả 400 Problem kèm `errors`. JSON hỏng trả 400 "Malformed JSON" | `source-fe/src/api/customerApi.js:createCustomer` (dùng trong submit handler của `source-fe/src/main.js`) |
| GET | `/api/customers/{id}` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.get` | `id` khớp `\d+`. Trả 200 + `Customer`, hoặc 404 Problem với detail `Customer {id} not found` | `source-fe/src/api/customerApi.js:getCustomer` (dùng trong handler `click` trên `#customers` của `source-fe/src/main.js`, để điền form sửa) |
| PUT | `/api/customers/{id}` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.update` | Sửa khách hàng đã có. `id` khớp `\d+` và chỉ lấy từ path. Body `UpdateCustomerRequest {name, email, phone}` là giá trị thô, **thay thế cả ba trường** (trường không gửi không giữ giá trị cũ: thiếu `phone` thì số đang có bị xoá). Field lạ (`id`, `status`...) bị bỏ qua, **kể cả `status`**: trạng thái không đổi dù body có field `status` (REQ-002 TC-63, không đổi ở REQ-003). Thành công trả 200 + `Customer` sau khi sửa, `id` và `status` như trước. Không bao giờ tạo khách hàng mới. Lỗi: 400 Problem kèm `errors`, 400 "Malformed JSON", 404 Problem `Customer {id} not found`. Thứ tự xử lý xem bên dưới | `source-fe/src/api/customerApi.js:updateCustomer` (dùng trong handler `submit` trên `#edit-customer` của `source-fe/src/main.js`) |
| PUT | `/api/customers/{id}/status` | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` → `CustomerService.updateStatus` (REQ-003, mới) | Đặt **trạng thái đích** của khách hàng `id`. `id` khớp `^/api/customers/(\d+)/status$` và chỉ lấy từ path. Body `UpdateCustomerStatusRequest {status}`, `status` phải đúng bằng `"ACTIVE"` hoặc `"INACTIVE"` (không trim, không đổi hoa thường). Idempotent: đặt lại đúng trạng thái đang có trả 200 và **không ghi, không kiểm tra trùng số**. Chỉ kiểm tra BR-09 khi đổi sang `ACTIVE` và khách hàng có số; **không** kiểm tra lại họ tên, email hay định dạng số (không gọi `CustomerService.check`). Thành công trả 200 + `Customer`, giữ nguyên `id`/`name`/`email`/`phone`. Không bao giờ tạo khách hàng mới. Lỗi: 400 Problem `errors.status` (trạng thái đích không hợp lệ) hoặc `errors.phone` (trùng số khi kích hoạt lại), 400 "Malformed JSON", 404 Problem `Customer {id} not found`. Thứ tự xử lý xem bên dưới | `source-fe/src/api/customerApi.js:updateCustomerStatus` (dùng trong listener `click` thứ hai trên `#customers` của `source-fe/src/main.js`, nút `button[data-status-id]` của `source-fe/src/components/customerTable.js`) |
| * | `/api/customers...` (method/path khác) | `source-be/src/main/java/com/example/crm/api/CustomerHandler.java:route` (fallback) | 404 Problem, detail `No route for <METHOD> <path>`. Method sai (vd. `PUT /api/customers`, `DELETE /api/customers/1`, `GET /api/customers/1/status`) cũng trả **404**, không phải 405. `id` không phải chuỗi chữ số (vd. `/api/customers/abc`, `/api/customers/-1`, `/api/customers/abc/status`) cũng rơi vào đây. Không có `GET` trên path con `/status` | — |

Schema `Customer` (`source-be/src/main/java/com/example/crm/domain/Customer.java`), serialize bằng Jackson theo tên component của record:
```json
{ "id": 1, "name": "Nguyen Van An", "email": "an.nguyen@example.com", "phone": "0912345678", "status": "ACTIVE" }
```
- `status` là một trong `ACTIVE`, `INACTIVE` (`source-be/src/main/java/com/example/crm/domain/CustomerStatus.java`).
- `phone` là số điện thoại **đã chuẩn hoá, chưa định dạng hiển thị** (vd. `"0912345678"`, `"02438251234"`), hoặc `null` khi khách hàng không có số. Field luôn có mặt trong JSON của cả bốn endpoint: `Customer` không có `@JsonInclude` và `CustomerHandler.JSON` không cấu hình bỏ `null` (kiểm chứng ở `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`, TC-27, TC-31, TC-62). FE định dạng khi hiển thị (`source-fe/src/utils/formatPhone.js`).

Quy tắc validation của `POST` và `PUT`: cả hai đi qua **cùng một** hàm private `source-be/src/main/java/com/example/crm/service/CustomerService.java:check`, nên quy tắc, thứ tự kiểm tra và thông điệp giống hệt nhau. Chỗ khác duy nhất là hai kiểm tra trùng, do `create` và `update` truyền vào dưới dạng `Predicate<String>` (xem bảng). `name` và `email` được `String.trim()` trước khi kiểm tra. `phone` được trim bằng `PhoneNumbers.trim`, chỉ bỏ space, `\t`, `\n`, `\r`, NUL, VT ở hai đầu (tập ký tự của `trim()` PHP, hẹp hơn `String.trim()`). `null` được coi là chuỗi rỗng ở cả ba field. Lỗi của mọi field được gom vào **một** response 400; nhánh `phone` chạy bất kể `name`/`email` có lỗi hay không:
| Field | Quy tắc | Thông điệp trong `errors` |
| --- | --- | --- |
| `name` | Không rỗng | `must not be blank` |
| `name` | ≤ 100 ký tự (`NAME_MAX_LENGTH`) | `must be at most 100 characters` |
| `email` | Khớp `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `must be a valid email address` |
| `email` | Chưa được khách hàng khác dùng, không phân biệt hoa thường, bất kể trạng thái của khách hàng kia. `POST`: `InMemoryCustomerRepository.existsByEmail`. `PUT`: `existsByEmailAndIdNot(email, id)`, không tính chính khách hàng đang sửa | `is already used by another customer` |
| `phone` | Rỗng sau `PhoneNumbers.trim` (thiếu field, `null`, `""`, `"   "`) nghĩa là không có số | Không lỗi; lưu `phone = null` (với `PUT`: số đang có bị xoá) |
| `phone` | Sau `PhoneNumbers.normalize`, cả chuỗi phải là di động `0[35789][0-9]{8}` (10 chữ số) hoặc cố định `02[0-9]{9}` (11 chữ số) (`PhoneNumbers.isValid`) | `must be a valid phone number` |
| `phone` | Số đã chuẩn hoá chưa được khách hàng `ACTIVE` nào dùng; khách hàng `INACTIVE` không giữ số (BR-09). Chỉ kiểm tra khi số hợp lệ. `POST`: `InMemoryCustomerRepository.existsByPhoneAndStatus(phone, ACTIVE)`. `PUT`: `existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)`, không tính chính khách hàng đang sửa | `is already used by another customer` |

Riêng `PUT /api/customers/{id}` (`CustomerService.update`; dẫn chứng: `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` TC-48..TC-60, `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` TC-61..TC-69):
- **Thứ tự xử lý**:
  1. Khớp route (`BY_ID` + method `PUT`); không khớp thì 404 fallback.
  2. Đọc body JSON; hỏng thì 400 "Malformed JSON", **kể cả khi `id` không tồn tại** (handler đọc body trước khi gọi service).
  3. Tìm khách hàng (`CustomerService.get`); không có thì 404 `Customer {id} not found`, **kể cả khi các field trong body không hợp lệ**.
  4. Kiểm tra dữ liệu (`check`); có lỗi thì 400 kèm `errors`.
  5. Ghi (`CustomerRepository.update`) và trả 200.
- Mọi trường hợp 400 và 404 đều không ghi gì.
- Giữ email và/hoặc số của chính mình thì không báo trùng, kể cả khi viết khác hoa thường hay khác định dạng. Giá trị gửi lên (email sau trim, số sau chuẩn hoá) là giá trị được lưu, vd. gửi `"AN@Example.com"` thì lưu `AN@Example.com`.
- `update` không đọc `status` của khách hàng đang sửa. Hệ quả: khách hàng `INACTIVE` vẫn sửa được và vẫn `INACTIVE`; khách hàng `INACTIVE` gửi lại số của mình mà số đó đang do một khách hàng `ACTIVE` khác giữ thì nhận 400 `errors.phone` (TC-57), kể cả khi chỉ đổi họ tên.
- Số đang lưu được kiểm tra lại ở mọi lần sửa, kể cả khi không đổi: số không còn khớp `PhoneNumbers.isValid` (vd. `01234567890`) phải sửa hoặc xoá thì mới lưu được (TC-54).
- `id` gồm toàn chữ số nhưng vượt `long`: `Long.parseLong` trong `CustomerHandler.route` ném `NumberFormatException`, nên trả 500 (giống `GET /api/customers/{id}`). [CẦN XÁC NHẬN] suy ra từ code, chưa có test nào kiểm chứng.
- [CẦN XÁC NHẬN] Body là JSON `null`: `route` gọi `body.name()` ngay sau `JSON.readValue`, nên trả 500 (giống `POST /api/customers`). Suy ra từ code, chưa có test nào kiểm chứng (`aiws/work/REQ-002/02-design.md` R10).

Riêng `PUT /api/customers/{id}/status` (`CustomerService.updateStatus`, REQ-003; dẫn chứng: `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` TC-84..TC-90, `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` TC-91..TC-100), **không đi qua** hàm private `check` ở trên — tên, email và định dạng số đang lưu không bao giờ được kiểm tra lại:
- **Thứ tự xử lý**:
  1. Khớp route (`STATUS_BY_ID = ^/api/customers/(\d+)/status$` + method `PUT`); không khớp thì 404 fallback (vd. `id` không phải chuỗi chữ số, `GET` trên path này, hoặc path thừa/thiếu đoạn như `/status/x`, `/statuses`).
  2. Đọc body JSON; hỏng thì 400 "Malformed JSON", **kể cả khi `id` không tồn tại**.
  3. Tìm khách hàng (`CustomerService.get`); không có thì 404 `Customer {id} not found`, **kể cả khi `status` trong body không hợp lệ**.
  4. Kiểm tra `status` đúng bằng `"ACTIVE"` hoặc `"INACTIVE"` (hàm private `parseStatus`, so khớp chính xác, không trim, không đổi hoa thường); sai thì 400 `errors.status = "must be ACTIVE or INACTIVE"`.
  5. Khách hàng đã ở đúng trạng thái đích: trả 200 kèm `Customer` đang lưu, **không ghi và không kiểm tra trùng số**.
  6. Trạng thái đích là `ACTIVE` **và** khách hàng có số (`phone != null`): kiểm tra BR-09 bằng `CustomerRepository.existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)` trên số **nguyên văn đang lưu** (không chuẩn hoá lại, không kiểm tra định dạng); trùng với khách hàng `ACTIVE` khác thì 400 `errors.phone = "is already used by another customer"`, khách hàng vẫn `INACTIVE`. Bỏ qua bước này khi `phone == null` (gọi `existsByPhoneAndStatusAndIdNot(null, ...)` sẽ `NullPointerException` → 500, nên được chặn tường minh trước).
  7. Ghi (`CustomerRepository.updateStatus`, chỉ đổi `status`, giữ `id`/`name`/`email`/`phone`) và trả 200.
- Mọi trường hợp 400 và 404 đều không ghi gì. Chiều `INACTIVE` không có điều kiện nào (luôn thành công khi khách hàng tồn tại và `status` hợp lệ).
- Đặt lại đúng trạng thái đang có là thao tác lặp lại được (idempotent): gọi nhiều lần cho cùng kết quả, không lỗi dù dữ liệu `ACTIVE` trùng số đã có sẵn từ trước (TC-95).
- `id` gồm toàn chữ số nhưng vượt `long`, hoặc body là JSON `null`: cùng hành vi suy ra như `PUT /api/customers/{id}` ở trên (500), kế thừa không đổi, chưa có test kiểm chứng.
- [CẦN XÁC NHẬN] `status` là JSON không phải chuỗi (số, boolean, object, mảng): kết quả do Jackson quyết định khi đọc vào field `String` của `UpdateCustomerStatusRequest`, như field `name`/`email`/`phone` của hai request record hiện có; thiết kế không quy định ca này (`aiws/work/REQ-003/02-design.md` R11).

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

Dẫn chứng cho bảng trên: `source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java` (TC-3..TC-7) và `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` (TC-17..TC-23). Cột "Kết quả" ghi theo `POST`; `PUT /api/customers/{id}` chuẩn hoá y hệt và trả 200 thay cho 201 (TC-48, TC-52, TC-61).

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
- **Format lỗi**: RFC 9457, `Content-Type: application/problem+json`, record `source-be/src/main/java/com/example/crm/api/Problem.java`: `type` (luôn `about:blank`), `title`, `status`, `detail`, `errors` (map field → message; bị bỏ khỏi JSON khi `null`, do `@JsonInclude(NON_NULL)`; key hiện có: `name`, `email`, `phone`, `status` (REQ-003, chỉ của `PUT /api/customers/{id}/status`)). Bảng map exception nằm ở `CustomerHandler.handle`:
  | Exception | HTTP | `title` |
  | --- | --- | --- |
  | `ValidationException` | 400 | `Validation failed` (kèm `errors`) |
  | `NotFoundException` | 404 | `Not Found` |
  | `JsonProcessingException` | 400 | `Malformed JSON` |
  | `RuntimeException` khác | 500 | `Internal Server Error` |
- **Giá trị thô và giá trị hiển thị**: request nhận giá trị thô người dùng nhập, BE chuẩn hoá rồi lưu, response trả giá trị đã chuẩn hoá. Việc định dạng để hiển thị thuộc về FE: `phone` qua `formatPhone` (`source-fe/src/utils/formatPhone.js`), `status` qua `STATUS_LABELS` (`source-fe/src/components/customerTable.js`). Ngoại lệ: form sửa điền nguyên giá trị API trả vào ô nhập, không định dạng (`source-fe/src/components/customerEditForm.js`).
- **Thêm, sửa và đổi trạng thái là ba endpoint riêng**: `POST /api/customers` chỉ thêm, `PUT /api/customers/{id}` chỉ sửa và thay thế toàn bộ các trường sửa được (`name`, `email`, `phone`; không đổi `status`), `PUT /api/customers/{id}/status` (REQ-003) chỉ đổi `status` và không đổi `name`/`email`/`phone` (không có `PATCH`, không upsert). Mỗi thao tác ghi có một request record riêng (`CreateCustomerRequest`, `UpdateCustomerRequest`, `UpdateCustomerStatusRequest`). `id` của tài nguyên chỉ lấy từ path. Sub-resource `/status` theo quy ước đặt tên path con cho một thao tác ghi hẹp hơn toàn bộ resource.
- **Mã thành công**: tạo mới trả 201 kèm object vừa tạo, không có header `Location`. Sửa trả 200 kèm object sau khi sửa. Đọc trả 200.
- **Ngoài context `/api/customers`**: request tới path khác không đi qua `CustomerHandler`, nên nhận 404 mặc định của JDK `HttpServer`, không phải `problem+json`.
- **Auth**: không có. **CORS**: không có header CORS.
- **Phân trang**: không có. `GET /api/customers` trả toàn bộ danh sách.
- **Client FE**: mọi lỗi non-2xx ném `ApiError { status, fieldErrors }`, trong đó `fieldErrors` lấy từ `problem.errors` (`source-fe/src/api/customerApi.js`). Path có `id` được ghép bằng `encodeURIComponent(id)` (`getCustomer`, `updateCustomer`). Body của `PUT` là đúng object nhận vào, không thêm `id`.
