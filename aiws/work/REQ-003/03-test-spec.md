# REQ-003 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-10 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D11) và `api-contract.yaml`. Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB hay dịch vụ ngoài.

**Mức test và framework** (theo `aiws/knowledge/conventions.md` → Test):
- BE, `unit`: JUnit Jupiter (`source-be/pom.xml`). Bảng dữ liệu dùng `@ParameterizedTest` + `@MethodSource` (hoặc `@ValueSource`, thêm `@NullSource` khi cần ca `null`); mã TC gắn một lần ở `@DisplayName`. Tên từng lần chạy theo cách của từng class (`ROW_NAME` trong `CustomerServiceTest`, `name = "[{index}]"` trong `CustomerHandlerTest`, tên mặc định trong `InMemoryCustomerRepositoryTest`).
  - Repository test tạo `InMemoryCustomerRepository` ngay trong từng test.
  - Service test dùng `InMemoryCustomerRepository` thật của `@BeforeEach`, không mock framework.
- BE, `integration`: `CustomerHandlerTest` khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, gọi bằng `java.net.http.HttpClient`. Chạy trong `be_test`, không cần môi trường ngoài. Dùng nguyên helper có sẵn `get(path)`, `post(json)`, `put(path, json)`, `customers()`, `errorsOf(body)`; **không cần helper mới** (`path` tính từ `/api/customers`, ví dụ `put("/2/status", ...)`).
- FE, `unit`: `node:test` + `node:assert/strict`. HTTP giả bằng `fakeFetch(status, body, calls)` có sẵn trong `source-fe/test/customerApi.test.js`. Component kiểm bằng so chuỗi HTML (`assert.match`/`assert.doesNotMatch`). Bảng dữ liệu là một mảng, lặp bằng `for...of` trong **một** `test(...)`.

**Đánh số TC**: đánh số **tiếp** từ TC-82 đến TC-107 (`aiws/knowledge/conventions.md` → Test → Mã TC; `02-design.md` → Quyết định cần duyệt). REQ-003 thêm test vào chính các file đang mang TC-11..TC-75, nên không bắt đầu lại từ TC-1.
- **TC-74 của REQ-002 không được định nghĩa lại ở đây** (D9). Nó được sửa đúng hai regex khớp nguyên dòng trong nhóm FE-2, cùng task với `source-fe/src/components/customerTable.js`, và giữ nguyên mã, tên hiển thị. Kỳ vọng mới của REQ-003 về nút đổi trạng thái thuộc TC-103..TC-105.
- Mọi test cũ khác (có hay không có mã TC) không sửa và phải pass. Hồi quy của bốn endpoint cũ do các test cũ giữ: TC-63 (`PUT /api/customers/{id}` vẫn bỏ qua `status`), TC-51, TC-54, TC-61..TC-69.

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương:
  - Trạng thái đích: `ACTIVE` / `INACTIVE` (hợp lệ) / không có giá trị (thiếu field, `null`, `""`, chỉ dấu cách) / giá trị lạ (`"DELETED"`) / gần đúng (sai hoa thường, thừa dấu cách).
  - `id`: có khách hàng / không có khách hàng / không khớp route.
  - Số điện thoại của khách hàng đang đổi trạng thái: không có số (`null`) / số hợp lệ / số theo quy tắc cũ (`01234567890`).
  - Lỗi ở FE: `ApiError` có `fieldErrors.phone` / `ApiError` không có `fieldErrors.phone` / lỗi không phải `ApiError` / không có lỗi (`null`, `undefined`).
  - `status` khi render bảng: `ACTIVE` / `INACTIVE` / ngoài hai giá trị đã biết.
- Giá trị biên: `id` bằng `0` và bằng giá trị kế tiếp của bộ đếm (TC-83, TC-96); trạng thái đích khớp **chính xác** so với lệch một ký tự hoa thường hoặc một dấu cách (TC-89, TC-97).
- Chuyển trạng thái của một khách hàng A (D2, D5):

  | Trạng thái hiện tại | Yêu cầu | Điều kiện | Trạng thái sau | Kết quả | TC |
  | --- | --- | --- | --- | --- | --- |
  | `ACTIVE` | → `INACTIVE` | không có | `INACTIVE` | 200 | TC-82, TC-84, TC-90, TC-91 |
  | `INACTIVE` | → `ACTIVE` | A không có số, hoặc không khách hàng `ACTIVE` khác nào có số của A | `ACTIVE` | 200 | TC-82, TC-85, TC-90, TC-92, TC-94 |
  | `INACTIVE` | → `ACTIVE` | một khách hàng `ACTIVE` khác có số của A | `INACTIVE` | 400 `errors.phone` | TC-86, TC-93 |
  | `ACTIVE` | → `ACTIVE` | không có (không kiểm tra trùng) | `ACTIVE` | 200, không đổi gì | TC-87, TC-95 |
  | `INACTIVE` | → `INACTIVE` | không có (không kiểm tra trùng) | `INACTIVE` | 200, không đổi gì | TC-87, TC-95 |
  | bất kỳ | → giá trị không hợp lệ | — | như cũ | 400 `errors.status` | TC-89, TC-97 |
  | (không có khách hàng) | bất kỳ | — | — | 404 | TC-83, TC-88, TC-96 |

  Chuỗi nhiều bước: `ACTIVE` → `INACTIVE` → `ACTIVE` trả về đúng khách hàng ban đầu (TC-90, TC-92); bị chặn → gỡ xung đột → kích hoạt lại được (TC-94).
- Bảng quyết định cho kiểm tra trùng khi kích hoạt lại (D5, BR-09):

  | Số của A | Ai khác đang có số đó | Trạng thái người đó | Kết quả | TC |
  | --- | --- | --- | --- | --- |
  | `null` | (khách hàng khác cũng `null`) | `ACTIVE` | 200 | TC-85, TC-92 |
  | có | không ai | — | 200 | TC-85, TC-92, TC-94 |
  | có | khách hàng khác | `INACTIVE` | 200 | TC-85, TC-94 |
  | có | khách hàng khác | `ACTIVE` | 400 `errors.phone` | TC-86, TC-93 |
  | số theo quy tắc cũ | không ai / khách hàng `ACTIVE` khác | — / `ACTIVE` | 200 / 400 `errors.phone` (chỉ kiểm tra trùng, không kiểm tra định dạng) | TC-85 / TC-86 |

- Bảng quyết định cho thứ tự lỗi (D2): `id` không tồn tại × trạng thái đích không hợp lệ × JSON hỏng → TC-88, TC-96 (404 trước 400 `errors.status`), TC-98 (`Malformed JSON` trước 404).
- Đoán lỗi (error guessing) cho các cách hiện thực sai mà design đã cảnh báo:
  - `updateStatus` đi qua `check` hoặc `PhoneNumbers`, làm khách hàng có số theo quy tắc cũ không đổi trạng thái được (D5, R1): dòng `01234567890` của TC-84, TC-85, TC-90.
  - Truyền `phone = null` xuống `existsByPhoneAndStatusAndIdNot`, gây `NullPointerException` → 500 (D5): dòng không có số của TC-85, TC-90, TC-92.
  - Field `status` kiểu enum, làm giá trị lạ thành `Malformed JSON` (D4): TC-97.
  - `CustomerStatus.valueOf(null)` ném `NullPointerException` → 500 (D5): dòng `null`/thiếu field của TC-89, TC-97.
  - Trim hoặc không phân biệt hoa thường khi đọc trạng thái đích (D4): TC-89, TC-97.
  - Kiểm tra trùng số trước bước "đã ở đúng trạng thái", hoặc kiểm tra trùng cả ở chiều ngừng hoạt động (D2): dòng trùng số của TC-84, TC-87, TC-95.
  - Kiểm tra trạng thái đích trước khi tìm khách hàng (D2): TC-88, TC-96.
  - `updateStatus` của repository kiểu upsert, hoặc chép `name`/`email`/`phone` từ nơi khác (D6): TC-82, TC-83.
  - Nới `BY_ID` làm hỏng định tuyến (D7): TC-99, TC-100 và các test cũ của `GET`/`PUT /api/customers/{id}`.
  - Quên `escapeHtml` cho `id` trong `data-status-id`; thừa dấu cách khi không có nút đổi trạng thái (D9, R7): TC-104, TC-105.
  - `describeStatusError` dùng `instanceof ApiError`, hoặc ném lỗi khi nhận `null` (D10): TC-106, TC-107.

**Dữ liệu chung**:
- **Seed** (BE): một khách hàng `ACTIVE` **không có số**, **khác** khách hàng đang đổi trạng thái, có mặt trong mọi test service và HTTP đi tới kiểm tra trùng số. Truy vấn trùng phải duyệt qua một bản ghi `phone = null` mà không lỗi.
  - Service test: `repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE)`, chèn đầu tiên (id 1). Helper có sẵn `insertSeedAndAn()` cho kho gồm Seed (id 1) và `("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` (id 2).
  - HTTP test: seed có sẵn của `@BeforeEach`, id 1 `("Nguyen Van An", "an@example.com", null)`, `ACTIVE`.
- Service test dựng trạng thái mà API không tạo ra được bằng `repository.insert(...)` trên repository của `@BeforeEach`: khách hàng `INACTIVE` có sẵn, số theo quy tắc cũ `01234567890`, hai khách hàng `ACTIVE` trùng số. Thứ tự `insert` trong `preconditions` quyết định `id`.
- HTTP test dựng khách hàng `INACTIVE` **qua chính endpoint mới** (`PUT /api/customers/{id}/status`), nên kịch bản đầu-cuối của AC-3 chạy được ở `CustomerHandlerTest`. Hai khách hàng `ACTIVE` trùng số và số theo quy tắc cũ không dựng được qua HTTP; các biến thể đó chỉ kiểm ở service.
- "Lưu" = giá trị trong kết quả `updateStatus`/response 200 **và** trong lần đọc lại (`service.get(id)`/`GET`).
- "Không đổi gì" = danh sách sau yêu cầu bằng đúng danh sách chụp trước yêu cầu:
  - service: `service.list()` (so `List<Customer>` bằng `assertEquals`)
  - repository: `findAll()`
  - HTTP: `customers()` (so `JsonNode`)
- "Không ghi" ở nhánh đã đúng trạng thái (D5) không quan sát được với repository thật. Test chỉ khẳng định điều quan sát được: không có exception, kết quả bằng bản ghi đang lưu, danh sách không đổi.
- Lỗi validation được so **cả map** `errors` (đúng một key, đúng thông điệp).
- Mỗi dòng dữ liệu chạy trên kho mới.

**TC sinh từ design, không có AC riêng**: được truy vết tới AC gần nhất.
- Thao tác ghi mới của repository (D6): TC-82 (AC-1, AC-2), TC-83 (AC-5).
- Thứ tự xử lý D2 bước 1 và 2 (route fallback, `Malformed JSON`): TC-98, TC-99, TC-100. Truy vết tới AC-6 (bị từ chối bằng Problem, không đổi gì) và AC-5 (chỉ đổi trạng thái của khách hàng đã có; không tạo mới, không đổi ai).
- Field khác trong body bị bỏ qua, `id` chỉ lấy từ path (D1): một dòng của TC-91.
- Khách hàng có `status` ngoài hai giá trị đã biết không có nút đổi trạng thái (D9, Q4): TC-105, truy vết tới AC-9.
- `errors.status` đi qua `ApiError` và nhận thông báo chung (D4, D10): một dòng của TC-102 và của TC-107.

**Không có đường "không có quyền"**: hệ thống chưa có đăng nhập hay phân quyền (`01-analysis.md` → Ngoài phạm vi; `02-design.md` R5), nên không có TC 401/403.

**Không đặt kỳ vọng** (không TC nào dùng các đầu vào này):
- R11: `id` vượt `long` (20 chữ số), body là JSON `null`, `status` là JSON không phải chuỗi (số, boolean, object, mảng). Hành vi kế thừa từ handler hiện có hoặc do Jackson quyết định; design không quy định.
- Body rỗng (0 byte): design không nêu.
- Số đang lưu ở dạng chưa chuẩn hoá (vd. `+84 912 345 678`): D5 yêu cầu so nguyên văn, nhưng `01-analysis.md` chỉ định nghĩa dữ liệu theo quy tắc cũ là số đã chuẩn hoá không còn hợp lệ. [CẦN XÁC NHẬN] nếu người duyệt muốn chốt ca này thì thêm một dòng vào TC-85.
- `fieldErrors.phone` là chuỗi rỗng hoặc `null` trong `describeStatusError`: D10 chỉ nói "có giá trị"; API không trả hai giá trị này.
- `status` của khách hàng trùng tên thuộc tính kế thừa của object (vd. `'constructor'`) khi render bảng: API chỉ trả `ACTIVE`/`INACTIVE`. [CẦN XÁC NHẬN] nếu cần chặt hơn thì hằng trạng thái đích của D9 phải được tra bằng `Object.hasOwn`.
- Thao tác đồng thời (Q6, R2): chấp nhận như hiện trạng, không có TC.

**Không có TC tự động**: `source-fe/index.html` và `source-fe/src/main.js` (D11), vì `node:test` không có DOM. Kiểm bằng review hoặc chạy tay:
- Bấm "Ngừng hoạt động" ở một dòng `ACTIVE`: danh sách tải lại; dòng đó hiện "Ngừng hoạt động" ở ô trạng thái và nút "Kích hoạt lại"; họ tên, email, số điện thoại không đổi.
- Bấm "Kích hoạt lại" ở một dòng `INACTIVE` không bị trùng số: danh sách tải lại; dòng đó hiện "Đang hoạt động" và nút "Ngừng hoạt động".
- Bấm "Kích hoạt lại" khi số đang được khách hàng `ACTIVE` khác dùng: `#message` hiện "Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng."; dòng không đổi; danh sách **không** tải lại.
- Lỗi khác (BE tắt, 404, 500): `#message` hiện "Không đổi được trạng thái khách hàng."; danh sách đang xem còn nguyên.
- Mỗi lần bấm nút đổi trạng thái xoá `#message` trước khi gọi API. Không có hộp thoại xác nhận.
- Nút "Sửa", form sửa đang mở và form thêm khách hàng hoạt động như trước.

**Kỳ vọng phụ thuộc quyết định đang chờ duyệt** (`02-design.md` → Quyết định cần duyệt). Nếu người duyệt chọn khác, các TC sau phải đổi theo:
- Endpoint `PUT /api/customers/{id}/status`, body `{"status": ...}`, trả 200 kèm `Customer` (Q1, D1): TC-91..TC-101.
- Thứ tự lỗi: JSON hỏng → 404 → 400 `errors.status` (D2): TC-88, TC-96, TC-98.
- Trùng số trả 400 với `errors.phone` chứ không phải 409 (Q2, D3): TC-86, TC-93, TC-102, TC-106.
- Trạng thái đích so khớp chính xác, thông điệp `must be ACTIVE or INACTIVE` (D4): TC-89, TC-97, dòng `errors.status` của TC-102.
- Không kiểm tra lại họ tên, email, định dạng số; số theo quy tắc cũ vẫn đổi trạng thái được (Q3, D5): dòng `01234567890` của TC-84, TC-85, TC-86, TC-90.
- Đặt lại đúng trạng thái đang có được xét trước kiểm tra trùng số (AC-4, D5): TC-87, TC-95.
- Vị trí nút, thứ tự thuộc tính, nhãn "Ngừng hoạt động" / "Kích hoạt lại", không có nút cho trạng thái lạ (Q4, D9): TC-103..TC-105 (và hai regex của TC-74).
- Lời văn hai câu thông báo (Q4, D10): TC-106, TC-107.

**Gắn mã TC trong code**:
- BE: `@DisplayName("TC-n: ...")` ở mức method, kể cả `@ParameterizedTest`. Tên method camelCase, không chứa mã TC.
- FE: `test('TC-n: <tên hàm> ...', ...)`.

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test:

| TC | File test | Nhóm |
| --- | --- | --- |
| TC-82, TC-83 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | BE-1 |
| TC-84..TC-90 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | BE-2 |
| TC-91..TC-100 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-3 |
| TC-101, TC-102 | `source-fe/test/customerApi.test.js` | FE-1 |
| TC-103..TC-105 | `source-fe/test/customerTable.test.js` (cùng task với việc sửa TC-74) | FE-2 |
| TC-106, TC-107 | `source-fe/test/describeStatusError.test.js` (mới) | FE-3 |

## Test cases

### TC-82: InMemoryCustomerRepository.updateStatus chỉ đổi status, giữ nguyên id, họ tên, email và số
- covers: AC-1, AC-2
- side: be
- level: unit
- type: functional
- priority: high
- objective: D6: `updateStatus` thay đúng `status` của khách hàng `id` theo cả hai chiều, giữ `id`, `name`, `email`, `phone` đang lưu (kể cả `phone = null`), không thêm phần tử và không đụng tới khách hàng khác. Repository không quyết định nghiệp vụ: ghi `ACTIVE` cả khi một khách hàng `ACTIVE` khác có cùng số.
- preconditions: `InMemoryCustomerRepository` mới, `insert` theo thứ tự:
  1. `("Other", "other@example.com", "0912345678", ACTIVE)` → id 1
  2. `("Nguyen Van An", "an@example.com", phone, current)` → id 2
- test data: (current, phone, target)
  - `ACTIVE`, `"0912345678"`, `INACTIVE`
  - `INACTIVE`, `"0912345678"`, `ACTIVE` (Other `ACTIVE` có cùng số; repository vẫn ghi)
  - `ACTIVE`, `null`, `INACTIVE`
  - `INACTIVE`, `null`, `ACTIVE`
  - `INACTIVE`, `"01234567890"`, `ACTIVE` (số theo quy tắc cũ)
  - `ACTIVE`, `"0912345678"`, `ACTIVE` (ghi lại đúng giá trị đang có)
- steps: Given kho có hai khách hàng như trên / When gọi `repository.updateStatus(2, target)` / Then kiểm tra giá trị trả về, `findById(2)` và `findAll()`.
- expected result:
  - trả `Optional.of(new Customer(2, "Nguyen Van An", "an@example.com", phone, target))`
  - `findById(2)` trả đúng record đó
  - `findAll()` bằng `List.of(new Customer(1, "Other", "other@example.com", "0912345678", ACTIVE), <record đã đổi>)`: vẫn 2 phần tử, theo thứ tự id, khách hàng 1 không đổi

### TC-83: InMemoryCustomerRepository.updateStatus với id không tồn tại trả Optional.empty() và không thêm mới
- covers: AC-5
- side: be
- level: unit
- type: negative
- priority: high
- objective: D6: `updateStatus` không bao giờ thêm mới. Bắt cách hiện thực bằng `customers.put` hoặc `compute` (upsert).
- preconditions: `InMemoryCustomerRepository` mới; `insert("Nguyen Van An", "an@example.com", "0912345678", ACTIVE)` → id 1; chụp `findAll()`.
- test data: (`id`)
  - `999`
  - `0` (biên dưới của `\d+`)
  - `2` (giá trị kế tiếp của bộ đếm id)
- steps: Given kho có một khách hàng / When gọi `repository.updateStatus(id, CustomerStatus.INACTIVE)` / Then kiểm tra giá trị trả về và kho.
- expected result: trả `Optional.empty()`; `findById(id)` là `Optional.empty()`; `findAll()` bằng đúng danh sách đã chụp (1 phần tử, vẫn `ACTIVE`).

### TC-84: CustomerService.updateStatus ngừng hoạt động khách hàng ACTIVE và giữ nguyên dữ liệu
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: chiều `INACTIVE` không có điều kiện nào. Khách hàng `ACTIVE` thành `INACTIVE`, còn `id`, `name`, `email`, `phone` giữ nguyên (số không bị xoá); không kiểm tra lại định dạng số và không kiểm tra trùng; số khách hàng và mọi khách hàng khác không đổi.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", aPhone, ACTIVE)` → id 2
  3. B: `("Tran Thi Binh", "binh@example.com", bPhone, ACTIVE)` → id 3
- test data: (aPhone, bPhone)
  - `"0912345678"`, `"0987654321"`
  - `null`, `null` (A không có số)
  - `"01234567890"`, `"0987654321"` (số theo quy tắc cũ; `PUT /api/customers/{id}` từ chối số này ở TC-54, đổi trạng thái thì không)
  - `"0912345678"`, `"0912345678"` (B `ACTIVE` có cùng số từ trước; chiều ngừng hoạt động không kiểm tra trùng)
- steps: Given kho có Seed, A, B / When gọi `service.updateStatus(2, "INACTIVE")` / Then kiểm tra khách hàng trả về, `service.get(2)` và `service.list()`.
- expected result:
  - không ném exception
  - kết quả bằng `new Customer(2, "Nguyen Van An", "an@example.com", aPhone, INACTIVE)`
  - `service.get(2)` bằng đúng kết quả đó
  - `service.list()` bằng `List.of(<Seed ban đầu>, <kết quả>, <B ban đầu>)`: vẫn 3 phần tử, Seed và B không đổi

### TC-85: CustomerService.updateStatus kích hoạt lại khi không khách hàng ACTIVE khác nào dùng số đó
- covers: AC-2
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5, BR-09: kích hoạt lại chỉ kiểm tra một điều kiện là số đang được khách hàng `ACTIVE` **khác** dùng. Khách hàng không có số luôn kích hoạt lại được (bỏ qua truy vấn trùng, không `NullPointerException`); số do khách hàng `INACTIVE` khác giữ không chặn; số theo quy tắc cũ không bị kiểm tra lại định dạng.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. B: `("Tran Thi Binh", "binh@example.com", bPhone, bStatus)` → id 2
  3. A: `("Nguyen Van An", "an@example.com", aPhone, INACTIVE)` → id 3
- test data: (aPhone, bPhone, bStatus)
  - `null`, `null`, `ACTIVE` (A không có số; Seed và B `ACTIVE` cũng không có số)
  - `"0912345678"`, `"0987654321"`, `ACTIVE` (không ai khác có số của A)
  - `"0912345678"`, `"0912345678"`, `INACTIVE` (số chỉ do một khách hàng `INACTIVE` khác giữ)
  - `"01234567890"`, `"0987654321"`, `ACTIVE` (số theo quy tắc cũ, không khách hàng `ACTIVE` khác nào có)
- steps: Given kho có Seed, B, A với A đang `INACTIVE` / When gọi `service.updateStatus(3, "ACTIVE")` / Then kiểm tra khách hàng trả về, `service.get(3)` và `service.list()`.
- expected result:
  - không ném exception
  - kết quả bằng `new Customer(3, "Nguyen Van An", "an@example.com", aPhone, ACTIVE)`
  - `service.get(3)` bằng đúng kết quả đó
  - `service.list()` bằng `List.of(<Seed ban đầu>, <B ban đầu>, <kết quả>)`: vẫn 3 phần tử, Seed và B không đổi

### TC-86: CustomerService.updateStatus từ chối kích hoạt lại khi số đang được khách hàng ACTIVE khác dùng
- covers: AC-3
- side: be
- level: unit
- type: negative
- priority: high
- objective: D3, D5, BR-09: khách hàng `INACTIVE` có số đã được cấp cho khách hàng `ACTIVE` khác không kích hoạt lại được; lỗi là `ValidationException` với đúng thông điệp của `POST`/`PUT`; không ghi gì. Số được so nguyên văn, kể cả số theo quy tắc cũ.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", phone, INACTIVE)` → id 2
  3. B: `("Tran Thi Binh", "binh@example.com", phone, ACTIVE)` → id 3 (số của A đã được cấp lại theo BR-09)
- test data: (`phone` của cả A và B)
  - `"0912345678"`
  - `"01234567890"` (số theo quy tắc cũ: không kiểm tra định dạng nhưng vẫn kiểm tra trùng)
- steps: Given A `INACTIVE` và B `ACTIVE` cùng có số `phone` / When gọi `service.updateStatus(2, "ACTIVE")` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "is already used by another customer"}` (một key); `service.list()` bằng đúng danh sách đã chụp; `service.get(2).status()` vẫn là `INACTIVE`.

### TC-87: CustomerService.updateStatus tới đúng trạng thái đang có trả khách hàng đang lưu và không báo trùng số
- covers: AC-4
- side: be
- level: unit
- type: functional
- priority: high
- objective: D2 bước 5, D5: "đã ở đúng trạng thái đích" được xét **trước** kiểm tra trùng số. Thao tác không báo lỗi và không đổi gì, kể cả khi số của khách hàng đang được khách hàng `ACTIVE` khác dùng.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", aPhone, status)` → id 2
  3. B: `("Tran Thi Binh", "binh@example.com", bPhone, ACTIVE)` → id 3
- test data: (status của A = trạng thái đích, aPhone, bPhone)
  - `ACTIVE`, `"0912345678"`, `"0987654321"`
  - `INACTIVE`, `"0912345678"`, `"0987654321"`
  - `INACTIVE`, `"0912345678"`, `"0912345678"` (số của A đang được B `ACTIVE` dùng; vẫn không báo trùng)
  - `ACTIVE`, `"0912345678"`, `"0912345678"` (hai khách hàng `ACTIVE` trùng số có từ trước, Q6)
  - `INACTIVE`, `null`, `null` (không có số)
- steps: Given A đang ở trạng thái `status` / When gọi `service.updateStatus(2, status.name())` / Then kiểm tra khách hàng trả về và `service.list()`.
- expected result: không ném exception; kết quả bằng `new Customer(2, "Nguyen Van An", "an@example.com", aPhone, status)`; `service.get(2)` bằng đúng kết quả đó; `service.list()` bằng đúng danh sách đã chụp.

### TC-88: CustomerService.updateStatus với id không tồn tại ném NotFoundException trước khi kiểm tra trạng thái đích
- covers: AC-5
- side: be
- level: unit
- type: negative
- priority: high
- objective: D2 bước 3: tìm khách hàng **trước** khi kiểm tra trạng thái đích. `id` không tồn tại cho `NotFoundException` kể cả khi trạng thái đích không hợp lệ; không tạo mới, không đổi ai.
- preconditions: kho của `@BeforeEach` sau `insertSeedAndAn()` (Seed id 1, A id 2 `ACTIVE`); chụp `service.list()`.
- test data: (`status`)
  - `"ACTIVE"`
  - `"INACTIVE"`
  - `"DELETED"` (không hợp lệ: vẫn 404, không phải 400)
  - `""`
  - `null`
- steps: Given không có khách hàng id 999 / When gọi `service.updateStatus(999, status)` / Then bắt exception.
- expected result: ném `NotFoundException` (không phải `ValidationException` hay `NullPointerException`) với message `"Customer 999 not found"`; `service.list()` bằng đúng danh sách đã chụp; `service.get(999)` vẫn ném `NotFoundException`.

### TC-89: CustomerService.updateStatus từ chối trạng thái đích không đúng bằng ACTIVE hoặc INACTIVE
- covers: AC-6
- side: be
- level: unit
- type: negative
- priority: high
- objective: D4: trạng thái đích hợp lệ là đúng hai chuỗi `ACTIVE` và `INACTIVE`, so khớp chính xác (không trim, không đổi hoa thường). Mọi giá trị khác, kể cả `null`, cho `ValidationException` với cùng một thông điệp ở key `status`; không ghi gì, dù khách hàng đang `ACTIVE` hay `INACTIVE`.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", "0912345678", current)` → id 2
- test data: (`status`); mỗi giá trị chạy với `current = ACTIVE` và `current = INACTIVE`
  - không có giá trị: `null`, `""`, `"   "`
  - giá trị lạ: `"DELETED"`
  - sai hoa thường: `"active"`, `"Inactive"`
  - thừa dấu cách: `" ACTIVE"`, `"INACTIVE "` (bắt cách hiện thực có trim: sẽ đổi trạng thái hoặc trả 200)
- steps: Given A đang ở trạng thái `current` / When gọi `service.updateStatus(2, status)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException` (không phải `NullPointerException` hay `IllegalArgumentException`); `errors()` bằng đúng `{"status": "must be ACTIVE or INACTIVE"}` (một key); `service.list()` bằng đúng danh sách đã chụp (A vẫn ở trạng thái `current`).

### TC-90: CustomerService.updateStatus ngừng hoạt động rồi kích hoạt lại trả về đúng khách hàng ban đầu
- covers: AC-1, AC-2
- side: be
- level: unit
- type: functional
- priority: medium
- objective: chuyển trạng thái `ACTIVE` → `INACTIVE` → `ACTIVE` qua chính service không làm mất hay đổi họ tên, email, số điện thoại (`01-analysis.md` → Đo thành công), kể cả khi không có số và khi số theo quy tắc cũ.
- preconditions: kho của `@BeforeEach`, `insert` theo thứ tự; chụp `service.list()`:
  1. Seed: `("Seed", "seed@example.com", null, ACTIVE)` → id 1
  2. A: `("Nguyen Van An", "an@example.com", phone, ACTIVE)` → id 2
- test data: (`phone`) `"0912345678"`, `null`, `"01234567890"`.
- steps: Given A đang `ACTIVE` / When gọi `service.updateStatus(2, "INACTIVE")` rồi `service.updateStatus(2, "ACTIVE")` / Then kiểm tra kết quả của từng lần gọi và `service.list()`.
- expected result:
  - lần gọi thứ nhất trả `new Customer(2, "Nguyen Van An", "an@example.com", phone, INACTIVE)`
  - lần gọi thứ hai trả `new Customer(2, "Nguyen Van An", "an@example.com", phone, ACTIVE)`
  - `service.list()` sau lần gọi thứ hai bằng đúng danh sách đã chụp

### TC-91: PUT /api/customers/{id}/status ngừng hoạt động trả 200 kèm khách hàng và GET đọc lại được
- covers: AC-1
- side: be
- level: integration
- type: functional
- priority: high
- objective: D1, D7: route mới đọc `UpdateCustomerStatusRequest`, gọi `service.updateStatus` với `id` từ path và trả 200 `application/json` kèm `Customer` có `status = "INACTIVE"`; các field khác như trước; field khác trong body bị bỏ qua.
- preconditions: server `App.start(0, service)` với seed id 1 `("Nguyen Van An", "an@example.com", null)`, `ACTIVE`; đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201 (id 2); chụp `before = customers()`.
- test data: (id, body của `PUT /api/customers/{id}/status`)
  - `1`, `{"status":"INACTIVE"}` (khách hàng không có số)
  - `2`, `{"status":"INACTIVE"}` (khách hàng có số `0912345678`)
  - `2`, `{"id":1,"name":"X","email":"x@example.com","phone":"0987654321","status":"INACTIVE"}` (`id` chỉ lấy từ path; `name`, `email`, `phone` trong body bị bỏ qua)
- steps: Given hai khách hàng đang `ACTIVE` / When `PUT /api/customers/{id}/status` rồi `GET /api/customers/{id}` và `GET /api/customers` / Then đọc các response bằng `CustomerHandler.JSON.readTree`.
- expected result:
  - PUT trả 200; header `Content-Type` bắt đầu bằng `application/json`
  - body PUT: `status` là `"INACTIVE"`; `id`, `name`, `email`, `phone` bằng đúng giá trị của khách hàng đó trong `before` (dòng 1: `body.has("phone")` là `true` và `phone` là JSON `null`; dòng 2 và 3: `"Tran Thi Binh"`, `"binh@example.com"`, `"0912345678"`)
  - `GET /api/customers/{id}` trả 200 với body bằng đúng body PUT
  - `GET /api/customers` vẫn có 2 phần tử; phần tử của khách hàng còn lại bằng đúng phần tử trong `before` (vẫn `ACTIVE`)

### TC-92: PUT /api/customers/{id}/status kích hoạt lại trả 200 và khách hàng trở về đúng như trước khi ngừng
- covers: AC-2
- side: be
- level: integration
- type: functional
- priority: high
- objective: khách hàng `INACTIVE` không bị trùng số kích hoạt lại được qua HTTP; ngừng rồi kích hoạt lại không làm mất hay đổi dữ liệu; khách hàng không có số kích hoạt lại được dù có khách hàng `ACTIVE` khác cũng không có số (không 500).
- preconditions: server đang chạy với seed id 1 (không có số); đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` → 201 (id 2) và `POST {"name":"Le Van Cuong","email":"cuong@example.com"}` → 201 (id 3, không có số); chụp `before = customers()`; đã `PUT /api/customers/{id}/status` với `{"status":"INACTIVE"}` và nhận 200.
- test data: (`id`)
  - `1` (không có số; khách hàng 3 `ACTIVE` cũng không có số)
  - `2` (số `0912345678`, không khách hàng nào khác có)
- steps: Given khách hàng `id` đang `INACTIVE` / When `PUT /api/customers/{id}/status` với `{"status":"ACTIVE"}` rồi `GET /api/customers/{id}` và `GET /api/customers` / Then kiểm tra các response.
- expected result:
  - PUT trả 200; header `Content-Type` bắt đầu bằng `application/json`; `status` là `"ACTIVE"`
  - body PUT bằng đúng phần tử của khách hàng `id` trong `before` (so `JsonNode`)
  - `GET /api/customers/{id}` trả body bằng đúng body PUT
  - `customers()` bằng đúng `before` (3 phần tử, không ai đổi)

### TC-93: PUT /api/customers/{id}/status từ chối kích hoạt lại khi số đã được cấp cho khách hàng ACTIVE khác
- covers: AC-3
- side: be
- level: integration
- type: negative
- priority: high
- objective: kịch bản đầu-cuối của BR-09: khách hàng ngừng hoạt động không giữ số, nên số được cấp cho người khác qua `POST` hoặc `PUT`; khi đó kích hoạt lại bị từ chối bằng 400 Problem với `errors.phone`, và không ai đổi gì.
- preconditions: server đang chạy với seed id 1 (không có số); thực hiện theo thứ tự rồi chụp `before = customers()` **sau** bước 3:
  1. `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` → 201 (A, id 2)
  2. `PUT /api/customers/2/status` với `{"status":"INACTIVE"}` → 200
  3. request của dòng dữ liệu, cấp số của A cho khách hàng B
- test data: (request ở bước 3 → status mong đợi của request đó)
  - `POST /api/customers` với `{"name":"Le Van Cuong","email":"cuong@example.com","phone":"0912345678"}` → 201 (B được **tạo mới**, id 3)
  - `PUT /api/customers/1` với `{"name":"Nguyen Van An","email":"an@example.com","phone":"0912345678"}` → 200 (B là khách hàng có sẵn id 1, được **sửa** sang số đó)
- steps: Given A `INACTIVE` và B `ACTIVE` cùng có số `0912345678` / When `PUT /api/customers/2/status` với `{"status":"ACTIVE"}` rồi `GET /api/customers/2` và `GET /api/customers` / Then kiểm tra các response.
- expected result:
  - request ở bước 3 trả đúng status của dòng dữ liệu (số của khách hàng `INACTIVE` dùng lại được)
  - PUT kích hoạt lại trả 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Validation failed"`
  - `errorsOf(body)` bằng đúng `{"phone": "is already used by another customer"}`
  - `GET /api/customers/2` trả `status` là `"INACTIVE"`
  - `customers()` bằng đúng `before` (A và B không đổi)

### TC-94: PUT /api/customers/{id}/status kích hoạt lại được sau khi xung đột số được gỡ
- covers: AC-2
- side: be
- level: integration
- type: functional
- priority: medium
- objective: chuyển trạng thái nhiều bước: bị chặn vì trùng số → gỡ xung đột bằng chức năng có sẵn → kích hoạt lại thành công. Kiểm tra trùng chỉ tính khách hàng `ACTIVE` **khác** đang có **đúng số hiện tại** của khách hàng; đổi trạng thái không tự đổi số (R2).
- preconditions: server đang chạy với seed id 1 (không có số); thực hiện theo thứ tự:
  1. `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` → 201 (A, id 2)
  2. `PUT /api/customers/2/status` với `{"status":"INACTIVE"}` → 200
  3. `POST {"name":"Le Van Cuong","email":"cuong@example.com","phone":"0912345678"}` → 201 (B, id 3)
  4. `PUT /api/customers/2/status` với `{"status":"ACTIVE"}` → 400 (xác nhận đang bị chặn)
- test data: (request gỡ xung đột → `phone` của A sau khi kích hoạt lại)
  - `PUT /api/customers/3` với `{"name":"Le Van Cuong","email":"cuong@example.com","phone":"0987654321"}` → `"0912345678"` (B đổi sang số khác)
  - `PUT /api/customers/3` với `{"name":"Le Van Cuong","email":"cuong@example.com"}` → `"0912345678"` (B xoá số)
  - `PUT /api/customers/3/status` với `{"status":"INACTIVE"}` → `"0912345678"` (B ngừng hoạt động)
  - `PUT /api/customers/2` với `{"name":"Tran Thi Binh","email":"binh@example.com","phone":"0987654321"}` → `"0987654321"` (A đổi sang số khác)
  - `PUT /api/customers/2` với `{"name":"Tran Thi Binh","email":"binh@example.com"}` → JSON `null` (A xoá số)
- steps: Given A `INACTIVE` đang bị chặn vì B `ACTIVE` có cùng số / When gửi request gỡ xung đột của dòng dữ liệu, rồi `PUT /api/customers/2/status` với `{"status":"ACTIVE"}`, rồi `GET /api/customers/2` / Then kiểm tra các response.
- expected result:
  - request gỡ xung đột trả 200
  - PUT kích hoạt lại trả 200; `id` là 2; `status` là `"ACTIVE"`; `name` là `"Tran Thi Binh"`; `phone` bằng giá trị mong đợi của dòng dữ liệu
  - `GET /api/customers/2` trả body bằng đúng body PUT
  - `GET /api/customers` vẫn có 3 phần tử

### TC-95: PUT /api/customers/{id}/status tới đúng trạng thái đang có trả 200 và không đổi gì
- covers: AC-4
- side: be
- level: integration
- type: functional
- priority: high
- objective: D1, D2 bước 5: đặt trạng thái đích là idempotent. Khách hàng đã ở đúng trạng thái đích nhận 200 kèm `Customer` đang lưu, không có lỗi trùng số, kể cả khi gửi lại nhiều lần.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`, không có số); thực hiện theo thứ tự rồi chụp `before = customers()`:
  1. `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` → 201 (id 2)
  2. `PUT /api/customers/2/status` với `{"status":"INACTIVE"}` → 200
  3. `POST {"name":"Le Van Cuong","email":"cuong@example.com","phone":"0912345678"}` → 201 (id 3, `ACTIVE`, giữ số của khách hàng 2)
- test data: (id, body)
  - `1`, `{"status":"ACTIVE"}` (`ACTIVE` → `ACTIVE`)
  - `3`, `{"status":"ACTIVE"}` (`ACTIVE` → `ACTIVE`; khách hàng `INACTIVE` 2 có cùng số)
  - `2`, `{"status":"INACTIVE"}` (`INACTIVE` → `INACTIVE`; số đang được khách hàng `ACTIVE` 3 dùng, vẫn không báo trùng)
- steps: Given khách hàng `id` đã ở đúng trạng thái đích / When gửi `PUT /api/customers/{id}/status` với body của dòng dữ liệu **hai lần liên tiếp** rồi `GET /api/customers` / Then kiểm tra cả hai response.
- expected result: cả hai lần trả 200; `Content-Type` bắt đầu bằng `application/json`; body của cả hai lần bằng đúng phần tử của khách hàng `id` trong `before` (so `JsonNode`); `customers()` bằng đúng `before`.

### TC-96: PUT /api/customers/{id}/status với id không tồn tại trả 404 Problem, kể cả khi status không hợp lệ
- covers: AC-5
- side: be
- level: integration
- type: negative
- priority: high
- objective: D2 bước 3: `NotFoundException` của `updateStatus` được map sang 404 như `GET /api/customers/{id}` và `PUT /api/customers/{id}`, **trước** kiểm tra trạng thái đích; không tạo mới, không đổi ai.
- preconditions: server đang chạy với seed id 1; chụp `before = customers()`.
- test data: (id, body)
  - `999`, `{"status":"ACTIVE"}`
  - `999`, `{"status":"INACTIVE"}`
  - `999`, `{"status":"DELETED"}` (trạng thái đích không hợp lệ: vẫn 404)
  - `999`, `{}` (thiếu `status`: vẫn 404)
  - `0`, `{"status":"INACTIVE"}` (biên dưới của `\d+`)
  - `2`, `{"status":"INACTIVE"}` (giá trị kế tiếp của bộ đếm id)
- steps: Given không có khách hàng `id` / When `PUT /api/customers/{id}/status` với body của dòng dữ liệu rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 404; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Not Found"`; `detail` là `"Customer {id} not found"` (vd. `"Customer 999 not found"`); `body.has("errors")` là `false`; `customers()` bằng đúng `before` (1 phần tử, vẫn `ACTIVE`).

### TC-97: PUT /api/customers/{id}/status với trạng thái đích không hợp lệ trả 400 Problem kèm errors.status
- covers: AC-6
- side: be
- level: integration
- type: negative
- priority: high
- objective: D4: field `status` được đọc vào `String`, nên giá trị thiếu, `null`, rỗng hoặc lạ đi tới service và thành 400 `Validation failed` với `errors.status`, không phải `Malformed JSON` và không phải 500; khách hàng không đổi gì.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`); chụp `before = customers()`.
- test data: (body của `PUT /api/customers/1/status`)
  - `{}` (thiếu field)
  - `{"state":"INACTIVE"}` (sai tên field, coi như thiếu `status`)
  - `{"status":null}`
  - `{"status":""}`
  - `{"status":"DELETED"}`
  - `{"status":"active"}`
  - `{"status":"inactive"}` (nếu không phân biệt hoa thường thì khách hàng sẽ bị ngừng hoạt động)
  - `{"status":" INACTIVE "}` (không trim)
- steps: Given khách hàng 1 đang `ACTIVE` / When `PUT /api/customers/1/status` với từng body rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Validation failed"`; `errorsOf(body)` bằng đúng `{"status": "must be ACTIVE or INACTIVE"}`; `customers()` bằng đúng `before` (khách hàng 1 vẫn `ACTIVE`).

### TC-98: PUT /api/customers/{id}/status với body không phải JSON hợp lệ trả 400 Malformed JSON
- covers: AC-5, AC-6
- side: be
- level: integration
- type: negative
- priority: medium
- objective: D2 bước 2: handler đọc body trước khi gọi service, nên JSON hỏng trả 400 `Malformed JSON` kể cả khi `id` không tồn tại; không ghi gì.
- preconditions: server đang chạy với seed id 1; chụp `before = customers()`.
- test data: (path sau `/api/customers`) `/1/status`, `/999/status`; body là chuỗi `{"status":` (JSON bị cắt).
- steps: Given server đang chạy / When `PUT` tới từng path với body hỏng rồi `GET /api/customers` / Then kiểm tra response.
- expected result: cả hai dòng trả status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Malformed JSON"`; `detail` là `"The request body is not valid JSON"`; `body.has("errors")` là `false`; `customers()` bằng đúng `before`.

### TC-99: PUT trên path không khớp /api/customers/{chữ số}/status trả 404 fallback
- covers: AC-5
- side: be
- level: integration
- type: negative
- priority: low
- objective: D2 bước 1, D7: chỉ path khớp `^/api/customers/(\d+)/status$` là route đổi trạng thái. `id` không phải chuỗi chữ số và path con khác rơi vào fallback như mọi route lạ; không đổi ai.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`); chụp `before = customers()`.
- test data: (path sau `/api/customers` → `detail`); body `{"status":"INACTIVE"}`
  - `"/abc/status"` → `"No route for PUT /api/customers/abc/status"`
  - `"/-1/status"` → `"No route for PUT /api/customers/-1/status"`
  - `"/status"` → `"No route for PUT /api/customers/status"`
  - `"/1/status/x"` → `"No route for PUT /api/customers/1/status/x"`
  - `"/1/statuses"` → `"No route for PUT /api/customers/1/statuses"`
- steps: Given server đang chạy / When `PUT` tới từng path rồi `GET /api/customers` / Then kiểm tra response.
- expected result: status 404; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Not Found"`; `detail` như dòng dữ liệu; `customers()` bằng đúng `before` (khách hàng 1 vẫn `ACTIVE`).

### TC-100: GET /api/customers/{id}/status trả 404 fallback và GET /api/customers/{id} vẫn hoạt động
- covers: AC-5
- side: be
- level: integration
- type: negative
- priority: low
- objective: D1, D7: path `/status` chỉ có method `PUT`; không thêm `GET` trên path này. Route mới không làm đổi điều kiện khớp của `GET /api/customers/{id}`.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`).
- test data: `GET /api/customers/1/status`; `GET /api/customers/1`.
- steps: Given server đang chạy / When `GET /api/customers/1/status` rồi `GET /api/customers/1` / Then kiểm tra cả hai response.
- expected result:
  - `GET /api/customers/1/status` trả 404; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Not Found"`; `detail` là `"No route for GET /api/customers/1/status"`
  - `GET /api/customers/1` trả 200 với `id` là 1 và `status` là `"ACTIVE"`

### TC-101: updateCustomerStatus gửi PUT /api/customers/{id}/status với body chỉ có trạng thái đích
- covers: AC-7
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8: `updateCustomerStatus(id, status, options)` gửi đúng một request `PUT` tới path con `/status` của `id` (qua `encodeURIComponent`), có `Content-Type: application/json`, body JSON là đúng `{ status }` (không thêm `id` hay field khác), và trả khách hàng mà API trả.
- preconditions: mỗi dòng dùng mảng `calls` mới và `fakeFetch(200, apiCustomer, calls)` truyền qua `{ fetchImpl }`, với `apiCustomer = { id: 7, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status }` (`status` của dòng dữ liệu).
- test data: (id, status → url)
  - `7`, `'INACTIVE'` → `'/api/customers/7/status'`
  - `'7'`, `'ACTIVE'` → `'/api/customers/7/status'` (`id` dạng chuỗi như `button.dataset.statusId`)
  - `'7/8'`, `'INACTIVE'` → `'/api/customers/7%2F8/status'` (`id` đi qua `encodeURIComponent`)
- steps: Given `fakeFetch` ghi lại request / When gọi `updateCustomerStatus(id, status, { fetchImpl })` / Then đọc `calls` và giá trị trả về.
- expected result:
  - `calls.length` là 1
  - `calls[0].url` bằng url của dòng dữ liệu; `calls[0].init.method` là `'PUT'`
  - `calls[0].init.headers['Content-Type']` là `'application/json'`
  - `JSON.parse(calls[0].init.body)` bằng đúng `{ status }` (`deepEqual`: đúng một key)
  - giá trị trả về bằng `apiCustomer` (`deepEqual`)

### TC-102: updateCustomerStatus ném ApiError mang status và fieldErrors của API
- covers: AC-8
- side: fe
- level: unit
- type: negative
- priority: high
- objective: response non-2xx của endpoint đổi trạng thái đi qua `request()` thành `ApiError`: `errors` của Problem nằm trong `fieldErrors`; Problem không có `errors` cho `fieldErrors` rỗng.
- preconditions: `fakeFetch(status, problem)` truyền qua `{ fetchImpl }`.
- test data: (status, problem → `fieldErrors`)
  - `400`, `{ type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { phone: 'is already used by another customer' } }` → `{ phone: 'is already used by another customer' }`
  - `400`, `{ type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { status: 'must be ACTIVE or INACTIVE' } }` → `{ status: 'must be ACTIVE or INACTIVE' }`
  - `404`, `{ type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' }` → `{}`
- steps: Given API trả Problem / When gọi `updateCustomerStatus(7, 'ACTIVE', { fetchImpl })` / Then `assert.rejects`.
- expected result: promise bị reject với `error instanceof ApiError`; `error.status` bằng status của dòng dữ liệu; `error.fieldErrors` bằng giá trị mong đợi (`deepEqual`).

### TC-103: renderCustomerTable thêm một nút đổi trạng thái mang id và trạng thái đích ở mỗi dòng
- covers: AC-9
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D9: ô "Thao tác" của mỗi dòng có nút "Sửa" như cũ, một dấu cách, rồi đúng một nút đổi trạng thái mang `id` của dòng và trạng thái đích ngược với trạng thái hiện tại; nhãn theo trạng thái; `<thead>`, năm ô dữ liệu và số cột giữ nguyên.
- preconditions: không có.
- test data: danh sách hai khách hàng (khách hàng → trạng thái đích, nhãn nút)
  - `{ id: 7, name: 'Le Van Cuong', email: 'cuong@example.com', phone: '0912345678', status: 'ACTIVE' }` → `INACTIVE`, "Ngừng hoạt động"
  - `{ id: 8, name: 'Pham Thi Dung', email: 'dung@example.com', phone: null, status: 'INACTIVE' }` → `ACTIVE`, "Kích hoạt lại"
- steps: Given danh sách hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result:
  - khớp `<thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>`
  - khớp `<tr><td>7</td><td>Le Van Cuong</td><td>cuong@example.com</td><td>0912 345 678</td><td>Đang hoạt động</td><td><button type="button" data-edit-id="7">Sửa</button> <button type="button" data-status-id="7" data-target-status="INACTIVE">Ngừng hoạt động</button></td></tr>`
  - khớp `<tr><td>8</td><td>Pham Thi Dung</td><td>dung@example.com</td><td>—</td><td>Ngừng hoạt động</td><td><button type="button" data-edit-id="8">Sửa</button> <button type="button" data-status-id="8" data-target-status="ACTIVE">Kích hoạt lại</button></td></tr>`
  - `<tbody>` có đúng 2 dòng; mỗi dòng có đúng 6 `<td>`, đúng 1 `data-edit-id=`, đúng 1 `data-status-id=` và đúng 1 `data-target-status=`
  - `html.match(/<tr>/g).length` là 3 (tiêu đề + hai dòng)

### TC-104: renderCustomerTable escape HTML id trong data-status-id
- covers: AC-9
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: R7: `id` đặt trong thuộc tính `data-status-id` đi qua `escapeHtml` (escape cả `"` và `'`), không sinh thẻ và không thoát khỏi thuộc tính, ở cả hai dạng nút.
- preconditions: không có.
- test data: khách hàng `{ id, name: 'A', email: 'a@example.com', phone: null, status }` (id, status → giá trị thuộc tính, phần còn lại của nút)
  - `'7"><b>x</b>'`, `'ACTIVE'` → `7&quot;&gt;&lt;b&gt;x&lt;/b&gt;`, ` data-target-status="INACTIVE">Ngừng hoạt động</button>`
  - `'7"><b>x</b>'`, `'INACTIVE'` → `7&quot;&gt;&lt;b&gt;x&lt;/b&gt;`, ` data-target-status="ACTIVE">Kích hoạt lại</button>`
  - `"7' x='y"`, `'ACTIVE'` → `7&#39; x=&#39;y`, ` data-target-status="INACTIVE">Ngừng hoạt động</button>`
- steps: Given một khách hàng có `id` chứa ký tự HTML / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: khớp `<button type="button" data-status-id="{giá trị thuộc tính}"{phần còn lại của nút}` của dòng dữ liệu; không khớp `/<b>x<\/b>/`; không khớp `/x='y/` (dấu `'` thô không xuất hiện trong thuộc tính); `data-status-id=` xuất hiện đúng 1 lần.

### TC-105: renderCustomerTable không hiện nút đổi trạng thái cho status ngoài ACTIVE và INACTIVE
- covers: AC-9
- side: fe
- level: unit
- type: boundary
- priority: medium
- objective: D9 (Q4): khách hàng có `status` ngoài hai giá trị đã biết không có trạng thái đích nào đúng để đề xuất. Ô "Thao tác" giữ như trước REQ-003: chỉ có nút "Sửa", không có dấu cách thừa, không có nút đổi trạng thái.
- preconditions: không có.
- test data: khách hàng `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status }` (`status`)
  - `'DELETED'`
  - `'active'` (sai hoa thường)
  - `''`
  - `null`
  - thiếu field `status`
- steps: Given một khách hàng có `status` của dòng dữ liệu / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: mọi dòng dữ liệu khớp `<td><button type="button" data-edit-id="1">Sửa</button></td></tr>`; không khớp `data-status-id`, `data-target-status`, `Kích hoạt lại`; `<button ` xuất hiện đúng 1 lần; dòng vẫn có đúng 6 `<td>`.

### TC-106: describeStatusError trả câu báo trùng số khi lỗi có fieldErrors.phone
- covers: AC-10
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D10: kích hoạt lại bị từ chối vì trùng số (`ApiError` 400 có `fieldErrors.phone`) được báo bằng một câu tiếng Việt nói đúng lý do, không phải nguyên văn thông điệp của API. Hàm nhận biết lỗi bằng hình dạng (`fieldErrors.phone`), không dùng `instanceof`.
- preconditions: file test import `describeStatusError` từ `../src/utils/describeStatusError.js` và `ApiError` từ `../src/api/customerApi.js`.
- test data: (`error`)
  - `new ApiError(400, { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { phone: 'is already used by another customer' } })`
  - `{ fieldErrors: { phone: 'is already used by another customer' } }` (object thường có cùng hình dạng)
- steps: Given lỗi có `fieldErrors.phone` / When gọi `describeStatusError(error)` / Then so giá trị trả về bằng `assert.equal`.
- expected result: mọi dòng trả đúng chuỗi `'Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng.'` (text thuần, không có thẻ HTML, không chứa `is already used`).

### TC-107: describeStatusError trả thông báo chung cho mọi lỗi khác
- covers: AC-10
- side: fe
- level: unit
- type: negative
- priority: high
- objective: D10: lỗi không có `fieldErrors.phone` (404, 500, 400 `errors.status`), lỗi không phải `ApiError` (mất mạng) và giá trị `null`/`undefined` đều nhận thông báo chung; hàm không ném lỗi.
- preconditions: file test import `describeStatusError` từ `../src/utils/describeStatusError.js` và `ApiError` từ `../src/api/customerApi.js`.
- test data: (`error`)
  - `new ApiError(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' })`
  - `new ApiError(500, { type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' })`
  - `new ApiError(400, { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { status: 'must be ACTIVE or INACTIVE' } })`
  - `new ApiError(502, null)` (response không có body JSON; `fieldErrors` là `{}`)
  - `new TypeError('Failed to fetch')` (mất mạng, không có `fieldErrors`)
  - `null`
  - `undefined`
- steps: Given lỗi không có `fieldErrors.phone` / When gọi `describeStatusError(error)` / Then so giá trị trả về bằng `assert.equal`.
- expected result: mọi dòng trả đúng chuỗi `'Không đổi được trạng thái khách hàng.'`; không dòng nào ném exception.

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-82, TC-84, TC-90, TC-91 |
| AC-2 | TC-82, TC-85, TC-90, TC-92, TC-94 |
| AC-3 | TC-86, TC-93 |
| AC-4 | TC-87, TC-95 |
| AC-5 | TC-83, TC-88, TC-96, TC-98, TC-99, TC-100 |
| AC-6 | TC-89, TC-97, TC-98 |
| AC-7 | TC-101 |
| AC-8 | TC-102 |
| AC-9 | TC-103, TC-104, TC-105 |
| AC-10 | TC-106, TC-107 |
