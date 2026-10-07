# REQ-002 — Review

## Tóm tắt
**Sẵn sàng PR — 0 critical, 0 major, 4 minor.**

- Đây là vòng review thứ hai. Lỗi chặn của vòng trước (run-0014: hàm kiểm tra dùng chung của `CustomerService` nhận tham số `Long ownId` nullable, là phương án D4 đã loại) đã được T7 sửa ở commit `880857d`. `check` nay nhận hai `Predicate<String>` đúng hình dạng của D4; `isEmailUsed` và `isPhoneUsed` đã bị xoá. Tôi đã đọc lại toàn bộ 16 file của diff, không chỉ file T7 sửa.
- T7 đúng phạm vi: commit chỉ chạm `source-be/src/main/java/com/example/crm/service/CustomerService.java` (file duy nhất trong `allowed_files`), `scope_violations_reverted` của run-0019 rỗng, không thêm, sửa hay xoá test nào. Trong thân `check` chỉ đổi đúng hai lệnh gọi truy vấn trùng; chữ ký public `create` và `update` không đổi.
- Mọi quyết định D1..D12 khớp code; BE expose đúng `PUT /api/customers/{id}`; FE gọi đúng path, method, body và xử lý đủ các mã lỗi được khai báo. Không có sai lệch với `api-contract.yaml`.
- Truy vết đủ: 14 AC đều có TC, TC-44..TC-81 đều có trong code với mã TC gắn đúng chuẩn (`@DisplayName("TC-n: ...")`, `test('TC-n: ...')`), `trace.md` không có problem. T7 không có TC riêng (`tests: []`) vì không đổi hành vi quan sát được.
- Kết quả test lấy từ evidence của orchestrator, tôi không tự chạy lại:
  - BE: 226 test pass sau T7 (`evidence/test-results/T7-attempt-1.yaml`, run-0019): CustomerHandlerTest 31, InMemoryCustomerRepositoryTest 31, CustomerServiceTest 94, PhoneNumbersTest 70. Sau T7 không commit nào chạm `source-be`, nên kết quả này ứng với HEAD.
  - FE: 29 test pass (`T6-attempt-1.yaml`, run-0013). Sau T6 không commit nào chạm `source-fe`.
  - Lưu ý cho người review PR: báo cáo của developer ở run-0019 ghi "Test result: NOT RUN" (phiên đó không được phép chạy Maven), và log test của T7 có dòng "Nothing to compile - all classes are up to date". Tôi đã kiểm tra: `target/classes/.../CustomerService.class` được biên dịch lúc 21:11:22 (+07), sau lần sửa cuối của file nguồn (21:08:29) và trước báo cáo surefire (21:11:32). Vậy 226 test của orchestrator chạy trên code sau T7; dòng "Nothing to compile" là do bước build chạy ngay trước bước test.
- Phạm vi và cấu trúc: bảy commit chạm source (sáu `feat`, một `refactor`) chỉ sửa đúng `allowed_files` của task mình và có đủ trailer `REQ-ID`, `Task`, `Tests`, `AIWS-Run`. Diff có 16 file, không đổi tên, di chuyển hay reformat file nào; ba file mới (`UpdateCustomerRequest.java`, `customerEditForm.js`, `customerEditForm.test.js`) đặt đúng chỗ. Test cũ chỉ bị sửa ở TC-36 (đúng hai assertion theo D9) và ở `setUp` của `CustomerServiceTest` (finding minor bên dưới).
- Bảo mật (OWASP): mọi giá trị động trong HTML đi qua `escapeHtml`, kể cả trong thuộc tính (TC-75, TC-78, TC-80); thông báo gán bằng `textContent`; body không nhận `id`, `status` (TC-63); không log, PII không nằm trong URL. API không có xác thực là hiện trạng đã được chấp nhận ở R4, không phải finding.
- Bốn finding minor dưới đây được giữ nguyên từ vòng trước: plan vòng hai cố ý không tạo task cho chúng và để người review PR quyết định. T7 không chạm các file đó.

## Findings
- [minor] source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java:456 — TC-53 có hai dòng dữ liệu trong 03-test-spec.md nhưng được viết thành một `@Test` với hai lượt Act/Assert trên cùng một kho, trái "mỗi dòng dữ liệu chạy trên kho mới" của test spec và quy tắc test tham số hoá của skill unit-testing. Cả hai dòng vẫn được so đủ cả map `errors` nên AC-4 vẫn được chứng minh — Chuyển thành `@ParameterizedTest(name = ROW_NAME)` + `@MethodSource` như TC-26 (`invalidFieldsWithPhoneError`).
- [minor] source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java:319 — TC-65 tương tự: hai dòng dữ liệu (trùng email, trùng số) chạy nối tiếp trong một `@Test` trên cùng một server thay vì test tham số hoá. AC-5 và AC-6 vẫn được chứng minh vì cả hai lượt đều so cả map `errors` và danh sách không đổi — Chuyển thành `@ParameterizedTest(name = "[{index}]")` + `@MethodSource` như TC-64.
- [minor] source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java:29 — `setUp` dùng chung của các test REQ-001 bị sửa (thêm field `repository`, dòng 29–36) dù design và plan T2 ghi "Test cũ không sửa" và yêu cầu mỗi test mới tự dựng kho "như TC-25". Biến cục bộ `repository` của TC-25 (dòng 303) nay che field cùng tên. Không đổi hành vi: mỗi test vẫn có kho mới và các test cũ vẫn pass — Người review PR chấp nhận như hiện tại, hoặc trả `setUp` về nguyên trạng và để các test mới tự dựng kho cục bộ theo plan. Không sửa TC-25.
- [minor] source-fe/src/main.js:47 — Không có trạng thái "đang lưu": nếu nhân viên bấm "Sửa" ở dòng khác khi `PUT` chưa trả về, response về sau sẽ đóng form vừa mở (dòng 56) hoặc dựng lại form cũ đè lên nó (dòng 60); bấm "Lưu" hai lần thì gửi hai `PUT` (vô hại vì idempotent). Code đúng nguyên văn D12 và không lưu sai dữ liệu vì `data-id` luôn khớp giá trị đang hiển thị, nhưng D11 mới chỉ chấp nhận tình huống bấm "Sửa" liên tiếp — Ghi nhận cho người review PR. Nếu muốn xử lý (vô hiệu nút khi đang chờ, hoặc so `data-id` trước khi thay form) thì cần bổ sung quyết định vào design, không làm trong task sửa lỗi.

## Đối chiếu design
| Quyết định | Kết quả | Dẫn chứng |
| --- | --- | --- |
| D1: `PUT /api/customers/{id}` thay thế cả ba trường, trả 200 kèm `Customer` | Đúng | `CustomerHandler.java:65-69`; `id` chỉ lấy từ path, field lạ bị bỏ qua nhờ `JSON` không đổi (TC-61, TC-63); không gửi `phone` thì số bị xoá (TC-62) |
| D2: thứ tự route → đọc JSON → tìm khách hàng → kiểm tra → ghi | Đúng | Handler đọc body trước khi gọi service (`CustomerHandler.java:66-67`); `update` gọi `get(id)` (`CustomerService.java:42`) trước `check` (dòng 43–45). TC-69 (fallback), TC-68 (400 `Malformed JSON` cả khi `id` không tồn tại), TC-60 và TC-67 (404 trước 400) |
| D3: record `UpdateCustomerRequest(name, email, phone)` | Đúng | `UpdateCustomerRequest.java:3-4`, Javadoc đúng nguyên văn; `CreateCustomerRequest` không bị đụng |
| D4: một hàm private dùng chung nhận hai `Predicate<String>` | Đúng (đã sửa ở T7, `880857d`) | `CustomerService.java:50-80`: `check(name, email, phone, Predicate<String> emailTaken, Predicate<String> phoneTaken)` trả record private `Checked` (dòng 82). `create` (dòng 33–38) truyền `repository::existsByEmail` và `p -> repository.existsByPhoneAndStatus(p, CustomerStatus.ACTIVE)`; `update` (dòng 41–48) truyền hai truy vấn có loại trừ `id`. `check` không còn tham số nullable hay cờ chế độ, không rẽ nhánh tạo/sửa và không gọi `repository` trực tiếp. So với khối kiểm tra gốc của `create`, chỉ đổi hai lệnh gọi truy vấn trùng và lệnh `return`; thứ tự name → email → phone, năm thông điệp, nhánh `else if` (chỉ truy vấn trùng khi giá trị đã qua kiểm tra định dạng) và `CustomerStatus.ACTIVE` do service truyền xuống đều giữ nguyên. `update` không đọc `status`. Tên `check`/`Checked` khác gợi ý `validate`/`ValidatedFields`, D4 cho phép |
| D5: `existsByEmailAndIdNot`, `existsByPhoneAndStatusAndIdNot` | Đúng | `InMemoryCustomerRepository.java:37-47`, đúng biểu thức của design, viết `phone.equals(c.phone())`; hai truy vấn cũ giữ nguyên và `create` vẫn dùng. TC-46, TC-47 đủ 9 dòng mỗi bảng |
| D6: `Optional<Customer> update(...)`, giữ `id` và `status`, không bao giờ thêm mới | Đúng | `InMemoryCustomerRepository.java:56-60` dùng `computeIfPresent` với hàm thuần; service có `orElseThrow` (`CustomerService.java:46-47`). TC-44, TC-45 |
| D7: giữ bốn hành vi legacy (a)–(d) | Đúng | Không có code riêng nào "sửa" các hành vi này. (a) TC-50, TC-62; (b) TC-51; (c) TC-57; (d) TC-54 |
| D8: `getCustomer`, `updateCustomer` qua `request()` | Đúng | `customerApi.js:33-41`; dùng template literal thay cho phép nối chuỗi, tương đương. `request`, `ApiError`, `listCustomers`, `createCustomer` không đổi. TC-70..TC-73 |
| D9: cột thứ sáu "Thao tác", nút "Sửa" mang `data-edit-id` | Đúng | `customerTable.js:16,19`; ô mới là `<td>` thường và có `<th>` tương ứng. TC-36 chỉ đổi đúng hai assertion nêu trong design, giữ mã và tên hiển thị. TC-74, TC-75 |
| D10: component thuần `renderCustomerEditForm(customer, fieldErrors = {})` | Đúng | `customerEditForm.js:10-26`; HTML khớp từng thuộc tính và thứ tự; `aria-invalid`, `aria-describedby` và `<span ... role="alert">` chỉ có ở trường lỗi; key lạ bị bỏ qua; `id`, ba `value` và thông điệp lỗi đều qua `escapeHtml`; không dùng `formatPhone` hay `NO_PHONE`. TC-76..TC-81 |
| D11: điền form bằng `GET /api/customers/{id}` | Đúng | `main.js:39`; `main.js` không giữ state hay cache khách hàng |
| D12: vùng `#edit-customer`, CSS `.field`, ba xử lý sự kiện bằng delegation | Đúng | `index.html:15,27`; `main.js:34-72`. Kiểm bằng đọc code vì không có TC tự động, chi tiết ở dưới |

D11 và D12 không có unit test (R11). Tôi đối chiếu `main.js` và `index.html` với từng điểm trong mục "Không có TC tự động" của 03-test-spec.md:
- Bấm "Sửa": xoá `#message`, gọi `getCustomer`, dựng form, focus ô đầu tiên (`main.js:37-41`); lỗi thì hiện "Không tải được khách hàng." và không đụng vùng form (`main.js:42-44`).
- Lưu thành công: `editEl.innerHTML = ''` rồi `await refresh()` (`main.js:55-57`).
- 400 có `errors`: dựng lại form với giá trị vừa nhập và `error.fieldErrors`, focus vào ô `aria-invalid` đầu tiên (`main.js:59-61`).
- 404, 500, mất mạng: hiện "Không lưu được khách hàng.", form không bị dựng lại nên giữ giá trị đang nhập (`main.js:62-64`).
- Bấm "Huỷ": đóng form và xoá `#message` (`main.js:68-72`).
- Form thêm khách hàng: `#create-form` trong `index.html`, submit handler của nó và `refresh()` không đổi trong diff.

Các mục khác của design:
- **BE change / FE change:** đủ 16 file đúng loại (Sửa/Mới). Các file ghi "Không đổi" (`domain/*`, `PhoneNumbers.java`, `CreateCustomerRequest.java`, `Problem.java`, `error/*`, `App.java`) không có trong diff. Không thêm package, thư mục hay dependency. Public API mới đều có Javadoc/JSDoc một dòng.
- **DB change, Migration:** không có, đúng design.
- **R1 (tách hàm làm đổi `create`):** không xảy ra, kể cả sau T7; khối kiểm tra giữ nguyên từng dòng ngoài hai lệnh gọi truy vấn trùng, và toàn bộ test REQ-001 của BE (TC-11..TC-32 cùng các test không mã TC) pass trong lần chạy sau T7.
- **R7 (sửa TC-36):** đúng phạm vi hai assertion, làm trong cùng commit T5 với `customerTable.js`.
- **R10:** `id` vượt `long` và body JSON `null` vẫn trả 500 như `GET`/`POST` hiện có. Design đã chấp nhận và không TC nào đặt kỳ vọng khác; không phải finding.
- **Test spec:** dữ liệu của TC-44..TC-81 khớp bảng trong 03-test-spec.md (TC-50 có thêm hai dòng `"\0"` và `"\u000B"` do dùng lại `blankPhones`, là tập cha của spec). Các test mới theo Arrange-Act-Assert; ngoại lệ là TC-53 và TC-65 ở Findings.
- **Style:** Javadoc của `check` (`CustomerService.java:50`) dài hơn 100 cột. Dự án không có công cụ kiểm độ dài dòng và code cũ đã có dòng dài hơn (`CustomerHandler.java:36`), nên theo thứ tự ưu tiên của skill coding-standards đây không phải finding.

## Đối chiếu api-contract
Workspace chưa cấu hình lệnh kiểm tra contract tự động (`api_contract_be`, `api_contract_fe` trong `aiws/config/policies.yaml` đang là comment), nên phần này đối chiếu bằng đọc code và test. T7 chỉ đổi cấu trúc bên trong của `CustomerService`, không chạm tầng HTTP; TC-61..TC-69 pass lại sau T7.

**BE expose**

| Contract | Kết quả | Dẫn chứng |
| --- | --- | --- |
| `PUT /api/customers/{id}`, `id` khớp `\d+` | Đúng | `CustomerHandler.java:65`; dùng lại `BY_ID` có sẵn |
| Request `UpdateCustomerRequest {name, email, phone}`, field lạ bị bỏ qua | Đúng | `UpdateCustomerRequest.java:4`; TC-63 gửi thêm `id`, `status` |
| 200 `application/json`, body `Customer` đủ 5 field, `phone` có thể `null` | Đúng | TC-61 (5 field, `Content-Type`), TC-62 (`phone` có mặt và là JSON `null`), TC-66 |
| 400 `application/problem+json`, `title` "Validation failed", có `errors` | Đúng | TC-64 (so cả map `errors`), TC-65 (trùng email, trùng số) |
| 400 `title` "Malformed JSON", không có `errors`, kể cả khi `id` không tồn tại | Đúng | TC-68 (`/1` và `/999`) |
| 404 `title` "Not Found", `detail` "Customer {id} not found", trước validation | Đúng | TC-67 (body hợp lệ và body sai) |
| 404 fallback "No route for PUT ..." | Đúng | TC-69 (`/api/customers`, `/abc`, `/-1`) |
| 500 `InternalError` | Đúng | Đi qua nhánh `RuntimeException` có sẵn của `handle`; không có test (R10) |
| Thứ tự xử lý (1)–(5) trong `description` | Đúng | Như D2 ở trên |
| `GET /api/customers/{id}` không đổi | Đúng | Nhánh `GET` của `route` không có trong diff |
| Schema `Customer`, `Problem`, `CustomerStatus` không đổi | Đúng | `domain/Customer.java`, `domain/CustomerStatus.java`, `api/Problem.java` không có trong diff |

Ví dụ `inactiveCustomer` của response 200 không dựng được qua HTTP (không có endpoint đổi trạng thái, ngoài phạm vi); hành vi này được chứng minh ở tầng service (TC-51) và repository (TC-44), đúng như test spec đã ghi.

**FE gọi**

| Contract | Kết quả | Dẫn chứng |
| --- | --- | --- |
| `getCustomer`: `GET /api/customers/{id}`, không body | Đúng | `customerApi.js:34-36`; TC-72 (`method` và `Content-Type` là `undefined`), TC-73 |
| `updateCustomer`: `PUT /api/customers/{id}`, `Content-Type: application/json` | Đúng | `customerApi.js:39-41`; `id` qua `encodeURIComponent`; TC-70 |
| Body `{name, email, phone}` là giá trị thô, không có `id` | Đúng | `main.js:53,55` luôn gửi đủ ba key dạng chuỗi lấy từ `FormData`, thoả `required: [name, email]`; ô điện thoại rỗng gửi `""` (BE lưu `null`); không chuẩn hoá, không kiểm tra ở FE |
| Xử lý 200 | Đúng | Đóng form, tải lại danh sách (`main.js:55-57`) |
| Xử lý 400 có `errors` | Đúng | Lỗi hiện dưới từng ô nhập (`main.js:59-61`, TC-71, TC-79) |
| Xử lý 400 `Malformed JSON`, 404, 500 của `PUT` | Đúng | `fieldErrors` rỗng nên hiện "Không lưu được khách hàng." (`main.js:62-64`) |
| Xử lý 404, 500 của `GET` | Đúng | "Không tải được khách hàng." (`main.js:42-44`) |
| Form điền nguyên `phone` API trả, không định dạng | Đúng | `customerEditForm.js:18`; TC-76, TC-77 |

Kết luận: không có sai lệch nào giữa code và `api-contract.yaml`.
