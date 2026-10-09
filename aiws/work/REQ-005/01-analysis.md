# REQ-005 — Phân tích requirement

## Mục tiêu
Màn hình danh sách khách hàng của hệ thống mới (`source-fe/index.html`, vùng `#customers`) luôn hiện mọi khách hàng: `GET /api/customers` trả toàn bộ kho, không lọc (`aiws/knowledge/api-inventory.md` → Endpoints). Từ REQ-003 khách hàng có thể bị ngừng hoạt động, nên số dòng "Ngừng hoạt động" tăng dần, trong khi nhân viên CSKH thường chỉ cần xem khách hàng đang hoạt động.

REQ-005 cho nhân viên chọn danh sách muốn xem (tất cả, chỉ đang hoạt động, chỉ ngừng hoạt động), và việc lọc do API làm.

Đo thành công:
- Nhân viên chọn được một trong ba danh sách; bảng chỉ hiện khách hàng khớp lựa chọn; lúc mở trang là "tất cả", như hiện nay.
- Khi lựa chọn khác "tất cả", yêu cầu lấy danh sách mang giá trị lọc và response chỉ chứa khách hàng khớp; FE không tự lọc.
- Gọi API với giá trị lọc sai thì nhận lỗi có mô tả, không nhận danh sách. Hiện nay `GET /api/customers?status=DELETED` trả 200 kèm mọi khách hàng, vì `CustomerHandler.route` chỉ đọc path của URI (`source-be/src/main/java/com/example/crm/api/CustomerHandler.java` dòng 52): đúng điều R3 cấm. Suy ra từ đọc code, chưa có test nào ghi lại.
- Sau khi sửa hoặc đổi trạng thái một khách hàng, danh sách tải lại theo lựa chọn đang chọn.
- Lời gọi không kèm giá trị lọc giữ nguyên hành vi: 311 lần chạy test BE và 43 test FE hiện có vẫn pass (`aiws/work/REQ-004/evidence/test-results/T1-attempt-1.yaml`, `T3-attempt-1.yaml`), trừ test mà design ghi rõ là phải sửa (xem Impact).

## Acceptance criteria
Truy vết:
- R1..R4 là bốn gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-005-filter-by-status.md`, theo đúng thứ tự.

Quy ước dùng trong các AC:
- "Lựa chọn lọc" là một trong ba: "Tất cả", "Đang hoạt động", "Ngừng hoạt động" (nhãn theo `aiws/knowledge/glossary.md`).
- "Giá trị lọc" là giá trị đi kèm yêu cầu lấy danh sách. Giả định (Q2): tham số query `status` của `GET /api/customers`, nhận `ACTIVE` hoặc `INACTIVE`; "Tất cả" là **không gửi** tham số này.
- "Khớp": khách hàng có `status` đúng bằng giá trị lọc; không có giá trị lọc thì mọi khách hàng đều khớp.
- "Tải lại danh sách" là FE gọi API lấy danh sách rồi vẽ lại vùng `#customers` bằng đúng dữ liệu API trả.
- Các AC của màn hình (AC-4 và AC-5) phát biểu cho trường hợp không có yêu cầu lấy danh sách nào khác đang chờ (Q7).

**Lọc danh sách (BE, `GET /api/customers`)**
- AC-1: Given kho có bốn khách hàng `id` 1 (`ACTIVE`), 2 (`INACTIVE`), 3 (`ACTIVE`), 4 (`INACTIVE`), when gọi `GET /api/customers` không kèm giá trị lọc hoặc kèm một giá trị lọc hợp lệ, then trả 200 `application/json`, body là mảng gồm **đúng** các khách hàng khớp, tăng dần theo `id`, mỗi phần tử đủ năm field `id`, `name`, `email`, `phone` (kể cả khi `null`), `status` như hiện nay. Biến thể dữ liệu:
  - không kèm giá trị lọc → 1, 2, 3, 4 (đúng như hiện nay)
  - `status=ACTIVE` → 1, 3
  - `status=INACTIVE` → 2, 4
  - không khách hàng nào khớp (kho chỉ có khách hàng `ACTIVE`, lọc `INACTIVE`; và ngược lại) → 200 kèm mảng rỗng `[]`, không phải 404
  - theo trạng thái đang lưu: sau khi khách hàng 1 bị ngừng hoạt động (`PUT /api/customers/1/status`), `status=ACTIVE` → 3 và `status=INACTIVE` → 1, 2, 4

  (R1, R2)
- AC-2: Given kho có ít nhất một khách hàng, when gọi `GET /api/customers` kèm giá trị lọc không hợp lệ, then trả 400 `application/problem+json` nêu tham số sai và các giá trị được chấp nhận (giả định `title = "Validation failed"` và `errors.status = "must be ACTIVE or INACTIVE"`, Q3); body không phải mảng khách hàng, kể cả mảng rỗng. Biến thể dữ liệu (giả định so khớp chính xác, không trim, không đổi hoa thường, Q4):
  - giá trị lạ: `status=DELETED`, `status=ALL`
  - sai hoa thường: `status=active`, `status=Inactive`
  - giá trị rỗng: `status=`, và `status` không có dấu `=`
  - có khoảng trắng: `status=%20ACTIVE`, `status=INACTIVE%20`
  - hai giá trị trong một tham số: `status=ACTIVE,INACTIVE`
  - tham số lặp với hai giá trị khác nhau: `status=ACTIVE&status=INACTIVE` (Q4)

  (R3)

**Gọi API (FE, `source-fe/src/api/customerApi.js`)**
- AC-3: Given một lựa chọn lọc, when gọi hàm lấy danh sách của API client cho lựa chọn đó, then client gửi đúng một request `GET` không body, không `Content-Type`, tới URL mang đúng giá trị lọc, và trả về nguyên mảng API trả (không lọc, không sắp xếp lại). Biến thể dữ liệu:
  - "Tất cả" → URL đúng bằng `/api/customers`, không có `?` (như hiện nay)
  - "Đang hoạt động" → `/api/customers?status=ACTIVE`
  - "Ngừng hoạt động" → `/api/customers?status=INACTIVE`
  - API trả `[]` → hàm trả `[]`
  - API (giả lập) trả mảng có cả khách hàng không khớp giá trị lọc → hàm vẫn trả nguyên mảng đó

  (R1, R2; URL theo giả định Q2)

**Màn hình danh sách (FE)**
- AC-4: Given màn hình danh sách, when trang vừa mở hoặc nhân viên chọn một lựa chọn lọc, then phần điều khiển lọc có đúng ba lựa chọn theo thứ tự "Tất cả", "Đang hoạt động", "Ngừng hoạt động" và hiện đúng lựa chọn đang chọn; FE gửi đúng một yêu cầu lấy danh sách mang giá trị lọc của lựa chọn đó; bảng hiện đúng các khách hàng API trả, đúng thứ tự, không bỏ dòng nào (FE không lọc). Biến thể dữ liệu:
  - trang vừa mở → "Tất cả" đang được chọn; yêu cầu không mang giá trị lọc (như hiện nay)
  - chọn "Đang hoạt động" → yêu cầu mang `ACTIVE`
  - chọn "Ngừng hoạt động" → yêu cầu mang `INACTIVE`
  - chọn lại "Tất cả" → yêu cầu không mang giá trị lọc; bảng lại hiện mọi khách hàng
  - API trả mảng rỗng → vùng danh sách hiện trạng thái rỗng như hiện nay (Q6); phần điều khiển lọc vẫn dùng được
  - yêu cầu lấy danh sách thất bại → vùng danh sách hiện "Không tải được danh sách khách hàng." như hiện nay; phần điều khiển lọc vẫn còn, vẫn hiện lựa chọn đang chọn và chọn lại được

  (R1, R2)
- AC-5: Given nhân viên đang chọn lựa chọn lọc L, when một thao tác sửa thông tin hoặc đổi trạng thái khách hàng (và thêm khách hàng, theo giả định Q5) thành công và danh sách tải lại, then yêu cầu lấy danh sách mang giá trị lọc của L, là lựa chọn đang chọn **lúc tải lại** (không phải lúc mở trang hay lúc bắt đầu thao tác); phần điều khiển lọc vẫn hiện L; bảng hiện đúng các khách hàng API trả. Biến thể dữ liệu:
  - L = "Đang hoạt động", lưu form sửa của khách hàng A (`ACTIVE`) → A vẫn trong bảng với dữ liệu mới
  - L = "Ngừng hoạt động", lưu form sửa của khách hàng `INACTIVE` → khách hàng đó vẫn trong bảng (sửa không đổi trạng thái)
  - L = "Đang hoạt động", ngừng hoạt động A → sau khi tải lại, A không còn trong bảng; các khách hàng `ACTIVE` khác vẫn còn
  - L = "Ngừng hoạt động", kích hoạt lại A → sau khi tải lại, A không còn trong bảng
  - L = "Tất cả" → như hiện nay: A vẫn trong bảng với trạng thái mới
  - L = "Ngừng hoạt động", thêm khách hàng → khách hàng vừa thêm (`ACTIVE`) không có trong bảng (Q5)

  (R4)

Giữ nguyên, không thuộc AC nào: thao tác thất bại (400 trùng số khi kích hoạt lại, lỗi theo field của form sửa hoặc form thêm, 404, 500, mất mạng) vẫn không tải lại danh sách; lựa chọn lọc và bảng giữ nguyên.

Cách kiểm chứng:
- Với AC-1 và AC-2: unit test BE, gồm test HTTP trong `CustomerHandlerTest` và test ở tầng mà architect đặt việc lọc và việc kiểm tra giá trị lọc.
- Với AC-3: unit test của API client bằng `fakeFetch` (`source-fe/test/customerApi.test.js`).
- Với AC-4 và AC-5: phần nối sự kiện nằm trong `source-fe/src/main.js` và phần tĩnh nằm trong `source-fe/index.html`, cả hai không có test tự động vì `node:test` không có DOM (`aiws/knowledge/conventions.md` → Test → FE). Rule `every_ac_has_tc` (`aiws/config/contracts/test-spec.yaml`) đòi mỗi AC có ít nhất một TC, nên mỗi AC này cần ít nhất một quyết định nằm trong đơn vị test được ngoài `main.js`, như `describeStatusError` (REQ-003) và `createDoubleClickGuard` (REQ-004). Phần còn lại kiểm bằng review và chạy tay với BE local.

## Impact
- **Module (BE)**, `source-be/src/main/java/com/example/crm/`:
  - `api/CustomerHandler.java`:
    - `route` lấy `exchange.getRequestURI().getPath()` (dòng 52) và khớp `GET /api/customers` → `service.list()` (dòng 53–56). Không dòng nào trong `source-be/src/main` đọc query string, nên hiện nay mọi query string đều bị bỏ qua.
    - Đây là tham số query **đầu tiên** của API: chưa có convention cho tên tham số, cách tách và giải mã query, hay key của `errors` cho một tham số không nằm trong body. `HttpServer` của JDK không có sẵn bộ tách query.
    - Javadoc của lớp (dòng 16–20) liệt kê endpoint; convention yêu cầu cập nhật khi endpoint đổi (`aiws/knowledge/conventions.md` → Backend → Định tuyến).
    - Bảng map exception trong `handle` (dòng 37–44) dùng nguyên.
  - `service/CustomerService.java`:
    - `list()` (dòng 25–27) trả `repository.findAll()`. Việc kiểm tra giá trị lọc thuộc tầng này ("All validation happens here, not in the HTTP layer", dòng 14).
    - `parseStatus` (dòng 66–74) đã có đúng quy tắc và thông điệp cần cho AC-2, nhưng `parseStatus(null)` ném lỗi. Với danh sách, "không có giá trị lọc" phải cho ra tất cả, nên ca này phải được tách ra **trước** khi kiểm tra giá trị.
  - `repository/CustomerRepository.java` (dòng 9), `repository/InMemoryCustomerRepository.java` (dòng 17–20): `findAll()` trả mọi khách hàng tăng dần theo `id`. Lọc ở repository (một truy vấn mới theo cách đặt tên `findAll`/`findById`) hay ở service là việc của architect.
  - Ràng buộc: giữ nguyên chữ ký và hành vi của `CustomerService.list()` và `CustomerRepository.findAll()` (`aiws/knowledge/conventions.md` → Backend → Đặt tên: "method cũ được giữ nguyên chữ ký"). Test hiện có dùng chúng làm ảnh chụp "không đổi gì": `service.list()` 38 lần trong `CustomerServiceTest`, `repository.findAll()` 7 lần trong `InMemoryCustomerRepositoryTest`, và helper `customers()` → `get("")` (dòng 67–69) trong `CustomerHandlerTest`.
  - Dự kiến không đổi: `domain/Customer.java`, `domain/CustomerStatus.java`, `api/Problem.java`, `error/`, `App.java` (context `/api/customers` vẫn nhận request có query string), mọi route khác.
  - Test, `source-be/src/test/java/com/example/crm/`:
    - `api/CustomerHandlerTest.java`: test không mã TC `listReturnsCustomers` (dòng 77–86) phải pass nguyên vẹn. Helper `get(path)` (dòng 47–49) nối `path` vào `baseUrl`, nên gọi được `get("?status=ACTIVE")`; `URI.create` không nhận khoảng trắng thô, dữ liệu test có khoảng trắng phải viết `%20`. Khách hàng `INACTIVE` dựng được qua chính API bằng `put(id + "/status", ...)`.
    - `service/CustomerServiceTest.java`, `repository/InMemoryCustomerRepositoryTest.java`: tuỳ nơi architect đặt logic.
    - Mốc số lần chạy: `CustomerHandlerTest` 68, `InMemoryCustomerRepositoryTest` 40, `CustomerServiceTest` 133, `PhoneNumbersTest` 70, tổng 311.
- **API**:
  - `GET /api/customers` **đổi**: nhận thêm một giá trị lọc tuỳ chọn và có thêm response 400. Body 200 vẫn là `Customer[]`, schema `Customer` không đổi. Lời gọi không kèm giá trị lọc trả đúng như hiện nay.
  - Mô tả hiện có: `aiws/work/REQ-001/api-contract.yaml` dòng 14–39 ("Không phân trang, không lọc", chỉ có response 200 và 500). `aiws/work/REQ-005/api-contract.yaml` phải mô tả tham số mới và response 400.
  - Các endpoint khác không đổi; query string gửi tới chúng vẫn bị bỏ qua (Q4).
- **DB**: không có (`aiws/knowledge/db-schema.md`: hệ thống mới chưa có DB).
  - Kho in-memory không đổi cấu trúc; lọc theo `status` là duyệt tuyến tính như các truy vấn hiện có.
  - Legacy không có lọc (`source-legacy/customer_list.php` dòng 5: `SELECT ... ORDER BY id`), nên không có quy tắc legacy nào phải giữ.
  - Khi có DB thật, câu tương ứng là `WHERE status = ? ORDER BY id`; `source-legacy/sql/schema.sql` không có index trên `status`.
- **FE**, `source-fe/`:
  - `index.html`: chưa có phần điều khiển lọc; các vùng hiện có là `#create-form`, `#message`, `#edit-customer`, `#customers` (dòng 20–28). Phần điều khiển lọc phải nằm **ngoài** `#customers`: `refresh()` ghi đè vùng này bằng `innerHTML` ở mỗi lần tải lại (`src/main.js` dòng 15) và bằng `textContent` khi lỗi (dòng 17). Kiểu điều khiển và vị trí do architect chọn.
  - `src/main.js`:
    - `refresh()` (dòng 13–19) là điểm tải danh sách duy nhất, gọi `listCustomers()` không tham số (dòng 15). Nó được gọi lúc mở trang (dòng 90), sau khi thêm (dòng 28), sau khi lưu form sửa (dòng 60), sau khi đổi trạng thái (dòng 84). AC-5 đòi mọi lần gọi dùng lựa chọn đang chọn lúc đó.
    - Cần thêm xử lý cho việc đổi lựa chọn lọc. Theo convention, mỗi handler của người dùng xoá `#message` trước khi chạy, còn `refresh()` thì không (`aiws/knowledge/conventions.md` → Xử lý lỗi).
    - Không ràng buộc: form sửa đang mở ở `#edit-customer` khi nhân viên đổi lựa chọn lọc (vùng riêng, lưu theo `id`).
    - **Bấm đúp khi đang lọc (Q1)**: listener đổi trạng thái hỏi guard theo `id` khách hàng (dòng 80; `src/utils/createDoubleClickGuard.js` giữ một mốc riêng cho từng key, bỏ qua lần bấm tới dưới 500 ms sau lần bấm được xử lý của cùng key). Trước REQ-005 một dòng không bao giờ rời bảng sau khi đổi trạng thái, nên lần bấm thứ hai luôn rơi vào nút của chính khách hàng đó. Khi đang lọc, dòng vừa đổi trạng thái biến mất và dòng kế tiếp dời lên; nút của dòng đó mang `id` khác nên guard coi là lần bấm mới và xử lý. Hệ quả: một cú bấm đúp đổi trạng thái của **hai** khách hàng. [CẦN XÁC NHẬN] suy ra từ đọc code, chưa tái hiện bằng chạy tay.
  - `src/api/customerApi.js`: `listCustomers(options)` (dòng 25–27) nhận `options` làm tham số **đầu tiên và duy nhất**. Thêm giá trị lọc là đổi chữ ký của một hàm public: test không mã TC `listCustomers calls GET /api/customers and returns the body` (`test/customerApi.test.js` dòng 12–19) gọi `listCustomers({ fetchImpl })` và kiểm URL đúng bằng `/api/customers`. Architect chọn chữ ký giữ được lời gọi đó, hoặc ghi rõ trong design việc sửa test này (AGENTS.md mục 9; tiền lệ TC-36, TC-74). FE chưa có tham số query nào; tham số path đang đi qua `encodeURIComponent`.
  - `src/components/customerTable.js`: dự kiến không đổi. `renderCustomerTable` vẽ mọi phần tử nhận được, không lọc; dòng 13 trả `<p>Chưa có khách hàng.</p>` khi mảng rỗng (Q6).
  - `src/utils/createDoubleClickGuard.js`: dự kiến không đổi (Q1).
  - Test, `test/`:
    - `customerApi.test.js`: test mới cho AC-3.
    - Test của đơn vị mới mà architect tách ra cho AC-4, AC-5.
    - Mốc: 43 test FE, đều pass.
  - Mã TC mới đánh số tiếp từ **TC-115**: REQ-004 đã dùng TC-108..TC-114 (`aiws/knowledge/conventions.md` → Test → bảng mã TC của REQ-004). Câu "REQ kế tiếp đánh số tiếp từ TC-108" ở cùng mục đã cũ.
- **Quyết định đã duyệt của REQ-004 có liên quan** (Q1): guard tính riêng cho từng khách hàng (`aiws/work/REQ-004/02-design.md` D1), kèm biến thể cuối của AC-2 trong `aiws/work/REQ-004/01-analysis.md` ("bấm nút của khách hàng khác ngay sau đó vẫn được xử lý") và TC-111 (`source-fe/test/createDoubleClickGuard.test.js` dòng 51, "tracks each key independently"). Design đó đã loại "một khoá chung cho mọi nút đổi trạng thái" (dòng 52) và `event.detail` (dòng 49). REQ-005 không đổi các quyết định này, trừ khi người duyệt design yêu cầu chặn ca ở Q1.
- **Knowledge** cần cập nhật sau khi merge:
  - `aiws/knowledge/api-inventory.md`: dòng `GET /api/customers` ("Không phân trang, không lọc"), mục Quy ước ("`GET /api/customers` trả toàn bộ danh sách"; convention cho tham số query và key `errors`).
  - `aiws/knowledge/system-map.md`: luồng 1, dòng "FE: trang chính", "FE: entry", "FE: API client".
  - `aiws/knowledge/conventions.md`: Gọi API (tham số query, chữ ký `listCustomers`), State và render, bảng mã TC của REQ-005, câu "đánh số tiếp từ TC-108".
  - `aiws/knowledge/glossary.md`: thuật ngữ "lọc theo trạng thái".

## Reuse
- **BE**, `source-be/src/main/java/com/example/crm/`:
  - `service/CustomerService.java:parseStatus` (dòng 66–74): so khớp chính xác `ACTIVE`/`INACTIVE` và thông điệp `must be ACTIVE or INACTIVE`, đã có test ở REQ-003 (TC-89 trong `CustomerServiceTest`, TC-97 trong `CustomerHandlerTest`).
  - `error/ValidationException` + `api/CustomerHandler.handle` (dòng 37–38): đường có sẵn từ lỗi theo field tới 400 `application/problem+json`.
  - `repository/InMemoryCustomerRepository.findAll` (dòng 17–20): thứ tự tăng dần theo `id` có sẵn nhờ `ConcurrentSkipListMap` (dòng 14).
  - `domain/CustomerStatus`: hai giá trị lọc hợp lệ trùng với enum này.
- **BE test**, `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`: helper `get(path)`, `put(path, json)`, `customers()`, `errorsOf(body)`; kiểu test tham số hoá của lớp (`@ParameterizedTest(name = "[{index}]")` + `@MethodSource`); TC-97 là mẫu bảng giá trị `status` không hợp lệ.
- **FE**, `source-fe/`:
  - `src/main.js:refresh` (dòng 13–19): một điểm tải lại cho mọi thao tác; câu lỗi "Không tải được danh sách khách hàng." dùng nguyên.
  - `src/api/customerApi.js:request` (dòng 15–23): ghép `API_BASE` với path, ném `ApiError` cho non-2xx; response 400 của AC-2 không cần xử lý riêng ở FE.
  - `src/components/customerTable.js:renderCustomerTable`: dùng nguyên. Nhãn "Đang hoạt động", "Ngừng hoạt động" có trong `STATUS_LABELS` (dòng 4), hằng này chưa được export.
  - `src/utils/describeStatusError.js` và `src/utils/createDoubleClickGuard.js`: mẫu tách logic ra khỏi `main.js` thành đơn vị có unit test. Guard cũng là điểm xuất phát nếu người duyệt yêu cầu chặn ca ở Q1.
  - `test/customerApi.test.js`: `fakeFetch(status, body, calls)`; TC-72 (dòng 114–130) là mẫu kiểm một `GET` không body; TC-101 là mẫu bảng `{ id, status, url }`.
- **Tài liệu**: `aiws/work/REQ-001/api-contract.yaml` (schema `Customer`, `Problem`, response `InternalError`) để chép vào contract mới; `aiws/work/REQ-003/api-contract.yaml` cho hình dạng lỗi `errors.status`.

## Ngoài phạm vi
- Tìm kiếm theo họ tên, email, số điện thoại; phân trang; sắp xếp (requirement → Ngoài phạm vi). Thứ tự vẫn tăng dần theo `id`.
- Ghi nhớ lựa chọn lọc giữa các lần mở trang (requirement → Ngoài phạm vi): không lưu vào storage hay URL; mỗi lần mở trang bắt đầu ở "Tất cả" (xem Q8).
- Lọc theo tiêu chí khác (có hay không có số điện thoại...), lọc nhiều trạng thái trong một yêu cầu, hiện số lượng khách hàng của từng lựa chọn.
- Đổi quy tắc hoặc API của thêm, sửa, đổi trạng thái; đổi nội dung bảng (cột, nhãn, nút).
- Lọc ở các endpoint khác; `GET /api/customers/{id}` không nhận giá trị lọc.
- Thông báo thành công sau khi thêm, sửa hoặc đổi trạng thái; tự đổi lựa chọn lọc để khách hàng vừa thao tác còn hiện trong bảng (Q5).
- Chặn cú bấm đúp đổi trạng thái của khách hàng kế tiếp khi đang lọc (Q1, theo giả định).
- Trạng thái "đang tải" cho danh sách; huỷ yêu cầu đang chờ (Q7).
- Hai nhân viên hoặc hai tab: danh sách không tự cập nhật khi người khác đổi trạng thái; chỉ tải lại sau thao tác trên chính trang đó, như hiện nay.
- Thêm thư viện DOM để test `main.js`: `source-fe` không có dependency npm.

## Câu hỏi mở
Không có câu hỏi chặn thiết kế. Mọi câu dưới đây đều có giả định; người duyệt design nên xem Q1 trước, vì đó là một rủi ro do chính REQ-005 tạo ra mà requirement không nhắc tới.

- [non-blocking] Q1: Khi đang lọc, một cú bấm đúp vào nút đổi trạng thái có thể đổi trạng thái của **khách hàng kế tiếp**; REQ-005 có phải chặn không? Cơ chế: xem Impact → FE → `src/main.js` → Bấm đúp khi đang lọc. Giả định **không** (requirement không yêu cầu, nên không có AC nào cho ca này), nhưng architect phải ghi nó thành rủi ro trong design và đưa phương án chặn vào "Quyết định cần duyệt" để người duyệt chọn.
  - Vì sao người duyệt nên cân nhắc chặn: ca này do chính R4 tạo ra (dòng biến mất khi tải lại theo lựa chọn lọc) và rơi đúng vào cách dùng chính của REQ-005: xem "Đang hoạt động" rồi ngừng hoạt động một khách hàng. Nó nặng hơn lỗi REQ-004 đã sửa: đổi trạng thái của một khách hàng nhân viên không hề chọn, và dòng đó cũng biến mất khỏi bảng nên khó nhận ra.
  - Chữ của REQ-004 vẫn được thoả: khách hàng được bấm chỉ đổi trạng thái một lần. Vì vậy đây không phải lỗi hồi quy theo requirement đã duyệt, mà là một ca mới.
  - Nếu người duyệt yêu cầu chặn thì cần thêm một AC (bấm đúp khi đang lọc chỉ gửi một yêu cầu đổi trạng thái và không đổi khách hàng nào khác). Lưu ý cho phương án: guard hiện chỉ biết `id` và thời điểm, không phân biệt được "lần bấm thứ hai của cú bấm đúp rơi vào B" với "nhân viên chủ động bấm B ngay sau A"; chặn theo thời gian cho mọi nút đổi trạng thái sẽ đảo biến thể cuối của AC-2 ở REQ-004 và TC-111 (xem Impact).
  - [CẦN XÁC NHẬN] chưa tái hiện bằng chạy tay. Dưới một lựa chọn lọc, mọi dòng mang cùng nhãn nút nên nút của dòng dời lên nhiều khả năng nằm đúng dưới con trỏ; độ rộng cột có thể đổi nhẹ theo nội dung các dòng còn lại.
- [non-blocking] Q2: Giá trị lọc đi qua API dưới dạng nào? Giả định: tham số query `status` trên `GET /api/customers`, giá trị `ACTIVE` hoặc `INACTIVE` (trùng field `status` của `Customer` và enum `CustomerStatus`); "tất cả" là không gửi tham số, không có giá trị `ALL`.
  - Lý do: lời gọi hiện có không đổi ("mặc định là tất cả, như hiện nay"), và không thêm một giá trị thứ ba không phải trạng thái.
  - Architect chốt tên tham số và ghi vào `api-contract.yaml`.
- [non-blocking] Q3: "Lỗi rõ ràng" có hình dạng nào? Giả định: 400 `application/problem+json` như lỗi validation hiện có, `title = "Validation failed"`, `errors = { "status": "must be ACTIVE or INACTIVE" }`, dùng lại thông điệp của `parseStatus`.
  - Điểm mới: `errors` hiện chỉ mô tả field của body; đây là lần đầu nó mô tả một tham số query.
  - FE không phụ thuộc hình dạng này: phần điều khiển lọc chỉ gửi giá trị hợp lệ, và `refresh()` hiện cùng một câu cho mọi lỗi.
- [non-blocking] Q4: Những gì được coi là "giá trị lọc không hợp lệ"? Giả định:
  - So khớp chính xác, không trim, không đổi hoa thường, như `parseStatus` (REQ-003): `active` là không hợp lệ.
  - Giá trị rỗng (`?status=`, và `?status` không có dấu `=`) là không hợp lệ, không phải "không lọc". Coi là "không lọc" sẽ trả về tất cả, trái R3.
  - Tham số lặp với hai giá trị khác nhau (`status=ACTIVE&status=INACTIVE`) là không hợp lệ. Chưa ràng buộc: tham số lặp cùng một giá trị hợp lệ; architect chốt.
  - Tham số có tên khác (`?Status=ACTIVE`, `?state=ACTIVE`, `?foo=1`) bị bỏ qua như mọi query string hiện nay và như field lạ trong body JSON, nên `?Status=ACTIVE` trả về tất cả. Đây cũng là một kiểu "lặng lẽ nhận về tất cả", nhưng R3 chỉ nói về **giá trị** lọc. Người duyệt design nói nếu muốn chặt hơn (400 cho tham số lạ).
  - Query string gửi tới endpoint khác (`GET /api/customers/1?status=x`, `POST /api/customers?status=x`) vẫn bị bỏ qua.
- [non-blocking] Q5: Sau khi **thêm** khách hàng, danh sách tải lại theo gì? R4 chỉ nêu sửa và đổi trạng thái. Giả định: cũng theo lựa chọn đang chọn (một điểm tải lại duy nhất, `refresh()`), không tự đổi lựa chọn lọc, không thêm thông báo.
  - Hệ quả: đang chọn "Ngừng hoạt động" mà thêm khách hàng thì khách hàng mới (`ACTIVE`) không hiện trong bảng; form được xoá trắng nhưng không có dấu hiệu nào khác là đã lưu. Nhân viên có thể nhập lại và nhận lỗi trùng email.
  - Cách khác: chuyển về "Tất cả" sau khi thêm, hoặc hiện thông báo đã thêm. Người duyệt design chọn.
- [non-blocking] Q6: Khi không khách hàng nào khớp lựa chọn lọc thì hiện gì? Giả định: giữ nguyên câu hiện có "Chưa có khách hàng." (`source-fe/src/components/customerTable.js` dòng 13), vì requirement không yêu cầu câu mới.
  - Câu này dễ gây hiểu nhầm khi đang lọc: kho vẫn có khách hàng, chỉ là không ai khớp. Ca thường gặp: đang chọn "Đang hoạt động" và ngừng hoạt động khách hàng cuối cùng.
  - Đề xuất người duyệt design cân nhắc một câu riêng cho ca đang lọc. Nếu đổi câu trong `renderCustomerTable` thì test không mã TC `renderCustomerTable shows an empty state` (`source-fe/test/customerTable.test.js` dòng 25–27) phải sửa.
- [non-blocking] Q7: Response về sai thứ tự. Trước REQ-005 mọi yêu cầu lấy danh sách giống hệt nhau, nên response nào về sau cũng cho cùng một bảng. Từ REQ-005 chúng khác nhau theo lựa chọn lọc: đổi lựa chọn hai lần liên tiếp nhanh, hoặc đổi lựa chọn trong lúc một thao tác đang chờ tải lại, thì response về sau quyết định nội dung bảng, và bảng có thể không khớp lựa chọn đang hiện.
  - Giả định: **không** xử lý trong REQ-005; các AC của màn hình phát biểu cho trường hợp không có yêu cầu lấy danh sách nào khác đang chờ. Cùng loại với giới hạn đã biết của form sửa (`aiws/knowledge/system-map.md` luồng 4; `aiws/work/REQ-002/05-review.md`).
  - Với BE in-memory chạy local, mỗi yêu cầu chỉ mất vài mili giây nên ca này hiếm; trên mạng chậm thì có thật. Nếu architect thấy cách chặn đủ nhỏ (bỏ qua response không còn là yêu cầu mới nhất) thì nên đưa vào một đơn vị test được và nêu ở "Quyết định cần duyệt".
- [non-blocking] Q8: Trình duyệt có thể khôi phục giá trị của phần tử form khi tải lại trang. [CẦN XÁC NHẬN] tuỳ trình duyệt và kiểu điều khiển; repo không khai báo trình duyệt hỗ trợ. Nếu phần điều khiển lọc là phần tử form gốc thì sau khi tải lại trang nó có thể hiện lựa chọn cũ. Giả định: lúc mở trang, phần điều khiển lọc và yêu cầu lấy danh sách đầu tiên phải **khớp nhau** và là "Tất cả" (AC-4, biến thể đầu). Architect chọn cách bảo đảm; việc này không phải "ghi nhớ lựa chọn" mà requirement đặt ngoài phạm vi.
