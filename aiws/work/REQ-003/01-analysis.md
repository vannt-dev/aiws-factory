# REQ-003 — Phân tích requirement

## Mục tiêu
Bộ phận CSKH cần đổi trạng thái của một khách hàng (đang hoạt động ↔ ngừng hoạt động) ngay trên hệ thống mới (`source-be` + `source-fe`). Hiện hệ thống mới chỉ **hiển thị** trạng thái (`source-fe/src/components/customerTable.js`: `STATUS_LABELS`) và không có đường nào đổi `status` sau khi tạo (`aiws/knowledge/db-schema.md`: "không có đường nào đổi `status` sau khi `insert`"; `aiws/knowledge/system-map.md` → Legacy → Hành vi → dòng "Đổi `status`").

Việc đổi trạng thái phải tôn trọng quy tắc BR-09 đang chạy ở cả legacy lẫn hệ thống mới: số điện thoại chỉ phải duy nhất giữa các khách hàng **đang hoạt động** (`source-legacy/customer_save.php` dòng 19–20, 27). Khách hàng ngừng hoạt động vẫn giữ nguyên dữ liệu nhưng không giữ số, nên số của họ có thể đã được cấp cho người khác; khi đó không được kích hoạt lại.

Đo thành công:
- Nhân viên ngừng hoạt động và kích hoạt lại được một khách hàng từ màn hình danh sách, và thấy trạng thái mới ngay sau khi đổi.
- Mọi yêu cầu kích hoạt lại đều kiểm tra BR-09: một thao tác đổi trạng thái đơn lẻ không tạo thêm cặp khách hàng `ACTIVE` nào dùng chung một số điện thoại (thao tác đồng thời: xem Q6).
- Ngừng hoạt động rồi kích hoạt lại không làm mất hay đổi họ tên, email, số điện thoại.

## Acceptance criteria
Truy vết:
- R1..R5 là năm gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-003-customer-status.md`, theo đúng thứ tự.
- RB là mục "Bối cảnh" (quy tắc số điện thoại duy nhất giữa các khách hàng đang hoạt động, tức BR-09 trong `aiws/knowledge/glossary.md`).

Quy ước dùng trong các AC:
- "Đổi trạng thái của khách hàng `{id}` sang X" là gửi yêu cầu đổi trạng thái tới khách hàng có `id` đó với trạng thái đích X (`ACTIVE` hoặc `INACTIVE`). Giả định endpoint là `PUT /api/customers/{id}/status` với body `{"status": "X"}` (Q1).
- "Ngừng hoạt động" là đổi sang `INACTIVE`; "kích hoạt lại" là đổi sang `ACTIVE`.
- "Lưu" là giá trị trong response thành công **và** trong các lần `GET` sau đó.
- "Không đổi gì" là `GET /api/customers` sau yêu cầu trả đúng danh sách như trước yêu cầu: cùng số phần tử, cùng giá trị từng field của **mọi** khách hàng.
- "Số theo quy tắc cũ" là số đang lưu không còn khớp `PhoneNumbers.isValid`, ví dụ `01234567890` (dữ liệu migrate, `aiws/knowledge/db-schema.md` → Migration).

**Đổi trạng thái (BE)**
- AC-1: Given khách hàng A đang `ACTIVE`, when đổi trạng thái của A sang `INACTIVE`, then trả 200 kèm `Customer` của A với `status = "INACTIVE"`, còn `id`, `name`, `email`, `phone` đúng bằng giá trị trước đó; giá trị này được lưu; số khách hàng và mọi khách hàng khác không đổi. Biến thể dữ liệu:
  - A có `phone = "0912345678"` → vẫn `0912345678` (số không bị xoá)
  - A có `phone = null` → vẫn `null`
  - A có số theo quy tắc cũ `01234567890` → vẫn ngừng hoạt động được, số giữ nguyên (không kiểm tra lại dữ liệu, Q3)

  (R1, R2)
- AC-2: Given khách hàng A đang `INACTIVE` và không có khách hàng `ACTIVE` nào khác đang dùng số điện thoại của A, when đổi trạng thái của A sang `ACTIVE`, then trả 200 kèm `Customer` của A với `status = "ACTIVE"`, còn `id`, `name`, `email`, `phone` đúng bằng giá trị trước đó; giá trị này được lưu; mọi khách hàng khác không đổi. Biến thể dữ liệu:
  - A có `phone = null`, trong khi các khách hàng `ACTIVE` khác cũng có `phone = null` → kích hoạt lại được (không có số thì không có gì để trùng)
  - A có `phone = "0912345678"`, không khách hàng nào khác có số này
  - A có `phone = "0912345678"`, số này chỉ đang được một khách hàng `INACTIVE` khác giữ
  - A có số theo quy tắc cũ `01234567890`, không khách hàng `ACTIVE` nào khác có số này → kích hoạt lại được (chỉ kiểm tra trùng, không kiểm tra lại định dạng, Q3)

  (R1, RB; BR-09)
- AC-3: Given khách hàng A đang `INACTIVE` có `phone = "0912345678"` và một khách hàng B khác đang `ACTIVE` cũng có `phone = "0912345678"`, when đổi trạng thái của A sang `ACTIVE`, then yêu cầu bị từ chối bằng response lỗi `application/problem+json` nêu rõ số điện thoại đang được khách hàng khác dùng (giả định 400 với `errors.phone = "is already used by another customer"`, Q2), A vẫn `INACTIVE`, và không đổi gì (cả A lẫn B). Biến thể dữ liệu (cách B có được số của A):
  - A được tạo với số `0912345678`, bị ngừng hoạt động, sau đó B được **tạo mới** với số `0912345678` (`POST /api/customers` chấp nhận vì A không còn giữ số), rồi kích hoạt lại A
  - như trên nhưng B là khách hàng có sẵn được **sửa** sang số `0912345678` (`PUT /api/customers/{id}`)

  (R3, RB; BR-09)
- AC-4: Given khách hàng A đang ở đúng trạng thái đích, when đổi trạng thái của A sang trạng thái đó, then trả 200 kèm `Customer` của A như đang lưu, không báo lỗi, và không đổi gì. Việc "đã ở đúng trạng thái" được xét **trước** kiểm tra trùng số. Biến thể dữ liệu:
  - A `ACTIVE`, đổi sang `ACTIVE`
  - A `INACTIVE`, đổi sang `INACTIVE`
  - A `INACTIVE` có số `0912345678` đang được khách hàng `ACTIVE` B dùng, đổi sang `INACTIVE` → vẫn 200, không báo lỗi trùng số
  - A `ACTIVE` có số `0912345678` mà một khách hàng `ACTIVE` khác cũng đang có (dữ liệu trùng có từ trước, Q6), đổi sang `ACTIVE` → vẫn 200, không báo lỗi trùng số

  (R4)
- AC-5: Given không có khách hàng nào mang `id` được yêu cầu (ví dụ `999`), when đổi trạng thái của khách hàng `999` sang `ACTIVE` hoặc `INACTIVE`, then trả 404 `application/problem+json` với `title = "Not Found"` và `detail = "Customer 999 not found"` như `GET /api/customers/{id}` và `PUT /api/customers/{id}`, và không đổi gì. (R1: chỉ đổi trạng thái của "một khách hàng" đã có)
- AC-6: Given khách hàng A đang có, when gửi yêu cầu đổi trạng thái của A mà trạng thái đích không phải `ACTIVE` hay `INACTIVE` (thiếu field `status`, `status = null`, `status = ""`, `status = "DELETED"`), then yêu cầu bị từ chối bằng response lỗi `application/problem+json` (giả định 400, Q1) và không đổi gì. (R1, RB: chỉ có hai trạng thái; hình dạng cụ thể phụ thuộc Q1)

**Gọi API (FE, `source-fe/src/api/customerApi.js`)**
- AC-7: Given khách hàng có `id = 7`, when gọi hàm đổi trạng thái của API client cho `id` đó với trạng thái đích `INACTIVE` hoặc `ACTIVE`, then client gửi đúng một request `PUT /api/customers/7/status` có `Content-Type: application/json`, body JSON là `{"status":"INACTIVE"}` hoặc `{"status":"ACTIVE"}` tương ứng, và hàm trả về khách hàng mà API trả. (R1, R5; method, path và body theo giả định Q1)
- AC-8: Given API từ chối yêu cầu đổi trạng thái, when gọi hàm đổi trạng thái của API client, then hàm ném `ApiError` mang đúng thông tin của API. Biến thể dữ liệu:
  - 400 Problem có `errors = { phone: "is already used by another customer" }` → `status = 400`, `fieldErrors` đúng bằng object đó (theo giả định Q2)
  - 404 Problem không có `errors` → `status = 404`, `fieldErrors` rỗng

  (R3)

**Màn hình danh sách (FE)**
- AC-9: Given danh sách có ít nhất một khách hàng, when `renderCustomerTable`, then mỗi dòng có đúng một điều khiển đổi trạng thái (nút) mang `id` của khách hàng ở dòng đó và trạng thái đích ngược với trạng thái hiện tại; năm cột dữ liệu (`ID, Họ tên, Email, Điện thoại, Trạng thái`) và nút "Sửa" (`data-edit-id`) của từng dòng giữ nguyên nội dung và thứ tự. Biến thể dữ liệu:
  - khách hàng `ACTIVE` → nút nhãn "Ngừng hoạt động", trạng thái đích `INACTIVE` (nhãn theo giả định Q4)
  - khách hàng `INACTIVE` → nút nhãn "Kích hoạt lại", trạng thái đích `ACTIVE`
  - `id = '7"><b>x</b>'` → `id` trong thuộc tính của nút được escape HTML, không sinh thẻ `<b>` và không thoát khỏi thuộc tính

  (R5)
- AC-10: Given yêu cầu đổi trạng thái thất bại, when FE chọn thông báo để hiện cho nhân viên, then thông báo là câu tiếng Việt nói đúng lý do. Biến thể dữ liệu (lời văn theo giả định Q4):
  - `ApiError` 400 có `fieldErrors.phone` (kích hoạt lại bị từ chối vì trùng số) → "Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng."
  - `ApiError` không có `fieldErrors` (404, 500) hoặc lỗi không phải `ApiError` (mất mạng) → thông báo chung "Không đổi được trạng thái khách hàng."

  (R3: "báo lỗi rõ ràng"; R5)

Phần "cập nhật lại sau khi đổi" của R5 gồm hai nửa. Nửa hiển thị (trạng thái mới kéo theo nhãn và nút mới) do AC-9 kiểm chứng. Nửa nối dây (gọi lại `refresh()` sau khi đổi) nằm trong `source-fe/src/main.js`, không có seam unit test, nên kiểm bằng review hoặc chạy tay (xem Impact → FE và Q7).

## Impact
- **Module (BE)**, `source-be/src/main/java/com/example/crm/`:
  - `service/CustomerService.java`: cần thêm thao tác đổi trạng thái. Hiện chỉ có `list`, `get`, `create`, `update`; `create` luôn truyền `ACTIVE` (dòng 37) và `update` không đụng tới `status` (dòng 41–48). Ràng buộc rút ra từ AC:
    - **Không đi qua hàm private `check`** (dòng 51–80). `check` kiểm tra lại họ tên, email và định dạng số, nên khách hàng có số theo quy tắc cũ sẽ không đổi trạng thái được (hành vi của `PUT`, TC-54), trái với AC-1, AC-2 và R2.
    - Thứ tự quan sát được: không tìm thấy (AC-5) → đã ở đúng trạng thái (AC-4) → nếu kích hoạt lại thì kiểm tra trùng số với khách hàng `ACTIVE` khác (AC-3) → ghi.
    - Chiều ngừng hoạt động không có điều kiện nào (AC-1).
  - `repository/CustomerRepository.java`, `repository/InMemoryCustomerRepository.java`:
    - Chưa có thao tác ghi `status`: `update(id, name, email, phone)` chép lại `c.status()` (`InMemoryCustomerRepository.java` dòng 57–60), và convention là thao tác ghi chỉ nhận các trường được phép đổi (`aiws/knowledge/conventions.md` → Backend → Đặt tên và style). Cần một thao tác ghi mới chỉ đổi `status`; tên và chữ ký do architect quyết. Chữ ký `update` hiện có nên giữ nguyên (TC-44..TC-47 và `CustomerService.update` đang dùng).
    - Truy vấn trùng **không cần thêm**: `existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)` đã đúng với điều kiện của R3.
  - `api/CustomerHandler.java`:
    - `route` (dòng 48–71) cần route mới. `BY_ID = ^/api/customers/(\d+)$` (dòng 21) không khớp path con, nên `/api/customers/1/status` hiện rơi vào fallback 404 `No route for <METHOD> <path>`.
    - Javadoc của class (dòng 16–19) liệt kê mọi endpoint nên phải cập nhật.
    - `handle` (dòng 32–46) dùng lại nguyên nếu lỗi trùng số là 400 (Q2). Nếu architect chọn 409 thì cần exception mới trong `error/` và một dòng map mới.
  - `api/`: body của thao tác mới (nếu có) cần request record riêng theo convention "mỗi thao tác ghi một record" (`CreateCustomerRequest`, `UpdateCustomerRequest`).
  - **`PUT /api/customers/{id}` không được dùng để đổi trạng thái.** REQ-002 đã chốt và có test rằng `PUT` bỏ qua `status` trong body và giữ nguyên trạng thái (`aiws/work/REQ-002/01-analysis.md` AC-3; `CustomerHandlerTest` TC-63; `CustomerServiceTest` TC-51). `api/UpdateCustomerRequest.java` và `CustomerService.update` dự kiến không đổi.
  - Dự kiến **không đổi**: `domain/Customer.java`, `domain/CustomerStatus.java` (đã có đủ `ACTIVE`, `INACTIVE`), `service/PhoneNumbers.java`, `api/Problem.java`, `App.java` (context `/api/customers` đã bao cả path con; seed vẫn là 2 khách hàng `ACTIVE` không có số).
  - Test, `source-be/src/test/java/com/example/crm/`: thêm vào `service/CustomerServiceTest.java`, `api/CustomerHandlerTest.java`, và `repository/InMemoryCustomerRepositoryTest.java` cho thao tác ghi mới.
    - Trạng thái mà API không tạo ra được vẫn phải dựng bằng `repository.insert(...)` ở service test: số theo quy tắc cũ (AC-1, AC-2) và hai khách hàng `ACTIVE` trùng số (AC-4).
    - Từ REQ này, HTTP test dựng được khách hàng `INACTIVE` qua chính API. Trước đây không dựng được (`aiws/knowledge/conventions.md` → Test → BE). Nhờ vậy kịch bản đầu-cuối của AC-3 chạy được ở `CustomerHandlerTest`.
    - Mã TC đánh số tiếp từ **TC-82** (`aiws/knowledge/conventions.md` → Test → Mã TC).
- **API**, `aiws/knowledge/api-inventory.md`:
  - Endpoint mới để đổi trạng thái (giả định `PUT /api/customers/{id}/status`, Q1): 200 kèm `Customer`; lỗi trùng số khi kích hoạt lại (giả định 400 kèm `errors.phone`, Q2); 404 Problem khi `id` không tồn tại; lỗi khi trạng thái đích không hợp lệ (AC-6).
  - Bốn endpoint hiện có và schema `Customer` không đổi. Field `status` trong response đã có sẵn.
  - Contract của REQ-003 do architect viết (`aiws/work/REQ-003/api-contract.yaml`); `aiws/work/REQ-001/api-contract.yaml` và `aiws/work/REQ-002/api-contract.yaml` chỉ mô tả bốn endpoint cũ.
  - Sau khi merge, phase knowledge cần cập nhật:
    - `api-inventory.md`: bảng endpoint, key của `errors`.
    - `db-schema.md`: câu "không có đường nào đổi `status` sau khi `insert`", câu "Hiện chưa có delete và chưa có thao tác đổi `status`", bảng method của repository.
    - `system-map.md`: dòng "Đổi `status`" trong Legacy → Hành vi, mô tả `CustomerService` và component bảng, thêm luồng đổi trạng thái.
    - `glossary.md`: dòng "Thao tác", "Đang hoạt động", "Ngừng hoạt động", và thuật ngữ mới "Kích hoạt lại".
    - `conventions.md`: ghi chú HTTP test không dựng được khách hàng `INACTIVE`.
- **DB**:
  - Hệ thống mới **không có DB** (`aiws/knowledge/db-schema.md`), nên không có migration. Thay đổi nằm ở kho in-memory `InMemoryCustomerRepository`.
  - Không cần cột mới: `Customer.status` đã có, tương ứng `customers.status TINYINT(1)` của legacy (1 = `ACTIVE`, 0 = `INACTIVE`; `source-legacy/sql/schema.sql` dòng 7).
  - Khi có DB thật, thao tác tương đương `UPDATE customers SET status = ? WHERE id = ?`, và kiểm tra của AC-3 là đúng câu `SELECT id FROM customers WHERE phone = ? AND status = 1 AND id <> ?` đang chạy trên `idx_customers_phone` (`source-legacy/customer_save.php` dòng 27).
  - **Legacy không có code đổi trạng thái để port**: `source-legacy/customer_save.php` chỉ `INSERT` với `status = 1` (dòng 46) và `UPDATE` không có cột `status` (dòng 43); `source-legacy/customer_list.php` chỉ đọc (dòng 20). Tham chiếu legacy duy nhất của REQ này là BR-09 (xem Q8).
- **FE**, `source-fe/`:
  - `src/api/customerApi.js`: thêm hàm đổi trạng thái (AC-7, AC-8). `request()` và `ApiError` dùng lại, không cần sửa. Một hàm nhận trạng thái đích hay hai hàm riêng do architect quyết.
  - `src/components/customerTable.js`: thêm điều khiển đổi trạng thái cho mỗi dòng (AC-9). Hiện cột "Thao tác" chỉ có nút "Sửa" (dòng 16).
    - **Test hiện có sẽ phải sửa**, `test/customerTable.test.js`:
      - TC-74 (REQ-002) khớp nguyên cả dòng, kết thúc bằng `<td><button type="button" data-edit-id="1">Sửa</button></td></tr>`. Thêm nút vào ô "Thao tác" (trước hay sau nút "Sửa") hoặc thêm ô mới đều làm test này fail.
      - TC-36 (REQ-001, đã sửa một lần ở REQ-002) và TC-74 cùng neo nguyên `<thead>` và đòi mỗi dòng đúng 6 `<td>`. Hai assertion này chỉ fail nếu thiết kế thêm cột thứ bảy.
      - Test đầu tiên của file và TC-74 đếm `<tr>` (2 và 3), chỉ fail nếu thiết kế thêm `<tr>` hoặc thêm thuộc tính vào `<tr>`.
    - Việc cập nhật các test này là thay đổi dự kiến và phải được ghi rõ trong design để người duyệt thấy (AGENTS.md mục 9), như REQ-002 đã làm với TC-36 (`aiws/work/REQ-002/02-design.md` D9, R7). **Không** né assertion cũ bằng mẹo (ví dụ `<td class="...">` để regex `/<td>/` không đếm, hay thêm ô mà không thêm `<th>`).
    - Nhãn nút "Ngừng hoạt động" trùng chữ với nhãn trạng thái `INACTIVE` trong `STATUS_LABELS` (Q4).
  - Thông báo lỗi (AC-10): `src/main.js` không có seam unit test vì `node:test` không có DOM (`aiws/knowledge/conventions.md` → Test → FE). Để AC-10 kiểm chứng được bằng unit test, phần "lỗi nào thì hiện câu nào" cần là hàm thuần ở `src/components/` hoặc `src/utils/`, theo convention "logic nằm trong hàm thuần, `main.js` chỉ nối sự kiện". Tên và vị trí do architect quyết.
  - `src/main.js`: handler `click` trên `#customers` (dòng 34–45) hiện chỉ tìm `button[data-edit-id]`; cần nhận thêm nút đổi trạng thái (delegation, vì vùng này bị gán lại `innerHTML` sau mỗi `refresh()`). Handler xoá `#message`, gọi hàm đổi trạng thái, thành công thì `refresh()` (R5), thất bại thì ghi thông báo của AC-10 vào `#message`. Phần này kiểm bằng review hoặc chạy tay.
  - `index.html`: dự kiến không đổi (`#message` và `#customers` đã có). Form sửa `#edit-customer` không hiện trạng thái nên không bị ảnh hưởng.
  - Test: thêm vào `test/customerApi.test.js`, `test/customerTable.test.js`, và file test mới nếu có hàm thuần mới.

## Reuse
- **Đặc tả tham chiếu** (quy tắc, không gọi trực tiếp): BR-09 trong `source-legacy/customer_save.php` dòng 19–20 (comment) và dòng 27 (`WHERE phone = ? AND status = 1 AND id <> ?`); mapping `status` 1/0 trong `source-legacy/sql/schema.sql` dòng 7.
- **BE**, `source-be/src/main/java/com/example/crm/`:
  - `repository/CustomerRepository.java:existsByPhoneAndStatusAndIdNot(phone, CustomerStatus.ACTIVE, id)`: đúng kiểm tra của AC-3, dùng nguyên. `InMemoryCustomerRepository` viết `phone.equals(c.phone())`, nên phải bỏ qua kiểm tra khi số của A là `null` (AC-2, biến thể đầu).
  - `repository/InMemoryCustomerRepository.java:update`: mẫu cho thao tác ghi mới (`computeIfPresent` với hàm thuần, trả `Optional<Customer>`, không bao giờ thêm mới).
  - `service/CustomerService.java:get` + `error/NotFoundException.java`: 404 với detail `Customer {id} not found` (AC-5). `CustomerService.update` là mẫu thứ tự "kiểm tra tồn tại trước, rồi mới tới quy tắc" và cách xử lý `Optional` của thao tác ghi bằng `orElseThrow`.
  - `error/ValidationException.java`: mang `Map<String, String>` lỗi theo field, đã được map sang 400 kèm `errors` (dùng cho AC-3 và AC-6 theo giả định Q1, Q2).
  - `domain/CustomerStatus.java`: enum đủ hai giá trị, là tập trạng thái đích hợp lệ.
  - `api/CustomerHandler.java`: mẫu khối route, `JSON` (đọc body trước khi gọi service), `send`, bảng map exception trong `handle`.
  - Test: `CustomerHandlerTest` (helper `get`, `post`, `put(path, json)`, `customers()`, `errorsOf(body)`; mẫu "chụp `before = customers()` rồi so lại" để chứng minh không đổi gì); `CustomerServiceTest` (`InMemoryCustomerRepository` thật, dựng `INACTIVE` và số theo quy tắc cũ bằng `repository.insert`, `@ParameterizedTest` + `@MethodSource`, provider `Stream<CustomerStatus>` của TC-51).
- **FE**, `source-fe/`:
  - `src/api/customerApi.js`: `request()`, `ApiError.fieldErrors`; `updateCustomer` là mẫu cho hàm ghi có `id` trên path (`encodeURIComponent(id)`, `JSON.stringify`).
  - `src/components/customerTable.js`: `STATUS_LABELS` (nhãn "Đang hoạt động" / "Ngừng hoạt động"), cột "Thao tác" và mẫu nút `<button type="button" data-edit-id="...">` (nút hành động mang thuộc tính `data-*`).
  - `src/utils/escapeHtml.js`: escape cả `"` và `'`, dùng cho `id` đặt trong thuộc tính (AC-9).
  - `src/main.js`: `refresh()` để tải lại danh sách; handler `click` trên `#customers` là mẫu event delegation; `#message` (`role="alert"`) là nơi hiện lỗi không gắn với form.
  - Test: `fakeFetch(status, body, calls)` trong `test/customerApi.test.js` (mẫu TC-70..TC-73); so chuỗi HTML và test escape thuộc tính trong `test/customerTable.test.js` (mẫu TC-74, TC-75).

## Ngoài phạm vi
- Xoá khách hàng; lọc hoặc tìm kiếm danh sách theo trạng thái; ghi lịch sử ai đổi trạng thái và lúc nào (requirement → Ngoài phạm vi).
- Thay đổi hành vi của `PUT /api/customers/{id}`: vẫn bỏ qua `status`, khách hàng `INACTIVE` vẫn sửa được, và vẫn kiểm tra lại số ở mọi lần sửa (REQ-002).
- Thay đổi quy tắc trùng số của thêm mới và sửa (BR-09 đã chạy đúng: số của khách hàng `INACTIVE` dùng lại được ngay). REQ này chỉ thêm kiểm tra ở chiều kích hoạt lại.
- Kiểm tra email khi kích hoạt lại. Thêm mới và sửa kiểm tra trùng email bất kể trạng thái (`aiws/knowledge/db-schema.md`), nên khách hàng `INACTIVE` vẫn giữ email và việc kích hoạt lại không làm phát sinh trùng email qua API hiện có.
- Tự xoá hoặc tự đổi số điện thoại khi ngừng hoạt động hay khi kích hoạt lại bị từ chối (R2). Muốn kích hoạt lại, nhân viên tự sửa hoặc xoá số bằng chức năng sửa.
- Hộp thoại xác nhận trước khi ngừng hoạt động (Q5), lý do ngừng hoạt động, đổi trạng thái hàng loạt.
- Trạng thái thứ ba ngoài `ACTIVE` / `INACTIVE`.
- Đăng nhập, phân quyền ("nhân viên" là mọi người dùng màn hình; hệ thống chưa có auth).
- DB thật, migrate dữ liệu legacy, khoá hoặc phát hiện thao tác đồng thời (Q6).
- Đổi cách hiển thị lỗi của form thêm và form sửa.

## Câu hỏi mở
Không có câu hỏi blocking. Các giả định dưới đây cần người duyệt design xem lại.

- [non-blocking] Q1: Endpoint và ngữ nghĩa của thao tác đổi trạng thái? Giả định:
  - `PUT /api/customers/{id}/status`, body `{"status": "ACTIVE" | "INACTIVE"}`, `id` lấy từ path. Thành công trả 200 kèm `Customer` sau khi đổi. `PUT` lên một tài nguyên con là thao tác idempotent, khớp với R4 (đặt lại đúng trạng thái đang có thì không lỗi).
  - Cách khác: hai endpoint hành động (`POST .../deactivate`, `POST .../activate`) hoặc `PATCH /api/customers/{id}`. Ràng buộc duy nhất từ hiện trạng: không gộp vào `PUT /api/customers/{id}` (xem Impact).
  - Architect chốt method, path, body và mã trạng thái. AC-1..AC-5 chỉ phụ thuộc vào ngữ nghĩa "đặt trạng thái đích". AC-7 ghi thẳng request theo giả định này và đổi theo nếu architect chọn khác. AC-6 chỉ có nghĩa đầy đủ khi request mang giá trị trạng thái; với endpoint hành động thì nó thu về "path hành động lạ rơi vào fallback 404".
  - Chưa đưa vào AC, architect chốt: `id` không tồn tại **và** trạng thái đích không hợp lệ thì trả 404 hay 400; có chấp nhận giá trị viết thường (`"active"`) hay không (đề xuất không: chỉ nhận đúng giá trị mà API trả ra).
- [non-blocking] Q2: Kích hoạt lại bị từ chối vì trùng số thì response lỗi có hình dạng gì? Giả định 400 `Validation failed` với `errors.phone = "is already used by another customer"`.
  - Lý do: đúng convention hiện có. Mọi vi phạm quy tắc nghiệp vụ, kể cả trùng số ở `POST` và `PUT`, đều là `ValidationException` → 400 kèm `errors` (`aiws/knowledge/api-inventory.md` → Quy ước → Format lỗi); FE đã đọc được qua `ApiError.fieldErrors`; không cần exception hay dòng map mới.
  - Cách khác: 409 Conflict với `detail` riêng, vì `phone` không phải field của request đổi trạng thái. Cách này thêm một loại lỗi mới vào API.
  - Ba AC ghi theo giả định 400 là AC-3, AC-8 và AC-10; nếu architect chọn 409 thì ba AC này đổi theo (hành vi "A vẫn `INACTIVE`, không đổi gì" thì không đổi).
- [non-blocking] Q3: Khi đổi trạng thái có kiểm tra lại họ tên, email, định dạng số điện thoại không? Giả định **không**: chiều ngừng hoạt động không kiểm tra gì; chiều kích hoạt lại chỉ kiểm tra đúng một điều kiện mà R3 nêu (số đang được khách hàng `ACTIVE` khác dùng); khách hàng không có số luôn kích hoạt lại được.
  - Hệ quả: khách hàng migrate có số theo quy tắc cũ (ví dụ `01234567890`) vẫn ngừng hoạt động và kích hoạt lại được, dù **sửa** khách hàng đó thì bị chặn cho tới khi đổi số (REQ-002, TC-54). Hai thao tác khác nhau có chủ ý: sửa ghi lại số nên phải kiểm tra, đổi trạng thái không đụng tới số (R2).
  - Nếu muốn kích hoạt lại cũng chặn số không còn hợp lệ, người duyệt nói ở bước duyệt design; khi đó biến thể cuối của AC-2 đổi thành ca lỗi.
- [non-blocking] Q4: Nhãn nút và lời thông báo trên màn hình? Giả định:
  - Nút của khách hàng `ACTIVE` là "Ngừng hoạt động", của khách hàng `INACTIVE` là "Kích hoạt lại" (theo tiêu đề requirement), đặt trong cột "Thao tác" cạnh nút "Sửa". Lưu ý: "Ngừng hoạt động" cũng là nhãn trạng thái của khách hàng `INACTIVE`, nên một dòng `ACTIVE` sẽ có ô trạng thái "Đang hoạt động" đứng cạnh nút "Ngừng hoạt động". Nếu dễ nhầm, có thể dùng nhãn ngắn hơn (ví dụ "Ngừng"); người duyệt design chốt.
  - "Báo lỗi rõ ràng" (R3) là một câu tiếng Việt nêu lý do trong `#message` (AC-10), không phải dòng `phone: is already used by another customer` kiểu form thêm. Lời văn cụ thể trong AC-10 là đề xuất.
  - Khách hàng có `status` ngoài hai giá trị đã biết (bảng hiện đang in nguyên giá trị gốc): chưa đưa vào AC; đề xuất không hiện nút đổi trạng thái.
- [non-blocking] Q5: Có hỏi xác nhận trước khi ngừng hoạt động không? Giả định không: requirement không yêu cầu, thao tác đảo ngược được bằng "Kích hoạt lại" và không làm mất dữ liệu (R2). Rủi ro còn lại: trong lúc A ngừng hoạt động do bấm nhầm, số của A có thể bị khách hàng khác lấy, và khi đó A không kích hoạt lại được cho tới khi đổi số.
- [non-blocking] Q6: Thao tác đồng thời và dữ liệu trùng có sẵn? Giả định chấp nhận như hiện trạng.
  - Kiểm tra trùng rồi mới ghi không nguyên tử, giống thêm mới và sửa (`aiws/knowledge/db-schema.md`; `aiws/work/REQ-002/02-design.md` R3): hai yêu cầu kích hoạt lại đồng thời cho hai khách hàng `INACTIVE` cùng số có thể cùng thành công.
  - Nếu đã tồn tại hai khách hàng `ACTIVE` trùng số (do tình huống trên hoặc do dữ liệu migrate), REQ này không dọn dẹp và không báo lỗi khi đặt lại đúng trạng thái đang có (AC-4, biến thể cuối).
  - Hai nhân viên cùng đổi trạng thái một khách hàng: yêu cầu thứ hai hoặc là thao tác không đổi gì (R4), hoặc đổi ngược lại; yêu cầu ghi sau thắng.
- [non-blocking] Q7: "Cập nhật lại sau khi đổi" (R5) kiểm chứng thế nào? Giả định: sau khi đổi thành công, FE gọi lại `refresh()` để tải cả danh sách (không tự vá một dòng), như sau khi thêm và sửa. Phần này nằm trong `source-fe/src/main.js`, không unit test được, nên không có AC riêng và được kiểm bằng review hoặc chạy tay. Đề xuất thêm: khi đổi thất bại cũng tải lại danh sách, vì lỗi thường đến từ danh sách đang xem đã cũ; architect chốt.
- [non-blocking] Q8: [CẦN XÁC NHẬN] Legacy đổi trạng thái bằng cách nào? Repo `source-legacy` không có code nào ghi cột `status` ngoài `INSERT ... status = 1` (`aiws/knowledge/system-map.md` → Legacy → Hành vi → "Đổi `status`"), nên không có hành vi legacy để đối chiếu (ví dụ legacy có kiểm tra trùng số khi kích hoạt lại hay không). Giả định: các gạch đầu dòng R1..R4 của requirement là đặc tả đầy đủ, và BR-09 là quy tắc legacy duy nhất phải giữ.
