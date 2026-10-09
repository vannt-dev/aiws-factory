# REQ-004 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-4 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D8). `api-contract.yaml` có `paths: {}` vì REQ-004 không đổi API, nên không có TC nào cho endpoint mới hay đổi. Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB, trình duyệt hay đồng hồ thật.

**Mức test và framework** (`aiws/knowledge/conventions.md` → Test):
- FE, `unit`: `node:test` + `node:assert/strict`. Bảng dữ liệu là một mảng, lặp bằng `for...of` trong **một** `test(...)`; không dùng `describe` hay subtest.
  - `createDoubleClickGuard` (file test mới `source-fe/test/createDoubleClickGuard.test.js`): thời điểm bấm là **số truyền vào** (`at`, mili giây). Không `setTimeout`, không `Date.now()`/`performance.now()`, không mock timer, không mock hay fake nào. Kết quả so bằng `assert.equal(..., true)` / `assert.equal(..., false)` (so chặt, không phải truthy/falsy).
  - `renderCustomerTable` (`source-fe/test/customerTable.test.js`): so chuỗi HTML bằng `assert.match`/`assert.doesNotMatch`, đếm bằng `html.match(/.../g).length`.
- BE, `integration`: `CustomerHandlerTest` (JUnit Jupiter) khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, nên vẫn chạy trong `be_test` mà không cần môi trường ngoài. REQ-004 **không thêm test BE**; nó chỉ đổi nguồn dữ liệu của hai test có sẵn (D7).

**Đánh số TC**:
- Mã mới là **TC-108..TC-114**, đánh số tiếp sau TC-107 của REQ-003 (`aiws/knowledge/conventions.md` → Test → Mã TC; D8).
- Ba mã có sẵn của REQ-003 được **định nghĩa lại** trong file này vì REQ-004 sửa chính các test đó (D6, D7, D8): **TC-92, TC-97** (AC-4) và **TC-105** (AC-3). Dãy mã của file vì thế không liền nhau: TC-92, TC-97, TC-105, rồi TC-108..TC-114.
  - Đây là điểm khác tiền lệ: REQ-002 và REQ-003 **không** định nghĩa lại TC-36 và TC-74 khi sửa chúng. Lý do phải làm khác:
    - AC-4 không thể có mã mới. Mã TC nằm trong `@DisplayName`, mà AC-4(b) đòi tên hiển thị giữ nguyên. Thiếu TC-92 và TC-97 thì AC-4 không có TC nào (rule `every_ac_has_tc`).
    - Plan chỉ gán được cho task những mã có trong file này (`validatePlan` trong `aiws/adapters/cli/src/validate.js`), và design giao TC-92, TC-97 cho nhóm BE-1, TC-105 cho nhóm FE-1.
  - Trường `covers` của ba TC này trỏ tới AC của **REQ-004**. Truy vết gốc của chúng tới AC của REQ-003 vẫn nằm trong `aiws/work/REQ-003/03-test-spec.md`, file đó không sửa.
  - `level`, `type`, `priority` của ba TC này giữ như REQ-003, vì vẫn là cùng một test trong code.
- **Giới hạn (R9)**: orchestrator kiểm "mã TC có mặt trong file test mà task đã sửa" trên toàn bộ nội dung file (`aiws/adapters/cli/src/engine.js`, `runUnitTests`). Với TC-92, TC-97, TC-105 phép kiểm này pass sẵn nhờ tên test cũ, kể cả khi chưa sửa gì. **Reviewer phải đọc diff của ba test này.** Mọi kỳ vọng mới vì thế mang mã mới (TC-108..TC-114).
- Mọi test cũ khác (có hay không có mã TC) không sửa và phải pass. Hồi quy của dòng `ACTIVE`/`INACTIVE` sau D5 do TC-36, TC-74, TC-103, TC-104 giữ (HTML của hai dòng đó giữ nguyên từng ký tự).

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương:
  - Lần bấm, theo đầu vào của guard `(key, at)`: chưa có lần bấm được xử lý nào của `key` / có, cách dưới 500 ms / có, cách từ 500 ms trở lên.
  - `key`: cùng key / key khác / key trùng tên thuộc tính có sẵn của object.
  - `status` khi render bảng: `ACTIVE`, `INACTIVE` (có nút; test cũ giữ) / trạng thái lạ thông thường (TC-105) / trạng thái lạ trùng tên thuộc tính có sẵn (TC-114).
  - Cách "không có `status`": `''`, `null`, thiếu hẳn key (TC-105).
- Giá trị biên của cửa sổ 500 ms (D1), theo khoảng cách `at − last(key)`:

  | Khoảng cách (ms) | Quyết định | TC |
  | --- | --- | --- |
  | 0, 1 | bỏ qua | TC-108 |
  | 499, 499.9 | bỏ qua | TC-108 |
  | 500 | xử lý | TC-109 |
  | 501, 100000 | xử lý | TC-109 |

  Biên của mốc: `last(key) = 0` là một mốc hợp lệ (TC-108).
- Chuyển trạng thái của một `key` trong guard (D1):

  | Trạng thái | Sự kiện | Điều kiện | Trạng thái sau | Kết quả | TC |
  | --- | --- | --- | --- | --- | --- |
  | chưa có mốc | bấm tại `at` | không có | mốc = `at` | `true` | TC-109, TC-113 |
  | mốc = `last` | bấm tại `at` | `at − last < 500` | mốc = `last` (không dời) | `false` | TC-108, TC-110, TC-112 |
  | mốc = `last` | bấm tại `at` | `at − last >= 500` | mốc = `at` | `true` | TC-109, TC-110 |

  Chuỗi nhiều bước (TC-110): xử lý → bỏ qua → xử lý, và xử lý → xử lý → bỏ qua → xử lý.
- Bảng quyết định cho "từng khách hàng độc lập" (Q2, D1):

  | `key` đã có mốc | Trong cửa sổ của chính `key` | Key khác vừa được xử lý (dưới 500 ms) | Quyết định | TC |
  | --- | --- | --- | --- | --- |
  | không | — | không | xử lý | TC-109 |
  | không | — | có | xử lý | TC-111 |
  | có | có | không | bỏ qua | TC-108 |
  | có | có | có | bỏ qua | TC-111 |
  | có | không | không | xử lý | TC-109 |
  | có | không | có | xử lý | TC-111 |

- Đoán lỗi (error guessing) cho các cách hiện thực sai mà design đã cảnh báo:
  - Kiểm tra truthy với mốc, làm mốc `0` bị coi là chưa có (D2): dòng `0`, `499` của TC-108.
  - Làm tròn thời điểm lên số nguyên (1499.9 thành 1500): dòng 499.9 của TC-108. So sánh `<=` thay cho `<`: dòng 500 của TC-109.
  - Cửa sổ trượt, tức lần bấm bị bỏ qua cũng dời mốc (D1 → Đã cân nhắc): dòng thứ nhất của TC-110.
  - Chỉ ghi mốc ở lần bấm đầu tiên, lần được xử lý sau đó không dời mốc: dòng thứ hai của TC-110.
  - Một mốc chung cho mọi key, hoặc chỉ nhớ key bấm gần nhất (Q2): TC-111.
  - State là object thường thay cho `Map` (D2 → Bắt buộc): TC-112. Với object thường, phép gán vào `'__proto__'` không tạo thuộc tính riêng, nên lần gọi thứ hai không thấy mốc. [CẦN XÁC NHẬN] suy ra từ ngữ nghĩa JavaScript, chưa chạy kiểm chứng.
  - State ở mức module thay cho factory (D2): TC-113.
  - Tra `STATUS_ACTIONS[c.status]` hoặc `c.status in STATUS_ACTIONS`, cả hai đều thấy thuộc tính kế thừa (D5, F2): TC-114.
  - Thừa dấu cách sau nút "Sửa" khi không có nút đổi trạng thái: TC-105, TC-114.

**Ánh xạ biến thể của AC-1 và AC-2.** Guard chỉ nhận `(key, at)` (D1): nó không biết phần tử nút, trạng thái đích, hay yêu cầu trước đang chờ, đã thành công hay đã thất bại. Các biến thể của AC vì thế rơi vào cùng một vùng tương đương ở mức unit. TC-108..TC-113 chứng minh **quyết định** "xử lý hay bỏ qua". Phần "FE gửi đúng một yêu cầu" và "không đổi gì trên màn hình" là hệ quả của ba dòng nối trong `source-fe/src/main.js` (D4), không có TC tự động.

| Biến thể | TC (quyết định) | Phần nối ở `main.js`, kiểm bằng review và chạy tay |
| --- | --- | --- |
| AC-1: yêu cầu đầu chưa trả về; nút vẫn mang T | TC-108 | bước 1, 2 |
| AC-1: yêu cầu đã thành công, danh sách đang tải lại | TC-108 | bước 1, 2 |
| AC-1: bảng đã vẽ lại; nút mới mang trạng thái đích ngược (F1) | TC-108 (đầu vào là `id`, không phải nút hay trạng thái đích) | key là `button.dataset.statusId`; bước 1, 2 |
| AC-1: yêu cầu đầu đã thất bại; `#message` còn nguyên | TC-108 (quyết định không phụ thuộc kết quả yêu cầu) | guard được hỏi **trước** `messageEl.textContent = ''`; bước 3 |
| AC-1: cả hai chiều T = `INACTIVE` và T = `ACTIVE` | TC-108 (guard không có tham số T) | bước 1 và bước 2 |
| AC-2: lần bấm đầu tiên kể từ khi mở trang | TC-109, TC-113 | guard tạo một lần ở mức module |
| AC-2: thao tác trước đã thành công, bấm lại sau khoảng bấm đúp | TC-109, TC-110 | bước 4 |
| AC-2: thao tác trước đã thất bại, bấm lại sau khoảng bấm đúp | TC-109 (không có khoá nào phải nhả) | không gọi guard trong `catch`/`finally`; bước 6 |
| AC-2: vừa bấm nút của khách hàng khác B | TC-111 | bước 5 |

**Dữ liệu chung**:
- Guard: `key` là chuỗi (`'1'`, `'2'`), như `button.dataset.statusId` mà `main.js` truyền vào. `at` là số mili giây tuỳ chọn; guard chỉ dùng hiệu của hai giá trị nên gốc thời gian không quan trọng (D3).
- **Mỗi dòng dữ liệu của TC-108..TC-112 chạy trên một guard mới** (`createDoubleClickGuard()` gọi trong vòng lặp); các lời gọi trong một dòng chạy nối tiếp trên cùng guard đó.
- Bảng: mỗi dòng dữ liệu render riêng một danh sách một khách hàng, `id: 1`, `name: 'A'`, `email: 'a@example.com'`, `phone: null`, như TC-105 hiện có.

**TC sinh từ design, không có AC riêng**: được truy vết tới AC gần nhất.
- Key trùng tên thuộc tính có sẵn trong guard (D2 → Bắt buộc, state là `Map`): TC-112, truy vết tới AC-1.
- Hai guard không chung state (D2): TC-113, truy vết tới AC-2 (trang vừa mở chưa ghi nhận lần bấm nào).

**Đường lỗi**: REQ-004 không thêm đường validation, "không tìm thấy" hay phân quyền nào.
- Đường validation có sẵn (400 `errors.status`) do TC-97 giữ, nay là TC bị sửa.
- Cách báo lỗi khi đổi trạng thái thất bại không đổi; TC-102, TC-106, TC-107 của REQ-003 không sửa và phải pass.
- Không có TC 401/403: hệ thống chưa có đăng nhập hay phân quyền (`aiws/work/REQ-003/02-design.md` R5).
- Biến thể "yêu cầu thất bại" của AC-1 và AC-2 nằm ở bảng ánh xạ trên (bước chạy tay 3 và 6).

**Không đặt kỳ vọng** (không TC nào dùng các đầu vào này):
- Guard: `at` nhỏ hơn mốc; `at` không phải số; `key` khác kiểu nhưng cùng chữ (`7` và `'7'`). D2 không quy định.
- Nội dung ô "Trạng thái" của dòng có `status` trùng tên thuộc tính có sẵn (Q3, D5, R7). TC-114 không có assertion nào nhìn ô thứ năm, và không dùng regex trần kiểu `/undefined/` để khỏi dính vào nội dung ô đó.
- Bấm ba lần liên tiếp (R3) và bấm lại vì sốt ruột khi mạng chậm (R2): không có TC nào đòi chặn. Dòng thứ nhất của TC-110 ghi lại đúng hành vi D1 đã chọn (lần bấm thứ ba được xử lý).
- Hai tab hoặc hai nhân viên (R12).
- TC-98 (Q4), TC-86 và TC-83 (Q5): không sửa, không định nghĩa lại ở đây.

**Không có TC tự động**:
- **Phần nối guard vào sự kiện `click`** trong `source-fe/src/main.js` (D4, R1), vì `node:test` không có DOM. Guard đúng mà nối sai thì `fe_test` vẫn pass.
  - Reviewer đối chiếu diff với các điểm bắt buộc của D4:
    - Dòng `if (!acceptStatusClick(button.dataset.statusId, event.timeStamp)) return;` đứng **trước** `messageEl.textContent = ''`.
    - Key là `button.dataset.statusId`; thời điểm là `event.timeStamp`.
    - Guard được tạo **một lần** ở mức module, không tạo trong listener hay trong `refresh()`.
    - Không gọi guard trong `catch` hay `finally`.
    - `refresh()`, listener của nút "Sửa", hai listener trên `#edit-customer` và submit của `#create-form` không đổi.
  - Người review PR chạy tay với BE local, mở tab Network (bảy bước của `02-design.md` → FE change):
    1. Bấm đúp nhanh "Ngừng hoạt động" ở một dòng đang hoạt động: dòng thành "Ngừng hoạt động" với nút "Kích hoạt lại" và **giữ nguyên như vậy**; đúng một `PUT .../status` (body `INACTIVE`) và một `GET /api/customers`.
    2. Bấm đúp nhanh "Kích hoạt lại" ở một dòng ngừng hoạt động: dòng thành "Đang hoạt động" và giữ nguyên; đúng một `PUT` (body `ACTIVE`).
    3. Bấm đúp "Kích hoạt lại" ở một khách hàng bị trùng số: `#message` hiện câu báo trùng số và **còn nguyên** sau lần bấm thứ hai; đúng một `PUT`.
    4. Ngừng một khách hàng, chờ hơn nửa giây, bấm "Kích hoạt lại": được xử lý (một `PUT` body `ACTIVE`).
    5. Bấm "Ngừng hoạt động" ở dòng A rồi ngay sau đó ở dòng B: cả hai đổi trạng thái (hai `PUT`).
    6. Tắt BE, bấm nút: `#message` hiện "Không đổi được trạng thái khách hàng."; bật lại BE, chờ hơn nửa giây, bấm lại: được xử lý.
    7. Nút "Sửa" và form sửa hoạt động như trước.
  - [CẦN XÁC NHẬN] F1 chưa từng được tái hiện bằng chạy tay; nên thử bước 1 và 2 trên bản trước REQ-004 để thấy thao tác bị đảo ngược.
- **AC-4(a), "đúng kiểu của lớp"**: là tính chất của code test, không quan sát được khi chạy test. Reviewer đối chiếu diff của `CustomerHandlerTest.java` với D7:
  - TC-92 và TC-97 có `@ParameterizedTest(name = "[{index}]")`, `@MethodSource(...)`, `@DisplayName(...)` theo đúng thứ tự đó.
  - Provider là `private static`, đặt ngay sau test: `Stream<Long>` cho TC-92, `Stream<String>` cho TC-97.
  - File không còn chữ `ValueSource` nào, kể cả dòng import.
  - Ngoài hai test, hai provider mới và dòng import, không gì khác trong file đổi.
- **AC-4, "không file nào dưới `source-be/src/main/` đổi"**: kiểm bằng `allowed_files` của task BE và diff-scope của orchestrator, không phải bằng test.

**Kỳ vọng phụ thuộc quyết định đang chờ duyệt** (`02-design.md` → Quyết định cần duyệt). Nếu người duyệt chọn khác, các TC sau phải đổi theo:
- Ngưỡng 500 ms, bỏ qua khi khoảng cách **nhỏ hơn** 500 ms (Q1, D1): TC-108, TC-109, và các khoảng cách trong TC-110, TC-111.
- Cửa sổ neo vào lần bấm **được xử lý**, không trượt (D1, R3): dòng thứ nhất của TC-110. Chọn cửa sổ trượt thì kết quả thứ ba của dòng đó thành `false` và AC-2 phải sửa.
- Tính riêng cho từng khách hàng (Q2): TC-111.
- Quyết định chỉ phụ thuộc `(id, at)`, không có khoá "đang chờ" (D1, D4, R2): chữ ký `(key, at) => boolean` của TC-108..TC-113. Tính cửa sổ từ lúc bảng vẽ lại thì guard cần thêm đầu vào và các TC này phải viết lại.
- Tên file, tên export và factory `createDoubleClickGuard()` (D2): TC-108..TC-113.
- Ô "Trạng thái" không sửa (Q3, D5): TC-114 không đặt kỳ vọng cho ô đó. Nếu gộp phần sửa vào thì TC-114 thêm kỳ vọng ô "Trạng thái" hiện giá trị gốc (vd. `<td>constructor</td>`).
- Sửa ba test của REQ-003 và giữ nguyên mã, tên hiển thị (D6, D7, D8): TC-92, TC-97, TC-105.
- Không sửa TC-98 (Q4): nếu muốn đổi TC-98 sang `Stream<Arguments>` thì thêm TC-98 vào file này như một TC bị sửa, truy vết tới AC-4.
- Phương án dự phòng `Object.prototype.hasOwnProperty.call` (R6) và `performance.now()` (R5) không làm đổi TC nào.

**Gắn mã TC trong code**:
- FE: `test('TC-n: <tên hàm> ...', ...)`.
- BE: `@DisplayName("TC-n: ...")`. Hai tên hiển thị của TC-92 và TC-97 **giữ nguyên từng ký tự**.

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test. Tên hiển thị của TC mới là gợi ý; của TC bị sửa là tên đang có, phải giữ.

| TC | File test | Nhóm | Tên hiển thị trong code |
| --- | --- | --- | --- |
| TC-92 (sửa) | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-1 | `TC-92: PUT /api/customers/{id}/status reactivating returns 200 and the customer is exactly as before deactivation` |
| TC-97 (sửa) | như trên | BE-1 | `TC-97: PUT /api/customers/{id}/status with an invalid target status returns 400 with errors.status` |
| TC-105 (sửa) | `source-fe/test/customerTable.test.js` | FE-1 | `TC-105: renderCustomerTable does not show a status action button for status outside ACTIVE and INACTIVE` |
| TC-114 | `source-fe/test/customerTable.test.js`, đặt liền sau TC-105 | FE-1 | `TC-114: renderCustomerTable does not show a status action button for a status named like a built-in object property` |
| TC-108 | `source-fe/test/createDoubleClickGuard.test.js` (mới) | FE-2 | `TC-108: createDoubleClickGuard rejects a click on the same key less than 500 ms after the last accepted click` |
| TC-109 | như trên | FE-2 | `TC-109: createDoubleClickGuard accepts a click when no click on that key was accepted in the previous 500 ms` |
| TC-110 | như trên | FE-2 | `TC-110: createDoubleClickGuard measures the window from the last accepted click, not from a rejected one` |
| TC-111 | như trên | FE-2 | `TC-111: createDoubleClickGuard tracks each key independently` |
| TC-112 | như trên | FE-2 | `TC-112: createDoubleClickGuard treats keys named like built-in object properties as ordinary keys` |
| TC-113 | như trên | FE-2 | `TC-113: createDoubleClickGuard returns guards that do not share state` |

**Số test mong đợi sau REQ-004**:
- FE: hiện 36, đều pass (`aiws/work/REQ-003/evidence/test-results/T6-attempt-1.yaml`). FE-1 thêm 1 (TC-114), FE-2 thêm 6 (TC-108..TC-113); sau cả hai nhóm là **43**, đều pass. TC-105 được sửa tại chỗ nên không làm đổi số test.
- BE: **không đổi**, 311 lần chạy, đều pass: `CustomerHandlerTest` 68, `InMemoryCustomerRepositoryTest` 40, `CustomerServiceTest` 133, `PhoneNumbersTest` 70 (`aiws/work/REQ-003/evidence/test-results/T3-attempt-1.yaml`). Số này đọc được trong output của `be_test` (dòng `Tests run: ...` của Surefire).

**Chưa chạy kiểm chứng.** Run này không chạy được lệnh nào, nên hai nhận định dưới đây suy ra từ đọc `source-fe/src/components/customerTable.js` (dòng 16–19) và `source-fe/src/utils/escapeHtml.js`. [CẦN XÁC NHẬN] developer xác nhận khi viết test:
- TC-114 **fail trên code hiện tại** ở cả năm dòng dữ liệu (dòng nào cũng có thêm nút `data-target-status=""` nhãn `undefined`) và pass sau D5.
- TC-105 sau khi sửa pass **cả trước lẫn sau** D5.

## Test cases

### TC-92: PUT /api/customers/{id}/status kích hoạt lại trả 200 và khách hàng trở về đúng như trước khi ngừng (sửa, mã của REQ-003)
- covers: AC-4
- side: be
- level: integration
- type: functional
- priority: high
- objective: D7: sau khi nguồn dữ liệu của test chuyển từ `@ValueSource(longs = {1, 2})` sang `@MethodSource` với provider `private static Stream<Long>`, test vẫn kiểm đúng hành vi đã định nghĩa cho TC-92 trong `aiws/work/REQ-003/03-test-spec.md`, trên đúng hai dòng dữ liệu cũ theo đúng thứ tự. Đây là test có sẵn (`CustomerHandlerTest.java` dòng 475–495), không phải test mới.
- preconditions: như hiện có, không đổi. Server `App.start(0, service)` với seed id 1 (không có số); đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` → 201 (id 2) và `POST {"name":"Le Van Cuong","email":"cuong@example.com"}` → 201 (id 3, không có số); chụp `before = customers()`; đã `PUT /api/customers/{id}/status` với `{"status":"INACTIVE"}` và nhận 200.
- test data: (`id`), provider trả `Stream.of(1L, 2L)`, đúng thứ tự
  - `1` (không có số; khách hàng 3 `ACTIVE` cũng không có số)
  - `2` (số `0912345678`, không khách hàng nào khác có)
- steps: Given khách hàng `id` đang `INACTIVE` / When `PUT /api/customers/{id}/status` với `{"status":"ACTIVE"}` rồi `GET /api/customers/{id}` và `GET /api/customers` / Then kiểm tra các response.
- expected result:
  - hành vi được kiểm, không đổi so với REQ-003: PUT trả 200; `Content-Type` bắt đầu bằng `application/json`; `status` là `"ACTIVE"`; body PUT bằng đúng phần tử của khách hàng `id` trong `before` (so `JsonNode`); `GET /api/customers/{id}` trả body bằng đúng body PUT; `customers()` bằng đúng `before`
  - giữ nguyên từng ký tự: `@DisplayName`, tên method và chữ ký `reactivateReturns200AndRestoresCustomer(long id)`, thân test
  - test chạy đúng **2 lần** (`[1]` với `id` = 1, `[2]` với `id` = 2), đều pass
  - `be_test` in `Tests run: 68` cho `CustomerHandlerTest` và `Tests run: 311` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-97: PUT /api/customers/{id}/status với trạng thái đích không hợp lệ trả 400 Problem kèm errors.status (sửa, mã của REQ-003)
- covers: AC-4
- side: be
- level: integration
- type: negative
- priority: high
- objective: D7: sau khi nguồn dữ liệu của test chuyển từ `@ValueSource(strings = {...})` sang `@MethodSource` với provider `private static Stream<String>`, test vẫn kiểm đúng hành vi đã định nghĩa cho TC-97 trong `aiws/work/REQ-003/03-test-spec.md`, trên đúng 8 body cũ theo đúng thứ tự (R10). Đây là test có sẵn (`CustomerHandlerTest.java` dòng 618–642), không phải test mới.
- preconditions: như hiện có, không đổi. Server đang chạy với seed id 1 (`ACTIVE`); chụp `before = customers()`.
- test data: (body của `PUT /api/customers/1/status`), provider trả `Stream.of(...)` với đúng 8 chuỗi, đúng thứ tự
  1. `{}`
  2. `{"state":"INACTIVE"}`
  3. `{"status":null}`
  4. `{"status":""}`
  5. `{"status":"DELETED"}`
  6. `{"status":"active"}`
  7. `{"status":"inactive"}`
  8. `{"status":" INACTIVE "}`
- steps: Given khách hàng 1 đang `ACTIVE` / When `PUT /api/customers/1/status` với từng body rồi `GET /api/customers` / Then kiểm tra response.
- expected result:
  - hành vi được kiểm, không đổi so với REQ-003: status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Validation failed"`; `errorsOf(body)` bằng đúng `{"status": "must be ACTIVE or INACTIVE"}`; `customers()` bằng đúng `before`
  - giữ nguyên từng ký tự: `@DisplayName`, tên method và chữ ký `invalidTargetStatusReturns400(String body)`, thân test
  - test chạy đúng **8 lần** (`[1]`..`[8]`, theo thứ tự trên), đều pass
  - `be_test` in `Tests run: 68` cho `CustomerHandlerTest` và `Tests run: 311` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-105: renderCustomerTable không hiện nút đổi trạng thái cho status ngoài ACTIVE và INACTIVE (sửa, mã của REQ-003)
- covers: AC-3
- side: fe
- level: unit
- type: boundary
- priority: medium
- objective: D6, F3: test có sẵn (`source-fe/test/customerTable.test.js` dòng 214–228) kiểm đủ kỳ vọng đã ghi cho TC-105 trong `aiws/work/REQ-003/03-test-spec.md`. Sửa **đúng hai điểm**: dòng "thiếu field `status`" dùng object thật sự không có key đó, và thêm assertion "dòng có đúng 6 `<td>`". Mã, tên hiển thị, vị trí trong file và năm assertion đang có giữ nguyên.
- preconditions: không có.
- test data: danh sách khách hàng, vẫn năm dòng theo đúng thứ tự cũ; mỗi dòng render riêng
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status: 'DELETED' }`
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status: 'active' }` (sai hoa thường)
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status: '' }`
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status: null }`
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null }` (**không có key `status`**; thay cho `status: undefined` hiện nay)
- steps: Given một khách hàng của dòng dữ liệu / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: mọi dòng dữ liệu
  - khớp `<td><button type="button" data-edit-id="1">Sửa</button></td></tr>` (chỉ nút "Sửa", không có dấu cách thừa)
  - không khớp `data-status-id`, `data-target-status`, `Kích hoạt lại`
  - `<button ` xuất hiện đúng 1 lần
  - `html.match(/<td>/g).length` là 6 (**assertion mới**)

### TC-108: createDoubleClickGuard bỏ qua lần bấm tới dưới 500 ms sau lần bấm được xử lý của cùng key
- covers: AC-1
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: D1, D2: lần bấm thứ hai vào cùng `key` tới khi `at − last(key) < 500` bị bỏ qua (guard trả `false`). Biên trên của cửa sổ là 499 ms và 499.9 ms; `0` là một mốc hợp lệ. Quyết định chỉ dùng `(key, at)`, nên một TC này phủ cả năm biến thể của AC-1 (xem bảng ánh xạ ở Chiến lược).
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Mỗi dòng dữ liệu tạo một guard mới: `const accept = createDoubleClickGuard()`.
- test data: (`key`, `at` của lần bấm đầu, `at` của lần bấm thứ hai)
  - `'1'`, `1000`, `1000` (cùng thời điểm, khoảng cách 0)
  - `'1'`, `1000`, `1001`
  - `'1'`, `1000`, `1499` (499 ms: số nguyên lớn nhất còn trong cửa sổ)
  - `'1'`, `1000`, `1499.9` (`event.timeStamp` là số thực)
  - `'1'`, `0`, `499` (mốc `0`; bắt cách kiểm tra truthy với mốc)
- steps: Given một guard mới / When gọi `accept(key, <lần đầu>)` rồi `accept(key, <lần thứ hai>)` / Then so hai giá trị trả về.
- expected result: mọi dòng dữ liệu: lời gọi thứ nhất trả `true`; lời gọi thứ hai trả `false`.

### TC-109: createDoubleClickGuard xử lý lần bấm khi không có lần bấm nào của key đó được xử lý trong 500 ms trước
- covers: AC-2
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D1, D2: lần bấm đầu tiên vào một `key` được xử lý; lần bấm tới khi `at − last(key) >= 500` cũng được xử lý (guard trả `true`). Đúng 500 ms là đã ngoài cửa sổ ("dưới 500 ms" của AC-1). Guard không có khoá nào phải nhả, nên kết quả không phụ thuộc thao tác trước đã thành công hay thất bại.
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Mỗi dòng dữ liệu tạo một guard mới.
- test data: (`key`, các giá trị `at` theo thứ tự gọi)
  - `'1'`: `1000` (lần bấm đầu tiên vào key kể từ khi tạo guard)
  - `'1'`: `0` (lần bấm đầu tiên tại thời điểm `0`)
  - `'1'`: `1000`, `1500` (đúng 500 ms: biên, được xử lý)
  - `'1'`: `1000`, `1501`
  - `'1'`: `1000`, `101000` (100 giây sau)
- steps: Given một guard mới / When gọi `accept(key, at)` lần lượt với từng `at` của dòng dữ liệu / Then so giá trị trả về của từng lời gọi.
- expected result: mọi lời gọi của mọi dòng dữ liệu trả `true`.

### TC-110: createDoubleClickGuard tính cửa sổ từ lần bấm được xử lý gần nhất, lần bấm bị bỏ qua không dời mốc
- covers: AC-1, AC-2
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D1: mốc của một `key` là lần bấm **được xử lý** gần nhất. Lần bấm bị bỏ qua không dời mốc (cửa sổ cố định, không trượt), còn lần bấm được xử lý thì dời mốc. Ở dòng thứ nhất (ba lần bấm cách lần đầu 0 / 300 / 500 ms), lần thứ ba không có lần bấm được xử lý nào trong 500 ms trước nó nên AC-2 đòi phải xử lý (D1 → Đã cân nhắc, R3); cách hiện thực cửa sổ trượt phải fail ở dòng này.
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Mỗi dòng dữ liệu tạo một guard mới.
- test data: (chuỗi `at` của các lời gọi trên key `'1'` → kết quả từng lời gọi)
  - `1000`, `1300`, `1500` → `true`, `false`, `true` (1500 − 1000 = 500; lần bị bỏ qua ở 1300 không dời mốc)
  - `1000`, `1500`, `1999`, `2000` → `true`, `true`, `false`, `true` (lần được xử lý ở 1500 dời mốc: 1999 − 1500 = 499 bị bỏ qua dù đã cách lần đầu 999 ms; 2000 − 1500 = 500 được xử lý)
- steps: Given một guard mới / When gọi `accept('1', at)` lần lượt theo chuỗi của dòng dữ liệu / Then so giá trị trả về của từng lời gọi.
- expected result: từng lời gọi trả đúng giá trị của dòng dữ liệu, theo đúng thứ tự.

### TC-111: createDoubleClickGuard tính riêng cho từng key
- covers: AC-1, AC-2
- side: fe
- level: unit
- type: functional
- priority: high
- objective: Q2, D1: mỗi `key` có mốc riêng. Lần bấm vào key khác ngay sau đó vẫn được xử lý (AC-2, biến thể "khách hàng khác B"); lần bấm lặp vào cùng key vẫn bị bỏ qua dù có lần bấm của key khác chen giữa (AC-1). Bắt cách hiện thực dùng một mốc chung cho mọi key, và cách chỉ nhớ key bấm gần nhất.
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Mỗi dòng dữ liệu tạo một guard mới.
- test data: (chuỗi lời gọi `(key, at)` → kết quả từng lời gọi)
  - `('1', 1000)`, `('2', 1001)`, `('1', 1002)`, `('2', 1003)` → `true`, `true`, `false`, `false`
  - `('1', 1000)`, `('2', 1400)`, `('1', 1500)`, `('2', 1899)`, `('2', 1900)` → `true`, `true`, `true`, `false`, `true` (key `'1'` ở 1500 đã cách mốc của chính nó 500 ms, dù key `'2'` vừa được xử lý 100 ms trước; key `'2'` ở 1899 cách mốc 1400 của chính nó 499 ms)
- steps: Given một guard mới / When gọi `accept(key, at)` lần lượt theo chuỗi của dòng dữ liệu / Then so giá trị trả về của từng lời gọi.
- expected result: từng lời gọi trả đúng giá trị của dòng dữ liệu, theo đúng thứ tự.

### TC-112: createDoubleClickGuard coi key trùng tên thuộc tính có sẵn của object như mọi key khác
- covers: AC-1
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: D2 → Bắt buộc: `key` là `id` lấy từ dữ liệu, nên state phải là `Map`. Một object thường sẽ lặp lại đúng lỗi của F2 với key như `'__proto__'`. Lần bấm đầu của các key này được xử lý và lần bấm lặp trong cửa sổ bị bỏ qua, như mọi key khác.
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Mỗi dòng dữ liệu tạo một guard mới.
- test data: (`key`); mỗi key gọi `accept(key, 1000)` rồi `accept(key, 1001)`
  - `'constructor'`
  - `'toString'`
  - `'valueOf'`
  - `'hasOwnProperty'`
  - `'__proto__'` (**không được bỏ dòng này**: đây là dòng bắt được state lưu bằng object thường, vì phép gán vào `'__proto__'` không tạo thuộc tính riêng; bốn tên còn lại vẫn pass với object thường. [CẦN XÁC NHẬN] suy ra từ ngữ nghĩa JavaScript, chưa chạy kiểm chứng)
- steps: Given một guard mới / When gọi `accept(key, 1000)` rồi `accept(key, 1001)` / Then so hai giá trị trả về.
- expected result: mọi dòng dữ liệu: lời gọi thứ nhất trả `true`; lời gọi thứ hai trả `false`.

### TC-113: createDoubleClickGuard tạo các guard không chung state
- covers: AC-2
- side: fe
- level: unit
- type: functional
- priority: low
- objective: D2: mỗi lời gọi `createDoubleClickGuard()` trả một guard có state riêng (factory, không phải state ở mức module). Guard vừa tạo chưa ghi nhận lần bấm nào, nên lần bấm đầu tiên luôn được xử lý; nhờ vậy các test không phụ thuộc thứ tự chạy.
- preconditions: file test import `createDoubleClickGuard` từ `../src/utils/createDoubleClickGuard.js`. Tạo hai guard bằng hai lời gọi riêng: `const acceptA = createDoubleClickGuard()` và `const acceptB = createDoubleClickGuard()`.
- test data: `acceptA('1', 1000)`, rồi `acceptB('1', 1001)` (cùng key, cách nhau 1 ms, trên hai guard khác nhau).
- steps: Given hai guard A và B / When gọi `acceptA('1', 1000)` rồi `acceptB('1', 1001)` / Then so hai giá trị trả về.
- expected result: `acceptA('1', 1000)` trả `true`; `acceptB('1', 1001)` trả `true`.

### TC-114: renderCustomerTable không hiện nút đổi trạng thái cho status trùng tên thuộc tính có sẵn của object
- covers: AC-3
- side: fe
- level: unit
- type: negative
- priority: high
- objective: D5, F2: `STATUS_ACTIONS` chỉ được tra theo thuộc tính của riêng nó. `status` trùng tên một thuộc tính kế thừa từ `Object.prototype` là trạng thái lạ: ô "Thao tác" chỉ có nút "Sửa", không có nút đổi trạng thái mang `data-target-status=""` và nhãn `undefined` như hiện nay. Đây là kỳ vọng **mới** (test spec của REQ-003 cố ý không đặt), nên không gộp vào TC-105.
- preconditions: không có. Test đặt liền sau TC-105 trong `source-fe/test/customerTable.test.js`.
- test data: khách hàng `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status }` (`status`); mỗi dòng render riêng
  - `'constructor'`
  - `'toString'`
  - `'valueOf'`
  - `'hasOwnProperty'`
  - `'__proto__'`
- steps: Given một khách hàng có `status` của dòng dữ liệu / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: mọi dòng dữ liệu
  - khớp `<td><button type="button" data-edit-id="1">Sửa</button></td></tr>` (ô "Thao tác" kết thúc dòng, chỉ có nút "Sửa", không có dấu cách thừa)
  - không khớp `data-status-id`, `data-target-status`, `Kích hoạt lại`
  - không khớp `>undefined</button>` (không có nút nhãn `undefined`)
  - `<button ` xuất hiện đúng 1 lần
  - `html.match(/<td>/g).length` là 6
  - không assertion nào nhìn vào nội dung ô "Trạng thái" (Q3, D5)

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-108, TC-110, TC-111, TC-112 |
| AC-2 | TC-109, TC-110, TC-111, TC-113 |
| AC-3 | TC-105, TC-114 |
| AC-4 | TC-92, TC-97 |
