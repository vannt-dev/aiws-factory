# REQ-002 — Phân tích requirement

## Mục tiêu
Bộ phận CSKH cần sửa họ tên, email và số điện thoại của khách hàng đã có ngay trên hệ thống mới (`source-be` + `source-fe`). Hiện hệ thống mới chỉ tạo và xem được (`aiws/knowledge/system-map.md` → Legacy → Hành vi: dòng "Sửa" ghi "Chưa có"), nên muốn sửa vẫn phải dùng legacy.

Cách xử lý khi sửa phải giống nhánh sửa của `source-legacy/customer_save.php` (nhánh có `id`): ghi lại cả ba trường, không đụng tới trạng thái, và khi kiểm tra trùng thì bỏ qua chính khách hàng đang sửa. Quy tắc kiểm tra dữ liệu là quy tắc đang chạy ở `POST /api/customers` (`source-be/src/main/java/com/example/crm/service/CustomerService.java:create`).

Đo thành công:
- Cùng một thao tác sửa, hệ thống mới chấp nhận/từ chối và lưu cùng giá trị như legacy, trừ các điểm lệch có chủ ý ghi ở "Câu hỏi mở" (Q2, Q4).
- Nhân viên sửa được một khách hàng từ màn hình danh sách và thấy lỗi của từng trường ngay tại trường đó.

## Acceptance criteria
Truy vết:
- R1..R4 là bốn gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-002-edit-customer.md`, theo đúng thứ tự.
- RB là mục "Bối cảnh" ("cách xử lý khi sửa phải giống hệ thống cũ"). Dẫn chiếu dòng là của `source-legacy/customer_save.php`.

Quy ước dùng trong các AC:
- "Sửa khách hàng `{id}`" là gửi yêu cầu sửa tới khách hàng có `id` đó với body JSON `{name, email, phone}`. Giả định endpoint là `PUT /api/customers/{id}` (Q1).
- "Lưu" là giá trị trong response thành công **và** trong các lần `GET` sau đó.
- "Không đổi gì" là `GET /api/customers` sau yêu cầu trả đúng danh sách như trước yêu cầu: cùng số phần tử, cùng giá trị từng field.
- Thông điệp lỗi là đúng các thông điệp hiện có của `POST /api/customers` (`aiws/knowledge/api-inventory.md` → bảng quy tắc validation).

**Sửa khách hàng (BE)**
- AC-1: Given khách hàng A đang có (`name = "Nguyen Van An"`, `email = "an@example.com"`, `phone = "0912345678"`) và không khách hàng nào khác dùng email hay số mới, when sửa A với họ tên, email và số điện thoại mới hợp lệ, then trả 200 kèm `Customer` của A, trong đó `name` và `email` đã bỏ dấu cách hai đầu, `phone` đã chuẩn hoá như lúc tạo, `id` không đổi, và số khách hàng trong `GET /api/customers` không đổi (không tạo khách hàng mới). Giá trị mới được lưu. Biến thể dữ liệu:
  - `name = "  Nguyen Van Anh "`, `email = " anh@example.com "`, `phone = " 0987.654-321 "` → lưu `Nguyen Van Anh`, `anh@example.com`, `0987654321`
  - `phone = "+84 24 3825 1234"` → lưu `02438251234`
  - `phone = "84 987 654 321"` → lưu `0987654321`
  - khách hàng đang không có số (`phone = null`) được sửa với `phone = "0987654321"` → lưu `0987654321`

  (R1, RB; dòng 7–9, 23, 43–44)
- AC-2: Given khách hàng A đang có số `0912345678`, when sửa A với `name`, `email` hợp lệ và không có số điện thoại (thiếu field `phone`, `phone = null`, `phone = ""` hoặc chỉ gồm dấu cách như `"   "`), then trả 200 và `phone` của A được lưu là `null`. Sửa là ghi lại cả ba trường: trường không gửi **không** giữ giá trị cũ. (RB; dòng 9, 21–22, 43–44: `UPDATE ... phone = ?` với `NULL`)
- AC-3: Given khách hàng có `status` là `ACTIVE` hoặc `INACTIVE`, when sửa khách hàng đó thành công, then `status` được lưu đúng bằng `status` trước khi sửa. Khách hàng `INACTIVE` vẫn sửa được như khách hàng `ACTIVE`. Biến thể dữ liệu:
  - khách hàng `ACTIVE`, body chỉ có `name`, `email`, `phone` → vẫn `ACTIVE`
  - khách hàng `INACTIVE` → vẫn `INACTIVE`, `name`/`email`/`phone` mới được lưu
  - khách hàng `ACTIVE`, body có thêm `"status": "INACTIVE"` → field này bị bỏ qua, vẫn `ACTIVE`

  (R3, RB; dòng 43: `UPDATE` không có cột `status` và không xét `status` của dòng đang sửa)
- AC-4: Given khách hàng A đang có, when sửa A với dữ liệu vi phạm quy tắc kiểm tra của lúc tạo, then trả 400 `application/problem+json`, `errors` có đúng các trường sai với mỗi trường một thông điệp giống hệt `POST /api/customers`, và A không đổi gì. Biến thể dữ liệu (các trường còn lại hợp lệ):
  - `name` rỗng sau khi bỏ dấu cách (thiếu field, `null`, `""`, `"   "`) → `errors.name = "must not be blank"`
  - `name` dài 101 ký tự → `errors.name = "must be at most 100 characters"`
  - `email` sai định dạng (thiếu field, `"x"`, `"a@b"`) → `errors.email = "must be a valid email address"`
  - `phone` không hợp lệ sau chuẩn hoá: sai đầu số `0412345678`, sai độ dài `091234567`, ký tự lạ `0912a45678`, mã quốc gia không khớp `84 24 3825 1234`, chỉ gồm ký tự phân cách `-` → `errors.phone = "must be a valid phone number"`
  - nhiều trường sai cùng lúc: `name = ""`, `email = "x"`, `phone = "0412345678"` → `errors` có đủ ba key `name`, `email`, `phone` trong một response

  (R2; dòng 12–17, 22–25, 36–40: gom mọi lỗi rồi trả một lần, không ghi gì)
- AC-5: Given khách hàng B (bất kể `ACTIVE` hay `INACTIVE`) đang dùng email `binh@example.com`, when sửa khách hàng A khác với email trùng B, không phân biệt hoa thường (ví dụ `binh@example.com`, `BINH@Example.com`), then trả 400, `errors.email = "is already used by another customer"`, và A không đổi gì. (R2)
- AC-6: Given khách hàng B đang hoạt động (`ACTIVE`) dùng số `0912345678`, when sửa khách hàng A khác với số trùng B sau chuẩn hoá, then trả 400, `errors.phone = "is already used by another customer"`, và A không đổi gì. Biến thể dữ liệu:
  - A `ACTIVE`, gửi `0912345678` hoặc `+84 912 345 678`
  - A `INACTIVE` đang không có số, gửi `0912345678`
  - A `INACTIVE` đang có chính số `0912345678` (số đã được cấp lại cho B theo BR-09), gửi lại số đó → vẫn lỗi; muốn lưu phải đổi hoặc xoá số

  (R2, RB; BR-09, dòng 27: `WHERE phone = ? AND status = 1 AND id <> ?`)
- AC-7: Given khách hàng A có `email = "an@example.com"` và `phone = "0912345678"`, when sửa A mà vẫn giữ email và/hoặc số của chính A, then trả 200 và giá trị gửi lên được lưu, không báo trùng. Biến thể dữ liệu:
  - gửi lại đúng `an@example.com` và `0912345678`, chỉ đổi `name`
  - email của chính A viết khác hoa thường: `AN@Example.com` → lưu `AN@Example.com`
  - số của chính A viết khác: `+84 912 345 678` → lưu `0912345678`

  (R2: "không tính chính khách hàng đang được sửa"; RB; dòng 27: `id <> ?`)
- AC-8: Given số `0987654321` chỉ đang được một khách hàng `INACTIVE` khác giữ, when sửa khách hàng A với `phone = "0987654321"`, then trả 200 và lưu `0987654321`. (R2, RB; BR-09: khách hàng ngừng hoạt động không giữ số)
- AC-9: Given không có khách hàng nào mang `id` được yêu cầu (ví dụ `999`), when sửa khách hàng `999` với body hợp lệ, then trả 404 `application/problem+json` với `title = "Not Found"` như `GET /api/customers/{id}`, và danh sách khách hàng không đổi gì (không tạo mới, không sửa ai). (R1: chỉ sửa "khách hàng đã có"; xem Q2)

**Gọi API (FE, `source-fe/src/api/customerApi.js`)**
- AC-10: Given khách hàng có `id = 7`, when gọi hàm sửa của API client với `id` đó và `{ name, email, phone }`, then client gửi đúng một request `PUT /api/customers/7` có `Content-Type: application/json`, body JSON chứa đúng giá trị nhân viên nhập (không chuẩn hoá, không kiểm tra; ví dụ `phone: '0912 345 678'` và `phone: ''` được gửi nguyên), và hàm trả về khách hàng mà API trả. (R1)
- AC-11: Given API từ chối yêu cầu sửa, when gọi hàm sửa của API client, then hàm ném `ApiError` mang đúng thông tin của API. Biến thể dữ liệu:
  - 400 Problem có `errors = { name, email, phone }` → `status = 400`, `fieldErrors` có đủ ba key với đúng thông điệp
  - 404 Problem không có `errors` → `status = 404`, `fieldErrors` rỗng

  (R2, R4)

**Màn hình danh sách (FE)**
- AC-12: Given danh sách có ít nhất một khách hàng, when `renderCustomerTable`, then mỗi dòng khách hàng có đúng một điều khiển sửa (nút hoặc liên kết, nhãn "Sửa") mang `id` của khách hàng ở dòng đó, và năm cột hiện có (`ID, Họ tên, Email, Điện thoại, Trạng thái`) giữ nguyên nội dung và thứ tự. (R4)
- AC-13: Given nhân viên chọn sửa một khách hàng, when form sửa được hiển thị cho khách hàng đó, then ba ô nhập có sẵn giá trị hiện tại của khách hàng. Biến thể dữ liệu:
  - `{ name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678' }` → ba ô có đúng ba giá trị này (số ở dạng API trả, chưa định dạng)
  - `phone` là `null` hoặc không có field → ô điện thoại rỗng, không phải `—`, `null` hay `undefined`
  - `name = '"><b>x</b>'` → giá trị được escape HTML, không sinh thẻ `<b>` và không thoát khỏi thuộc tính

  (R4, RB: sửa là ghi lại cả ba trường, nên form không có sẵn số thì lưu sẽ xoá số, xem AC-2)
- AC-14: Given API từ chối yêu cầu sửa với `errors` theo trường (ví dụ `{ name: 'must not be blank', phone: 'must be a valid phone number' }`), when form sửa hiển thị lỗi, then thông điệp của mỗi trường hiện ngay tại trường tương ứng (`name`, `phone`), trường không có lỗi (`email`) không có thông điệp nào, và thông điệp được escape HTML. (R4; xem Q5)

## Impact
- **Module (BE)**, `source-be/src/main/java/com/example/crm/`:
  - `service/CustomerService.java`: cần thêm thao tác sửa. Toàn bộ kiểm tra hiện viết thẳng trong `create` (dòng 33–58), nên "giống lúc tạo" (R2) đòi hỏi hai thao tác dùng chung một bộ quy tắc, không chép lại. Cách tách do architect quyết. Chữ ký `create(String name, String email, String phone)` nên giữ nguyên: có ba call site (`App.main`, `CustomerServiceTest`, `CustomerHandlerTest`) và các test REQ-001 (TC-13..TC-26).
  - `repository/CustomerRepository.java`, `repository/InMemoryCustomerRepository.java`:
    - Chưa có thao tác cập nhật: interface chỉ có `findAll`, `findById`, `existsByEmail`, `existsByPhoneAndStatus`, `insert` (`aiws/knowledge/db-schema.md`: "Hiện chưa có update/delete"). `Customer` là record bất biến, nên sửa nghĩa là thay phần tử trong map bằng `Customer` mới có cùng `id` và `status`.
    - `existsByEmail(email)` và `existsByPhoneAndStatus(phone, status)` không loại trừ được một `id`. Khách hàng sửa mà giữ email/số của mình sẽ bị báo trùng với chính nó (AC-7). Cần truy vấn tương đương `... AND id <> ?` của legacy; đổi interface thế nào do architect quyết.
  - `api/CustomerHandler.java:route`: `BY_ID` hiện chỉ đi kèm `GET` (dòng 60–64). Mọi method khác trên `/api/customers/{id}` đang rơi vào fallback 404 `No route for <METHOD> <path>`. Cần thêm route sửa. Javadoc của class đang liệt kê ba endpoint nên phải cập nhật. `handle` (bảng map exception) dùng lại nguyên: `ValidationException` → 400, `NotFoundException` → 404, `JsonProcessingException` → 400 "Malformed JSON".
  - `api/CreateCustomerRequest.java`: body sửa có cùng ba field `{name, email, phone}`. Dùng lại record này hay thêm record riêng do architect quyết.
  - Dự kiến **không đổi**: `domain/Customer.java`, `domain/CustomerStatus.java`, `service/PhoneNumbers.java`, `error/*`, `App.java` (context `/api/customers` đã bao cả path con).
  - Test, `source-be/src/test/java/com/example/crm/`: thêm test vào `service/CustomerServiceTest.java`, `api/CustomerHandlerTest.java` (hiện chỉ có helper `get` và `post`, cần helper cho method mới) và `repository/InMemoryCustomerRepositoryTest.java` nếu repository có method mới. Khách hàng `INACTIVE` cho AC-3, AC-5, AC-6, AC-8 dựng bằng `repository.insert(..., CustomerStatus.INACTIVE)` như TC-25.
- **API**, `aiws/knowledge/api-inventory.md`:
  - Endpoint mới để sửa (giả định `PUT /api/customers/{id}`, Q1): body `{name, email, phone}` là giá trị thô; 200 kèm `Customer`; 400 Problem kèm `errors` (key `name`, `email`, `phone`); 404 Problem khi `id` không tồn tại.
  - Ba endpoint hiện có và schema `Customer` không đổi. `PUT /api/customers` (không có `id`) vẫn trả 404 như hiện nay.
  - `aiws/work/REQ-001/api-contract.yaml` chỉ mô tả ba endpoint cũ; contract của REQ-002 do architect viết.
  - Sau khi merge, phase knowledge cần cập nhật: bảng endpoint trong `api-inventory.md`; dòng "Sửa … Chưa có" và câu "Điều kiện `id <> ?` … không có ở hệ thống mới" trong `system-map.md`; câu "Hiện chưa có update/delete" trong `db-schema.md`; mục Frontend của `conventions.md`.
- **DB**:
  - Hệ thống mới **không có DB** (`aiws/knowledge/db-schema.md`), nên không có migration. Thay đổi nằm ở kho in-memory `InMemoryCustomerRepository`.
  - Tham chiếu legacy: `UPDATE customers SET full_name = ?, email = ?, phone = ? WHERE id = ?` (dòng 43). Cột `status` và `created_at` không bị ghi.
- **FE**, `source-fe/`:
  - `src/api/customerApi.js`: thêm hàm sửa (AC-10, AC-11). `request()` và `ApiError` dùng lại, không cần sửa.
  - `src/components/customerTable.js`: thêm điều khiển sửa cho mỗi dòng (AC-12).
    - **Test REQ-001 sẽ phải sửa**: AC-12 giữ nguyên năm cột hiện có, nên điều khiển sửa nằm ở ô thứ sáu. TC-36 trong `test/customerTable.test.js` neo tiêu đề bằng `<th>Trạng thái</th></tr></thead>` và đòi mỗi dòng có đúng 5 `<td>`, nên sẽ fail. Test đầu tiên của file đòi đúng 2 `<tr>` và chỉ fail nếu thiết kế thêm `<tr>` (ví dụ sửa ngay trong dòng). TC-37..TC-41 chỉ so nội dung từng ô nên không bị ảnh hưởng.
    - Việc cập nhật TC-36 là thay đổi dự kiến và phải được ghi rõ trong design để người duyệt thấy (AGENTS.md mục 9). **Không** né assertion cũ bằng mẹo, ví dụ dùng `<td class="...">` để regex `/<td>/` không đếm, hay thêm ô mà không thêm `<th>` tương ứng.
  - Form sửa (AC-13, AC-14): `index.html` hiện chỉ có `#create-form`, `#message`, `#customers`. Dùng lại form thêm ở "chế độ sửa", thêm form riêng hay sửa ngay trong dòng do architect quyết.
    - `index.html` và `src/main.js` không có seam unit test vì `node:test` không có DOM (`aiws/knowledge/conventions.md` → Test → FE). Để hai AC này kiểm chứng được bằng unit test, phần dựng form sửa (giá trị có sẵn và lỗi theo trường) cần là hàm thuần trả chuỗi HTML trong `src/components/`, theo đúng convention component hiện có. Tên và hình dạng hàm do architect quyết.
  - `src/main.js`: bắt sự kiện chọn sửa trên `#customers` (vùng này bị gán lại `innerHTML` sau mỗi `refresh()`), mở form với giá trị hiện tại, gọi hàm sửa, hiển thị lỗi theo trường, và gọi `refresh()` khi lưu được. Lỗi không theo trường (404, 500, mất mạng) hiển thị thông báo chung "Không lưu được khách hàng." như hiện nay. Phần này kiểm bằng review hoặc chạy tay.
  - Test: thêm vào `test/customerApi.test.js`, `test/customerTable.test.js`, và file test mới cho component mới (nếu có).

## Reuse
- **Đặc tả tham chiếu** (port hành vi, không gọi trực tiếp): `source-legacy/customer_save.php`.
  - Dòng 6, 42–44: có `id` thì `UPDATE` đúng ba cột `full_name`, `email`, `phone`.
  - Dòng 9, 21–22: không có số thì ghi `NULL`.
  - Dòng 27: truy vấn trùng số `status = 1 AND id <> ?`.
  - Dòng 36–40: có lỗi thì trả hết lỗi một lần và không ghi gì.
- **BE**, `source-be/src/main/java/com/example/crm/`:
  - `service/CustomerService.java:create`: toàn bộ khối kiểm tra (trim, `NAME_MAX_LENGTH`, `EMAIL`, thứ tự rỗng → chuẩn hoá → hợp lệ → trùng của số điện thoại, gom lỗi vào `LinkedHashMap` rồi ném `ValidationException` một lần) và nguyên văn năm thông điệp lỗi.
  - `service/PhoneNumbers.java` (`trim`, `normalize`, `isValid`): dùng nguyên, không sửa.
  - `service/CustomerService.java:get` + `error/NotFoundException.java`: mẫu 404 với detail `Customer {id} not found`.
  - `repository/CustomerRepository.java`: `findById` để lấy khách hàng hiện tại (giữ `id`, `status`); `existsByEmail` và `existsByPhoneAndStatus` làm mẫu đặt tên cho truy vấn có loại trừ `id`.
  - `api/CustomerHandler.java`: regex `BY_ID`, `JSON` (bỏ qua field lạ, nên `status` trong body tự bị bỏ, AC-3), `send`, và bảng map exception trong `handle`.
  - `api/CreateCustomerRequest.java`: cùng hình dạng body `{name, email, phone}`.
  - Test: `CustomerHandlerTest` (`App.start(0, service)` + `HttpClient`), `CustomerServiceTest` (`InMemoryCustomerRepository` thật; mẫu dựng `INACTIVE` của TC-25; `@ParameterizedTest` + `@MethodSource`).
- **FE**, `source-fe/`:
  - `src/api/customerApi.js`: `request()` (ghép `API_BASE`, header, parse body, ném `ApiError`) và `ApiError.fieldErrors`. `createCustomer` là mẫu cho hàm sửa.
  - `src/utils/escapeHtml.js`: escape cả `"` và `'`, nên dùng được cho giá trị đặt trong thuộc tính của ô nhập (AC-13); `null`/`undefined` thành chuỗi rỗng.
  - `src/components/customerTable.js:renderCustomerTable`: nơi thêm điều khiển sửa. `formatPhone` và `NO_PHONE` chỉ dùng cho ô hiển thị trong bảng, không dùng cho giá trị trong form.
  - `src/main.js`: `refresh()` để tải lại danh sách sau khi lưu; khối `catch` hiện có là mẫu phân biệt lỗi theo trường và lỗi chung.
  - `index.html`: class CSS `.error` và mẫu `role="alert"`.
  - `GET /api/customers/{id}` đã có ở BE nhưng FE chưa gọi; dùng nó hay dùng dữ liệu của danh sách đã tải để điền form do architect quyết.
  - Test: `fakeFetch(status, body, calls)` trong `test/customerApi.test.js`; so chuỗi HTML bằng `assert.match`/`assert.doesNotMatch` trong `test/customerTable.test.js`.

## Ngoài phạm vi
- Đổi trạng thái hoạt động và xoá khách hàng (requirement → Ngoài phạm vi). Không thêm endpoint đổi trạng thái chỉ để phục vụ test; dữ liệu `INACTIVE` dựng ở tầng repository.
- Sửa một phần (chỉ gửi trường muốn đổi, kiểu `PATCH`). Legacy luôn ghi lại cả ba trường (AC-2).
- Đổi cách hiển thị lỗi của form **thêm** khách hàng (`#message` dạng `field: msg; ...`). R4 chỉ nói về việc sửa. Nếu architect dùng chung một form cho thêm và sửa thì việc này phải được ghi rõ trong design.
- Các khác biệt giữa quy tắc tạo của hệ thống mới và legacy đã ghi ở `aiws/knowledge/system-map.md` → Legacy → Hành vi: quy tắc email (`filter_var` so với regex), đơn vị đo độ dài họ tên, giới hạn 150 ký tự của email, `created_at`, ngôn ngữ và format body lỗi. Sửa dùng đúng quy tắc của tạo nên kế thừa nguyên các khác biệt này.
- Lịch sử thay đổi, người sửa, thời điểm sửa. Legacy cũng không ghi.
- Khoá hoặc phát hiện sửa đồng thời (Q7).
- DB thật, migrate dữ liệu legacy, màn hình chi tiết khách hàng, tìm kiếm và lọc.

## Câu hỏi mở
- [non-blocking] Q1: Endpoint và ngữ nghĩa của thao tác sửa? Giả định:
  - `PUT /api/customers/{id}`, body `{name, email, phone}` là giá trị thô, thay thế toàn bộ ba trường như `UPDATE` của legacy. `id` lấy từ path; field khác trong body bị bỏ qua theo convention hiện có (`FAIL_ON_UNKNOWN_PROPERTIES = false`).
  - Thành công trả 200 kèm `Customer` sau khi sửa. Legacy chuyển hướng về danh sách; hệ thống mới theo convention REST đang dùng (`aiws/knowledge/api-inventory.md` → Quy ước → Mã thành công).
  - Architect chốt method, path và mã trạng thái. Các AC phía BE chỉ phụ thuộc vào ngữ nghĩa "ghi lại cả ba trường". Riêng AC-10 ghi thẳng `PUT /api/customers/7` theo giả định này; nếu architect chọn method hoặc path khác thì AC-10 đổi theo.
- [non-blocking] Q2: `id` không tồn tại thì xử lý thế nào? Giả định trả 404 (AC-9). Đây là **điểm lệch có chủ ý** so với legacy.
  - Legacy không kiểm tra: `UPDATE ... WHERE id = ?` ghi 0 dòng rồi vẫn chuyển hướng như thành công (dòng 42–50). Với `id` ≤ 0 hoặc không phải số, legacy chạy nhánh `INSERT`, vì một script lo cả thêm và sửa.
  - Lý do lệch: API REST không có `Customer` nào để trả, `GET /api/customers/{id}` đã trả 404 cho cùng tình huống, và báo thành công khi không lưu gì sẽ che lỗi với nhân viên. Yêu cầu sửa cũng không bao giờ tạo khách hàng mới.
  - `id` không tồn tại **và** body sai thì trả 404 hay 400: chưa đưa vào AC, architect chốt (đề xuất 404, vì cần khách hàng hiện tại để giữ `status`).
- [non-blocking] Q3: Có giữ các hành vi dễ gây bất ngờ của legacy khi sửa không? Giả định **giữ nguyên có chủ ý** vì requirement yêu cầu "giống hệ thống cũ". Developer và reviewer không được "sửa" các hành vi sau:
  - (a) Không gửi số điện thoại thì số đang có bị xoá, không được giữ lại (AC-2). Vì vậy form sửa phải điền sẵn số hiện tại (AC-13).
  - (b) Khách hàng `INACTIVE` vẫn sửa được và vẫn `INACTIVE` (AC-3).
  - (c) Kiểm tra trùng số không xét trạng thái của khách hàng đang sửa. Khách hàng `INACTIVE` có số đã được cấp lại cho một khách hàng `ACTIVE` sẽ không lưu được cho tới khi đổi hoặc xoá số, kể cả khi chỉ muốn sửa họ tên (AC-6, biến thể thứ ba).
  - (d) Mọi lần lưu đều kiểm tra lại số điện thoại. Dữ liệu migrate có số theo quy tắc trước BR-07 (ví dụ `01234567890`, `aiws/knowledge/db-schema.md` → Migration) phải sửa số thì mới lưu được.

  Nếu muốn khác, người duyệt cần nói ở bước duyệt design.
- [non-blocking] Q4: "Quy tắc kiểm tra giống lúc tạo" là quy tắc của hệ thống nào? Giả định là quy tắc **đang chạy ở `POST /api/customers` của hệ thống mới**, kể cả những chỗ nó khác legacy (xem "Ngoài phạm vi"). Hệ quả với email trùng:
  - Sửa sang email của khách hàng khác trả 400 `errors.email` (AC-5), giống lúc tạo.
  - Legacy không kiểm tra trong code mà dựa vào `UNIQUE uq_customers_email`, và không đọc kết quả `$stmt->execute()` (dòng 49). [CẦN XÁC NHẬN] hành vi thật của legacy khi sửa sang email trùng: nhiều khả năng không lưu nhưng vẫn chuyển hướng như thành công. Hệ thống mới không lặp lại điều này.
- [non-blocking] Q5: "Hiển thị lỗi theo từng trường" nghĩa là gì trên màn hình? Giả định mỗi thông điệp hiện ngay tại ô nhập của trường đó trong form sửa (AC-14), nội dung là nguyên văn thông điệp tiếng Anh của API.
  - Cách hiểu hẹp hơn: dùng lại dòng `field: msg; ...` trong `#message` như form thêm (`source-fe/src/main.js`). Cách này không cần code hiển thị mới, nhưng không gắn lỗi với ô nhập.
  - Chọn cách hiểu rộng vì nó thoả cả hai cách đọc requirement. Nếu chỉ cần cách hẹp, người duyệt nói ở bước duyệt design để bỏ AC-14 và giảm phần FE.
- [non-blocking] Q6: "Có cách để sửa" trông thế nào? Giả định mỗi dòng có điều khiển "Sửa", bấm vào thì hiện form có sẵn ba giá trị hiện tại. Số điện thoại trong form ở dạng API trả (`0912345678`), không định dạng 4-3-3; nhập dạng nào thì BE cũng chuẩn hoá về cùng một số.
  - [CẦN XÁC NHẬN] giao diện sửa của legacy: repo không có form HTML nào gửi `id` tới `customer_save.php`, và `source-legacy/customer_list.php` không có liên kết sửa. Vì vậy không có mẫu giao diện để theo; bố cục do architect đề xuất và người duyệt design chốt.
- [non-blocking] Q7: Hai nhân viên sửa cùng một khách hàng, hoặc hai yêu cầu cùng lấy một số/email? Giả định chấp nhận như hiện trạng: yêu cầu ghi sau thắng, và kiểm tra trùng rồi mới ghi không phải thao tác nguyên tử. Giống lúc tạo (`aiws/knowledge/db-schema.md`) và giống legacy (`SELECT` rồi `UPDATE`, không khoá).
- [non-blocking] Q8: Mã TC của REQ-002 đánh số tiếp hay bắt đầu lại? `aiws/knowledge/conventions.md` → Test → Mã TC còn [CẦN XÁC NHẬN]: tên test không chứa mã REQ, và REQ-001 đã dùng TC-1..TC-43 trong chính các file test mà REQ-002 sẽ sửa. Giả định đánh số tiếp từ TC-44 để mã không trùng trong cùng một file. Test-designer chốt.
