# REQ-003 — Review

## Tóm tắt
**Sẵn sàng tạo PR.** Không có finding mức nghiêm trọng hay major; có 4 finding minor để người review PR cân nhắc.

- Phạm vi đã đọc: toàn bộ 15 file nguồn đổi so với `7a881fa` (8 file BE, 7 file FE) cùng diff của chúng, đối chiếu với `02-design.md` (D1..D11), `api-contract.yaml`, `03-test-spec.md` (TC-82..TC-107) và `04-plan.yaml` (T1..T6).
- Design được duyệt nguyên trạng (`approvals/design-01.yaml`: `decision: approved`, không kèm ghi chú chọn phương án thay thế), nên các lựa chọn 400 thay vì 409, nhãn "Ngừng hoạt động", không tải lại khi thất bại và không kiểm tra lại định dạng số đều là thiết kế đã duyệt.
- Code hiện thực đúng từng quyết định D1..D11; hai đoạn mã mẫu của D5 và D11 được chép gần như nguyên văn. BE expose và FE gọi đúng `PUT /api/customers/{id}/status` theo contract.
- Cả 26 TC (TC-82..TC-107) đều có trong code, đúng file theo bảng phân bổ của test spec, đủ số dòng dữ liệu, gắn mã qua `@DisplayName("TC-n: ...")` (BE) và `test('TC-n: ...')` (FE). Số lần chạy trong evidence khớp số dòng dữ liệu của spec: `CustomerHandlerTest` 31 → 68 (+37 ở T3), `CustomerServiceTest` 94 → 133 (+39 ở T2), FE 31 → 34 → 36 qua T4, T5, T6 (+3 ở T5, +2 ở T6). `InMemoryCustomerRepositoryTest` là 40 sau T1 và FE là 31 sau T4; số trước hai task này không có trong evidence của REQ-003 nên phần tăng của T1 (9 theo spec) và T4 (2 theo spec) chỉ được đối chiếu bằng cách đếm dòng dữ liệu trong code. [CẦN XÁC NHẬN]
- Cấu trúc dự án không bị phá: chỉ thêm 3 file mới đúng chỗ (`api/UpdateCustomerStatusRequest.java`, `src/utils/describeStatusError.js`, `test/describeStatusError.test.js`); không đổi tên, di chuyển, xoá hay reformat ngoài phạm vi; public API cũ giữ nguyên chữ ký. Test cũ không bị sửa, trừ đúng hai regex của TC-74 mà D9 đã duyệt (`source-fe/test/customerTable.test.js:130`, `:134`).
- Bảo mật (OWASP): `id` và trạng thái đích trong thuộc tính HTML đều qua `escapeHtml`; thông báo lỗi là hằng và gán bằng `textContent`; `status` được validate ở service bằng so khớp chính xác; không log, không lộ PII trong thông điệp lỗi. Thiếu xác thực là hiện trạng đã ghi ở R5 của design.

Giới hạn của lần review này:
- **Không chạy lại test.** Kết quả lấy từ evidence của orchestrator: BE 311 test pass sau T3 (`evidence/test-results/T3-attempt-1.yaml`; không file BE nào đổi sau T3), FE 36 test pass sau T6 (`evidence/test-results/T6-attempt-1.yaml`).
- **Không kiểm lại trailer của từng commit** (`REQ-ID`, `Task`, `Tests`, `AIWS-Run`). Phạm vi file của từng task được kiểm qua `evidence/runs/run-0005..0010.json`: `files_changed` nằm trọn trong `allowed_files`, không có `scope_violations_reverted`.
- `source-fe/src/main.js` không có test tự động (R12). Listener của D11 chỉ được kiểm bằng đọc code; **người review PR cần chạy tay** 6 bước ở mục "Không có TC tự động" của `03-test-spec.md`, và thử thêm tình huống bấm đúp ở finding thứ nhất.

## Findings
- [minor] source-fe/src/main.js:75 — Bấm đúp vào nút đổi trạng thái có thể đảo ngược chính thao tác vừa làm: sau lần bấm đầu, `refresh()` vẽ lại bảng và đặt nút có trạng thái đích ngược lại vào đúng vị trí cũ, nên lần bấm thứ hai (nếu tới sau khi bảng đã vẽ lại) gửi trạng thái đích ngược. Lập luận "bấm hai lần là thao tác không đổi gì" của D1/D11 chỉ đúng khi lần bấm thứ hai tới trước khi bảng vẽ lại. Code làm đúng D11 đã duyệt (không vô hiệu hoá nút), nên đây là hệ quả của thiết kế chứ không phải lệch design; suy ra từ đọc code, chưa kiểm chứng bằng chạy tay — Người review PR thử bấm đúp; nếu tái hiện được thì mở REQ/redesign để bỏ qua lần bấm khi đang có request đổi trạng thái chưa xong (không tự sửa trong REQ này vì D11 đã loại phương án đó).
- [minor] source-fe/src/components/customerTable.js:16 — `STATUS_ACTIONS[c.status]` tra cả thuộc tính kế thừa của object: `status` bằng `'constructor'`, `'toString'`, `'__proto__'`... cho giá trị truthy, nên dòng đó vẫn hiện một nút với `data-target-status=""` và nhãn `undefined`, trái câu "status ngoài hai giá trị trên thì chỉ có nút Sửa" của D9. Không xảy ra qua contract (API chỉ trả `ACTIVE`/`INACTIVE`), không tạo lỗ hổng XSS (giá trị vẫn qua `escapeHtml`, bấm nút chỉ nhận 400 `errors.status`), và test spec đã ghi ca này là [CẦN XÁC NHẬN], không đặt kỳ vọng — Tra bằng `Object.hasOwn(STATUS_ACTIONS, c.status)` và thêm một dòng dữ liệu `'constructor'` vào TC-105.
- [minor] source-fe/test/customerTable.test.js:214 — TC-105 thiếu assertion "dòng vẫn có đúng 6 `<td>`" trong `expected result` của test spec; dòng dữ liệu "thiếu field `status`" được viết thành `status: undefined` (key vẫn có mặt) thay vì bỏ hẳn key. Hành vi được kiểm vẫn tương đương và số cột đã được TC-36, TC-74, TC-103 giữ — Thêm `assert.equal(html.match(/<td>/g).length, 6)` và một khách hàng không có key `status`.
- [minor] source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java:476 — TC-92 và TC-97 (dòng 619) dùng `@ValueSource`, TC-98 dùng provider `Stream<String>` (dòng 661), trong khi plan T3 yêu cầu bảng dữ liệu của class này theo `@MethodSource` + `Arguments.of(...)`; thay đổi kéo theo import mới `ValueSource` (dòng 27). Test spec cho phép `@ValueSource` và hành vi được kiểm đúng, nên chỉ là lệch kiểu so với plan — Chấp nhận như hiện tại, hoặc đổi sang `@MethodSource` cho đồng nhất với các test khác trong class.

## Đối chiếu design
Mọi quyết định D1..D11 đã được hiện thực đúng.

| Quyết định | Kết quả | Dẫn chứng |
| --- | --- | --- |
| D1: `PUT /api/customers/{id}/status`, body là trạng thái đích, trả 200 kèm `Customer`; `id` chỉ lấy từ path; không có `GET` trên path này | Đúng | `CustomerHandler.java:72-77`. Field khác trong body bị bỏ qua (TC-91 dòng 3). `GET .../status` rơi vào fallback 404 (TC-100) |
| D2: thứ tự JSON hỏng → 404 → `errors.status` → đã đúng trạng thái → trùng số → ghi | Đúng | Handler đọc body trước khi gọi service (`CustomerHandler.java:74-75`); `CustomerService.java:52-63` theo đúng bước 3..7. Chứng minh bởi TC-98 (`Malformed JSON` trước 404), TC-88/TC-96 (404 trước 400), TC-87/TC-95 (đúng trạng thái trước kiểm tra trùng) |
| D3: trùng số khi kích hoạt lại trả 400 `errors.phone = "is already used by another customer"` qua `ValidationException` | Đúng | `CustomerService.java:57-61`; không thêm exception hay dòng map. TC-86, TC-93 so cả map `errors` |
| D4: record `UpdateCustomerStatusRequest(String status)`; so khớp chính xác, không trim, không đổi hoa thường; một thông điệp `must be ACTIVE or INACTIVE` | Đúng | `UpdateCustomerStatusRequest.java:4` (field `String`); `CustomerService.java:66-74` dùng `name().equals(status)` nên `null` không gây `NullPointerException`. TC-89 (16 dòng), TC-97 (8 body) |
| D5: `CustomerService.updateStatus` không gọi `check`/`PhoneNumbers`; bỏ qua kiểm tra trùng khi `phone = null`; chiều `INACTIVE` không điều kiện; trả `current` khi đã đúng trạng thái | Đúng | `CustomerService.java:50-64` trùng với đoạn mã mẫu của design. `list`, `get`, `create`, `update`, `check` không đổi. Dòng `01234567890` và dòng `null` của TC-84, TC-85, TC-86, TC-90 |
| D6: `CustomerRepository.updateStatus` chỉ đổi `status`, chép `id`/`name`/`email`/`phone` từ giá trị trong map, không bao giờ thêm mới | Đúng | `CustomerRepository.java:29-30` (có Javadoc); `InMemoryCustomerRepository.java:62-66` dùng `computeIfPresent`. Chữ ký `update` và tám method cũ không đổi. TC-82, TC-83 |
| D7: hằng `STATUS_BY_ID`, một khối route `PUT` đặt sau các khối `BY_ID` và trước fallback; cập nhật Javadoc class | Đúng | `CustomerHandler.java:23`, `:72-77`, Javadoc `:16-20`. `BY_ID`, `handle`, `send` và bốn route cũ không đổi; `App.java` không đổi. TC-99, TC-100 |
| D8: `updateCustomerStatus(id, status, options)` đi qua `request()` | Đúng | `customerApi.js:43-46`: `encodeURIComponent(id)`, `method: 'PUT'`, body đúng `{ status }`, có JSDoc. `request`, `ApiError` và bốn hàm cũ không đổi. TC-101, TC-102 |
| D9: nút đổi trạng thái trong ô "Thao tác", sau nút "Sửa" đúng một dấu cách; thứ tự thuộc tính `type`, `data-status-id`, `data-target-status`; bảng vẫn 6 cột; không có nút cho trạng thái lạ; sửa TC-74 đúng hai regex | Đúng, có một ca biên (finding thứ hai) | `customerTable.js:5-8` (`STATUS_ACTIONS`), `:16-19`, `:24`. `id` và trạng thái đích qua `escapeHtml`. TC-74 chỉ đổi hai regex khớp nguyên dòng (`customerTable.test.js:130`, `:134`), giữ mã, tên và mọi assertion khác. TC-103, TC-104, TC-105 |
| D10: hàm thuần `describeStatusError` trong `src/utils/`, nhận biết lỗi bằng hình dạng, không import, hai câu là hằng `UPPER_SNAKE_CASE` | Đúng | `describeStatusError.js:1-8`; hai câu đúng nguyên văn design; có JSDoc. TC-106, TC-107 |
| D11: một listener `click` mới trên `#customers`; thành công thì `refresh()`, thất bại thì ghi câu của D10 vào `#message` và không tải lại; không xác nhận, không vô hiệu hoá nút | Đúng theo design; xem finding thứ nhất | `main.js:75-85` trùng với đoạn mã mẫu; import ở `main.js:1`, `:4`. Listener của nút "Sửa" (`main.js:35-46`) và `refresh()` không đổi. Không có test tự động (R12) |

Các ràng buộc khác của design:
- Không đổi: `domain/*`, `service/PhoneNumbers.java`, `api/CreateCustomerRequest.java`, `api/UpdateCustomerRequest.java`, `api/Problem.java`, `error/*`, `App.java`, `source-fe/index.html` — không file nào trong số này có trong diff.
- Không DB, không migration, không dependency hay thư mục mới: đúng.
- `PUT /api/customers/{id}` vẫn bỏ qua `status`: `CustomerService.update` và route của nó không đổi; TC-51, TC-63 vẫn pass trong evidence.
- Các hành vi biên ở R11 (id vượt `long`, body JSON `null`, `status` không phải chuỗi) không được xử lý riêng và không có test, đúng như design và plan yêu cầu.

## Đối chiếu api-contract
Contract có đúng một endpoint: `PUT /api/customers/{id}/status` (`operationId: updateCustomerStatus`). BE expose đúng, FE gọi đúng.

**BE (`CustomerHandler`, `CustomerService`)**

| Mục của contract | Kết quả | Dẫn chứng |
| --- | --- | --- |
| Path và method; `id` chỉ gồm chữ số | Đúng | `STATUS_BY_ID = ^/api/customers/(\d+)/status$` và `method.equals("PUT")` (`CustomerHandler.java:23`, `:73`) |
| Request body `UpdateCustomerStatusRequest {status}`, field lạ bị bỏ qua | Đúng | Record một field `String status`; `FAIL_ON_UNKNOWN_PROPERTIES = false` của `JSON` |
| 200 `application/json`, schema `Customer` (đủ `id`, `name`, `email`, `phone` nullable, `status`) | Đúng | `send(exchange, 200, service.updateStatus(...))`; TC-91 kiểm `Content-Type` và `phone` JSON `null` có mặt; TC-92, TC-95 so nguyên `JsonNode` |
| 400 `Validation failed`, `errors` chỉ có key `phone` | Đúng | TC-93 |
| 400 `Validation failed`, `errors` chỉ có key `status` = `must be ACTIVE or INACTIVE` | Đúng | TC-97 |
| 400 `Malformed JSON`, không có `errors`, trả trước cả khi tìm khách hàng | Đúng | TC-98 (cả `/1/status` và `/999/status`) |
| 404 `Customer {id} not found`, kiểm tra trước `status` | Đúng | TC-96 |
| 404 `No route for <METHOD> <path>` khi `id` không phải chuỗi chữ số hoặc method khác | Đúng | TC-99, TC-100 |
| 500 `InternalError` | Đúng | Nhánh `RuntimeException` có sẵn của `handle`, không đổi |
| Mọi lỗi là `application/problem+json` (RFC 9457), schema `Problem` không đổi | Đúng | `send` chọn `Content-Type` theo kiểu body; không thêm `title` hay mã lỗi mới |
| Idempotent; không bao giờ tạo khách hàng mới; `id`, `name`, `email`, `phone` không đổi | Đúng | TC-95 (gửi hai lần liên tiếp), TC-83, TC-82 |

**FE (`customerApi.js`, `main.js`, `describeStatusError.js`)**

| Mục của contract | Kết quả | Dẫn chứng |
| --- | --- | --- |
| Gọi `PUT /api/customers/{id}/status` | Đúng | `customerApi.js:45`: `API_BASE` + `/customers/${encodeURIComponent(id)}/status`, `method: 'PUT'`; TC-101 |
| Body đúng `{"status": ...}`, `Content-Type: application/json` | Đúng | `JSON.stringify({ status })`; header do `request()` đặt khi có body; TC-101 so `deepEqual` đúng một key |
| Giá trị `status` gửi đi thuộc enum `CustomerStatus` | Đúng | Lấy từ `data-target-status` do `STATUS_ACTIONS` sinh ra, chỉ là `ACTIVE` hoặc `INACTIVE` (`customerTable.js:5-8`; `main.js:80`) |
| Đọc response 200 là `Customer` | Đúng | Hàm trả body của API; `main.js` không dùng body mà tải lại danh sách (D11) |
| Xử lý mọi mã lỗi được khai báo | Đúng | 400 `errors.phone` → câu báo trùng số; 400 `errors.status`, 400 `Malformed JSON`, 404, 500 và lỗi mạng → câu chung (`describeStatusError.js:7`; TC-102, TC-106, TC-107) |

Bốn endpoint cũ không nằm trong contract của REQ-003 và không đổi path, method, schema hay format lỗi.
