# REQ-006 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-6 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D10). `api-contract.yaml` có `paths: {}` (REQ-006 không đổi API), nên không có TC nào cho endpoint. Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB, trình duyệt hay đồng hồ thật.

Ký hiệu dùng trong file: D1..D10, Q1..Q10 và R1..R14 là quyết định, câu hỏi và rủi ro của `02-design.md` / `01-analysis.md`. R1..R4 của requirement (`01-analysis.md` → Truy vết) luôn ghi kèm chữ "của requirement". F1..F4 là bốn finding của `aiws/work/REQ-005/05-review.md` → Findings.

**Mức test và framework** (`aiws/knowledge/conventions.md` → Test):
- FE, `unit`: `node:test` + `node:assert/strict`. Bảng dữ liệu là một mảng, lặp bằng `for...of` trong **một** `test(...)`; không dùng `describe` hay subtest.
  - `renderCustomerTable` (`source-fe/test/customerTable.test.js`): so chuỗi bằng `assert.equal` (D1 trả nguyên một chuỗi `<p>...</p>` khi rỗng).
  - `chooseStatusClickKey` (file test mới `source-fe/test/chooseStatusClickKey.test.js`): hàm thuần, không import gì — test gọi trực tiếp, so bằng `assert.equal` (`===`, kể cả kiểm `typeof`).
  - `chooseStatusClickKey` ghép với `createDoubleClickGuard` **thật** (không giả, như `source-fe/test/describeStatusError.test.js` đã import một module production thứ hai): mỗi dòng dữ liệu là một chuỗi lần bấm `(statusFilter, customerId, at)` trên một guard mới (`createDoubleClickGuard()` gọi trong vòng lặp); mỗi lần bấm gọi `accept(chooseStatusClickKey(statusFilter, customerId), at)`, so từng kết quả bằng `assert.equal(..., true)` / `assert.equal(..., false)`.
  - `describeCreateNotice` (file test mới `source-fe/test/describeCreateNotice.test.js`): hàm thuần, so bằng `assert.equal`.
- BE, `unit`: `CustomerServiceTest` (JUnit Jupiter). REQ-006 **không thêm test BE**; chỉ đổi dữ liệu của helper `insertByStatuses` (TC-117, TC-118 dùng chung helper) và thêm assertion vào thân test có sẵn (TC-120, TC-122).
- BE, `integration`: `CustomerHandlerTest` khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, vẫn chạy trong `be_test`.

**Đánh số TC**:
- Mã mới là **TC-135..TC-144**, đánh số tiếp sau TC-134 của REQ-005 (`aiws/knowledge/conventions.md` → Test → Mã TC; D10).
- Năm mã có sẵn được **định nghĩa lại** trong file này vì REQ-006 sửa chính các test đó (D7, D8, D9; theo tiền lệ TC-92/TC-97/TC-105 của `aiws/work/REQ-004/03-test-spec.md`, không theo tiền lệ TC-36/TC-74 là chỉ ghi chú sửa):
  - **TC-117, TC-118** (`CustomerServiceTest.java`, mã của REQ-005; F1, D7)
  - **TC-120, TC-122** (`CustomerHandlerTest.java`, mã của REQ-005; F2, F3, D8)
  - **TC-127** (`source-fe/test/customerApi.test.js`, mã của REQ-005; F4, D9)
  - Lý do phải định nghĩa lại, không chỉ ghi chú: mã TC nằm trong `@DisplayName`/tên hiển thị, mà phần (b) của AC-5 và AC-6 đòi tên hiển thị giữ nguyên nên không thể mang mã mới; `every_ac_has_tc` cần một TC cho AC-5, AC-6; plan chỉ gán được cho task những mã có trong file này (`validatePlan`, `aiws/adapters/cli/src/validate.js`).
  - `covers` của năm TC này trỏ tới AC của **REQ-006** (AC-5 hoặc AC-6). Truy vết gốc tới AC của REQ-005 vẫn nằm trong `aiws/work/REQ-005/03-test-spec.md`, file đó không sửa. `level`, `type`, `priority` giữ như REQ-005, vì vẫn là cùng một test trong code.
  - Dãy mã của file vì thế không liền nhau: TC-117, TC-118, TC-120, TC-122, TC-127, rồi TC-135..TC-144.
- **Giới hạn (R6)**: orchestrator kiểm "mã TC có mặt trong file test mà task đã sửa" trên toàn bộ nội dung file. Phép kiểm này pass sẵn với năm mã trên nhờ tên test cũ, kể cả khi chưa sửa gì. **Reviewer phải đọc diff của năm test này** để xác nhận phần (a) của AC-5, AC-6; phần (b) kiểm bằng số lần chạy.
- Mọi test cũ khác (có hay không có mã TC) không sửa và phải pass nguyên vẹn.

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương:
  - `statusFilter` của `renderCustomerTable`: không lọc (`''`, bỏ qua, `undefined`, `null`) / lọc với giá trị chuẩn (`ACTIVE`, `INACTIVE`) / lọc với giá trị không chuẩn nhưng truthy (`'DELETED'`).
  - `customers` của `renderCustomerTable`: rỗng / không rỗng.
  - Đầu vào `chooseStatusClickKey`: `statusFilter` falsy (`''`, `undefined`, `null`) / truthy; `customerId`: chuỗi thường / chuỗi trùng tên thuộc tính có sẵn / chuỗi chứa thẻ HTML / chuỗi rỗng.
  - Lần bấm thứ hai so với lần bấm được xử lý gần nhất của đúng chế độ (chung khi đang lọc, theo `id` khi "Tất cả"): trong khoảng bấm đúp / từ 500 ms trở đi.
  - `created` của `describeCreateNotice`: có `status` khớp `statusFilter` / có `status` khác / không đọc được `status` (`null`, `undefined`, không có field).
- Giá trị biên:
  - Cửa sổ bấm đúp theo khoảng cách `at − mốc`: dưới 500 ms (0, 1, 499 ms) bị bỏ qua; đúng 500 ms trở đi được xử lý (kế thừa từ REQ-004 D1, nay áp cho chế độ "khi đang lọc" qua key chung — TC-139, TC-140).
  - `chooseStatusClickKey` với `customerId` là chuỗi trùng tên thuộc tính có sẵn (`'constructor'`, `'__proto__'`) hoặc chứa HTML (`'7"><b>x</b>'`): vẫn phải trả về chính nó khi không lọc (TC-137).
- Bảng quyết định cho câu trạng thái rỗng (D1):

  | `customers` | `statusFilter` | Kết quả | TC |
  | --- | --- | --- | --- |
  | `[]` | không truyền / `''` / `undefined` / `null` | `<p>Chưa có khách hàng.</p>` | test không mã TC có sẵn, không sửa |
  | `[]` | `'ACTIVE'`, `'INACTIVE'`, `'DELETED'` | `<p>Không có khách hàng nào khớp lựa chọn lọc.</p>` | TC-135 |
  | không rỗng | bất kỳ | bảng, giống từng ký tự lời gọi không `statusFilter` | TC-136 |

- Bảng quyết định cho `chooseStatusClickKey` (D3):

  | `statusFilter` | Kết quả | TC |
  | --- | --- | --- |
  | falsy | chính `customerId` nhận vào | TC-137 |
  | truthy | một giá trị chung, không phải chuỗi, khác mọi `customerId` | TC-138 |

- Bảng quyết định cho thông báo sau khi thêm (D5):

  | `statusFilter` | `created?.status` | Kết quả | TC |
  | --- | --- | --- | --- |
  | falsy | bất kỳ | `''` | TC-143 |
  | truthy | bằng đúng `statusFilter` | `''` | TC-143 |
  | truthy | khác `statusFilter`, hoặc không đọc được | `'Đã thêm khách hàng.'` | TC-144 |

- Chuyển trạng thái của guard khi đang lọc, qua `chooseStatusClickKey` + `createDoubleClickGuard` thật (D3, D4):

  | Mốc của key chung | Lần bấm mới (bất kỳ khách hàng) | Kết quả | TC |
  | --- | --- | --- | --- |
  | chưa có | — | xử lý | TC-139, TC-140 |
  | có | dưới 500 ms sau | bỏ qua | TC-139 |
  | có | từ 500 ms trở lên sau | xử lý, dời mốc | TC-140 |
  | có (bị bỏ qua không dời mốc) | — | mốc cũ vẫn còn | TC-140 |

- Đoán lỗi (error guessing) cho các cách hiện thực sai mà design đã cảnh báo:
  - Chèn `statusFilter` vào HTML, hoặc dùng nó để chọn câu khác ngoài hai câu cố định: TC-135 chỉ so hai chuỗi hằng, không có giá trị động nào trong kết quả.
  - Câu "không khớp" chỉ áp cho `'ACTIVE'`/`'INACTIVE'`, bỏ qua giá trị truthy khác: dòng `'DELETED'` của TC-135.
  - `statusFilter` làm thay đổi bảng khi `customers` không rỗng (vd. thêm cột, đổi màu dòng): TC-136 so cả chuỗi bằng `assert.equal`, không chỉ `assert.match` một phần.
  - Key chung là chuỗi cố định (`''`, `'any'`) có thể trùng `data-status-id`: TC-138 kiểm `typeof !== 'string'` và khác mọi `customerId` đã truyền.
  - Key chung đổi theo `customerId` hay `statusFilter` (không thật sự "chung"): TC-138 so bốn lời gọi khác nhau đều cho cùng một giá trị bằng `===`.
  - `chooseStatusClickKey` đổi kiểu hay thêm tiền tố cho `customerId` khi không lọc: TC-137 so bằng `===` với chính giá trị truyền vào (không phải chỉ `==`).
  - Chặn bấm đúp theo từng khách hàng cả khi đang lọc (không đảo D1 của REQ-004): dòng "dòng của A rời bảng, rơi vào B" của TC-139 phải cho `false`, không phải `true`.
  - Cửa sổ trượt (lần bấm bị bỏ qua cũng dời mốc): dòng thứ ba của TC-140.
  - Không phân biệt "Tất cả" theo từng khách hàng (áp key chung cho mọi lúc, đảo REQ-004): TC-141 phải cho `true` ở lần bấm vào khách hàng khác.
  - Hai chế độ (key chung, key theo `id`) dùng chung một `Map`/mốc: các dòng của TC-142 đổi giữa "Tất cả" và một lựa chọn lọc phải cho `true` ở cả hai lần.
  - `describeCreateNotice` mặc định khách hàng mới là `ACTIVE` thay vì đọc `created.status`: dòng `('ACTIVE', { status: 'INACTIVE' })` của TC-144.
  - Không đọc được `status` thì coi là khớp (không hiện thông báo): các dòng `null`/`undefined`/thiếu field của TC-144 phải vẫn cho câu.
  - So sánh `status` không phân biệt hoa thường hay dùng danh sách trạng thái viết cứng: không có dòng dữ liệu nào kiểm trực tiếp (ngoài phạm vi; D5 → Bắt buộc chỉ đòi so khớp chính xác).

**Ánh xạ biến thể của AC-1..AC-4.** `index.html` và phần nối trong `source-fe/src/main.js` không có TC tự động (`node:test` không có DOM). Mỗi biến thể tách làm hai phần: **quyết định** (có TC) và **phần nối** (review và chạy tay, mười bốn bước của `02-design.md` → FE change).

| Biến thể | TC (quyết định) | Phần nối, kiểm bằng review và chạy tay |
| --- | --- | --- |
| AC-1: L = "Tất cả", mảng rỗng → "Chưa có khách hàng." | test không mã TC có sẵn (không sửa) | `refresh()` đọc `statusFilter` trước `try` (D2); bước 7 |
| AC-1: L = "Đang hoạt động"/"Ngừng hoạt động", mảng rỗng → "không khớp" | TC-135 | như trên; bước 7 |
| AC-1: đang lọc, ngừng hoạt động khách hàng cuối cùng của danh sách → câu đổi sau khi tải lại | TC-135 (câu của lần tải mới) | `renderCustomerTable(customers, statusFilter)` nhận giá trị của **lần tải đó** (D2); bước 8 |
| AC-1: mảng không rỗng, mọi L → bảng như hiện nay | TC-136 | bước 2 |
| AC-2: đang lọc, lần bấm thứ hai rơi vào khách hàng khác B (dòng của A đã rời bảng) | TC-139 | key của guard là `chooseStatusClickKey(filterEl.value, button.dataset.statusId)` (D4); bước 1, 2 |
| AC-2: đang lọc, lần bấm thứ hai rơi vào chính A (chưa vẽ lại hoặc đã thất bại) | TC-139 | như trên; bước 1 |
| AC-2: cả hai lựa chọn lọc ("Đang hoạt động", "Ngừng hoạt động") | TC-139 | như trên; bước 1, 3 |
| AC-2: lần bấm bị bỏ qua không đổi gì trên màn hình, kể cả `#message` | không có (là hệ quả của vị trí dòng hỏi guard) | dòng hỏi guard đứng **trước** `clearMessages()` (D4, D6); bước 3, 4 |
| AC-2: FE gửi đúng một yêu cầu đổi trạng thái | không có | `updateCustomerStatus` chỉ gọi khi guard trả `true`; bước 1, 2, 3, 4 |
| AC-3: đang lọc, lần bấm đầu tiên kể từ khi mở trang | TC-140 | bước 5 |
| AC-3: đang lọc, bấm nút của B sau khi hết khoảng bấm đúp | TC-140 | bước 5 |
| AC-3: xem "Tất cả", khách hàng khác vẫn được xử lý, cùng khách hàng vẫn bị bỏ qua | TC-141 | bước 6 |
| AC-4: L = "Ngừng hoạt động", thêm thành công, khách hàng mới `ACTIVE` → thông báo hiện | TC-144 | `noticeEl.textContent = describeCreateNotice(created, filterEl.value)` sau `form.reset()`, trước `await refresh()` (D6); bước 9 |
| AC-4: L = "Tất cả"/"Đang hoạt động", thêm thành công, khớp L → không thông báo | TC-143 | như trên; bước 10, 11 |
| AC-4: thêm thất bại dưới mọi L → không thông báo, `#message` hiện lỗi | không có (là hệ quả của việc không gán `#notice` trong `catch`) | D6 → Bắt buộc: không gán `#notice` trong `catch`; bước 12 |
| AC-4: thêm thành công nhưng tải lại ngay sau đó thất bại → thông báo vẫn hiện | không có | gán `#notice` đứng trước `await refresh()`; `refresh()` không đụng `#notice`; bước 13 |
| AC-4: các kết quả hiện có của thao tác thêm giữ nguyên | không có | `form.reset()`, `filterEl.value` không đổi; bước 9, 14 |

**Dữ liệu chung**:
- **Bảng bốn khách hàng chuẩn** và **kho K4**: như `aiws/work/REQ-005/03-test-spec.md` → Dữ liệu chung (`01-analysis.md` dòng 24). TC-117, TC-118, TC-120, TC-122 dùng lại đúng bảng này qua helper đã sửa (D7) hoặc đã có (`insertStandardFour`).
- FE, mỗi dòng dữ liệu của TC-138..TC-142 chạy trên một lần gọi/một guard mới (như quy ước của TC-108..TC-113, REQ-004): `createDoubleClickGuard()` gọi lại trong vòng lặp của test, không dùng chung giữa các dòng.
- `at` trong các bảng là số mili giây tuỳ chọn, như `event.timeStamp`; chỉ hiệu số giữa hai lần bấm có ý nghĩa (quy ước từ REQ-004).

**TC sinh từ design, không có AC riêng**: không có (tất cả TC mới của REQ-006 truy vết trực tiếp tới AC-1..AC-4).

**Đường lỗi**: REQ-006 không thêm đường validation, "không tìm thấy" hay phân quyền nào ở API. Phía FE:
- `describeCreateNotice` nhận `created` không đọc được `status` (`null`, `undefined`, object thiếu field) như một ca "không chứng minh được là khớp": TC-144, để không bỏ sót thông báo khi API trả hình dạng lạ (D5 → Vì sao).
- Lần bấm bị bỏ qua không phải một đường lỗi: không ném, không đổi gì trên màn hình (bảng ánh xạ ở trên).

**Không đặt kỳ vọng** (không TC nào dùng các đầu vào này):
- `renderCustomerTable`: `statusFilter` không phải chuỗi (số, object, `Symbol`) — D1 không quy định; `main.js` luôn truyền `filterEl.value`.
- `chooseStatusClickKey`: `customerId` không phải chuỗi; `statusFilter` không phải chuỗi hay `''`/`undefined`/`null`.
- `describeCreateNotice`: `created.status` không phải chuỗi; `statusFilter` không phải chuỗi.
- Bấm ba lần liên tiếp, hoặc bấm lại vì sốt ruột khi mạng chậm, khi đang lọc (R4, ngoài phạm vi theo `01-analysis.md`): không có TC nào đòi chặn.
- Hai tab hoặc hai nhân viên; hiệu năng.
- `role="status"` với trình đọc màn hình thật (R10): không quan sát được bằng test.

**Không có TC tự động**:
- **`index.html` và phần nối trong `main.js`** (R1), vì `node:test` không có DOM. Ba hàm thuần đúng mà nối sai (đọc `statusFilter` sau `await`, xoá thông báo trước khi hỏi guard, gán thông báo trong `catch` hoặc sau `refresh()`, sót một trong sáu chỗ `clearMessages()`) thì AC-1..AC-4 hỏng mà `fe_test` vẫn pass.
  - Reviewer đối chiếu diff với các điểm bắt buộc của D2, D4, D6 (trích ở bảng ánh xạ trên).
  - Người review PR chạy mười bốn bước của `02-design.md` → FE change với BE local, mở tab Network.
  - Ca "xem Tất cả khi hệ thống chưa có khách hàng nào" (test cũ `renderCustomerTable shows an empty state`) không chạy tay được: `App.main` seed hai khách hàng (`aiws/knowledge/db-schema.md`).
- **Phần (a) của AC-5, AC-6** ("khẳng định trực tiếp hơn trước", "tên biến nói đúng nội dung"): tính chất của code test, không quan sát được khi chạy test (R6). Reviewer đọc diff của TC-117, TC-118, TC-120, TC-122, TC-127 đối chiếu với D7, D8, D9.
- **"Không file nào dưới `source-be/src/main/` đổi"** (AC-5): kiểm bằng `allowed_files` của task BE và diff-scope của orchestrator, không phải bằng test.

**Kỳ vọng phụ thuộc quyết định đang chờ duyệt** (`02-design.md` → Quyết định cần duyệt). Nếu người duyệt chọn khác, các TC sau phải đổi theo:
- Phương án giữ nguyên chữ của D9 (REQ-005), đọc `filterEl.value` lúc vẽ thay vì một biến cục bộ trong `refresh()` (D2): không TC nào đổi, vì khác nhau chỉ ở phần nối (ngoài TC).
- Áp cùng quy tắc bấm đúp cho cả "Tất cả" (cách khác của Q2, D3): TC-141 đổi kết quả thành `false` ở lần bấm vào khách hàng khác; TC-137, TC-138 không còn cần (không còn `chooseStatusClickKey`, chỉ còn một key chung mọi lúc).
- Hiện thông báo sau **mọi** lần thêm thành công thay vì chỉ khi không khớp (cách khác của Q4, D5): bảng quyết định của TC-143, TC-144 đổi — mọi `created` hợp lệ cho câu, bất kể `statusFilter`.
- Cho TC-119 gọi chung helper `insertByStatuses` (trọn đề xuất F1, Q7, D7): TC-119 trở thành một TC bị sửa, cần định nghĩa lại thêm trong file này.
- Thêm kỳ vọng số điện thoại cụ thể của `id` 2 và 3 vào F2 (Q8, D8): TC-120 có thêm assertion, không đổi mã hay số lần chạy.
- Tên biến `internalError500` (Q9, D9): chỉ đổi chữ trong objective của TC-127, không đổi hành vi kiểm.

**Gắn mã TC trong code**:
- BE: `@DisplayName("TC-n: ...")` ở mức method. TC-117, TC-118, TC-120, TC-122 giữ nguyên từng ký tự tên hiển thị hiện có.
- FE: `test('TC-n: <tên hàm> ...', ...)`. TC-127 giữ nguyên tên hiển thị hiện có.

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test. Tên hiển thị của TC mới là gợi ý; của TC bị sửa là tên đang có, phải giữ.

| TC | File test | Nhóm | Tên hiển thị trong code |
| --- | --- | --- | --- |
| TC-117 (sửa, mã của REQ-005) | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | BE-1 | `TC-117: list with no status value returns the same customers as list()` |
| TC-118 (sửa, mã của REQ-005) | như trên | BE-1 | `TC-118: list with one valid status value returns only the customers in that status, ordered by id` |
| TC-120 (sửa, mã của REQ-005) | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-2 | `TC-120: GET /api/customers returns 200 with exactly the customers matching the status query parameter` |
| TC-122 (sửa, mã của REQ-005) | như trên | BE-2 | `TC-122: GET /api/customers filters by the status currently stored after a status change` |
| TC-127 (sửa, mã của REQ-005) | `source-fe/test/customerApi.test.js` | FE-1 | `TC-127: listCustomers throws ApiError with the status and field errors of the API` |
| TC-135 | `source-fe/test/customerTable.test.js` | FE-2 | `TC-135: renderCustomerTable shows a no-match sentence for an empty list when a status filter is selected` |
| TC-136 | như trên | FE-2 | `TC-136: renderCustomerTable renders the table unchanged when the list is not empty, regardless of statusFilter` |
| TC-137 | `source-fe/test/chooseStatusClickKey.test.js` (mới) | FE-3 | `TC-137: chooseStatusClickKey returns the given customerId unchanged when no status filter is selected` |
| TC-138 | như trên | FE-3 | `TC-138: chooseStatusClickKey returns one shared non-string key for every customer when a status filter is selected` |
| TC-139 | như trên | FE-3 | `TC-139: a second click on any customer's status button is rejected within the double-click window while a status filter is selected` |
| TC-140 | như trên | FE-3 | `TC-140: a click on a customer's status button is accepted from 500 ms onward since the last accepted click, while a status filter is selected` |
| TC-141 | như trên | FE-3 | `TC-141: viewing "Tất cả" still tracks the double-click window per customer` |
| TC-142 | như trên | FE-3 | `TC-142: changing the status filter between two clicks starts a new double-click window for the new mode` |
| TC-143 | `source-fe/test/describeCreateNotice.test.js` (mới) | FE-4 | `TC-143: describeCreateNotice returns an empty string when there is no status filter or the created customer matches it` |
| TC-144 | như trên | FE-4 | `TC-144: describeCreateNotice returns the added-customer notice when a status filter hides the created customer or its status cannot be read` |

**Số test mong đợi sau REQ-006**:
- BE: **không đổi**, 399 lần chạy, đều pass: `CustomerServiceTest` 173 (TC-117: 3, TC-118: 5), `CustomerHandlerTest` 107 (TC-120: 15, TC-122: 2), `InMemoryCustomerRepositoryTest` 49, `PhoneNumbersTest` 70 (`aiws/work/REQ-005/evidence/test-results/T3-attempt-1.yaml`). TC-117, TC-118, TC-120, TC-122 được sửa tại chỗ nên không làm đổi số lần chạy.
- FE: hiện 53 test, đều pass (`aiws/work/REQ-005/evidence/test-results/T5-attempt-1.yaml`). FE-1 (TC-127, sửa tại chỗ) không đổi số test. FE-2 thêm 1 (TC-135; TC-136 là test mới thứ hai, cũng thêm 1 — tổng FE-2 thêm 2). FE-3 thêm 6 (TC-137..TC-142). FE-4 thêm 2 (TC-143, TC-144). Sau cả bốn nhóm là **63**, đều pass.

**Chưa chạy kiểm chứng.** Run này không chạy lệnh nào; các nhận định dưới đây suy ra từ đọc `02-design.md` và code hiện tại. [CẦN XÁC NHẬN] developer xác nhận khi viết test:
- TC-135 fail trên code hiện tại (`renderCustomerTable` chỉ nhận một tham số, mọi mảng rỗng cho `<p>Chưa có khách hàng.</p>`) và pass sau D1.
- TC-136 pass **cả trước lẫn sau** D1, vì D1 không đổi dòng dựng bảng.
- TC-137..TC-144 fail trước khi `chooseStatusClickKey.js` và `describeCreateNotice.js` tồn tại (lỗi import), pass sau D3, D5.
- TC-117, TC-118 pass **cả trước lẫn sau** D7 (assertion không đổi, chỉ dữ liệu của helper đổi); dữ liệu mới vẫn tạo ra đúng số dòng, đúng `id` như dữ liệu cũ.
- TC-120, TC-122 pass trên code hiện tại ở các assertion đã có; fail ở các assertion mới (D8) cho tới khi thêm.
- TC-127 pass cả trước lẫn sau D9 (chỉ đổi tên biến, không đổi giá trị hay assertion).

## Test cases

### TC-117: list with no status value returns the same customers as list() (sửa, mã của REQ-005)
- covers: AC-5
- side: be
- level: unit
- type: functional
- priority: high
- objective: D7, F1: sau khi helper `insertByStatuses` (dòng 817–824) dựng kho từ **n khách hàng đầu của bảng bốn khách hàng chuẩn** thay vì dữ liệu giả `"Customer " + n`, `"customer" + n + "@example.com"`, `phone = null`, test vẫn kiểm đúng hành vi đã định nghĩa cho TC-117 trong `aiws/work/REQ-005/03-test-spec.md`, trên đúng ba dòng dữ liệu cũ theo đúng thứ tự. Đây là test có sẵn (`CustomerServiceTest.java` dòng 771–781), không phải test mới; chỉ dữ liệu của helper đổi.
- preconditions: `repository` và `service` của `@BeforeEach`. Helper `insertByStatuses(statuses)` dựng kho: khách hàng thứ i mang tên, email, số điện thoại của dòng i trong bảng bốn khách hàng chuẩn (`Nguyen Van An`/`an@example.com`/không số, `Tran Thi Binh`/`binh@example.com`/`0912345678`, `Le Van Cuong`/`cuong@example.com`/`0987654321`, `Pham Thi Dung`/`dung@example.com`/không số) và `status` thứ i của tham số.
- test data: (danh sách trạng thái của kho), provider `statusListsForNoFilter` trả `Stream.of(...)`, đúng thứ tự, không đổi
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`
  - `[INACTIVE, INACTIVE]`
  - `[]`
- steps: Given kho dựng bằng `insertByStatuses(statuses)` (nay dùng dữ liệu chuẩn) / When gọi `service.list(List.of())` / Then so với `service.list()` và với các `Customer` do `insertByStatuses` trả về.
- expected result:
  - hành vi được kiểm, không đổi so với trước: không ném exception; kết quả bằng đúng `service.list()`; kết quả bằng đúng list các `Customer` mà `insertByStatuses` trả về, tăng dần theo `id`
  - giữ nguyên từng ký tự: `@DisplayName("TC-117: ...")`, tên method `listWithNoStatusValueReturnsSameAsList`, chữ ký, thân test (dòng 771–781), provider `statusListsForNoFilter` (dòng 783–788)
  - trên kho `[INACTIVE, INACTIVE]`, hai khách hàng là **Nguyen Van An** và **Tran Thi Binh** (khách hàng 1 và 2 của bảng chuẩn), không còn `"Customer 1"`, `"Customer 2"`
  - chuỗi `"Customer "` và `"customer" + n` không còn ở đâu trong file (phần (a) của AC-5, kiểm bằng review diff, không bằng chạy test — R6)
  - test chạy đúng **3 lần**, đều pass; `be_test` in `Tests run: 173` cho `CustomerServiceTest` và `Tests run: 399` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-118: list with one valid status value returns only the customers in that status, ordered by id (sửa, mã của REQ-005)
- covers: AC-5
- side: be
- level: unit
- type: functional
- priority: high
- objective: D7, F1: cùng thay đổi dữ liệu của helper như TC-117 (helper dùng chung). Trên kho K4 (`[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`), kết quả lọc `INACTIVE` nay có một khách hàng mang số điện thoại thật (**Tran Thi Binh**, `0912345678`) thay vì `phone = null`, và test so **cả bản ghi** (`assertEquals(expected, result)` đang có) nên khẳng định trực tiếp rằng số điện thoại cũng được giữ đúng qua helper, không chỉ tên và email.
- preconditions: `repository` và `service` của `@BeforeEach`. Helper `insertByStatuses` như TC-117.
- test data: (danh sách trạng thái của kho, giá trị lọc → `id` mong đợi), provider `statusListsWithOneFilterValue`, không đổi
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `"ACTIVE"` → 1, 3 (khách hàng 3 là **Le Van Cuong**, có số `0987654321`)
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `"INACTIVE"` → 2, 4 (khách hàng 2 là **Tran Thi Binh**, có số `0912345678`; khách hàng 4 là **Pham Thi Dung**, không số)
  - `[ACTIVE, ACTIVE]`, `"INACTIVE"` → (rỗng)
  - `[INACTIVE, INACTIVE]`, `"ACTIVE"` → (rỗng)
  - `[]`, `"ACTIVE"` → (rỗng)
- steps: Given kho dựng bằng `insertByStatuses(statuses)` / When gọi `service.list(List.of(giá trị lọc))` / Then so kết quả với list mong đợi (dựng từ các `Customer` do `insertByStatuses` trả về) và đọc lại `service.list()`.
- expected result:
  - hành vi được kiểm, không đổi so với trước: không ném exception; kết quả bằng đúng (so cả bản ghi) list các `Customer` có `id` mong đợi, theo đúng thứ tự; `service.list()` vẫn bằng đúng list mọi `Customer`
  - trên dòng K4/`INACTIVE`: phần tử `id` 2 trong kết quả có `phone = "0912345678"` (**không còn `null`**), chứng minh helper mang số điện thoại của bảng chuẩn qua `insert`
  - giữ nguyên từng ký tự: `@DisplayName`, tên method `listWithOneValidStatusValueReturnsMatchingCustomers`, chữ ký, thân test (dòng 790–802), provider `statusListsWithOneFilterValue` (dòng 804–815)
  - **TC-119 không sửa** (Q7): vẫn tự dựng K4 tại chỗ (dòng 831–834) bằng đúng dữ liệu chuẩn, không gọi `insertByStatuses`
  - test chạy đúng **5 lần**, đều pass; `be_test` in `Tests run: 173` cho `CustomerServiceTest` và `Tests run: 399` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-120: GET /api/customers returns 200 with exactly the customers matching the status query parameter (sửa, mã của REQ-005)
- covers: AC-5
- side: be
- level: integration
- type: functional
- priority: high
- objective: D8, F2: thêm ba assertion ngay sau dòng so `id` (dòng 740–741) của vòng lặp, trên **chính** `body.get(i)` đang kiểm (không qua bản chụp `all`): mỗi phần tử có đúng năm field, có field `phone`, và ở `id` 1, 4 thì `phone` là JSON `null`. Trước đây kỳ vọng này chỉ được chứng minh gián tiếp qua phép so `all.get((int) id - 1).equals(body.get(i))`, vốn cũng pass nếu cả hai phía cùng thiếu field. Đây là test có sẵn (dòng 724–746), không phải test mới.
- preconditions: server đang chạy; kho K4 dựng qua `insertStandardFour()` (không đổi); chụp `all = customers()`, xác nhận có 4 phần tử.
- test data: (`path`, `expectedIds`, `expectedFilterStatus`), provider `statusFilterPathsAndIds`, không đổi, 15 dòng (bao gồm `""` → 1,2,3,4; `"?status=ACTIVE"` → 1,3; `"?status=INACTIVE"` → 2,4; các dòng D3 và các dòng tên tham số khác bị bỏ qua)
- steps: Given kho K4 và `all` / When gọi `get(path)` / Then kiểm tra status, `Content-Type`, `id` từng phần tử, **số field và `phone` của từng phần tử (mới)**, rồi so cả phần tử với `all`.
- expected result: mọi dòng dữ liệu
  - hành vi được kiểm, không đổi so với trước: status 200; `Content-Type` bắt đầu bằng `application/json`; `id` của các phần tử đúng thứ tự mong đợi; mỗi phần tử bằng đúng (`assertEquals`, so `JsonNode`) phần tử cùng `id` trong `all`; ở các dòng có lọc, mọi phần tử có `status` đúng bằng giá trị lọc
  - **mới**: với mọi `i` trong vòng lặp, `body.get(i).size()` là `5`; `body.get(i).has("phone")` là `true`; nếu `id` của phần tử là 1 hoặc 4 thì `body.get(i).get("phone").isNull()` là `true`
  - giữ nguyên từng ký tự: `@DisplayName`, tên method `listFiltersByStatusQueryParameter`, chữ ký, provider `statusFilterPathsAndIds`, helper `insertStandardFour`, dòng so `id` và dòng so `all.get(...)` đang có
  - test chạy đúng **15 lần**, đều pass; `be_test` in `Tests run: 107` cho `CustomerHandlerTest` và `Tests run: 399` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-122: GET /api/customers filters by the status currently stored after a status change (sửa, mã của REQ-005)
- covers: AC-5
- side: be
- level: integration
- type: functional
- priority: high
- objective: D8, F3: trong cả hai nhánh `if (id == changedId)` (dòng 815–816 với `activeBody`, dòng 825–826 với `inactiveBody`), thêm phép so `name`, `email`, `phone` của phần tử khách hàng vừa đổi với phần tử cùng `id` trong `all` (so `JsonNode` với `JsonNode`, không qua `asText()`). Trước đây nhánh này chỉ so `status`; ba field còn lại chỉ được kiểm ở các khách hàng **không** đổi (qua `else` so với `all`), nên khẳng định "khách hàng vừa đổi vẫn giữ đúng ba field kia" chưa có trực tiếp.
- preconditions: server đang chạy; kho K4 dựng qua `insertStandardFour()`; chụp `all = customers()`.
- test data: (`changedId`, `changeBody`, `expectedActiveIds`, `expectedInactiveIds`), provider `statusChangeScenarios`, không đổi, 2 dòng
  - `1`, `{"status":"INACTIVE"}`, `[3]`, `[1, 2, 4]` → nhánh chạy là `inactiveBody` (khách hàng 1 có `phone = null`, lấy từ `all.get(0)`)
  - `2`, `{"status":"ACTIVE"}`, `[1, 2, 3]`, `[4]` → nhánh chạy là `activeBody` (khách hàng 2 có `phone = "0912345678"`, lấy từ `all.get(1)`)
- steps: Given kho K4 và `all` / When `PUT /api/customers/{changedId}/status` với `changeBody` rồi `GET ?status=ACTIVE` và `GET ?status=INACTIVE` / Then kiểm tra ba response, **so thêm `name`, `email`, `phone` của khách hàng vừa đổi với `all`**.
- expected result: mọi dòng dữ liệu
  - hành vi được kiểm, không đổi so với trước: PUT trả 200; hai GET trả 200 với `id` đúng mong đợi, theo đúng thứ tự; phần tử của khách hàng vừa đổi có `status` mới (giữ assertion `status` đang có); mọi phần tử khác bằng đúng phần tử cùng `id` trong `all`
  - **mới**: với khách hàng vừa đổi, ba lệnh `assertEquals(all.get((int) id - 1).get(field), <body>.get(i).get(field))` cho `field` trong `{"name", "email", "phone"}` đều đúng (dòng 1: `inactiveBody`, khách hàng 1 so `phone` JSON `null` với `null`; dòng 2: `activeBody`, khách hàng 2 so `phone` `"0912345678"` với `"0912345678"`)
  - giữ nguyên từng ký tự: `@DisplayName`, tên method `listFiltersByCurrentlyStoredStatusAfterChange`, chữ ký, provider `statusChangeScenarios`, hai dòng so `status` đang có
  - test chạy đúng **2 lần**, đều pass; `be_test` in `Tests run: 107` cho `CustomerHandlerTest` và `Tests run: 399` cho toàn bộ BE, `Failures: 0, Errors: 0, Skipped: 0`

### TC-127: listCustomers throws ApiError with the status and field errors of the API (sửa, mã của REQ-005)
- covers: AC-6
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: D9, F4: biến cục bộ dùng cho hai dòng dữ liệu 500 đổi tên từ `notFound500` thành `internalError500`, vì nó chứa Problem `500 Internal Server Error`, không liên quan gì tới "not found". Đây là test có sẵn (`customerApi.test.js` dòng 275–290+), không phải test mới; chỉ đổi định danh ở ba chỗ (dòng khai báo và hai dòng dùng).
- preconditions: mỗi dòng dùng mảng `calls` mới và `fakeFetch(status, problem, calls)` truyền qua `{ fetchImpl }`.
- test data: (`options`; status và `problem` API trả → `url`; `fieldErrors`), không đổi
  - `{ status: 'DELETED' }`; 400, Problem validation (`errors: { status: 'must be ACTIVE or INACTIVE' }`) → `'/api/customers?status=DELETED'`; `{ status: 'must be ACTIVE or INACTIVE' }`
  - `{ status: 'ACTIVE' }`; 500, `internalError500` (đổi tên từ `notFound500`) → `'/api/customers?status=ACTIVE'`; `{}`
  - `{}`; 500, cùng `internalError500` → `'/api/customers'`; `{}`
- steps: Given `fakeFetch` trả lỗi / When gọi `listCustomers({ ...options, fetchImpl })` / Then kiểm tra lỗi bị ném bằng `assert.rejects` và đọc `calls`.
- expected result: mọi dòng dữ liệu
  - hành vi được kiểm, không đổi so với trước: promise bị reject; lỗi `instanceof ApiError`; `error.status` đúng; `error.fieldErrors` bằng đúng (`assert.deepEqual`); `calls.length` là 1 và `calls[0].url` đúng
  - nội dung object Problem của `internalError500` giống nguyên văn `notFound500` trước đây (`type: 'about:blank'`, `title: 'Internal Server Error'`, `status: 500`, `detail: 'Unexpected error'`)
  - chuỗi `notFound500` không còn ở đâu trong file; `internalError500` dùng ở đúng ba chỗ (khai báo, và hai dòng dữ liệu 500)
  - giữ nguyên từng ký tự: tên hiển thị `test('TC-127: ...')`, ba dòng dữ liệu, thứ tự, mọi assertion
  - test vẫn là **một** test (không tách thêm); `fe_test` không giảm tổng số test vì thay đổi này

### TC-135: renderCustomerTable shows a no-match sentence for an empty list when a status filter is selected
- covers: AC-1
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D1: `renderCustomerTable([], statusFilter)` trả `<p>Không có khách hàng nào khớp lựa chọn lọc.</p>` khi `statusFilter` là một giá trị truthy, kể cả giá trị không chuẩn (`'DELETED'`), vì FE không biết kho có khách hàng hay không khi đang lọc (Q1). Câu này không chèn `statusFilter` vào HTML: cả ba dòng dữ liệu cho đúng một chuỗi hằng như nhau.
- preconditions: file test import `renderCustomerTable` từ `../src/components/customerTable.js` (đã có sẵn trong file).
- test data: (`statusFilter`)
  - `'ACTIVE'`
  - `'INACTIVE'`
  - `'DELETED'` (giá trị truthy không chuẩn; bắt cách hiện thực chỉ so với hai hằng `ACTIVE`/`INACTIVE`)
- steps: Given danh sách rỗng / When gọi `renderCustomerTable([], statusFilter)` / Then so chuỗi trả về.
- expected result: mọi dòng dữ liệu: kết quả đúng bằng (`assert.equal`) `'<p>Không có khách hàng nào khớp lựa chọn lọc.</p>'`.

### TC-136: renderCustomerTable renders the table unchanged when the list is not empty, regardless of statusFilter
- covers: AC-1
- side: fe
- level: unit
- type: functional
- priority: medium
- objective: D1 → Bắt buộc: `statusFilter` chỉ ảnh hưởng tới trường hợp danh sách rỗng; khi `customers` không rỗng, kết quả giống từng ký tự với lời gọi không truyền `statusFilter` (dòng dựng bảng, dòng 14–28 của `customerTable.js`, không đổi). Bắt cách hiện thực lỡ làm `statusFilter` ảnh hưởng tới bảng (thêm cột, đổi nội dung).
- preconditions: file test import `renderCustomerTable`. Dùng chung một danh sách một khách hàng cho cả bốn lời gọi trong một dòng dữ liệu: `{ id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'ACTIVE' }`.
- test data: (`statusFilter`)
  - không truyền (một tham số)
  - `''`
  - `'ACTIVE'`
  - `'INACTIVE'`
- steps: Given một danh sách một khách hàng cố định / When gọi `renderCustomerTable(customers)` (không `statusFilter`) để lấy chuỗi đối chiếu, rồi `renderCustomerTable(customers, statusFilter)` cho từng dòng dữ liệu / Then so hai chuỗi.
- expected result: mọi dòng dữ liệu: `renderCustomerTable(customers, statusFilter)` đúng bằng từng ký tự (`assert.equal`) với `renderCustomerTable(customers)`; không chuỗi nào chứa `'Chưa có khách hàng.'` hay `'Không có khách hàng nào khớp lựa chọn lọc.'`.

### TC-137: chooseStatusClickKey returns the given customerId unchanged when no status filter is selected
- covers: AC-3
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: D3 → Bắt buộc: khi `statusFilter` falsy, `chooseStatusClickKey` trả **chính** `customerId` nhận vào (so `===`), không đổi kiểu, không thêm tiền tố — dưới "Tất cả" guard phải nhận đúng key như trước REQ-006, kể cả với `customerId` là chuỗi trùng tên thuộc tính có sẵn hoặc chứa thẻ HTML (giá trị thật của `button.dataset.statusId`, TC-104 của REQ-003).
- preconditions: file test import `chooseStatusClickKey` từ `../src/utils/chooseStatusClickKey.js`.
- test data: (`statusFilter`, `customerId`)
  - `''`, `'7'`
  - `undefined`, `'7'`
  - `null`, `'7'`
  - `''`, `''`
  - `''`, `'constructor'`
  - `''`, `'__proto__'`
  - `''`, `'7"><b>x</b>'`
- steps: Given cặp `(statusFilter, customerId)` của dòng dữ liệu / When gọi `chooseStatusClickKey(statusFilter, customerId)` / Then so kết quả.
- expected result: mọi dòng dữ liệu: kết quả `=== customerId` của đúng dòng đó (không chỉ `==`).

### TC-138: chooseStatusClickKey returns one shared non-string key for every customer when a status filter is selected
- covers: AC-2
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D3 → Bắt buộc: khi `statusFilter` truthy, `chooseStatusClickKey` trả một giá trị **chung** cho mọi `customerId` và cho cả hai lựa chọn lọc, giá trị đó **không phải chuỗi** (để chắc không trùng `customerId` nào, vốn luôn là chuỗi). Bắt cách hiện thực dùng một chuỗi cố định (`''`, `'*'`, `'any'`) có thể trùng `data-status-id`, hoặc một key đổi theo `customerId`/`statusFilter`.
- preconditions: file test import `chooseStatusClickKey`.
- test data: (`statusFilter`, `customerId`)
  - `'ACTIVE'`, `'1'`
  - `'ACTIVE'`, `'2'`
  - `'INACTIVE'`, `'2'`
  - `'INACTIVE'`, `''`
- steps: Given bốn lời gọi của bốn dòng dữ liệu / When gọi `chooseStatusClickKey(statusFilter, customerId)` cho từng dòng / Then so kiểu và so bốn kết quả với nhau.
- expected result:
  - `typeof chooseStatusClickKey(statusFilter, customerId) !== 'string'`, đúng cho cả bốn dòng
  - bốn kết quả bằng nhau (`===`) từng cặp
  - kết quả chung này khác (`!==`) mọi `customerId` đã dùng ở bốn dòng (`'1'`, `'2'`, `''`)

### TC-139: a second click on any customer's status button is rejected within the double-click window while a status filter is selected
- covers: AC-2
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: D3, D4; AC-2: khi đang lọc, dùng `chooseStatusClickKey` làm key cho `createDoubleClickGuard` **thật** thì lần bấm thứ hai vào nút đổi trạng thái của **bất kỳ** khách hàng nào, tới dưới 500 ms sau một lần bấm được xử lý, bị bỏ qua — bất kể lần bấm đó rơi vào khách hàng khác (dòng của A đã rời bảng) hay vào chính khách hàng vừa bấm (bảng chưa vẽ lại, hoặc yêu cầu đã thất bại), và bất kể lựa chọn lọc nào. Hệ quả được chấp nhận ở Q2: quyết định không nhìn `customerId`.
- preconditions: file test import `chooseStatusClickKey` và `createDoubleClickGuard` (thật) từ `../src/utils/`. Mỗi dòng dữ liệu tạo một guard mới: `const accept = createDoubleClickGuard()`. Mỗi lần bấm gọi `accept(chooseStatusClickKey(statusFilter, customerId), at)`.
- test data: (chuỗi lần bấm `(statusFilter, customerId, at)` → kết quả từng lần)
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '2', 1000)` → `true`, `false` (dòng của A rời bảng ngay, rơi vào B)
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '2', 1001)` → `true`, `false`
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '2', 1499)` → `true`, `false`
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '1', 1300)` → `true`, `false` (rơi vào chính A: bảng chưa vẽ lại, hoặc yêu cầu đã thất bại)
  - `('INACTIVE', '2', 1000)`, `('INACTIVE', '4', 1499)` → `true`, `false` (lựa chọn "Ngừng hoạt động")
- steps: Given một guard mới / When gọi `accept(chooseStatusClickKey(statusFilter, customerId), at)` lần lượt theo chuỗi của dòng dữ liệu / Then so giá trị trả về của từng lời gọi, theo đúng thứ tự.
- expected result: mọi dòng dữ liệu: lần bấm thứ nhất trả `true`; lần bấm thứ hai trả `false`.

### TC-140: a click on a customer's status button is accepted from 500 ms onward since the last accepted click, while a status filter is selected
- covers: AC-3
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: D3, D4; AC-3: khi đang lọc, lần bấm đầu tiên kể từ khi mở trang được xử lý; lần bấm tới từ 500 ms trở lên sau lần bấm được xử lý gần nhất (của key chung) cũng được xử lý, cho phép đổi trạng thái nhiều khách hàng liên tiếp. Mốc neo vào lần bấm **được xử lý**, không trượt: một lần bị bỏ qua ở giữa không dời mốc.
- preconditions: file test import `chooseStatusClickKey` và `createDoubleClickGuard` (thật). Mỗi dòng dữ liệu tạo một guard mới.
- test data: (chuỗi lần bấm `(statusFilter, customerId, at)` → kết quả từng lần)
  - `('ACTIVE', '1', 1000)` → `true` (lần bấm đầu tiên kể từ khi mở trang)
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '3', 1500)` → `true`, `true` (đúng 500 ms: biên, được xử lý)
  - `('ACTIVE', '1', 1000)`, `('ACTIVE', '3', 1300)`, `('ACTIVE', '3', 1500)` → `true`, `false`, `true` (lần bị bỏ qua ở 1300 không dời mốc; 1500 vẫn cách mốc gốc 1000 đúng 500 ms)
- steps: Given một guard mới / When gọi `accept(chooseStatusClickKey(statusFilter, customerId), at)` lần lượt theo chuỗi của dòng dữ liệu / Then so giá trị trả về của từng lời gọi, theo đúng thứ tự.
- expected result: mọi dòng dữ liệu: từng lời gọi trả đúng giá trị của dòng dữ liệu, theo đúng thứ tự.

### TC-141: viewing "Tất cả" still tracks the double-click window per customer
- covers: AC-3
- side: fe
- level: unit
- type: functional
- priority: medium
- objective: D3 → Đã cân nhắc, R2 (của requirement): khi `statusFilter` là `''` ("Tất cả"), `chooseStatusClickKey` trả chính `customerId`, nên guard vẫn tính cửa sổ riêng cho từng khách hàng như REQ-004: lần bấm vào khách hàng khác được xử lý ngay; lần bấm lặp vào cùng khách hàng trong khoảng bấm đúp vẫn bị bỏ qua. Đây là tiền đề để D3 không đảo D1 của REQ-004 khi xem "Tất cả" (`aiws/work/REQ-004/01-analysis.md` dòng 39, TC-111).
- preconditions: file test import `chooseStatusClickKey` và `createDoubleClickGuard` (thật). Một guard mới cho dòng dữ liệu duy nhất.
- test data: chuỗi lần bấm trên `statusFilter = ''`: `('', '1', 1000)`, `('', '2', 1001)`, `('', '1', 1002)`.
- steps: Given một guard mới / When gọi `accept(chooseStatusClickKey('', customerId), at)` lần lượt theo chuỗi trên / Then so giá trị trả về của từng lời gọi.
- expected result: `true`, `true`, `false` theo đúng thứ tự (khách hàng `'2'` được xử lý; lần bấm lặp vào khách hàng `'1'` chỉ 2 ms sau bị bỏ qua).

### TC-142: changing the status filter between two clicks starts a new double-click window for the new mode
- covers: AC-2
- side: fe
- level: unit
- type: functional
- priority: low
- objective: D4 (Q3): "đang lọc" được xét theo `statusFilter` **tại từng lần bấm**; chế độ "key chung" (mọi giá trị truthy) và chế độ "key theo `customerId`" (`''`) giữ mốc riêng, nên một lần bấm ngay sau khi đổi giữa "Tất cả" và một lựa chọn lọc không bị chặn bởi lần bấm trước. Ngoại lệ: hai lựa chọn lọc khác nhau (cả hai truthy) dùng **chung** một key, nên vẫn chặn nhau. Ba kịch bản này nằm **ngoài tiền đề** của AC-2 và AC-3 (hai AC chỉ phát biểu khi lựa chọn lọc không đổi giữa hai lần bấm); ghi ở đây để hành vi đã chọn của D4 có test giữ.
- preconditions: file test import `chooseStatusClickKey` và `createDoubleClickGuard` (thật). Mỗi dòng dữ liệu tạo một guard mới.
- test data: (chuỗi lần bấm `(statusFilter, customerId, at)` → kết quả từng lần)
  - `('ACTIVE', '1', 1000)`, `('', '1', 1300)` → `true`, `true` (đang lọc → "Tất cả")
  - `('', '1', 1000)`, `('ACTIVE', '2', 1300)` → `true`, `true` ("Tất cả" → đang lọc)
  - `('ACTIVE', '1', 1000)`, `('INACTIVE', '2', 1300)` → `true`, `false` (hai lựa chọn lọc khác nhau, vẫn cùng key chung)
- steps: Given một guard mới / When gọi `accept(chooseStatusClickKey(statusFilter, customerId), at)` lần lượt theo chuỗi của dòng dữ liệu / Then so giá trị trả về của từng lời gọi.
- expected result: mọi dòng dữ liệu: từng lời gọi trả đúng giá trị của dòng dữ liệu, theo đúng thứ tự.

### TC-143: describeCreateNotice returns an empty string when there is no status filter or the created customer matches it
- covers: AC-4
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D5: thông báo đã thêm **không** hiện khi xem "Tất cả" (khách hàng mới luôn khớp), hoặc khi đang lọc và `status` của khách hàng vừa tạo đúng bằng `statusFilter` (khách hàng mới có trong bảng, như hiện nay). So khớp chính xác bằng `!==`, không mặc định khách hàng mới là `ACTIVE`.
- preconditions: file test import `describeCreateNotice` từ `../src/utils/describeCreateNotice.js`.
- test data: (`created`, `statusFilter`)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }`, `''` (xem "Tất cả")
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'INACTIVE' }`, `undefined`
  - `null`, `null` (xem "Tất cả", kể cả khi `created` không đọc được)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }`, `'ACTIVE'` (khớp)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: '0912345678', status: 'INACTIVE' }`, `'INACTIVE'` (khớp)
- steps: Given cặp `(created, statusFilter)` của dòng dữ liệu / When gọi `describeCreateNotice(created, statusFilter)` / Then so kết quả.
- expected result: mọi dòng dữ liệu: kết quả đúng bằng (`assert.equal`) chuỗi rỗng `''`.

### TC-144: describeCreateNotice returns the added-customer notice when a status filter hides the created customer or its status cannot be read
- covers: AC-4
- side: fe
- level: unit
- type: negative
- priority: high
- objective: D5; Q4, Q6: thông báo "Đã thêm khách hàng." hiện khi đang lọc và `status` của khách hàng vừa tạo khác `statusFilter`, xét theo giá trị API trả (không mặc định `ACTIVE`) — bao gồm cả ca duy nhất hiện có thể xảy ra (`CustomerService.create` luôn tạo `ACTIVE`, nên dưới "Ngừng hoạt động" khách hàng mới luôn không khớp). Khi không đọc được `status` (`created` là `null`, `undefined`, hoặc thiếu field `status`) thì API đã báo thành công mà FE không chứng minh được khách hàng mới có trong bảng đang lọc, nên vẫn hiện thông báo — hiện thừa một câu đúng thì vô hại, thiếu câu thì là lỗi R3 (của requirement) mô tả.
- preconditions: file test import `describeCreateNotice`.
- test data: (`created`, `statusFilter`)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: null, status: 'ACTIVE' }`, `'INACTIVE'` (ca duy nhất API hiện tạo ra)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: '0912345678', status: 'INACTIVE' }`, `'ACTIVE'` (chiều ngược, xét theo `status` API trả, không mặc định)
  - `null`, `'ACTIVE'` (không đọc được `created`, đang lọc)
  - `undefined`, `'INACTIVE'` (không đọc được `created`, đang lọc)
  - `{ id: 5, name: 'E', email: 'e@example.com', phone: null }`, `'ACTIVE'` (object không có field `status`)
- steps: Given cặp `(created, statusFilter)` của dòng dữ liệu / When gọi `describeCreateNotice(created, statusFilter)` / Then so kết quả.
- expected result: mọi dòng dữ liệu: kết quả đúng bằng (`assert.equal`) chuỗi `'Đã thêm khách hàng.'`.

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-135, TC-136 |
| AC-2 | TC-138, TC-139, TC-142 |
| AC-3 | TC-137, TC-140, TC-141 |
| AC-4 | TC-143, TC-144 |
| AC-5 | TC-117, TC-118, TC-120, TC-122 |
| AC-6 | TC-127 |
