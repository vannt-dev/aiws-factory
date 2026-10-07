# REQ-002 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-14 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D12) và `api-contract.yaml`. Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB hay dịch vụ ngoài.

**Mức test và framework** (theo `aiws/knowledge/conventions.md` → Test):
- BE, `unit`: JUnit Jupiter (`source-be/pom.xml`). Bảng dữ liệu dùng `@ParameterizedTest` + `@MethodSource` (thêm `@NullSource` khi cần ca `null`); mã TC gắn một lần ở `@DisplayName`.
  - Repository test tạo `InMemoryCustomerRepository` ngay trong từng test.
  - Service test dùng `InMemoryCustomerRepository` thật, không mock framework.
- BE, `integration`: `CustomerHandlerTest` khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, gọi bằng `java.net.http.HttpClient` (convention hiện có). Chạy trong `be_test`, không cần môi trường ngoài. Cần helper mới `put(String path, String json)` theo mẫu `post` (design → BE change).
- FE, `unit`: `node:test` + `node:assert/strict`. HTTP giả bằng `fakeFetch(status, body, calls)` có sẵn trong `source-fe/test/customerApi.test.js`. Component kiểm bằng so chuỗi HTML (`assert.match`/`assert.doesNotMatch`). Bảng dữ liệu là một mảng, lặp bằng `for...of` trong **một** `test(...)`.

**Đánh số TC (chốt Q8)**: đánh số **tiếp** từ TC-44 đến TC-81, không bắt đầu lại từ TC-1.
- Lý do: `runUnitTests` trong `aiws/adapters/cli/src/engine.js` tìm mã TC trong **toàn bộ nội dung** các file test mà task đã sửa, không phải trong diff. REQ-002 thêm test vào chính các file đang mang mã TC của REQ-001 (TC-11..TC-32, TC-36..TC-43; `aiws/knowledge/conventions.md` → Test → Mã TC). Nếu bắt đầu lại từ TC-1, một TC mới chưa được viết vẫn "có mặt" nhờ test cũ cùng mã, và truy vết AC → TC → commit sẽ sai.
- **TC-36 của REQ-001 không được định nghĩa lại ở đây** (D9). Nó được sửa đúng hai assertion trong nhóm FE-2 và giữ nguyên mã, tên hiển thị. Kỳ vọng mới của REQ-002 về cột thứ sáu thuộc TC-74.

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương:
  - `phone` khi sửa: không có số (thiếu field / `null` / `""` / chỉ dấu cách) / hợp lệ có ký tự phân cách / có mã quốc gia `+84`, `84` / sai đầu số / sai độ dài / ký tự lạ / mã quốc gia không khớp / chỉ ký tự phân cách.
  - `name`: rỗng sau trim / hợp lệ / quá dài. `email`: sai định dạng / hợp lệ / trùng.
  - `id`: có khách hàng / không có khách hàng / không khớp route.
- Giá trị biên: độ dài `name` 1, 100 (chấp nhận, TC-49) và 101 (từ chối, TC-52), đo **sau** trim; `id` bằng `0` và bằng giá trị kế tiếp của bộ đếm (TC-45).
- Bảng quyết định cho kiểm tra trùng (D5), ở repository (TC-46, TC-47) và service (TC-55..TC-59):

  | Giá trị gửi lên đang được ai giữ | Trạng thái người giữ | Kết quả | TC |
  | --- | --- | --- | --- |
  | Email: chính khách hàng đang sửa | bất kỳ | 200 | TC-46, TC-58, TC-66 |
  | Email: khách hàng khác | `ACTIVE` hoặc `INACTIVE` | 400 `errors.email` | TC-46, TC-55, TC-65 |
  | Số: chính khách hàng đang sửa (và không ai khác) | `ACTIVE` | 200 | TC-47, TC-58, TC-66 |
  | Số: khách hàng khác | `ACTIVE` | 400 `errors.phone`, kể cả khi khách hàng đang sửa là `INACTIVE` và đang giữ chính số đó | TC-47, TC-56, TC-57, TC-65 |
  | Số: khách hàng khác | `INACTIVE` | 200 | TC-47, TC-59 |
  | Không ai | — | 200 | TC-46, TC-47, TC-48 |

- Chuyển trạng thái: trạng thái số điện thoại của một khách hàng (có số → không có số ở TC-50, TC-62; không có số → có số ở TC-48, TC-61) và bất biến `status` qua thao tác sửa (`ACTIVE` → `ACTIVE`, `INACTIVE` → `INACTIVE`, TC-44, TC-51, TC-63).
- Bảng quyết định cho form sửa: trường nào có lỗi × trường nào có phần tử lỗi (TC-79).
- Đoán lỗi (error guessing) cho các cách hiện thực sai mà design đã cảnh báo:
  - `c.phone().equals(phone)` gây `NullPointerException` (D5).
  - `save`/`put` kiểu upsert tạo khách hàng mới khi `id` chưa có (D6).
  - Giữ số cũ khi không gửi `phone`, bỏ qua kiểm tra số khi số không đổi, không kiểm tra trùng cho khách hàng `INACTIVE` (D7).
  - Kiểm tra dữ liệu trước khi tìm khách hàng (D2).
  - Dùng `formatPhone` hoặc `NO_PHONE` cho giá trị trong form; quên `escapeHtml` trong thuộc tính (D10, R6).

**Dữ liệu chung**:
- **Seed** (BE): một khách hàng `ACTIVE` **không có số**, **khác** khách hàng đang sửa, có mặt trong mọi test service và HTTP đi tới truy vấn trùng số. Số `null` của chính khách hàng đang sửa bị điều kiện `id` loại trước, nên không bắt được lỗi NPE của D5; phải là khách hàng khác.
  - Service test: `repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE)`, chèn đầu tiên (id 1).
  - HTTP test: seed có sẵn của `@BeforeEach`, id 1 `("Nguyen Van An", "an@example.com", null)`, `ACTIVE`.
- Service test dựng kho bằng `repository.insert(...)` trên `InMemoryCustomerRepository` thật rồi tạo `new CustomerService(repository)` trên chính repository đó (mẫu TC-25 của REQ-001), vì nhiều TC cần khách hàng `INACTIVE`. Thứ tự `insert` trong `preconditions` quyết định `id`.
- Khách hàng `INACTIVE` **không dựng được qua HTTP** (không có endpoint đổi trạng thái; nằm ngoài phạm vi). Các biến thể `INACTIVE` được kiểm ở repository và service; HTTP test chỉ kiểm biến thể "`status` trong body bị bỏ qua" của AC-3 (TC-63).
- "Lưu" = giá trị trong kết quả `update`/response 200 **và** trong lần đọc lại (`service.get(id)`/`GET`).
- "Không đổi gì" = danh sách sau yêu cầu bằng đúng danh sách chụp trước yêu cầu:
  - service: `service.list()` (so `List<Customer>` bằng `assertEquals`)
  - repository: `findAll()`
  - HTTP: body của `GET /api/customers` (so `JsonNode`)
- Lỗi validation được so **cả map** `errors` (đúng tập key, đúng thông điệp), để chắc không có lỗi thừa.
- Mỗi dòng dữ liệu chạy trên kho mới.

**TC sinh từ design, không có AC riêng**: được truy vết tới AC gần nhất.
- Thứ tự xử lý D2 bước 1 và 2 (route fallback, `Malformed JSON`): TC-68, TC-69. Truy vết tới AC-4 (400, khách hàng không đổi gì) và AC-9 (không tạo mới, không sửa ai).
- `getCustomer` của D8/D11 (nguồn giá trị điền form): TC-72, TC-73. Truy vết tới AC-13.
- Truy vấn và thao tác ghi mới của repository (D5, D6): TC-44..TC-47. Truy vết tới AC mà chúng hiện thực.

**Không đặt kỳ vọng** (R10): `id` vượt `long` (20 chữ số) và body là JSON `null`. Cả hai trả 500 do kế thừa từ handler hiện có, và REQ-002 không sửa. Không TC nào dùng hai đầu vào này.

**Không có TC tự động**: `source-fe/index.html` và `source-fe/src/main.js` (D12), vì `node:test` không có DOM. Kiểm bằng review hoặc chạy tay:
- Bấm "Sửa": gọi `getCustomer`, form hiện với giá trị hiện tại, focus vào ô đầu tiên. Lỗi thì `#message` hiện "Không tải được khách hàng.".
- Lưu thành công: form đóng, danh sách tải lại.
- 400 có `errors`: form dựng lại với giá trị vừa nhập và lỗi dưới từng ô, focus vào ô lỗi đầu tiên.
- 404, 500, mất mạng: `#message` hiện "Không lưu được khách hàng."; form giữ nguyên giá trị đang nhập.
- Bấm "Huỷ": form đóng, `#message` được xoá.
- Form thêm khách hàng và cách hiển thị lỗi của nó không đổi.

**Kỳ vọng phụ thuộc quyết định đang chờ duyệt** (`02-design.md` → Quyết định cần duyệt). Nếu người duyệt chọn khác, các TC sau phải đổi theo:
- `id` không tồn tại trả 404, và 404 trước 400 (Q2, D2): TC-45, TC-60, TC-67, TC-68.
- Giữ nguyên hành vi legacy (Q3, D7): (a) TC-50, TC-62; (b) TC-51; (c) TC-57; (d) TC-54.
- Lỗi hiện ngay dưới ô nhập, nguyên văn thông điệp của API (Q5, D10): TC-79..TC-81.
- Bố cục bảng và form (Q6, D9, D10): TC-74..TC-78.
- Form điền bằng `GET /api/customers/{id}` (D11): TC-72, TC-73.

**Gắn mã TC trong code**:
- BE: `@DisplayName("TC-n: ...")` ở mức method, kể cả `@ParameterizedTest`. Tên method camelCase, không chứa mã TC.
- FE: `test('TC-n: <tên hàm> ...', ...)`.
- Test cũ (có hay không có mã TC) không sửa, trừ TC-36 theo D9.

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test:

| TC | File test | Nhóm |
| --- | --- | --- |
| TC-44..TC-47 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | BE-1 |
| TC-48..TC-60 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | BE-2 |
| TC-61..TC-69 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-3 |
| TC-70..TC-73 | `source-fe/test/customerApi.test.js` | FE-1 |
| TC-74..TC-75 | `source-fe/test/customerTable.test.js` (cùng task với việc sửa TC-36) | FE-2 |
| TC-76..TC-81 | `source-fe/test/customerEditForm.test.js` (mới) | FE-3 |

## Test cases

### TC-44: InMemoryCustomerRepository.update ghi lại ba trường, giữ nguyên id và status
- covers: AC-1, AC-2, AC-3
- side: be
- level: unit
- type: functional
- priority: high
- objective: D6: `update` thay đúng `name`, `email`, `phone` (kể cả ghi `null`), không đổi `id` và `status` đang lưu, không thêm phần tử và không đụng tới khách hàng khác.
- preconditions: `InMemoryCustomerRepository` mới, `insert` theo thứ tự:
  1. `("Other", "other@example.com", null, ACTIVE)` → id 1
  2. `("Nguyen Van An", "an@example.com", oldPhone, status)` → id 2
- test data: (status, oldPhone, newPhone)
  - `ACTIVE`, `"0912345678"`, `"0987654321"`
  - `INACTIVE`, `"0912345678"`, `"0987654321"`
  - `ACTIVE`, `"0912345678"`, `null` (xoá số)
  - `INACTIVE`, `null`, `"0987654321"` (thêm số)
- steps: Given kho có hai khách hàng như trên / When gọi `repository.update(2, "Nguyen Van Anh", "anh@example.com", newPhone)` / Then kiểm tra giá trị trả về, `findById(2)` và `findAll()`.
- expected result:
  - trả `Optional.of(new Customer(2, "Nguyen Van Anh", "anh@example.com", newPhone, status))`
  - `findById(2)` trả đúng record đó
  - `findAll()` bằng `List.of(new Customer(1, "Other", "other@example.com", null, ACTIVE), <record đã sửa>)`: vẫn 2 phần tử, theo thứ tự id, khách hàng 1 không đổi

### TC-45: InMemoryCustomerRepository.update với id không tồn tại trả Optional.empty() và không thêm mới
- covers: AC-9
- side: be
- level: unit
- type: negative
- priority: high
- objective: D6: `update` không bao giờ thêm mới. Bắt cách hiện thực bằng `customers.put` (upsert).
- preconditions: `InMemoryCustomerRepository` mới; `insert("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 1; chụp `findAll()`.
- test data: (`id`)
  - `999`
  - `0` (biên dưới của `\d+`)
  - `2` (giá trị kế tiếp của bộ đếm id)
- steps: Given kho có một khách hàng / When gọi `repository.update(id, "X", "x@example.com", "0987654321")` / Then kiểm tra giá trị trả về và kho.
- expected result: trả `Optional.empty()`; `findById(id)` là `Optional.empty()`; `findAll()` bằng đúng danh sách đã chụp (1 phần tử, không đổi).

### TC-46: InMemoryCustomerRepository.existsByEmailAndIdNot theo bảng quyết định email × id
- covers: AC-5, AC-7
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: chỉ trả `true` khi có khách hàng **khác** `id` dùng email đó, không phân biệt hoa thường, bất kể trạng thái. Tương đương `... AND id <> ?` của legacy.
- preconditions: `InMemoryCustomerRepository` mới, `insert` theo thứ tự:
  1. `("A", "an@example.com", null, ACTIVE)` → id 1
  2. `("B", "binh@example.com", null, INACTIVE)` → id 2
  3. `("C", "dup@example.com", null, ACTIVE)` → id 3
  4. `("D", "dup@example.com", null, ACTIVE)` → id 4 (kho không có ràng buộc duy nhất)
- test data: (email, id → kết quả)
  - `"an@example.com"`, `1` → `false` (email của chính mình)
  - `"AN@Example.com"`, `1` → `false` (của chính mình, khác hoa thường)
  - `"an@example.com"`, `2` → `true` (của khách hàng khác)
  - `"AN@EXAMPLE.COM"`, `2` → `true`
  - `"binh@example.com"`, `1` → `true` (người giữ là `INACTIVE`; trạng thái không được xét)
  - `"binh@example.com"`, `2` → `false`
  - `"new@example.com"`, `1` → `false` (không ai dùng)
  - `"an@example.com"`, `999` → `true` (`id` không khớp ai thì không loại trừ ai)
  - `"dup@example.com"`, `3` → `true` (D cũng dùng; bắt cách tìm một bản ghi rồi so `id`)
- steps: Given kho có A, B, C, D / When gọi `existsByEmailAndIdNot(email, id)` cho từng dòng / Then kết quả bằng giá trị mong đợi.
- expected result: đúng 9 kết quả như bảng.

### TC-47: InMemoryCustomerRepository.existsByPhoneAndStatusAndIdNot theo bảng quyết định số × trạng thái × id
- covers: AC-6, AC-7, AC-8
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: chỉ trả `true` khi có khách hàng **khác** `id` có đúng số đó **và** đúng `status` đó. Không ném `NullPointerException` khi kho có khách hàng không có số.
- preconditions: `InMemoryCustomerRepository` mới, `insert` theo thứ tự:
  1. C: `("C", "c@example.com", null, ACTIVE)` → id 1. Chèn đầu tiên để mọi truy vấn đều đi qua bản ghi `phone = null`.
  2. A: `("A", "a@example.com", "0912345678", ACTIVE)` → id 2
  3. B: `("B", "b@example.com", "0987654321", INACTIVE)` → id 3
  4. D: `("D", "d@example.com", "0912345678", INACTIVE)` → id 4 (khách hàng `INACTIVE` có số đã được cấp lại cho A)
- test data: (phone, status, id → kết quả)
  - `"0912345678"`, `ACTIVE`, `2` → `false` (số của chính A; AC-7)
  - `"0912345678"`, `ACTIVE`, `1` → `true` (A `ACTIVE` giữ số; AC-6)
  - `"0912345678"`, `ACTIVE`, `4` → `true` (D `INACTIVE` gửi lại số mà A `ACTIVE` đang giữ; AC-6 biến thể thứ ba)
  - `"0987654321"`, `ACTIVE`, `1` → `false` (chỉ B `INACTIVE` giữ; AC-8)
  - `"0987654321"`, `INACTIVE`, `1` → `true` (tham số `status` được tôn trọng)
  - `"0987654321"`, `INACTIVE`, `3` → `false` (số của chính B)
  - `"0912345678"`, `INACTIVE`, `2` → `true` (D `INACTIVE` giữ)
  - `"0911111111"`, `ACTIVE`, `1` → `false` (không ai giữ)
  - `"0912345678"`, `ACTIVE`, `999` → `true` (`id` không khớp ai)
- steps: Given kho có C, A, B, D / When gọi `existsByPhoneAndStatusAndIdNot(phone, status, id)` cho từng dòng / Then kết quả bằng giá trị mong đợi.
- expected result: đúng 9 kết quả như bảng; không có exception.

### TC-48: CustomerService.update lưu họ tên, email đã trim và số đã chuẩn hoá, không tạo khách hàng mới
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D1, D4, D6: sửa ghi lại cả ba trường của đúng khách hàng đó, với `name`/`email` đã trim và `phone` đã chuẩn hoá như lúc tạo; `id` không đổi; số khách hàng không đổi.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", currentPhone, ACTIVE)` → id 2
- test data: (currentPhone, name, email, phone → name, email, phone được lưu)
  - `"0912345678"`, `"  Nguyen Van Anh "`, `" anh@example.com "`, `" 0987.654-321 "` → `"Nguyen Van Anh"`, `"anh@example.com"`, `"0987654321"`
  - `"0912345678"`, `"Nguyen Van Anh"`, `"anh@example.com"`, `"+84 24 3825 1234"` → `"Nguyen Van Anh"`, `"anh@example.com"`, `"02438251234"`
  - `"0912345678"`, `"Nguyen Van Anh"`, `"anh@example.com"`, `"84 987 654 321"` → `"Nguyen Van Anh"`, `"anh@example.com"`, `"0987654321"`
  - `null`, `"Nguyen Van An"`, `"an@example.com"`, `"0987654321"` → `"Nguyen Van An"`, `"an@example.com"`, `"0987654321"` (khách hàng đang không có số)
- steps: Given kho có Seed và A / When gọi `service.update(2, name, email, phone)` / Then kiểm tra khách hàng trả về, `service.get(2)` và `service.list()`.
- expected result:
  - không ném exception
  - kết quả bằng `new Customer(2, <name lưu>, <email lưu>, <phone lưu>, ACTIVE)`
  - `service.get(2)` bằng đúng kết quả đó
  - `service.list().size()` vẫn là 2; `service.get(1)` vẫn là Seed ban đầu

### TC-49: CustomerService.update chấp nhận họ tên ở biên độ dài hợp lệ
- covers: AC-1, AC-4
- side: be
- level: unit
- type: boundary
- priority: medium
- objective: giới hạn họ tên là "tối đa 100 ký tự" và được đo **sau** trim, giống lúc tạo: 100 ký tự được chấp nhận (cặp biên với dòng 101 ký tự của TC-52).
- preconditions: kho mới; Seed `("Seed", "seed@example.com", null, ACTIVE)` → id 1; A `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2.
- test data: (`name` → `name` được lưu); `email = "an@example.com"`, `phone = "0912345678"`
  - `"x"` → `"x"` (1 ký tự)
  - `"x".repeat(100)` → `"x".repeat(100)`
  - `" " + "x".repeat(100) + " "` → `"x".repeat(100)` (102 ký tự thô, 100 sau trim)
- steps: Given kho có Seed và A / When gọi `service.update(2, name, "an@example.com", "0912345678")` / Then kiểm tra khách hàng trả về và `service.get(2)`.
- expected result: không ném exception; `name()` của kết quả và của `service.get(2)` bằng giá trị lưu mong đợi.

### TC-50: CustomerService.update không có số điện thoại thì xoá số đang có
- covers: AC-2
- side: be
- level: unit
- type: functional
- priority: high
- objective: D7 (a): sửa là ghi lại cả ba trường. `phone` là `null` hoặc rỗng sau trim kiểu PHP thì số đang có bị xoá, **không** được giữ lại.
- preconditions: kho mới; Seed `("Seed", "seed@example.com", null, ACTIVE)` → id 1; A `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2.
- test data: (`phone`) `null`, `""`, `"   "`, `" \t\r\n"`.
- steps: Given A đang có số `0912345678` / When gọi `service.update(2, "Nguyen Van An", "an@example.com", phone)` / Then kiểm tra khách hàng trả về và `service.get(2)`.
- expected result: không ném exception; kết quả bằng `new Customer(2, "Nguyen Van An", "an@example.com", null, ACTIVE)`; `service.get(2).phone()` là `null`; `service.list().size()` vẫn là 2.

### TC-51: CustomerService.update giữ nguyên status của khách hàng ACTIVE và INACTIVE
- covers: AC-3
- side: be
- level: unit
- type: functional
- priority: high
- objective: D6, D7 (b): sửa không đổi trạng thái. Khách hàng `INACTIVE` sửa được như khách hàng `ACTIVE` và vẫn `INACTIVE`.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", "0912345678", status)` → id 2
- test data: (`status`) `ACTIVE`, `INACTIVE`.
- steps: Given A có `status` của dòng dữ liệu / When gọi `service.update(2, "Nguyen Van Anh", "anh@example.com", "0987654321")` / Then kiểm tra khách hàng trả về và `service.get(2)`.
- expected result: không ném exception; kết quả bằng `new Customer(2, "Nguyen Van Anh", "anh@example.com", "0987654321", status)`; `service.get(2)` bằng đúng kết quả đó.

### TC-52: CustomerService.update từ chối một trường vi phạm quy tắc của lúc tạo
- covers: AC-4
- side: be
- level: unit
- type: negative
- priority: high
- objective: D4: `update` dùng chung bộ quy tắc với `create`. Mỗi trường sai cho đúng một thông điệp giống hệt `POST /api/customers`; không ghi gì.
- preconditions: kho mới; Seed `("Seed", "seed@example.com", null, ACTIVE)` → id 1; A `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2; chụp `service.list()`.
- test data: (name, email, phone → `errors`). Trường không nêu dùng giá trị hợp lệ `name = "Nguyen Van Anh"`, `email = "anh@example.com"`, `phone = "0987654321"`.
  - `name` rỗng sau trim: `null`, `""`, `"   "` → `{"name": "must not be blank"}`
  - `name` quá dài: `"x".repeat(101)` → `{"name": "must be at most 100 characters"}`
  - `email` sai định dạng: `null`, `""`, `"x"`, `"a@b"` → `{"email": "must be a valid email address"}`
  - `phone` không hợp lệ sau chuẩn hoá → `{"phone": "must be a valid phone number"}`:
    - `"0412345678"` (sai đầu số)
    - `"091234567"` (sai độ dài)
    - `"0912a45678"` (ký tự lạ)
    - `"84 24 3825 1234"` (mã quốc gia không khớp)
    - `"-"` (chỉ ký tự phân cách; không được coi là "không có số")
- steps: Given kho có Seed và A / When gọi `service.update(2, name, email, phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng map của dòng dữ liệu (một key); `service.list()` bằng đúng danh sách đã chụp.

### TC-53: CustomerService.update gom lỗi của cả ba trường trong một lần
- covers: AC-4
- side: be
- level: unit
- type: negative
- priority: high
- objective: các trường được kiểm tra độc lập; mọi lỗi nằm trong một `ValidationException`, kể cả lỗi trùng số.
- preconditions: kho mới, `insert` theo thứ tự; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2
  3. B: `("Tran Thi Binh", "binh@example.com", "0987654321", ACTIVE)` → id 3
- test data: (name, email, phone → `errors.phone`)
  - `""`, `"x"`, `"0412345678"` → `"must be a valid phone number"`
  - `" "`, `"x"`, `"0987654321"` → `"is already used by another customer"` (số của B)
- steps: Given kho có Seed, A, B / When gọi `service.update(2, name, email, phone)` / Then bắt `ValidationException`.
- expected result: `errors()` bằng đúng `{"name": "must not be blank", "email": "must be a valid email address", "phone": <theo dòng dữ liệu>}` (ba key); `service.list()` bằng đúng danh sách đã chụp.

### TC-54: CustomerService.update kiểm tra lại số điện thoại đang lưu theo quy tắc cũ
- covers: AC-4
- side: be
- level: unit
- type: negative
- priority: medium
- objective: D7 (d): mọi lần lưu đều kiểm tra lại số, kể cả khi số không đổi. Bắt cách hiện thực bỏ qua kiểm tra khi số gửi lên bằng số đang lưu.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. L: `("Le Van Cuong", "cuong@example.com", "01234567890", ACTIVE)` → id 2 (số theo quy tắc trước BR-07, như dữ liệu migrate)
- test data: `update(2, "Le Van Cuong Moi", "cuong@example.com", "01234567890")` (chỉ đổi họ tên, gửi lại đúng số đang lưu).
- steps: Given L đang lưu số `01234567890` / When gọi `update` gửi lại số đó / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "must be a valid phone number"}`; `service.list()` bằng đúng danh sách đã chụp (họ tên vẫn là `"Le Van Cuong"`).

### TC-55: CustomerService.update từ chối email của khách hàng khác, bất kể trạng thái và hoa thường
- covers: AC-5
- side: be
- level: unit
- type: negative
- priority: high
- objective: D5: email trùng khách hàng **khác** bị từ chối như lúc tạo, dù khách hàng đó `ACTIVE` hay `INACTIVE`, so sau trim và không phân biệt hoa thường.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó; chụp `service.list()`:
  1. B: `("Tran Thi Binh", "binh@example.com", null, bStatus)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2
- test data: (bStatus, email)
  - `ACTIVE`, `"binh@example.com"`
  - `ACTIVE`, `"BINH@Example.com"`
  - `ACTIVE`, `" binh@example.com "`
  - `INACTIVE`, `"binh@example.com"`
  - `INACTIVE`, `"BINH@Example.com"`
- steps: Given B đang dùng `binh@example.com` / When gọi `service.update(2, "Nguyen Van An", email, "0912345678")` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"email": "is already used by another customer"}` (một key: số của chính A không bị báo trùng); `service.list()` bằng đúng danh sách đã chụp.

### TC-56: CustomerService.update từ chối số của khách hàng ACTIVE khác sau chuẩn hoá
- covers: AC-6
- side: be
- level: unit
- type: negative
- priority: high
- objective: BR-09 khi sửa: số trùng (sau chuẩn hoá) với khách hàng `ACTIVE` **khác** bị từ chối, bất kể khách hàng đang sửa là `ACTIVE` hay `INACTIVE`.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. B: `("Tran Thi Binh", "binh@example.com", "0912345678", ACTIVE)` → id 2
  3. A: `("Nguyen Van An", "an@example.com", aPhone, aStatus)` → id 3
- test data: (aStatus, aPhone, phone gửi lên)
  - `ACTIVE`, `"0987654321"`, `"0912345678"`
  - `ACTIVE`, `"0987654321"`, `"+84 912 345 678"`
  - `INACTIVE`, `null`, `"0912345678"`
- steps: Given B `ACTIVE` đang dùng `0912345678` / When gọi `service.update(3, "Nguyen Van An", "an@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "is already used by another customer"}`; `service.list()` bằng đúng danh sách đã chụp.

### TC-57: CustomerService.update từ chối khách hàng INACTIVE gửi lại số đã được cấp cho khách hàng ACTIVE khác
- covers: AC-6
- side: be
- level: unit
- type: negative
- priority: high
- objective: D7 (c): kiểm tra trùng số không xét trạng thái của khách hàng đang sửa. Khách hàng `INACTIVE` đang giữ chính số đã cấp lại cho khách hàng `ACTIVE` khác không lưu được, kể cả khi chỉ sửa họ tên. Bắt cách hiện thực bỏ kiểm tra trùng cho khách hàng `INACTIVE` hoặc khi số không đổi.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", "0912345678", INACTIVE)` → id 2
  3. B: `("Tran Thi Binh", "binh@example.com", "0912345678", ACTIVE)` → id 3 (số của A đã được cấp lại theo BR-09)
- test data: (`phone` gửi lên) `"0912345678"`, `"+84 912 345 678"`; `name = "Nguyen Van Anh"`, `email = "an@example.com"`.
- steps: Given A `INACTIVE` và B `ACTIVE` cùng có số `0912345678` / When gọi `service.update(2, "Nguyen Van Anh", "an@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "is already used by another customer"}`; `service.list()` bằng đúng danh sách đã chụp (họ tên của A vẫn là `"Nguyen Van An"`).

### TC-58: CustomerService.update chấp nhận email và số của chính khách hàng đang sửa
- covers: AC-7
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: kiểm tra trùng không tính chính khách hàng đang sửa (`id <> ?` của legacy). Giá trị gửi lên là giá trị được lưu: email sau trim, **giữ nguyên hoa thường**; số sau chuẩn hoá.
- preconditions: kho mới; Seed `("Seed", "seed@example.com", null, ACTIVE)` → id 1; A `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2.
- test data: (name, email, phone → email, phone được lưu)
  - `"Nguyen Van Anh"`, `"an@example.com"`, `"0912345678"` → `"an@example.com"`, `"0912345678"` (chỉ đổi họ tên)
  - `"Nguyen Van An"`, `"AN@Example.com"`, `"0912345678"` → `"AN@Example.com"`, `"0912345678"`
  - `"Nguyen Van An"`, `"an@example.com"`, `"+84 912 345 678"` → `"an@example.com"`, `"0912345678"`
  - `"Nguyen Van Anh"`, `"AN@Example.com"`, `"+84 912 345 678"` → `"AN@Example.com"`, `"0912345678"`
- steps: Given A có `an@example.com` và `0912345678` / When gọi `service.update(2, name, email, phone)` / Then kiểm tra khách hàng trả về và `service.get(2)`.
- expected result: không ném exception; kết quả bằng `new Customer(2, name, <email lưu>, <phone lưu>, ACTIVE)`; `service.get(2)` bằng đúng kết quả đó; `service.list().size()` vẫn là 2.

### TC-59: CustomerService.update chấp nhận số chỉ do khách hàng INACTIVE khác giữ
- covers: AC-8
- side: be
- level: unit
- type: functional
- priority: high
- objective: BR-09 khi sửa: khách hàng ngừng hoạt động không giữ số; service truyền `CustomerStatus.ACTIVE` xuống truy vấn trùng.
- preconditions: kho mới, `insert` theo thứ tự rồi tạo `CustomerService` trên kho đó:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. Old: `("Old", "old@example.com", "0987654321", INACTIVE)` → id 2
  3. A: `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 3
- test data: `update(3, "Nguyen Van An", "an@example.com", "0987654321")`.
- steps: Given `0987654321` chỉ do Old `INACTIVE` giữ / When gọi `update` cho A với số đó / Then kiểm tra khách hàng trả về và kho.
- expected result: không ném exception; kết quả bằng `new Customer(3, "Nguyen Van An", "an@example.com", "0987654321", ACTIVE)`; `service.get(3)` bằng đúng kết quả đó; `service.get(2)` vẫn là `new Customer(2, "Old", "old@example.com", "0987654321", INACTIVE)`; `service.list().size()` vẫn là 3.

### TC-60: CustomerService.update với id không tồn tại ném NotFoundException trước khi kiểm tra dữ liệu
- covers: AC-9
- side: be
- level: unit
- type: negative
- priority: high
- objective: D2 bước 3: tìm khách hàng **trước** validation. `id` không tồn tại cho `NotFoundException` kể cả khi dữ liệu sai; không tạo mới, không sửa ai.
- preconditions: kho mới; Seed `("Seed", "seed@example.com", null, ACTIVE)` → id 1; A `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 2; chụp `service.list()`.
- test data: (name, email, phone)
  - `"Nguyen Van Anh"`, `"anh@example.com"`, `"0987654321"` (hợp lệ)
  - `""`, `"x"`, `"0412345678"` (cả ba trường sai)
  - `"Nguyen Van An"`, `"an@example.com"`, `"0912345678"` (trùng email và số của A)
- steps: Given không có khách hàng id 999 / When gọi `service.update(999, name, email, phone)` / Then bắt exception.
- expected result: ném `NotFoundException` (không phải `ValidationException`) với message `"Customer 999 not found"`; `service.list()` bằng đúng danh sách đã chụp; `service.get(999)` vẫn ném `NotFoundException`.

### TC-61: PUT /api/customers/{id} trả 200 kèm khách hàng đã sửa và GET đọc lại được
- covers: AC-1
- side: be
- level: integration
- type: functional
- priority: high
- objective: route `PUT` mới đọc `UpdateCustomerRequest`, gọi `service.update` với `id` từ path và trả 200 `application/json` kèm `Customer` sau khi sửa (D1, D3).
- preconditions: server `App.start(0, service)`; kho có seed id 1 `("Nguyen Van An", "an@example.com", null)`, `ACTIVE`, từ `@BeforeEach`.
- test data: `PUT /api/customers/1`, body `{"name":"  Nguyen Van Anh ","email":" anh@example.com ","phone":" 0987.654-321 "}`.
- steps: Given server đang chạy / When `PUT /api/customers/1` rồi `GET /api/customers/1` và `GET /api/customers` / Then đọc các response bằng `CustomerHandler.JSON.readTree`.
- expected result:
  - PUT trả 200; header `Content-Type` bắt đầu bằng `application/json`
  - body PUT: `id` là 1, `name` là `"Nguyen Van Anh"`, `email` là `"anh@example.com"`, `phone` là `"0987654321"`, `status` là `"ACTIVE"`
  - `GET /api/customers/1` trả 200 với đúng năm giá trị trên
  - `GET /api/customers` vẫn có 1 phần tử

### TC-62: PUT /api/customers/{id} không có số trả 200 với "phone": null
- covers: AC-2
- side: be
- level: integration
- type: functional
- priority: high
- objective: thiếu field `phone`, `null`, `""` hoặc chỉ gồm dấu cách đều xoá số đang có; response vẫn có field `phone` với giá trị JSON `null` (contract `Customer.required`).
- preconditions: server đang chạy với seed id 1; đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201 (id 2).
- test data: (body của `PUT /api/customers/2`)
  - `{"name":"Tran Thi Binh","email":"binh@example.com"}` (thiếu field)
  - `{"name":"Tran Thi Binh","email":"binh@example.com","phone":null}`
  - `{"name":"Tran Thi Binh","email":"binh@example.com","phone":""}`
  - `{"name":"Tran Thi Binh","email":"binh@example.com","phone":"   "}`
- steps: Given khách hàng 2 đang có số `0912345678` / When `PUT /api/customers/2` với từng body rồi `GET /api/customers/2` / Then kiểm tra `phone` của cả hai response.
- expected result: PUT trả 200; `body.has("phone")` là `true` và `body.get("phone").isNull()` là `true`; `status` là `"ACTIVE"`; GET trả 200 với `phone` là JSON `null`.

### TC-63: PUT /api/customers/{id} bỏ qua status và id trong body
- covers: AC-3
- side: be
- level: integration
- type: functional
- priority: high
- objective: `id` chỉ lấy từ path; field lạ trong body (`status`, `id`) bị bỏ qua (D1, D3), nên trạng thái không đổi qua endpoint sửa.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`).
- test data: `PUT /api/customers/1`, body `{"id":99,"name":"Nguyen Van Anh","email":"anh@example.com","phone":"0987654321","status":"INACTIVE"}`.
- steps: Given khách hàng 1 đang `ACTIVE` / When `PUT /api/customers/1` rồi `GET /api/customers/1`, `GET /api/customers/99` và `GET /api/customers` / Then kiểm tra các response.
- expected result:
  - PUT trả 200; `id` là 1; `status` là `"ACTIVE"`; `name` là `"Nguyen Van Anh"`
  - `GET /api/customers/1` trả `status` là `"ACTIVE"`, `phone` là `"0987654321"`
  - `GET /api/customers/99` trả 404
  - `GET /api/customers` vẫn có 1 phần tử

### TC-64: PUT /api/customers/{id} với dữ liệu không hợp lệ trả 400 Problem kèm errors
- covers: AC-4
- side: be
- level: integration
- type: negative
- priority: high
- objective: `ValidationException` của `update` được map sang RFC 9457 Problem 400 với `errors` đúng các trường sai, thông điệp như `POST`; khách hàng không đổi gì.
- preconditions: server đang chạy với seed id 1; chụp body của `GET /api/customers`.
- test data: (body của `PUT /api/customers/1` → `errors`)
  - `{"email":"an@example.com"}` (thiếu `name`) → `{"name": "must not be blank"}`
  - `{"name":"Nguyen Van An"}` (thiếu `email`) → `{"email": "must be a valid email address"}`
  - `{"name":"Nguyen Van An","email":"an@example.com","phone":"0412345678"}` → `{"phone": "must be a valid phone number"}`
  - `{"name":"","email":"x","phone":"0412345678"}` → `{"name": "must not be blank", "email": "must be a valid email address", "phone": "must be a valid phone number"}`
- steps: Given server đang chạy / When `PUT /api/customers/1` với từng body rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Validation failed"`; `errors` có đúng số key của dòng dữ liệu và từng thông điệp khớp; body của `GET /api/customers` bằng đúng body đã chụp.

### TC-65: PUT /api/customers/{id} với email hoặc số của khách hàng khác trả 400 Problem
- covers: AC-5, AC-6
- side: be
- level: integration
- type: negative
- priority: high
- objective: lỗi trùng khi sửa đi qua HTTP với thông điệp `is already used by another customer` ở đúng trường; khách hàng không đổi gì.
- preconditions: server đang chạy với seed id 1 `("Nguyen Van An", "an@example.com", null)`; đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201 (id 2); chụp body của `GET /api/customers`.
- test data: (body của `PUT /api/customers/1` → `errors`)
  - `{"name":"Nguyen Van An","email":"BINH@Example.com"}` → `{"email": "is already used by another customer"}`
  - `{"name":"Nguyen Van An","email":"an@example.com","phone":"+84 912 345 678"}` → `{"phone": "is already used by another customer"}`
- steps: Given khách hàng 2 `ACTIVE` đang dùng `binh@example.com` và `0912345678` / When `PUT /api/customers/1` với từng body rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `errors` có đúng 1 key với thông điệp của dòng dữ liệu; body của `GET /api/customers` bằng đúng body đã chụp (2 phần tử).

### TC-66: PUT /api/customers/{id} giữ email và số của chính mình trả 200
- covers: AC-7
- side: be
- level: integration
- type: functional
- priority: high
- objective: handler truyền `id` của path xuống kiểm tra trùng: email và số của chính khách hàng đang sửa, viết khác hoa thường và khác định dạng, không bị báo trùng.
- preconditions: server đang chạy với seed id 1 (không có số); đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201 (id 2).
- test data: `PUT /api/customers/2`, body `{"name":"Tran Thi Binh An","email":"BINH@Example.com","phone":"+84 912 345 678"}`.
- steps: Given khách hàng 2 có `binh@example.com` và `0912345678` / When `PUT /api/customers/2` rồi `GET /api/customers/2` / Then kiểm tra cả hai response.
- expected result: PUT trả 200; `id` là 2, `name` là `"Tran Thi Binh An"`, `email` là `"BINH@Example.com"`, `phone` là `"0912345678"`; GET trả đúng các giá trị đó.

### TC-67: PUT /api/customers/{id} với id không tồn tại trả 404 Problem, kể cả khi dữ liệu không hợp lệ
- covers: AC-9
- side: be
- level: integration
- type: negative
- priority: high
- objective: D2 bước 3: `NotFoundException` của `update` được map sang 404 như `GET /api/customers/{id}`, trước validation; không tạo mới, không sửa ai.
- preconditions: server đang chạy với seed id 1; chụp body của `GET /api/customers`.
- test data: (body của `PUT /api/customers/999`)
  - `{"name":"Nguyen Van Anh","email":"anh@example.com","phone":"0987654321"}` (hợp lệ)
  - `{"name":"","email":"x","phone":"0412345678"}` (cả ba trường sai)
- steps: Given không có khách hàng 999 / When `PUT /api/customers/999` với từng body rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 404; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Not Found"`; `detail` là `"Customer 999 not found"`; `body.has("errors")` là `false`; body của `GET /api/customers` bằng đúng body đã chụp (1 phần tử).

### TC-68: PUT /api/customers/{id} với body không phải JSON hợp lệ trả 400 Malformed JSON
- covers: AC-4, AC-9
- side: be
- level: integration
- type: negative
- priority: medium
- objective: D2 bước 2: handler đọc body trước khi gọi service, nên JSON hỏng trả 400 `Malformed JSON` kể cả khi `id` không tồn tại; không ghi gì.
- preconditions: server đang chạy với seed id 1; chụp body của `GET /api/customers`.
- test data: (path) `/1`, `/999`; body là chuỗi `{"name":` (JSON bị cắt).
- steps: Given server đang chạy / When `PUT /api/customers` + path với body hỏng rồi `GET /api/customers` / Then kiểm tra response.
- expected result: cả hai dòng trả status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Malformed JSON"`; `detail` là `"The request body is not valid JSON"`; `body.has("errors")` là `false`; body của `GET /api/customers` bằng đúng body đã chụp.

### TC-69: PUT trên path không khớp route trả 404 fallback
- covers: AC-9
- side: be
- level: integration
- type: negative
- priority: low
- objective: D2 bước 1: chỉ `PUT /api/customers/{id}` với `id` gồm toàn chữ số là route sửa. `PUT /api/customers` và `id` không phải chuỗi chữ số vẫn rơi vào fallback như hiện nay; không tạo mới, không sửa ai.
- preconditions: server đang chạy với seed id 1; chụp body của `GET /api/customers`.
- test data: (path sau `/api/customers` → `detail`); body `{"name":"Nguyen Van Anh","email":"anh@example.com","phone":"0987654321"}`
  - `""` → `"No route for PUT /api/customers"`
  - `"/abc"` → `"No route for PUT /api/customers/abc"`
  - `"/-1"` → `"No route for PUT /api/customers/-1"`
- steps: Given server đang chạy / When `PUT` tới từng path rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 404; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Not Found"`; `detail` như dòng dữ liệu; body của `GET /api/customers` bằng đúng body đã chụp.

### TC-70: updateCustomer gửi PUT /api/customers/{id} với nguyên giá trị nhân viên nhập
- covers: AC-10
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8: `updateCustomer(id, customer, options)` gửi đúng một request `PUT` tới path của `id`, body JSON là đúng object nhận vào (không thêm `id`, không chuẩn hoá, không kiểm tra), và trả khách hàng mà API trả.
- preconditions: `apiCustomer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }`; mỗi dòng dùng mảng `calls` mới và `fakeFetch(200, apiCustomer, calls)` truyền qua `{ fetchImpl }`.
- test data: (id, input)
  - `7`, `{ name: 'Nguyen Van An', email: 'an@example.com', phone: '0912 345 678' }`
  - `'7'`, `{ name: 'Nguyen Van An', email: 'an@example.com', phone: '' }` (`id` dạng chuỗi như `form.dataset.id`)
- steps: Given `fakeFetch` ghi lại request / When gọi `updateCustomer(id, input, { fetchImpl })` / Then đọc `calls` và giá trị trả về.
- expected result:
  - `calls.length` là 1
  - `calls[0].url` là `'/api/customers/7'`; `calls[0].init.method` là `'PUT'`
  - `calls[0].init.headers['Content-Type']` là `'application/json'`
  - `JSON.parse(calls[0].init.body)` bằng đúng input (`deepEqual`): không có key `id`, `phone` là `'0912 345 678'` ở dòng 1 và `''` ở dòng 2
  - giá trị trả về bằng `apiCustomer` (`deepEqual`)

### TC-71: updateCustomer ném ApiError mang status và fieldErrors của API
- covers: AC-11
- side: fe
- level: unit
- type: negative
- priority: high
- objective: response non-2xx của `PUT` đi qua `request()` thành `ApiError`: lỗi theo trường nằm trong `fieldErrors`; Problem không có `errors` cho `fieldErrors` rỗng.
- preconditions: `fakeFetch(status, problem)` truyền qua `{ fetchImpl }`.
- test data: (status, problem → `fieldErrors`)
  - `400`, `{ type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { name: 'must not be blank', email: 'must be a valid email address', phone: 'must be a valid phone number' } }` → đúng object `errors` đó
  - `404`, `{ type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' }` → `{}`
- steps: Given API trả Problem / When gọi `updateCustomer(7, { name: '', email: 'x', phone: '0412345678' }, { fetchImpl })` / Then `assert.rejects`.
- expected result: promise bị reject với `error instanceof ApiError`; `error.status` bằng status của dòng dữ liệu; `error.fieldErrors` bằng giá trị mong đợi (`deepEqual`: đủ ba key với đúng thông điệp ở dòng 1, object rỗng ở dòng 2).

### TC-72: getCustomer gọi GET /api/customers/{id} và trả khách hàng
- covers: AC-13
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8, D11: `getCustomer(id, options)` lấy giá trị hiện tại của khách hàng để điền form sửa, qua `request()` có sẵn, không gửi body.
- preconditions: mỗi dòng dùng mảng `calls` mới và `fakeFetch(200, body, calls)` truyền qua `{ fetchImpl }`.
- test data: (id, body API trả)
  - `7`, `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }`
  - `'7'`, `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'INACTIVE' }`
- steps: Given `fakeFetch` ghi lại request / When gọi `getCustomer(id, { fetchImpl })` / Then đọc `calls` và giá trị trả về.
- expected result: `calls.length` là 1; `calls[0].url` là `'/api/customers/7'`; `calls[0].init.method` là `undefined`; `calls[0].init.headers['Content-Type']` là `undefined`; giá trị trả về bằng body của dòng dữ liệu (`deepEqual`, `phone` giữ dạng API trả).

### TC-73: getCustomer ném ApiError khi API trả lỗi
- covers: AC-13
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: khi không lấy được khách hàng, `getCustomer` ném `ApiError` để `main.js` báo "Không tải được khách hàng." và không dựng form với dữ liệu sai (D12).
- preconditions: `fakeFetch(status, problem)` truyền qua `{ fetchImpl }`.
- test data: (status, problem)
  - `404`, `{ type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' }`
  - `500`, `{ type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' }`
- steps: Given API trả Problem / When gọi `getCustomer(7, { fetchImpl })` / Then `assert.rejects`.
- expected result: promise bị reject với `error instanceof ApiError`; `error.status` bằng status của dòng dữ liệu; `error.fieldErrors` là object rỗng (`deepEqual` với `{}`).

### TC-74: renderCustomerTable thêm cột Thao tác với một nút Sửa mang id ở mỗi dòng
- covers: AC-12
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D9: cột thứ sáu "Thao tác", mỗi dòng đúng một nút "Sửa" mang `id` của khách hàng ở dòng đó (kể cả khách hàng `INACTIVE`); năm cột hiện có giữ nguyên nội dung và thứ tự; không thêm `<tr>`.
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }`
  - `{ id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: null, status: 'INACTIVE' }`
- steps: Given danh sách hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result:
  - khớp `<thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>`
  - khớp `<tr><td>1</td><td>Nguyen Van An</td><td>an@example.com</td><td>0912 345 678</td><td>Đang hoạt động</td><td><button type="button" data-edit-id="1">Sửa</button></td></tr>`
  - khớp `<tr><td>2</td><td>Tran Thi Binh</td><td>binh@example.com</td><td>—</td><td>Ngừng hoạt động</td><td><button type="button" data-edit-id="2">Sửa</button></td></tr>`
  - `<tbody>` có đúng 2 dòng; mỗi dòng có đúng 6 `<td>` và đúng 1 `data-edit-id=`
  - `html.match(/<tr>/g).length` là 3 (tiêu đề + hai dòng)

### TC-75: renderCustomerTable escape HTML id trong data-edit-id
- covers: AC-12
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: R6: `id` đặt trong thuộc tính `data-edit-id` đi qua `escapeHtml`, không thoát khỏi thuộc tính.
- preconditions: không có.
- test data: `{ id: '7"><b>x</b>', name: 'A', email: 'a@example.com', phone: null, status: 'ACTIVE' }`.
- steps: Given một khách hàng có `id` chứa ký tự HTML / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: khớp `data-edit-id="7&quot;&gt;&lt;b&gt;x&lt;/b&gt;"`; không khớp `/<b>x<\/b>/`.

### TC-76: renderCustomerEditForm điền sẵn họ tên, email và số điện thoại hiện tại
- covers: AC-13
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D10: form sửa có ba ô nhập mang sẵn giá trị hiện tại của khách hàng; số điện thoại ở dạng API trả, không qua `formatPhone`; `data-id` và tiêu đề mang `id`; không có lỗi nào khi không truyền `fieldErrors`.
- preconditions: không có.
- test data: `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }` (object `GET /api/customers/7` trả).
- steps: Given khách hàng 7 / When gọi `renderCustomerEditForm(customer)` (một tham số) / Then so chuỗi HTML.
- expected result:
  - khớp `<h2>Sửa khách hàng #7</h2>` và `<form id="edit-form" data-id="7" novalidate>`
  - khớp `<label for="edit-name">Họ tên</label><input id="edit-name" name="name" type="text" value="Nguyen Van An"></div>`
  - khớp `<label for="edit-email">Email</label><input id="edit-email" name="email" type="email" value="an@example.com"></div>`
  - khớp `<label for="edit-phone">Điện thoại</label><input id="edit-phone" name="phone" type="tel" value="0912345678"></div>`
  - khớp `<button type="submit">Lưu</button>` và `<button type="button" data-cancel-edit>Huỷ</button>`
  - có đúng 3 `<input`; không khớp `0912 345 678`, `name="status"`, `aria-invalid`, `class="error"`

### TC-77: renderCustomerEditForm để ô điện thoại rỗng khi khách hàng không có số
- covers: AC-13
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: `phone` là `null`, thiếu field hoặc `''` cho ô điện thoại rỗng, không dùng `NO_PHONE` của bảng. Form không có sẵn số thì lưu sẽ xoá số (AC-2), nên giá trị này phải đúng.
- preconditions: không có.
- test data: (customer)
  - `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: null }`
  - `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com' }` (thiếu field)
  - `{ id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '' }`
- steps: Given từng khách hàng / When gọi `renderCustomerEditForm(customer)` / Then so chuỗi HTML.
- expected result: mọi dòng khớp `<input id="edit-phone" name="phone" type="tel" value="">`; không khớp `value="—"`, `value="null"`, `value="undefined"`.

### TC-78: renderCustomerEditForm escape HTML mọi giá trị điền sẵn
- covers: AC-13
- side: fe
- level: unit
- type: negative
- priority: high
- objective: R6: giá trị đặt trong thuộc tính `value`, `data-id` và trong tiêu đề đi qua `escapeHtml` (escape cả `"` và `'`); không sinh thẻ và không thoát khỏi thuộc tính.
- preconditions: không có.
- test data: một khách hàng `{ id: '7" onsubmit="x', name: '"><b>x</b>', email: "a'b&c@example.com", phone: '"><script>alert(1)</script>' }`.
- steps: Given khách hàng có ký tự HTML ở mọi field / When gọi `renderCustomerEditForm(customer)` / Then so chuỗi HTML.
- expected result:
  - khớp `name="name" type="text" value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;">`
  - khớp `name="email" type="email" value="a&#39;b&amp;c@example.com">`
  - khớp `name="phone" type="tel" value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">`
  - khớp `data-id="7&quot; onsubmit=&quot;x"` và `Sửa khách hàng #7&quot; onsubmit=&quot;x</h2>`
  - không khớp `/<b>x<\/b>/`, `/<script>/`, `/ onsubmit="x"/`

### TC-79: renderCustomerEditForm hiện thông điệp lỗi ngay tại trường có lỗi
- covers: AC-14
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D10: mỗi key `name`/`email`/`phone` của `fieldErrors` sinh một phần tử lỗi ngay sau ô nhập của trường đó, gắn bằng `aria-invalid` và `aria-describedby`; trường không có lỗi không có gì thêm; form giữ giá trị nhân viên vừa nhập.
- preconditions: `customer = { id: 7, name: '', email: 'an@example.com', phone: '0412345678' }` (giá trị nhân viên vừa nhập, D12).
- test data: (`fieldErrors`), bảng quyết định trường nào có lỗi
  - `{ name: 'must not be blank', phone: 'must be a valid phone number' }` (ví dụ của AC-14)
  - `{ email: 'is already used by another customer' }`
  - `{ name: 'must not be blank', email: 'must be a valid email address', phone: 'must be a valid phone number' }`
- steps: Given `customer` và từng `fieldErrors` / When gọi `renderCustomerEditForm(customer, fieldErrors)` / Then so chuỗi HTML cho từng trường `name`, `email`, `phone`.
- expected result: với `type` là `text`/`email`/`tel` và `value` là `""`/`"an@example.com"`/`"0412345678"` theo trường:
  - trường **có** trong `fieldErrors`: khớp `<input id="edit-{field}" name="{field}" type="{type}" value="{value}" aria-invalid="true" aria-describedby="edit-{field}-error"><span id="edit-{field}-error" class="error" role="alert">{thông điệp}</span>`
  - trường **không có** trong `fieldErrors`: khớp `<input id="edit-{field}" name="{field}" type="{type}" value="{value}"></div>`; không khớp `edit-{field}-error`
  - số lần xuất hiện của `class="error"` và của `aria-invalid="true"` đều bằng số key của `fieldErrors` (2, 1, 3)
  - ví dụ dòng 1: khớp `<input id="edit-name" name="name" type="text" value="" aria-invalid="true" aria-describedby="edit-name-error"><span id="edit-name-error" class="error" role="alert">must not be blank</span>` và `<input id="edit-email" name="email" type="email" value="an@example.com"></div>`

### TC-80: renderCustomerEditForm escape HTML thông điệp lỗi
- covers: AC-14
- side: fe
- level: unit
- type: negative
- priority: high
- objective: thông điệp lỗi là dữ liệu từ API, phải đi qua `escapeHtml` trước khi đặt vào HTML.
- preconditions: `customer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678' }`.
- test data: `fieldErrors = { name: '<img src=x onerror=alert(1)>', email: 'a "quoted" & <b>bold</b> message' }`.
- steps: Given `fieldErrors` chứa ký tự HTML / When gọi `renderCustomerEditForm(customer, fieldErrors)` / Then so chuỗi HTML.
- expected result:
  - khớp `<span id="edit-name-error" class="error" role="alert">&lt;img src=x onerror=alert(1)&gt;</span>`
  - khớp `<span id="edit-email-error" class="error" role="alert">a &quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt; message</span>`
  - không khớp `/<img/`, `/<b>bold<\/b>/`

### TC-81: renderCustomerEditForm bỏ qua key lạ trong fieldErrors
- covers: AC-14
- side: fe
- level: unit
- type: boundary
- priority: medium
- objective: D10: chỉ `name`, `email`, `phone` có chỗ hiển thị; key khác trong `fieldErrors` không sinh phần tử lỗi và không làm hỏng form.
- preconditions: `customer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678' }`.
- test data: (`fieldErrors` → số phần tử lỗi)
  - `{ status: 'must not change', id: 'is read-only' }` → 0
  - `{ status: 'must not change', name: 'must not be blank' }` → 1 (chỉ `edit-name-error`)
- steps: Given từng `fieldErrors` / When gọi `renderCustomerEditForm(customer, fieldErrors)` / Then so chuỗi HTML.
- expected result:
  - dòng 1: kết quả bằng đúng `renderCustomerEditForm(customer)`; không khớp `class="error"`, `aria-invalid`
  - dòng 2: `class="error"` xuất hiện đúng 1 lần, khớp `<span id="edit-name-error" class="error" role="alert">must not be blank</span>`
  - cả hai dòng: không khớp `must not change`, `is read-only`, `edit-status-error`, `edit-id-error`

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-44, TC-48, TC-49, TC-61 |
| AC-2 | TC-44, TC-50, TC-62 |
| AC-3 | TC-44, TC-51, TC-63 |
| AC-4 | TC-49, TC-52, TC-53, TC-54, TC-64, TC-68 |
| AC-5 | TC-46, TC-55, TC-65 |
| AC-6 | TC-47, TC-56, TC-57, TC-65 |
| AC-7 | TC-46, TC-47, TC-58, TC-66 |
| AC-8 | TC-47, TC-59 |
| AC-9 | TC-45, TC-60, TC-67, TC-68, TC-69 |
| AC-10 | TC-70 |
| AC-11 | TC-71 |
| AC-12 | TC-74, TC-75 |
| AC-13 | TC-72, TC-73, TC-76, TC-77, TC-78 |
| AC-14 | TC-79, TC-80, TC-81 |
