# REQ-004 — Phân tích requirement

## Mục tiêu
REQ-004 không thêm chức năng. Nó xử lý bốn finding mức minor mà lần review của REQ-003 để lại (`aiws/work/REQ-003/05-review.md` → Findings) quanh nút đổi trạng thái trên màn hình danh sách khách hàng:
- Cho bộ phận CSKH: bấm đúp vào nút đổi trạng thái không còn đảo ngược chính thao tác vừa làm. Hiện nay một khách hàng vừa bị ngừng hoạt động có thể được kích hoạt lại ngay (hoặc ngược lại) mà nhân viên không biết.
- Cho nhóm phát triển: bảng không hiện nút đổi trạng thái cho bất kỳ trạng thái nào ngoài hai trạng thái đã biết; test của REQ-003 kiểm đủ kỳ vọng của test spec và viết theo đúng kiểu của lớp test.

Đo thành công:
- Một cú bấm đúp vào nút đổi trạng thái gửi đúng một yêu cầu đổi trạng thái, và khách hàng đổi trạng thái đúng một lần.
- Không giá trị `status` nào ngoài `ACTIVE`/`INACTIVE` làm hiện nút đổi trạng thái, kể cả `constructor`, `toString`.
- Test TC-105 kiểm đủ các kỳ vọng ghi trong `aiws/work/REQ-003/03-test-spec.md`.
- `CustomerHandlerTest` chỉ còn một kiểu tham số hoá; số lần chạy test BE không đổi (311, đều pass) và không file nào dưới `source-be/src/main/` thay đổi.

## Acceptance criteria
Truy vết:
- R1..R4 là bốn gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-004-status-button-hardening.md`, theo đúng thứ tự.
- F1..F4 là bốn finding trong `aiws/work/REQ-003/05-review.md` → Findings, theo đúng thứ tự (R1 ↔ F1, R2 ↔ F2, R3 ↔ F3, R4 ↔ F4).

Quy ước dùng trong các AC:
- "Nút đổi trạng thái của khách hàng A" là nút `button[data-status-id]` mang `id` của A trong ô "Thao tác" (`source-fe/src/components/customerTable.js`). Nút mang sẵn trạng thái đích trong `data-target-status`.
- "Lần bấm được xử lý" là FE gửi một yêu cầu đổi trạng thái (`updateCustomerStatus`) cho khách hàng và trạng thái đích mà nút đang mang lúc bấm, như hiện nay (`source-fe/src/main.js` dòng 75–85). "Lần bấm bị bỏ qua" là FE không gửi yêu cầu nào cho lần bấm đó và không đổi gì trên màn hình (`#message`, bảng).
- "Thao tác kết thúc" là yêu cầu đổi trạng thái đã trả về (thành công hoặc lỗi); nếu thành công thì danh sách đã tải lại xong và bảng đã vẽ lại.
- "Khoảng bấm đúp" là khoảng thời gian ngắn sau một lần bấm được xử lý; giả định dưới 500 ms tính từ lần bấm đó (Q1).
- "Trạng thái lạ" là `status` không đúng bằng chuỗi `ACTIVE` hay `INACTIVE`.

**Chống bấm đúp (FE)**
- AC-1: Given nhân viên vừa bấm nút đổi trạng thái của khách hàng A với trạng thái đích T và lần bấm đó được xử lý, when một lần bấm nữa vào nút đổi trạng thái của **cùng** khách hàng A tới trong khoảng bấm đúp, then lần bấm này bị bỏ qua: tính cả hai lần bấm, FE gửi đúng một yêu cầu đổi trạng thái cho A, mang trạng thái đích T, và không gửi yêu cầu nào mang trạng thái đích ngược lại. Biến thể dữ liệu (thời điểm lần bấm thứ hai tới, và trạng thái đích mà nút của A đang mang lúc đó):
  - yêu cầu của lần bấm đầu chưa trả về; nút vẫn mang T
  - yêu cầu đã thành công, danh sách đang tải lại, bảng chưa vẽ lại; nút vẫn mang T
  - bảng đã vẽ lại; nút của A là một phần tử mới ở đúng vị trí cũ, mang trạng thái đích **ngược** với T → vẫn bị bỏ qua (đây là ca hiện nay đảo ngược thao tác, F1)
  - yêu cầu của lần bấm đầu đã thất bại (ví dụ 400 trùng số khi kích hoạt lại) → vẫn bị bỏ qua, câu báo lỗi trong `#message` còn nguyên
  - cả hai chiều: T = `INACTIVE` (A đang `ACTIVE`) và T = `ACTIVE` (A đang `INACTIVE`)

  (R1; F1)
- AC-2: Given không có lần bấm nào vào nút đổi trạng thái của khách hàng A được xử lý trong khoảng bấm đúp vừa qua, và thao tác đổi trạng thái trước đó của A (nếu có) đã kết thúc, when nhân viên bấm nút đổi trạng thái của A, then lần bấm được xử lý: FE gửi đúng một yêu cầu đổi trạng thái cho A với trạng thái đích mà nút đang mang. Biến thể dữ liệu:
  - lần bấm đầu tiên vào nút của A kể từ khi mở trang
  - thao tác trước của A đã thành công: A vừa bị ngừng hoạt động, sau khoảng bấm đúp nhân viên bấm "Kích hoạt lại" → gửi `ACTIVE` (vẫn chủ động đảo lại được)
  - thao tác trước của A đã thất bại (400 trùng số, 404, 500, mất mạng): sau khoảng bấm đúp nhân viên bấm lại → yêu cầu được gửi lại (nút không bị khoá sau lỗi)
  - nhân viên vừa bấm nút của một khách hàng **khác** B (đang trong khoảng bấm đúp của B, yêu cầu của B chưa trả về) rồi bấm nút của A → lần bấm của A vẫn được xử lý (giả định Q2)

  (R1: "của một khách hàng", "chỉ đổi ... một lần")

**Trạng thái lạ (FE, `renderCustomerTable`)**
- AC-3: Given danh sách có một khách hàng có trạng thái lạ, when `renderCustomerTable`, then dòng của khách hàng đó không có nút đổi trạng thái và vẫn đủ ô: ô "Thao tác" đúng bằng `<td><button type="button" data-edit-id="{id}">Sửa</button></td>` (chỉ nút "Sửa", không có dấu cách thừa); HTML không chứa `data-status-id`, `data-target-status`, nhãn "Kích hoạt lại" hay một nút nhãn `undefined`; `<button ` xuất hiện đúng một lần; dòng có đúng 6 `<td>`. Biến thể dữ liệu (`status` của khách hàng):
  - `'DELETED'`, `'active'` (sai hoa thường), `''`, `null`
  - object khách hàng **không có key `status`** (không phải `status: undefined`)
  - trùng tên thuộc tính có sẵn của object JavaScript: `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'`

  (R2, R3; F2, F3)

**Test backend của REQ-003 (`CustomerHandlerTest`)**
- AC-4: Given các test của REQ-003 trong `CustomerHandlerTest` (TC-91..TC-100), when đọc khai báo của chúng và chạy `be_test`, then (a) mọi test tham số hoá trong số đó lấy dữ liệu theo cùng kiểu với các test khác của lớp: `@ParameterizedTest(name = "[{index}]")` + `@MethodSource` trỏ tới provider `private static` đặt ngay sau test, và lớp không còn `@ValueSource` lẫn import của nó; (b) hành vi được kiểm không đổi: tên hiển thị (mã TC), tên method, thân test và các dòng dữ liệu giữ nguyên, đúng thứ tự; `CustomerHandlerTest` vẫn chạy 68 lần, toàn bộ BE vẫn 311 lần, đều pass. Biến thể dữ liệu (hai test đang dùng `@ValueSource` và dữ liệu phải giữ):
  - TC-92: `id` = 1, 2 → 2 lần chạy
  - TC-97: 8 body `{}`, `{"state":"INACTIVE"}`, `{"status":null}`, `{"status":""}`, `{"status":"DELETED"}`, `{"status":"active"}`, `{"status":"inactive"}`, `{"status":" INACTIVE "}` → 8 lần chạy

  (R4; F4)

Cách kiểm chứng:
- Với AC-1 và AC-2 (mô tả hành vi nhân viên thấy): phần kiểm bằng unit test là quyết định "xử lý hay bỏ qua lần bấm này"; phần nối quyết định đó vào sự kiện `click` nằm trong `source-fe/src/main.js`, không có seam unit test, nên kiểm bằng review hoặc chạy tay (xem Impact → FE).
- Với AC-3: unit test của `renderCustomerTable`.
- Với AC-4: phần (b) kiểm bằng `be_test`, so số lần chạy với `aiws/work/REQ-003/evidence/test-results/T3-attempt-1.yaml`; phần (a) là tính chất của code test, kiểm bằng review diff (Q6).

## Impact
- **Module (FE)**, `source-fe/`:
  - `src/main.js`, listener `click` thứ hai trên `#customers` (dòng 75–85): hiện xử lý **mọi** lần bấm vào `button[data-status-id]`. Cơ chế gây lỗi của R1, suy ra từ đọc code:
    1. Lần bấm đầu đọc `button.dataset.targetStatus` (dòng 80), gửi yêu cầu, rồi gọi `refresh()` (dòng 81).
    2. `refresh()` gán lại `listEl.innerHTML` (dòng 13), nên mọi nút bị thay bằng phần tử mới; `customerTable.js` dòng 16–18 đặt vào đúng vị trí cũ một nút mang trạng thái đích ngược lại.
    3. Lần bấm thứ hai rơi vào nút mới đó và gửi trạng thái đích ngược.
  - Ràng buộc rút ra từ AC-1, architect cần biết trước khi thiết kế:
    - **Chỉ "bỏ qua lần bấm khi yêu cầu chưa xong" (đề xuất của F1) là không đủ.** Lần bấm gây đảo ngược luôn tới **sau** khi bảng đã vẽ lại, tức là sau khi yêu cầu và `refresh()` đã xong; một khoá chỉ giữ trong lúc chờ đã được nhả trước lần bấm đó. Lần bấm tới trong lúc chờ thì hiện nay gửi lại cùng trạng thái đích, là thao tác không đổi gì ở BE (`aiws/knowledge/api-inventory.md` → `PUT /api/customers/{id}/status`, idempotent). Với BE in-memory chạy local, một lượt `PUT` + `GET` ngắn hơn nhiều so với khoảng cách hai lần bấm của một cú bấm đúp, nên ca "sau khi vẽ lại" là ca thường gặp. [CẦN XÁC NHẬN] chưa tái hiện bằng chạy tay (F1 cũng ghi "chưa kiểm chứng bằng chạy tay").
    - Nhận biết "cùng khách hàng" phải dựa vào `id` (`data-status-id`), không dựa vào phần tử nút (đã bị thay) hay trạng thái đích (đã đảo).
    - `main.js` không có test tự động vì `node:test` không có DOM (`aiws/knowledge/conventions.md` → Test → FE). Để AC-1, AC-2 kiểm được bằng unit test, quyết định "xử lý hay bỏ qua" cần nằm trong một đơn vị test được ngoài `main.js`, theo convention "logic nằm trong hàm thuần, `main.js` chỉ nối sự kiện" và theo cách REQ-003 đã tách `describeStatusError` cho AC-10. Nếu quyết định phụ thuộc thời gian thì thời gian phải truyền vào được, để test không phải chờ thật. Tên, vị trí và cơ chế do architect quyết.
  - **REQ-004 đảo một quyết định đã duyệt của REQ-003**, design phải ghi rõ: D11 đã loại việc chặn lần bấm lặp ("Vô hiệu hoá nút trong lúc chờ: không cần, vì request lặp lại là thao tác không đổi gì (D1)", `aiws/work/REQ-003/02-design.md` dòng 197), và plan T6 chép lại thành "không vô hiệu hoá nút, không giữ state" (`aiws/work/REQ-003/04-plan.yaml` dòng 219). Lập luận của D1 (`02-design.md` dòng 39) chỉ đúng khi lần bấm thứ hai tới trước khi bảng vẽ lại.
  - Dự kiến không đổi trong `main.js`: `refresh()`, listener của nút "Sửa" (dòng 35–46), hai listener trên `#edit-customer`, submit của `#create-form`; cách báo lỗi khi đổi trạng thái thất bại (dòng 82–84).
  - `src/components/customerTable.js`: dòng 16 `STATUS_ACTIONS[c.status]` tra cả thuộc tính kế thừa từ `Object.prototype`. Với `status = 'constructor'` kết quả là hàm `Object` (truthy), nên dòng 17–18 vẫn dựng nút với `data-target-status=""` (`escapeHtml(undefined)` cho chuỗi rỗng, `src/utils/escapeHtml.js` dòng 5) và nhãn `undefined`. Chỉ cần đổi cách tra; hằng `STATUS_ACTIONS`, HTML của nút cho `ACTIVE`/`INACTIVE`, `<thead>` và năm ô dữ liệu không đổi. Dòng 23 `STATUS_LABELS[c.status] ?? c.status` dùng cùng kiểu tra (Q3).
  - Dự kiến không đổi: `index.html`, `src/api/customerApi.js` (`updateCustomerStatus` dùng nguyên), `src/utils/describeStatusError.js`.
  - Test, `test/customerTable.test.js`:
    - **TC-105 của REQ-003 phải sửa** (dòng 214–228). Nó thiếu assertion "dòng có đúng 6 `<td>`", và mảng `statuses = ['DELETED', 'active', '', null, undefined]` (dòng 215) được đưa vào `{ ..., status }` (dòng 218) nên key `status` luôn có mặt. Kỳ vọng tương ứng đã có sẵn trong `aiws/work/REQ-003/03-test-spec.md` (TC-105, dòng 562–569); file test spec đó không sửa.
    - Sửa một test có sẵn của REQ trước là thay đổi phải ghi rõ trong design (AGENTS.md mục 9), như TC-36 ở REQ-002 và TC-74 ở REQ-003 (`aiws/knowledge/conventions.md` → Test → Mã TC).
    - Các dòng dữ liệu trùng tên thuộc tính có sẵn là kỳ vọng **mới**: test spec của REQ-003 cố ý không đặt kỳ vọng cho ca này (`03-test-spec.md` dòng 91).
    - Không sửa và phải pass: TC-36, TC-74, TC-103, TC-104 (dòng `ACTIVE`/`INACTIVE` vẫn có nút như cũ) cùng mọi test khác của file.
  - Test mới cho đơn vị quyết định của AC-1, AC-2 theo mẫu `test/<module>.test.js`. Mã TC mới đánh số tiếp từ **TC-108** (`aiws/knowledge/conventions.md` → Test → Mã TC). Mốc hiện tại: FE 36 test, đều pass (`aiws/work/REQ-003/evidence/test-results/T6-attempt-1.yaml`).
- **Module (BE)**: chỉ code test, `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`.
  - Lệch kiểu hiện có: TC-92 dùng `@ValueSource(longs = {1, 2})` (dòng 476), TC-97 dùng `@ValueSource(strings = {...})` (dòng 619–629), kéo theo import `org.junit.jupiter.params.provider.ValueSource` (dòng 27). Trước REQ-003 lớp này không có `@ValueSource`.
  - Kiểu của lớp: mọi test tham số hoá khác dùng `@ParameterizedTest(name = "[{index}]")` + `@MethodSource`, provider `private static` đặt ngay sau test. Bảng một cột trả `Stream<String>` (TC-27 dòng 133, TC-62 dòng 262, TC-67 dòng 380, TC-68 dòng 403, TC-98 dòng 661); bảng nhiều cột trả `Stream<Arguments>` với `Arguments.of(...)` (TC-64, TC-69, TC-91, TC-93..TC-96, TC-99). Plan T3 của REQ-003 yêu cầu đúng kiểu này (`aiws/work/REQ-003/04-plan.yaml` dòng 128–130).
  - Tham số của TC-92 là `long id`; lớp chưa có provider một cột nào không phải `String`, nên kiểu trả về của provider mới do architect chốt.
  - Không đổi: helper (`get`, `post`, `put`, `customers`, `errorsOf`), `@BeforeEach`/`@AfterEach`, mọi test khác của lớp, và toàn bộ `source-be/src/main/` (requirement → Ngoài phạm vi).
  - Mốc số lần chạy (`aiws/work/REQ-003/evidence/test-results/T3-attempt-1.yaml`): `CustomerHandlerTest` 68, `InMemoryCustomerRepositoryTest` 40, `CustomerServiceTest` 133, `PhoneNumbersTest` 70, tổng 311, đều pass.
  - Theo giả định, không thuộc phạm vi: TC-98 (Q4), TC-86 trong `CustomerServiceTest` (Q5), TC-83 trong `InMemoryCustomerRepositoryTest` (plan T1 yêu cầu đích danh `@ValueSource` như TC-45, `04-plan.yaml` dòng 41).
- **API**: không đổi. `PUT /api/customers/{id}/status` và contract `aiws/work/REQ-003/api-contract.yaml` giữ nguyên; FE không gọi thêm endpoint nào.
- **DB**: không có (`aiws/knowledge/db-schema.md`: hệ thống mới chưa có DB). Kho in-memory không đổi.
- **Knowledge** cần cập nhật sau khi merge:
  - `aiws/knowledge/system-map.md`: luồng 6 và dòng "FE: entry" (lần bấm thứ hai của một cú bấm đúp bị bỏ qua).
  - `aiws/knowledge/conventions.md`: mục Sự kiện; mục Test → BE (`CustomerHandlerTest` không dùng `@ValueSource`); ghi chú TC-105 bị sửa ở REQ-004 và bảng mã TC của REQ-004.

## Reuse
- **FE**, `source-fe/`:
  - `src/main.js` dòng 75–85: listener delegation có sẵn; `button.dataset.statusId` là `id` khách hàng để phân biệt "cùng khách hàng" (AC-1, AC-2).
  - `src/utils/describeStatusError.js` + `test/describeStatusError.test.js`: mẫu đưa logic ra khỏi `main.js` thành đơn vị thuần có unit test (bảng dữ liệu là một mảng, lặp `for...of` trong một `test(...)`).
  - `src/api/customerApi.js:updateCustomerStatus` (dòng 44–46): dùng nguyên. Tính idempotent của endpoint làm lần bấm lặp lại trong lúc chờ (cùng trạng thái đích) vô hại.
  - `src/components/customerTable.js`: hằng `STATUS_ACTIONS` (dòng 5–8) và nhánh "không có nút" (dòng 19) giữ nguyên; chỉ điều kiện chọn nhánh đổi.
  - `test/customerTable.test.js`: TC-105 (vòng lặp và năm assertion có sẵn, dòng 217–227); cách đếm ô `row.match(/<td>/g).length` của TC-36, TC-74, TC-103 (dòng 46, 139, 171); TC-39 dòng 75 là mẫu dữ liệu "object không có key".
- **BE**, `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`:
  - Provider một cột `malformedUpdateRequests` (dòng 403–405) và `bodiesWithoutPhone` (dòng 133–138) là mẫu cho TC-97.
  - `deactivateBodies` (dòng 463–473) là mẫu truyền `id` kiểu `long` qua `Arguments.of(1L, ...)`.
- **Tài liệu**: `aiws/work/REQ-003/03-test-spec.md` TC-105 (kỳ vọng đầy đủ), TC-92, TC-97 (bảng dữ liệu gốc để đối chiếu "không đổi hành vi").

## Ngoài phạm vi
- Thay đổi API hoặc quy tắc đổi trạng thái ở backend; hỏi xác nhận trước khi ngừng hoạt động; trạng thái "đang lưu" cho form sửa (requirement → Ngoài phạm vi; finding về `source-fe/src/main.js` trong `aiws/work/REQ-002/05-review.md`).
- Chống gửi lặp cho form thêm, form sửa và nút "Sửa".
- Hai nhân viên, hoặc hai tab, cùng đổi trạng thái một khách hàng: vẫn là "yêu cầu ghi sau thắng" (`aiws/work/REQ-003/02-design.md` R2). REQ-004 chỉ xử lý hai lần bấm trên cùng một trang.
- Hiển thị trạng thái "đang xử lý" (nút mờ, biểu tượng chờ), đổi nhãn nút, vị trí nút hay câu báo lỗi.
- Thêm thư viện DOM (ví dụ jsdom) để test `main.js`: `source-fe` không có dependency npm.
- Nội dung ô "Trạng thái" của khách hàng có trạng thái trùng tên thuộc tính có sẵn (Q3).
- Các finding của REQ-002 về TC-53 và TC-65 (hai dòng dữ liệu trong một `@Test`), comment Arrange-Act-Assert, đổi tên hay sắp xếp lại test: R4 chỉ nói về kiểu tham số hoá của test REQ-003.
- Sửa tài liệu của REQ-003 (`03-test-spec.md`, `04-plan.yaml`, `05-review.md`).

## Câu hỏi mở
Không có câu hỏi chặn thiết kế. Các giả định dưới đây cần người duyệt design xem lại.

- [non-blocking] Q1: "Hai lần liên tiếp nhanh" là nhanh tới mức nào, và nhận biết bằng gì? Giả định: lần bấm vào nút đổi trạng thái của cùng khách hàng tới dưới 500 ms sau một lần bấm đã được xử lý thì bị bỏ qua, bất kể yêu cầu của lần đầu đang chờ, đã thành công hay đã thất bại.
  - 500 ms là khoảng bấm đúp mặc định thường gặp của hệ điều hành. [CẦN XÁC NHẬN] repo không có nguồn nào cho con số này; architect chốt giá trị và cơ chế (ngưỡng thời gian cố định, hoặc số đếm lần bấm do trình duyệt cung cấp). Cơ chế nào cũng phải thoả biến thể "bảng đã vẽ lại" của AC-1 (xem Impact → FE).
  - Chưa ràng buộc: lần bấm lại trên cùng khách hàng **sau** khoảng bấm đúp nhưng khi yêu cầu đầu **chưa** trả về (mạng chậm). Xử lý hay bỏ qua đều thoả R1, vì yêu cầu lặp lại mang cùng trạng thái đích; architect chốt.
  - Giới hạn đã biết: khi mạng chậm, một lần bấm ngay sau lúc bảng vẽ lại nhưng đã quá khoảng bấm đúp được coi là thao tác chủ động (AC-2) và sẽ đảo trạng thái. Requirement chỉ nói bấm đúp; nếu muốn chặn cả ca này thì khoảng thời gian phải tính từ lúc bảng vẽ lại, người duyệt nói ở bước duyệt design.
- [non-blocking] Q2: Việc bỏ qua áp dụng cho từng khách hàng hay cho mọi nút đổi trạng thái? Giả định **từng khách hàng**, theo chữ "của một khách hàng" trong R1: bấm nút của khách hàng khác ngay sau đó vẫn được xử lý (AC-2, biến thể cuối). Cách khác là bỏ qua mọi nút đổi trạng thái trong lúc một yêu cầu đang chờ: đơn giản hơn nhưng chặn cả thao tác hợp lệ trên hai khách hàng liên tiếp.
- [non-blocking] Q3: Ô "Trạng thái" của khách hàng có `status` trùng tên thuộc tính có sẵn có cần sửa không? `source-fe/src/components/customerTable.js` dòng 23 tra `STATUS_LABELS[c.status] ?? c.status` theo cùng kiểu với dòng 16: với `'constructor'` kết quả là hàm `Object` (không nullish), nên ô hiện nội dung chuyển thành chuỗi của hàm đó thay vì giá trị gốc `constructor`, trái convention "không có nhãn thì hiển thị giá trị gốc" (`aiws/knowledge/conventions.md` → Frontend → State và render). [CẦN XÁC NHẬN] suy ra từ đọc code, chưa chạy kiểm chứng; nội dung vẫn qua `escapeHtml` nên không tạo lỗ hổng XSS.
  - Giả định **ngoài phạm vi**: R2 chỉ nói về nút. AC-3 vì thế không đặt kỳ vọng cho nội dung ô "Trạng thái" của các dòng đó, chỉ đòi dòng đủ 6 ô.
  - Đề xuất người duyệt design cân nhắc gộp vào: cùng nguyên nhân, cùng file, cùng dòng dữ liệu test. Review của REQ-003 không ghi nhận điểm này.
- [non-blocking] Q4: TC-98 có thuộc R4 không? F4 liệt kê TC-98 vì provider của nó trả `Stream<String>` thay vì `Arguments.of(...)` như chữ của plan T3. Nhưng TC-98 (`CustomerHandlerTest.java` dòng 644–663) dùng `@MethodSource` và provider một cột y hệt TC-68 (dòng 386–405) cùng TC-27, TC-62, TC-67 của chính lớp này, tức là đã "cùng một kiểu với những test khác trong cùng lớp test". Giả định **không sửa TC-98**; AC-4 chỉ đổi TC-92 và TC-97. Nếu người duyệt muốn theo đúng chữ của plan T3 thì TC-98 đổi sang `Stream<Arguments>`, và khi đó nó khác kiểu với TC-68.
- [non-blocking] Q5: R4 nói "các test của REQ-003 ở backend"; có gồm lớp test khác không? Giả định **chỉ `CustomerHandlerTest`**, là lớp duy nhất F4 nêu.
  - TC-86 (`CustomerServiceTest.java` dòng 670–671) dùng `@ValueSource(strings = ...)` trong khi plan T2 ghi `@MethodSource`. Lớp này đã có đúng kiểu đó ở TC-57 của REQ-002 (dòng 540–541), nên TC-86 không lệch kiểu của lớp; giả định không sửa.
  - TC-83 (`InMemoryCustomerRepositoryTest`) dùng `@ValueSource(longs = ...)` đúng như plan T1 yêu cầu.
- [non-blocking] Q6: R3 và R4 chỉ sửa code test có sẵn của REQ-003; truy vết AC → TC thế nào? Giả định: TC-105, TC-92, TC-97 giữ nguyên mã và tên hiển thị (như TC-36 và TC-74 trước đây).
  - Contract của test spec đòi mỗi AC có ít nhất một TC trong `aiws/work/REQ-004/03-test-spec.md` (`aiws/config/contracts/test-spec.yaml`: `every_ac_has_tc`), và orchestrator chỉ kiểm rằng mã TC của task có mặt trong file test mà task đã sửa (`aiws/adapters/cli/src/engine.js` dòng 751–758). Test-designer chốt một trong hai cách: ghi lại các mã có sẵn trong test spec của REQ-004 như "TC bị sửa", hoặc cấp mã mới từ TC-108.
  - Lưu ý khi chọn: phép kiểm đó đọc toàn bộ nội dung file, nên một mã có sẵn (TC-105, TC-92, TC-97) luôn "có mặt" nhờ tên test cũ, kể cả khi dòng dữ liệu hay assertion mới chưa được thêm. Đây chính là lý do đánh số tiếp qua các REQ (`aiws/knowledge/conventions.md` → Test → Mã TC). Kỳ vọng mới của AC-3 (các dòng trùng tên thuộc tính có sẵn) vì thế nên mang mã mới từ TC-108.
  - AC-4 không tạo hành vi quan sát mới: phần "đúng kiểu của lớp" chỉ kiểm được bằng review, phần "không đổi hành vi" bằng số lần chạy. Người duyệt design nên biết giới hạn này.
