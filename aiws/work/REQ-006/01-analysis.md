# REQ-006 — Phân tích requirement

## Mục tiêu
REQ-005 đưa bộ lọc theo trạng thái vào màn hình danh sách khách hàng (`source-fe/index.html`, `<select id="status-filter">`) và chấp nhận ba điểm chưa trọn vẹn về trải nghiệm cho nhân viên CSKH (`aiws/work/REQ-005/02-design.md` → Quyết định cần duyệt: Q1/D10, Q5, Q6). Lần review REQ-005 cũng ghi bốn finding minor, đều nằm trong test (`aiws/work/REQ-005/05-review.md` → Findings). REQ-006 xử lý cả bảy điểm đó, chỉ ở FE và ở code test; API và quy tắc lọc của BE không đổi.

Đo thành công:
- Khi đang lọc mà không ai khớp, vùng danh sách không còn nói "Chưa có khách hàng." mà nói rõ là không ai khớp lựa chọn lọc.
- Khi đang lọc, một cú bấm đúp vào nút đổi trạng thái chỉ gửi **một** yêu cầu đổi trạng thái, cho đúng khách hàng được bấm; khách hàng ở dòng kế tiếp không bị đổi.
- Thêm một khách hàng mà khách hàng đó không hiện trong danh sách đang lọc thì nhân viên vẫn thấy thông báo đã thêm.
- Năm test của REQ-005 mà bốn finding nêu (TC-117, TC-118, TC-120, TC-122, TC-127) khẳng định trực tiếp điều finding nêu; mã TC, tên hiển thị, dữ liệu và số lần chạy giữ nguyên.
- Không hành vi hiện có nào khác đổi: 399 lần chạy test BE và 53 test FE hiện có vẫn pass (`aiws/work/REQ-005/evidence/test-results/T3-attempt-1.yaml`, `T5-attempt-1.yaml`), trừ test mà design ghi rõ là phải sửa (xem Impact).

## Acceptance criteria
Truy vết:
- R1..R4 là bốn gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-006-status-filter-polish.md`, theo đúng thứ tự.
- F1..F4 là bốn finding trong `aiws/work/REQ-005/05-review.md` → Findings, theo đúng thứ tự: F1 `CustomerServiceTest.java:817`, F2 `CustomerHandlerTest.java:741`, F3 `CustomerHandlerTest.java:816`, F4 `customerApi.test.js:276`. Số dòng của cả bốn khớp với file hiện tại.

Quy ước dùng trong các AC:
- "Lựa chọn lọc" là một trong ba: "Tất cả" (`''`), "Đang hoạt động" (`ACTIVE`), "Ngừng hoạt động" (`INACTIVE`) (`aiws/knowledge/glossary.md`). "Đang lọc" là lựa chọn đang chọn khác "Tất cả".
- "Khớp": khách hàng có `status` đúng bằng giá trị của lựa chọn lọc; với "Tất cả" thì mọi khách hàng đều khớp (như REQ-005).
- "Tải lại danh sách" là FE gọi API lấy danh sách theo lựa chọn đang chọn lúc đó rồi vẽ lại vùng `#customers` (`source-fe/src/main.js:refresh`).
- "Nút đổi trạng thái", "lần bấm được xử lý", "lần bấm bị bỏ qua" dùng đúng nghĩa của REQ-004 (`aiws/work/REQ-004/01-analysis.md` dòng 20–23): được xử lý là FE gửi một yêu cầu đổi trạng thái cho khách hàng và trạng thái đích mà nút đang mang; bị bỏ qua là FE không gửi yêu cầu nào và không đổi gì trên màn hình (`#message`, bảng).
- "Khoảng bấm đúp" là dưới 500 ms tính từ lần bấm được xử lý gần nhất, như REQ-004 (`source-fe/src/utils/createDoubleClickGuard.js` dòng 1, `DOUBLE_CLICK_WINDOW_MS`).
- "Bốn khách hàng chuẩn" và "kho K4" là bảng dữ liệu của `aiws/work/REQ-005/03-test-spec.md` → Dữ liệu chung: `id` 1 An (`phone = null`, `ACTIVE`), 2 Binh (`0912345678`, `INACTIVE`), 3 Cuong (`0987654321`, `ACTIVE`), 4 Dung (`phone = null`, `INACTIVE`).

**Câu trạng thái rỗng (FE)**
- AC-1: Given một lần tải danh sách theo lựa chọn lọc L thành công và API trả mảng rỗng, when vùng danh sách được vẽ, then vùng danh sách không có bảng và hiện đúng một câu, chọn theo L. Biến thể dữ liệu:
  - L = "Tất cả" → "Chưa có khách hàng." (như hiện nay)
  - L = "Đang hoạt động" → "Không có khách hàng nào khớp lựa chọn lọc." (câu giả định, Q1)
  - L = "Ngừng hoạt động" → cùng câu "Không có khách hàng nào khớp lựa chọn lọc."
  - đang chọn "Đang hoạt động" và ngừng hoạt động khách hàng cuối cùng của danh sách → sau khi tải lại, vùng danh sách hiện câu "Không có khách hàng nào khớp lựa chọn lọc."
  - API trả mảng không rỗng, mọi L → bảng như hiện nay, không có câu nào trong hai câu trên

  (R1)

**Bấm đúp khi đang lọc (FE)**
- AC-2: Given nhân viên đang lọc và vừa bấm nút đổi trạng thái của khách hàng A, lần bấm đó được xử lý, when một lần bấm nữa vào nút đổi trạng thái của **bất kỳ** khách hàng nào tới trong khoảng bấm đúp, then lần bấm này bị bỏ qua: tính cả hai lần bấm, FE gửi đúng một yêu cầu đổi trạng thái, là yêu cầu của A; không khách hàng nào khác đổi trạng thái. Biến thể dữ liệu (nút mà lần bấm thứ hai rơi vào):
  - bảng đã vẽ lại, dòng của A đã rời bảng, dòng kế tiếp của khách hàng B dời lên đúng chỗ → lần bấm rơi vào nút của B và bị bỏ qua; B giữ nguyên trạng thái (đây là ca R2 mô tả)
  - yêu cầu của A chưa trả về hoặc bảng chưa vẽ lại → lần bấm rơi vào nút của chính A và bị bỏ qua (như REQ-004)
  - yêu cầu của A đã thất bại (ví dụ 400 trùng số khi kích hoạt lại dưới "Ngừng hoạt động") nên A còn trong bảng → lần bấm vào nút của A bị bỏ qua; câu lỗi trong `#message` còn nguyên (như REQ-004)
  - cả hai lựa chọn lọc: "Đang hoạt động" (nút "Ngừng hoạt động") và "Ngừng hoạt động" (nút "Kích hoạt lại")
  - hệ quả được chấp nhận (Q2): nhân viên **chủ động** bấm nút của một khách hàng khác B trong khoảng bấm đúp sau lần bấm của A cũng bị bỏ qua, vì FE không phân biệt được với lần bấm thứ hai của một cú bấm đúp

  (R2)
- AC-3: Given một lần bấm vào nút đổi trạng thái của khách hàng B không thuộc trường hợp bị bỏ qua (khi đang lọc: không có lần bấm nút đổi trạng thái nào được xử lý trong khoảng bấm đúp vừa qua; khi xem "Tất cả": không có lần bấm nào vào nút của **chính B** được xử lý trong khoảng bấm đúp vừa qua), when nhân viên bấm, then lần bấm được xử lý: FE gửi đúng một yêu cầu đổi trạng thái cho B với trạng thái đích mà nút đang mang. Biến thể dữ liệu:
  - đang lọc, lần bấm đầu tiên vào một nút đổi trạng thái kể từ khi mở trang
  - đang lọc, vừa đổi trạng thái của A, rồi bấm nút của B khi đã hết khoảng bấm đúp (từ 500 ms trở đi) → được xử lý (vẫn đổi được trạng thái nhiều khách hàng liên tiếp)
  - xem "Tất cả", vừa bấm nút của A (lần bấm được xử lý) rồi bấm nút của B trong khoảng bấm đúp → lần bấm của B vẫn được xử lý, đúng như REQ-004 (`aiws/work/REQ-004/01-analysis.md`, biến thể cuối của AC-2 ở đó; TC-111)

  (R2: "Khi đang lọc"; giữ nguyên REQ-004 ngoài phạm vi đó)

**Thông báo sau khi thêm (FE)**
- AC-4: Given nhân viên đang chọn lựa chọn lọc L và gửi form thêm khách hàng, when thao tác thêm kết thúc, then thông báo thêm thành công (câu giả định "Đã thêm khách hàng.", Q5) hiện **khi và chỉ khi** API báo thêm thành công và khách hàng vừa thêm không khớp L; các kết quả hiện có của thao tác thêm giữ nguyên (thành công: form trắng lại, danh sách tải lại theo L, lựa chọn lọc vẫn là L; thất bại: câu lỗi trong `#message`, danh sách không tải lại). Biến thể dữ liệu:
  - L = "Ngừng hoạt động", thêm thành công (API trả khách hàng `ACTIVE`) → thông báo hiện; khách hàng mới không có trong bảng
  - L = "Tất cả" hoặc "Đang hoạt động", thêm thành công → không có thông báo (giả định Q4); khách hàng mới có trong bảng, như hiện nay
  - thêm thất bại dưới mọi L (400 kèm lỗi theo field; 500 hoặc mất mạng) → không có thông báo thành công; `#message` hiện câu lỗi như hiện nay
  - L = "Ngừng hoạt động", thêm thành công nhưng lần tải lại danh sách ngay sau đó thất bại → thông báo vẫn hiện, vì khách hàng đã được lưu (giả định Q6); vùng danh sách hiện "Không tải được danh sách khách hàng." như hiện nay

  (R3)

**Test của REQ-005 ở BE**
- AC-5: Given các test BE của REQ-005 mà F1, F2, F3 nêu (TC-117 và TC-118 trong `CustomerServiceTest`; TC-120 và TC-122 trong `CustomerHandlerTest`), when đọc thân các test đó và chạy `be_test`, then (a) mỗi test khẳng định **trực tiếp** điều finding của nó nêu là thiếu hoặc mới chỉ được kiểm gián tiếp; (b) hành vi được kiểm không đổi: tên hiển thị (mã TC), tên method, các dòng dữ liệu, thứ tự của chúng và mọi assertion đang có giữ nguyên; không file nào trong `source-be/src/main` đổi; `CustomerServiceTest` vẫn chạy 173 lần, `CustomerHandlerTest` 107 lần, toàn bộ BE 399 lần, đều pass. Biến thể dữ liệu (finding → điều test phải khẳng định sau khi sửa):
  - F1, TC-117 (3 dòng) và TC-118 (5 dòng): kho của mỗi dòng dữ liệu gồm n khách hàng **đầu của bảng bốn khách hàng chuẩn**, đúng tên, email và số điện thoại của bảng, khách hàng thứ i mang `status` thứ i của dòng dữ liệu; không còn dữ liệu `"Customer n"`, `customer<n>@example.com`, `phone = null` cho mọi dòng. Trên kho K4, kết quả của TC-118 vì thế có một bản ghi có số điện thoại (`id` 3 khi lọc `ACTIVE`, `id` 2 khi lọc `INACTIVE`) và được so cả bản ghi
  - F2, TC-120 (15 dòng): trên chính response đang kiểm (không qua bản chụp `all`), mỗi phần tử có đúng năm field và có field `phone`; ở phần tử `id` 1 và `id` 4, `phone` là JSON `null`
  - F3, TC-122 (2 dòng): phần tử của khách hàng vừa đổi trạng thái, ngoài `status` mới, có `name`, `email`, `phone` bằng đúng phần tử cùng `id` trong `all`; kiểm ở danh sách mà khách hàng đó xuất hiện sau khi đổi

  (R4; F1, F2, F3)

**Test của REQ-005 ở FE**
- AC-6: Given TC-127 trong `source-fe/test/customerApi.test.js`, when đọc thân test và chạy `fe_test`, then (a) biến chứa Problem `500 Internal Server Error` dùng cho hai dòng dữ liệu 500 mang tên nói đúng nội dung của nó (tên giả định `internalError500`, Q9), và tên `notFound500` không còn ở đâu trong file; (b) hành vi được kiểm không đổi: tên hiển thị (mã TC), ba dòng dữ liệu (400 có lọc, 500 có lọc, 500 không lọc), nội dung của object Problem và mọi assertion giữ nguyên; 53 test FE hiện có vẫn pass.

  (R4; F4)

Giữ nguyên, không thuộc AC nào:
- Khi xem "Tất cả", lần bấm thứ hai vào nút của **cùng** khách hàng trong khoảng bấm đúp vẫn bị bỏ qua (REQ-004).
- Tải danh sách thất bại vẫn hiện "Không tải được danh sách khách hàng." dưới mọi lựa chọn lọc.
- Sửa và đổi trạng thái thành công vẫn không có thông báo; thao tác thất bại vẫn không tải lại danh sách.
- Lần tải danh sách bị một lần tải mới hơn vượt qua vẫn không đổi gì trên màn hình (`source-fe/src/utils/createCustomerListLoader.js`).

Cách kiểm chứng:
- Với AC-1..AC-4: phần nối sự kiện nằm trong `source-fe/src/main.js` và phần tĩnh nằm trong `source-fe/index.html`, cả hai không có test tự động vì `node:test` không có DOM (`aiws/knowledge/conventions.md` → Test → FE). Rule `every_ac_has_tc` (`aiws/config/contracts/test-spec.yaml`) đòi mỗi AC có ít nhất một TC, nên mỗi AC này cần quyết định của nó ("câu nào", "xử lý hay bỏ qua", "có thông báo hay không") nằm trong một đơn vị test được ngoài `main.js`, như `describeStatusError` (REQ-003), `createDoubleClickGuard` (REQ-004), `createCustomerListLoader` (REQ-005). Phần nối còn lại kiểm bằng review và chạy tay với BE local.
- Với AC-5 và AC-6: phần (b) kiểm bằng `be_test`, `fe_test` và so số lần chạy với mốc ở trên. Phần (a) là tính chất của code test: một assertion chặt hơn vẫn pass trên code đúng, nên chỉ chạy test thì không chứng minh được nó đã chặt hơn; kiểm bằng review diff, như AC-4 của REQ-004 (Q10).

## Impact
- **Module (BE)**: code production **không đổi** (requirement → Ngoài phạm vi). Chỉ hai file test đổi, trong `source-be/src/test/java/com/example/crm/`:
  - `service/CustomerServiceTest.java` (F1):
    - Helper `insertByStatuses` (dòng 817–824) dựng mọi khách hàng bằng `"Customer " + n`, `"customer" + n + "@example.com"`, `phone = null`. TC-117 (dòng 771–781) và TC-118 (dòng 790–802) cùng dùng nó, nên sửa helper là sửa dữ liệu của cả hai test.
    - Định nghĩa phải theo: "Kho theo danh sách trạng thái `[s1, .., sn]` (n ≤ 4) là kho gồm n khách hàng đầu của bảng, khách hàng thứ i mang `status = si`" (`aiws/work/REQ-005/03-test-spec.md` dòng 118).
    - List mong đợi của hai test được dựng từ các `Customer` do `repository.insert` trả về (dòng 780, 799–801), nên các assertion không phải đổi khi dữ liệu đổi. `repository.insert` không kiểm tra gì (`aiws/knowledge/db-schema.md`), nên hai khách hàng `INACTIVE` hay hai khách hàng có số đều dựng được.
    - TC-119 (dòng 826–842) tự dựng K4 tại chỗ ở dòng 831–834 (finding ghi "dòng 833–836", lệch hai dòng so với file hiện tại) và đã dùng đúng dữ liệu chuẩn (Q7).
  - `api/CustomerHandlerTest.java` (F2, F3):
    - TC-120 (dòng 724–746): vòng lặp dòng 738–745 so từng phần tử với `all.get(id - 1)` (dòng 741), và `all` là bản chụp của chính endpoint này. Kỳ vọng "đúng năm field, `phone` là JSON `null` ở `id` 1 và 4" (`aiws/work/REQ-005/03-test-spec.md` dòng 364) vì thế chưa được khẳng định trực tiếp.
    - TC-122 (dòng 792–831): nhánh `id == changedId` chỉ kiểm `status` (dòng 815–816, 825–826); kỳ vọng "`name`, `email`, `phone` bằng đúng phần tử cùng `id` trong `all`" (test spec dòng 399) chưa có.
    - Helper `insertStandardFour` (dòng 716–722) đã dựng đúng K4 qua API; không cần đổi.
  - Mốc số lần chạy: `CustomerHandlerTest` 107, `InMemoryCustomerRepositoryTest` 49, `CustomerServiceTest` 173, `PhoneNumbersTest` 70, tổng 399 (`aiws/work/REQ-005/evidence/test-results/T3-attempt-1.yaml`). REQ-006 không thêm dòng dữ liệu hay test BE nào, nên các số này phải giữ nguyên.
- **API**: không đổi. Không endpoint, tham số, schema hay mã lỗi nào đổi (`aiws/knowledge/api-inventory.md`). `aiws/work/REQ-006/api-contract.yaml` vẫn là output bắt buộc của phase design (`aiws/config/contracts/design.yaml`); architect ghi rõ trong đó là không có thay đổi.
  - FE dùng thêm một thông tin đã có sẵn: `POST /api/customers` trả 201 kèm `Customer` có field `status` (`aiws/knowledge/api-inventory.md` → Endpoints). Hiện `source-fe/src/main.js` dòng 30 bỏ kết quả này đi.
- **DB**: không có (`aiws/knowledge/db-schema.md`: hệ thống mới chưa có DB).
- **FE**, `source-fe/`:
  - `src/components/customerTable.js`: dòng 13 trả `<p>Chưa có khách hàng.</p>` cho mọi mảng rỗng; `renderCustomerTable(customers)` chỉ nhận danh sách, không biết lựa chọn lọc (AC-1).
    - Ràng buộc: test không mã TC `renderCustomerTable shows an empty state` (`test/customerTable.test.js` dòng 25–27) gọi `renderCustomerTable([])` và so đúng chuỗi `<p>Chưa có khách hàng.</p>`. Architect chọn cách giữ được lời gọi đó, hoặc ghi rõ trong design việc sửa test này (AGENTS.md mục 9; tiền lệ TC-36, TC-74). `aiws/work/REQ-005/02-design.md` dòng 511 đã nêu một phương án giữ được.
  - `src/main.js`:
    - `refresh()` (dòng 16–23) là nơi duy nhất vẽ vùng danh sách. `loadCustomers()` trả `{ current, customers }`, **không** trả lựa chọn lọc mà lần tải đó đã dùng (`src/utils/createCustomerListLoader.js` dòng 7–8). AC-1 đòi câu trạng thái rỗng theo đúng lựa chọn của lần tải được vẽ. Bình thường `filterEl.value` lúc vẽ bằng giá trị đó, vì mỗi lần đổi lựa chọn tạo một lần tải mới và lần tải cũ không còn `current`; ngoại lệ là khi giá trị của `<select>` đổi mà không phát `change` ([CẦN XÁC NHẬN] trình duyệt khôi phục giá trị, `aiws/work/REQ-005/02-design.md` R9). Architect chọn nguồn của giá trị này.
    - Submit của `#create-form` (dòng 25–39): dòng 27 xoá `#message`; dòng 30 gọi `createCustomer(...)` và bỏ kết quả; thành công thì `form.reset()` (dòng 31) rồi `await refresh()` (dòng 32). `refresh()` tự bắt lỗi của nó, nên code đứng sau dòng 32 vẫn chạy khi tải lại thất bại (biến thể cuối của AC-4). `main.js` hiện không có thông báo thành công nào.
    - Listener đổi trạng thái (dòng 81–92): dòng 84 hỏi `acceptStatusClick(button.dataset.statusId, event.timeStamp)`, tức key là `id` khách hàng. Cơ chế của R2 đã được ghi ở `aiws/work/REQ-005/02-design.md` D10 và R2: khi đang lọc, dòng vừa đổi trạng thái rời bảng, nút của dòng kế tiếp mang `id` khác nên guard coi là lần bấm mới. Requirement mô tả đây là hiện trạng; repo không có ghi nhận chạy tay nào tái hiện nó ([CẦN XÁC NHẬN], bước chạy tay 11 của REQ-005).
    - Ràng buộc từ AC-2, AC-3 mà architect cần biết trước khi thiết kế:
      - Quyết định "xử lý hay bỏ qua" phải biết lựa chọn lọc lúc bấm. Lựa chọn chỉ nằm ở `filterEl.value`, không có bản sao trong JS (`aiws/knowledge/conventions.md` → State và render).
      - Guard chỉ biết key và thời điểm, không phân biệt được lần bấm thứ hai của cú bấm đúp với lần bấm chủ động vào khách hàng khác (hệ quả ở AC-2).
      - Lần bấm bị bỏ qua phải thoát **trước** khi xoá `#message` (`aiws/work/REQ-004/02-design.md` D4), để "không đổi gì trên màn hình" còn đúng.
      - Nếu `createDoubleClickGuard.js` phải đổi thì TC-108..TC-113 (`test/createDoubleClickGuard.test.js`) phải pass nguyên vẹn, hoặc design ghi rõ test nào sửa. `aiws/work/REQ-005/02-design.md` D10 (phương án C) nhận định là không cần đổi guard.
  - `index.html`:
    - `#message` (dòng 26) là `<p id="message" class="error" role="alert">`, và `.error` tô chữ đỏ (dòng 14). Đặt thông báo thành công vào đó thì nó hiện như một lỗi và được trình đọc màn hình đọc như cảnh báo. Architect chọn nơi và cách trình bày (Q5).
    - Điều khiển lọc (dòng 28–35) dự kiến không đổi.
  - `src/utils/createDoubleClickGuard.js`, `src/utils/createCustomerListLoader.js`, `src/api/customerApi.js`: dự kiến không đổi (tuỳ thiết kế, xem hai ràng buộc ở trên).
  - Test, `test/`:
    - `customerApi.test.js` (F4): biến `notFound500` (dòng 276) chứa Problem `500 Internal Server Error`, dùng ở dòng 291–292 của TC-127.
    - Test mới cho các đơn vị mà architect đặt quyết định của AC-1..AC-4.
    - Mốc: 53 test FE, đều pass (`aiws/work/REQ-005/evidence/test-results/T5-attempt-1.yaml`).
- **Mã TC**:
  - Mã mới đánh số tiếp từ **TC-135** (`aiws/knowledge/conventions.md` → Test → Mã TC).
  - TC-117, TC-118, TC-120, TC-122, TC-127 bị sửa nhưng giữ mã và tên hiển thị (AC-5, AC-6). Chúng không thể mang mã mới vì mã nằm trong tên hiển thị. Theo tiền lệ của REQ-004 (TC-92, TC-97, TC-105; `aiws/work/REQ-004/03-test-spec.md` dòng 14–20), test spec của REQ-006 phải **định nghĩa lại** năm mã này để AC-5, AC-6 có TC và plan gán được chúng cho task (Q10).
- **Quyết định đã duyệt mà REQ-006 đổi** (người duyệt design nên biết):
  - `aiws/work/REQ-005/02-design.md` D10, phương án A "không chặn bấm đúp khi đang lọc": bị R2 đảo.
  - `aiws/work/REQ-005/02-design.md` D9, hai hệ quả "không thêm thông báo sau khi thêm" (Q5 ở đó) và "vẫn là câu Chưa có khách hàng." (Q6 ở đó): bị R3 và R1 đảo.
  - `aiws/work/REQ-004/02-design.md` D1 (guard tính riêng cho từng khách hàng) và biến thể cuối của AC-2 ở `aiws/work/REQ-004/01-analysis.md` dòng 39: **bị thu hẹp** khi đang lọc (AC-2 của REQ-006), giữ nguyên khi xem "Tất cả" (AC-3 của REQ-006).
  - `aiws/work/REQ-005/02-design.md` D11 "không test có sẵn nào bị sửa" chỉ nói về REQ-005; REQ-006 sửa năm test của REQ-005 theo R4.
- **Knowledge** cần cập nhật sau khi merge:
  - `aiws/knowledge/system-map.md`: dòng "FE: entry", "FE: component bảng", "FE: tiện ích" (nếu có đơn vị mới), "FE: trang chính" (nếu `index.html` đổi); luồng 1 (câu trạng thái rỗng), luồng 2 (thông báo sau khi thêm), luồng 6 (bấm đúp khi đang lọc).
  - `aiws/knowledge/conventions.md`: State và render, Xử lý lỗi (lần đầu có thông báo thành công); bảng mã TC của REQ-006, câu "REQ kế tiếp đánh số tiếp từ TC-135", danh sách các TC bị sửa và định nghĩa lại.
  - `aiws/knowledge/glossary.md`: thuật ngữ "Lựa chọn lọc" (hành vi bấm đúp khi đang lọc), và thuật ngữ mới nếu design đặt tên.
  - `aiws/knowledge/api-inventory.md`, `aiws/knowledge/db-schema.md`: không đổi.

## Reuse
- **FE**, `source-fe/`:
  - `src/utils/createDoubleClickGuard.js`: cửa sổ 500 ms neo vào lần bấm được xử lý, theo key bất kỳ; đã có TC-108..TC-113. Dùng được cho AC-2 nếu key không còn luôn là `id` khách hàng.
  - `src/main.js` dòng 13 (`acceptStatusClick`, một guard ở mức module) và dòng 84 (điểm hỏi guard, trước khi xoá `#message`).
  - `src/main.js` dòng 12 và 14 (`filterEl`, `() => filterEl.value`): cách đọc lựa chọn đang chọn tại thời điểm cần, không giữ bản sao.
  - `src/components/customerTable.js:renderCustomerTable`: nơi đang chọn câu trạng thái rỗng; mẫu "hằng nhãn tiếng Việt đặt ngay trong component" (`STATUS_LABELS`, `NO_PHONE`).
  - `src/utils/describeStatusError.js`: mẫu hàm thuần chọn một câu thông báo tiếng Việt, trả chuỗi text thuần, có unit test (TC-106, TC-107). Cùng dạng với quyết định của AC-4.
  - `src/api/customerApi.js:createCustomer` (dòng 30–32): đã trả `Customer` vừa tạo, gồm `status`.
  - `index.html` dòng 26: `#message` và quy ước "mỗi handler của người dùng xoá `#message` trước khi chạy" (`aiws/knowledge/conventions.md` → Xử lý lỗi), nếu architect đặt thông báo ở đó.
  - `test/customerTable.test.js`, `test/createDoubleClickGuard.test.js`, `test/describeStatusError.test.js`: mẫu test theo bảng dữ liệu lặp `for...of` trong một `test(...)`.
- **BE test**, `source-be/src/test/java/com/example/crm/`:
  - `service/CustomerServiceTest.java` dòng 831–834: bốn lời gọi `repository.insert` của K4 trong TC-119, đúng dữ liệu mà F1 đòi cho helper.
  - `api/CustomerHandlerTest.java`: `insertStandardFour()` (dòng 716–722), `customers()`, bản chụp `all`; `JsonNode.size()`, `has(...)`, `isNull()` của Jackson đã có sẵn qua `CustomerHandler.JSON`.
- **Tài liệu**:
  - `aiws/work/REQ-005/02-design.md` D10 (bảng phương án A..D và nhận định của architect), dòng 510–511 (phương án cho thông báo sau khi thêm và câu trạng thái rỗng), mười hai bước chạy tay ở mục FE change (bước 5, 6, 11 ứng với R3, R1, R2).
  - `aiws/work/REQ-005/03-test-spec.md`: Dữ liệu chung (dòng 107–119), expected result của TC-118, TC-120, TC-122, TC-127.
  - `aiws/work/REQ-004/03-test-spec.md` dòng 14–20: cách định nghĩa lại mã TC của test bị sửa.

## Ngoài phạm vi
- Thay đổi API hoặc quy tắc lọc ở backend; mọi file trong `source-be/src/main` (requirement → Ngoài phạm vi).
- Tìm kiếm, phân trang, sắp xếp (requirement → Ngoài phạm vi).
- Định dạng lỗi của yêu cầu có URL mã hoá hỏng (requirement → Ngoài phạm vi; `aiws/work/REQ-005/02-design.md` R10).
- Tự chuyển lựa chọn lọc về "Tất cả" sau khi thêm (phương án kia của Q5 ở REQ-005): lựa chọn lọc vẫn giữ nguyên.
- Thông báo thành công sau khi sửa hoặc đổi trạng thái; thông báo sau khi thêm khi khách hàng mới có trong bảng (Q4).
- Đổi hành vi bấm đúp khi xem "Tất cả"; đổi độ dài khoảng bấm đúp; bấm ba lần trở lên liên tiếp và bấm lại vì sốt ruột khi mạng chậm (giới hạn đã biết, `aiws/work/REQ-004/02-design.md` R2, R3); vô hiệu hoá nút hay trạng thái "đang chờ".
- Câu trạng thái rỗng nêu tên lựa chọn đang lọc, hay số lượng khách hàng của từng lựa chọn.
- Hai mục "Ghi nhận thêm, không tính là finding" của `aiws/work/REQ-005/05-review.md` (TC-129 và TC-134 dùng `Promise.resolve([])`; dòng `"?"` của TC-120): R4 chỉ nói bốn finding.
- Finding minor còn tồn của các REQ trước (TC-53, TC-65, TC-25; `aiws/knowledge/conventions.md` → Test) và mọi test khác ngoài năm test nêu ở AC-5, AC-6.
- Ghi nhớ lựa chọn lọc giữa các lần mở trang; thêm thư viện DOM để test `main.js`.

## Câu hỏi mở
Không có câu hỏi chặn thiết kế. Mọi câu dưới đây đều có giả định; người duyệt design nên xem Q2 và Q4 trước, vì hai giả định đó quyết định hành vi nhân viên thấy.

- [non-blocking] Q1: Câu cho danh sách rỗng khi đang lọc viết thế nào? Giả định: một câu cố định cho cả hai lựa chọn, "Không có khách hàng nào khớp lựa chọn lọc.", lấy từ đề xuất ở `aiws/work/REQ-005/02-design.md` dòng 511. Câu này cũng dùng khi kho hoàn toàn rỗng mà đang lọc: FE không biết kho có khách hàng hay không, và R1 chỉ giữ "Chưa có khách hàng." cho lúc xem tất cả.
- [non-blocking] Q2: Khi đang lọc, những lần bấm nào bị bỏ qua? Giả định: mọi lần bấm vào nút đổi trạng thái, **của bất kỳ khách hàng nào**, tới trong khoảng bấm đúp (dưới 500 ms) sau một lần bấm được xử lý; khi xem "Tất cả" thì giữ nguyên REQ-004 (tính riêng từng khách hàng). Đây là phương án C ở `aiws/work/REQ-005/02-design.md` D10, khớp với chữ "Khi đang lọc" của R2.
  - Hệ quả người duyệt cần chấp nhận: khi đang lọc, nhân viên chủ động bấm nút của khách hàng khác trong vòng 500 ms sau một lần bấm được xử lý thì lần bấm đó bị bỏ qua, không có phản hồi nào. Biến thể cuối của AC-2 ở REQ-004 không còn đúng khi đang lọc.
  - Cách khác: bỏ qua theo cùng quy tắc cả khi xem "Tất cả" (phương án B ở D10). Một quy tắc cho mọi lúc, nhưng đảo quyết định của REQ-004 ở nơi không có rủi ro (dòng không rời bảng). Không chọn vì R2 chỉ nói "khi đang lọc".
  - [CẦN XÁC NHẬN] ca R2 mô tả chưa có ghi nhận chạy tay nào trong repo; architect nên giữ một bước chạy tay để tái hiện trước và sau khi sửa.
- [non-blocking] Q3: "Đang lọc" được xét ở thời điểm nào, nếu lựa chọn lọc đổi giữa hai lần bấm? Giả định: xét theo lựa chọn đang chọn lúc lần bấm đang được quyết định. AC-2 và AC-3 chỉ phát biểu cho trường hợp lựa chọn lọc không đổi giữa hai lần bấm; đổi lựa chọn rồi bấm một nút trong vòng 500 ms khó làm được bằng tay, nên architect tự chọn hành vi cho ca này và ghi vào design.
- [non-blocking] Q4: Thông báo đã thêm hiện **chỉ khi** khách hàng mới không khớp lựa chọn lọc, hay sau **mọi** lần thêm thành công? Giả định: chỉ khi không khớp, theo đúng điều kiện R3 nêu; khi khách hàng mới có trong bảng thì chính dòng mới là dấu hiệu, như hiện nay.
  - Hiện `CustomerService.create` luôn tạo khách hàng `ACTIVE` (`source-be/src/main/java/com/example/crm/service/CustomerService.java` dòng 48), nên trên thực tế ca này chỉ xảy ra dưới "Ngừng hoạt động". "Không khớp" vẫn nên xét theo `status` mà API trả cho khách hàng vừa tạo, không mặc định khách hàng mới là `ACTIVE`; architect chốt.
  - Cách khác: hiện sau mọi lần thêm thành công. Đơn giản và nhất quán hơn cho thao tác thêm, nhưng rộng hơn R3 và làm thao tác thêm khác thao tác sửa, đổi trạng thái (vẫn không có thông báo). Người duyệt design nói nếu muốn cách này; khi đó biến thể thứ hai của AC-4 đổi.
- [non-blocking] Q5: Thông báo đã thêm viết thế nào, hiện ở đâu, mất khi nào? Giả định: câu cố định "Đã thêm khách hàng."; không được trình bày như một lỗi; mất ở thao tác kế tiếp của nhân viên, như các câu trong `#message` hiện nay. `#message` đang là `class="error" role="alert"` (`source-fe/index.html` dòng 26), nên architect chọn giữa một vùng riêng và việc đổi cách trình bày của `#message`. Câu có nên nói thêm lý do khách hàng không hiện trong bảng hay không: giả định không, R3 chỉ đòi "cho biết đã thêm thành công".
- [non-blocking] Q6: Thêm thành công nhưng lần tải lại danh sách ngay sau đó thất bại thì có hiện thông báo không? Giả định: có, khi khách hàng mới không khớp lựa chọn lọc; thông báo nói về thao tác thêm (đã được lưu), không phụ thuộc lần tải lại. Dưới "Tất cả" và "Đang hoạt động" ca này giữ nguyên như hiện nay (không thông báo, vùng danh sách hiện câu lỗi tải).
- [non-blocking] Q7: F1 đề xuất "một helper phục vụ cả ba TC"; TC-119 có phải sửa không? Giả định: **không bắt buộc**. Finding nằm ở helper mà TC-117 và TC-118 dùng; TC-119 đã dựng đúng K4. Architect được cho TC-119 gọi chung helper nếu ghi rõ trong design, với điều kiện tên hiển thị, 32 lần chạy và dữ liệu của nó giữ nguyên.
- [non-blocking] Q8: F2 phải khẳng định tới đâu? Giả định: đúng điều finding nêu, tức mỗi phần tử có đúng năm field, có field `phone`, và `phone` là JSON `null` ở `id` 1 và 4. Phần còn lại của cùng gạch đầu dòng trong test spec (số của `id` 2 và 3 viết thành giá trị cụ thể, `aiws/work/REQ-005/03-test-spec.md` dòng 364) không bắt buộc, vì finding không nêu và R4 nói "đúng theo bốn finding".
- [non-blocking] Q9: Tên mới của biến `notFound500`? Giả định `internalError500`, là tên đầu trong hai tên finding đề xuất (tên kia là `serverErrorProblem`). Chỉ là tên biến cục bộ trong một test.
- [non-blocking] Q10: R4 chỉ sửa code test có sẵn; truy vết AC → TC và kiểm chứng thế nào? Giả định: năm test giữ mã và tên hiển thị, và được định nghĩa lại trong test spec của REQ-006 (xem Impact → Mã TC). Orchestrator chỉ kiểm "mã TC có mặt trong file test mà task đã sửa", và phép kiểm này pass sẵn trước khi sửa gì (`aiws/work/REQ-004/03-test-spec.md` dòng 20), nên reviewer phải đọc diff của năm test này để xác nhận phần (a) của AC-5 và AC-6.
