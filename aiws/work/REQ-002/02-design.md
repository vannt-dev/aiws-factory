# REQ-002 — Thiết kế

## Tổng quan
REQ-002 thêm thao tác **sửa** họ tên, email và số điện thoại của khách hàng đã có: một endpoint mới ở BE và một form sửa mở từ màn hình danh sách ở FE. Thiết kế xử lý đủ AC-1..AC-14 trong `01-analysis.md`. Đây là vòng thiết kế đầu tiên, chưa có feedback reject.

- **BE: endpoint sửa (AC-1..AC-3, AC-9).** Thêm `PUT /api/customers/{id}` với body `{name, email, phone}`, ghi lại cả ba trường như câu `UPDATE` của `source-legacy/customer_save.php` (D1). `id` không tồn tại trả 404, kiểm tra trước validation (D2). Repository chỉ ghi ba trường, nên `id` và `status` không thể bị đổi (D6).
- **BE: quy tắc kiểm tra dùng chung với lúc tạo (AC-4..AC-8).** Khối kiểm tra đang viết thẳng trong `CustomerService.create` được tách thành một hàm private mà `create` và `update` cùng gọi; không chép lại quy tắc (D4). Khi sửa, kiểm tra trùng dùng hai truy vấn repository mới có loại trừ `id`, tương đương `id <> ?` của legacy (D5).
- **FE (AC-10..AC-14).**
  - `customerApi.js` thêm `updateCustomer` và `getCustomer`, đi qua `request()` có sẵn (D8).
  - Bảng thêm cột thứ sáu "Thao tác", mỗi dòng một nút "Sửa" (D9).
  - Form sửa là component thuần mới `renderCustomerEditForm`, hiện lỗi ngay dưới từng ô nhập (D10). Form được điền bằng `GET /api/customers/{id}` (D11) và gắn vào trang qua `main.js` (D12).
- **Không có DB, không có migration.** HTTP API chỉ **thêm một endpoint**; ba endpoint cũ, schema `Customer` và format lỗi không đổi, nên vẫn tương thích ngược.
- **Một test của REQ-001 phải sửa:** TC-36 trong `source-fe/test/customerTable.test.js` (D9). Mọi test cũ khác giữ nguyên và phải pass.

Truy vết AC → thiết kế:

| AC | Phần thiết kế |
| --- | --- |
| AC-1, AC-2 | D1, D4 (trim, chuẩn hoá, số rỗng → `null`), D6 (ghi lại cả ba trường) |
| AC-3 | D6 (repository không ghi `status`), D3 (body không có `status`) |
| AC-4 | D4 (cùng một hàm kiểm tra với `create`) |
| AC-5..AC-8 | D5 (truy vấn trùng có loại trừ `id`) |
| AC-9 | D2 (404 trước validation), D6 (`update` không bao giờ thêm mới) |
| AC-10, AC-11 | D8 |
| AC-12 | D9 |
| AC-13 | D10, D11 |
| AC-14 | D10, D12 |

Chi tiết schema nằm trong `api-contract.yaml`.

## Quyết định chính
- D1: Endpoint sửa là `PUT /api/customers/{id}`, body `{name, email, phone}` là giá trị thô, **thay thế toàn bộ** ba trường. Thành công trả **200** kèm `Customer` sau khi sửa (Q1).
  - `id` chỉ lấy từ path. Field khác trong body (`id`, `status`...) bị bỏ qua nhờ `FAIL_ON_UNKNOWN_PROPERTIES = false` của `CustomerHandler.JSON`.
  - Trường không gửi **không** giữ giá trị cũ: không gửi `phone` thì số đang có bị xoá (AC-2).
  - Lý do:
    - Legacy luôn ghi lại cả ba cột (`customer_save.php` dòng 43), đúng ngữ nghĩa "thay thế" của PUT (skill api-design: "PUT thay thế").
    - PUT là idempotent: bấm lưu hai lần cho cùng một kết quả.
    - Trả 200 kèm object giống mẫu `POST` trả object vừa tạo (`aiws/knowledge/api-inventory.md` → Quy ước → Mã thành công). Client thấy ngay giá trị đã chuẩn hoá.
  - Đã cân nhắc:
    - `PATCH` (chỉ gửi trường muốn đổi): loại. Khác legacy và nằm ngoài phạm vi (`01-analysis.md` → Ngoài phạm vi).
    - `POST /api/customers` kèm `id` trong body như legacy: loại. Một endpoint lo cả thêm và sửa là nguyên nhân legacy chạy nhánh `INSERT` khi `id` sai (Q2).
    - Trả 204 không body: loại, vì FE phải gọi thêm `GET` mới biết giá trị đã lưu.
- D2: Thứ tự xử lý của `PUT` cố định như sau; `id` không tồn tại trả **404** (Q2, AC-9).
  1. Khớp route: path khớp `^/api/customers/(\d+)$` và method là `PUT`. Không khớp (`PUT /api/customers`, `PUT /api/customers/abc`) thì rơi vào fallback 404 `No route for PUT <path>` như hiện nay.
  2. Đọc body JSON. Hỏng thì 400 `Malformed JSON`, **kể cả khi `id` không tồn tại** (handler phải đọc body trước khi gọi service).
  3. Tìm khách hàng. Không có thì 404 `Not Found`, detail `Customer {id} not found`, **kể cả khi các field trong body không hợp lệ**.
  4. Kiểm tra dữ liệu (D4). Có lỗi thì 400 kèm `errors`, không ghi gì.
  5. Ghi (D6) và trả 200.
  - Lý do:
    - 404 là **điểm lệch có chủ ý** so với legacy. Legacy chạy `UPDATE ... WHERE id = ?`, ghi 0 dòng rồi vẫn chuyển hướng như thành công (dòng 42–50). API REST không có `Customer` nào để trả, và báo thành công khi không lưu gì sẽ che lỗi với nhân viên.
    - 404 trước 400: kiểm tra dữ liệu của một khách hàng không tồn tại là vô nghĩa (kiểm tra trùng "trừ khách hàng 999" không có nghĩa). `GET /api/customers/{id}` đã trả 404 cho cùng tình huống, với cùng `title` và `detail`.
  - Đã cân nhắc:
    - Giống legacy (trả thành công, không lưu gì): loại, lý do ở trên.
    - Tạo mới khi `id` chưa có (PUT kiểu upsert): loại. R1 chỉ nói sửa "khách hàng đã có", và `id` do hệ thống gán.
    - 400 trước 404 (bỏ bước 3, để tầng ghi phát hiện thiếu khách hàng): loại, vì nhân viên sẽ sửa xong lỗi nhập rồi mới biết khách hàng không tồn tại.
- D3: Thêm record `api/UpdateCustomerRequest(String name, String email, String phone)` làm body của `PUT`.
  - Lý do: `CreateCustomerRequest` mang tên và Javadoc của `POST` ("Request body of POST /api/customers"). Mỗi thao tác một request record thì hai body đổi độc lập được (ví dụ khi thêm mới cần thêm field mà sửa không cho đổi). Record không có `status` nên AC-3 (bỏ qua `status` trong body) tự đúng.
  - Đã cân nhắc:
    - Dùng lại `CreateCustomerRequest` cho `PUT`: loại, vì tên sai nghĩa ở call site và trói hai body vào nhau.
    - Đổi tên thành `CustomerRequest` dùng chung: loại, vì đổi tên public type là phá cấu trúc (AGENTS.md mục 9).
- D4: Thêm `CustomerService.update(long id, String name, String email, String phone)`. Khối kiểm tra của `create` (dòng 33–58) được tách thành **một** hàm private mà `create` và `update` cùng gọi. Chữ ký và hành vi của `create(String name, String email, String phone)` **không đổi**.
  - Hình dạng:
    ```java
    public Customer create(String name, String email, String phone) {
      ValidatedFields fields = validate(name, email, phone,
          repository::existsByEmail,
          p -> repository.existsByPhoneAndStatus(p, CustomerStatus.ACTIVE));
      return repository.insert(fields.name(), fields.email(), fields.phone(), CustomerStatus.ACTIVE);
    }

    public Customer update(long id, String name, String email, String phone) {
      get(id); // 404 before validation (D2)
      ValidatedFields fields = validate(name, email, phone,
          e -> repository.existsByEmailAndIdNot(e, id),
          p -> repository.existsByPhoneAndStatusAndIdNot(p, CustomerStatus.ACTIVE, id));
      return repository.update(id, fields.name(), fields.email(), fields.phone())
          .orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
    }
    ```
  - `validate(name, email, phone, Predicate<String> emailTaken, Predicate<String> phoneTaken)` chứa nguyên khối kiểm tra hiện có, chỉ thay hai lệnh gọi repository bằng hai predicate. Hàm trả record private lồng trong `CustomerService`, `ValidatedFields(String name, String email, String phone)`: `name` và `email` đã trim, `phone` đã chuẩn hoá hoặc `null`. Có lỗi thì ném `ValidationException` một lần như hiện nay.
  - **Bắt buộc:**
    - Chỉ có một nơi chứa quy tắc. Giữ nguyên thứ tự kiểm tra, nguyên văn năm thông điệp lỗi, và điều kiện "chỉ truy vấn trùng khi giá trị đã qua kiểm tra định dạng".
    - Quy tắc BR-09 (chỉ khách hàng `ACTIVE` giữ số) vẫn do service truyền xuống qua tham số `CustomerStatus.ACTIVE`.
    - Tên của hàm và record private là gợi ý; developer được đặt tên khác nếu giữ đúng các điểm trên.
  - `update` không đọc `status` của khách hàng đang sửa: khách hàng `INACTIVE` đi qua đúng các kiểm tra như khách hàng `ACTIVE` (AC-3, AC-6).
  - Lý do: R2 đòi quy tắc "giống lúc tạo". Một hàm dùng chung thì hai thao tác không thể lệch nhau về sau. `create` giữ chữ ký nên ba call site (`App.main`, `CustomerServiceTest`, `CustomerHandlerTest`) và các test TC-13..TC-32 không phải sửa; chính các test này bảo vệ việc tách hàm.
  - Đã cân nhắc:
    - Chép khối kiểm tra sang `update`: loại, vì có hai nguồn quy tắc.
    - Một hàm `save(Long id, ...)` lo cả thêm và sửa như script legacy: loại, vì lặp lại đúng thiết kế gây ra lỗi ở Q2.
    - Tham số `Long excludedId` (`null` khi tạo) rồi rẽ nhánh bên trong: loại, vì hàm kiểm tra phải biết mình đang tạo hay sửa.
    - Cho `create` đi qua truy vấn có loại trừ với `id = 0` như legacy (`$id = 0`): loại, vì dựa vào giá trị ma thuật và để lại `existsByEmail`, `existsByPhoneAndStatus` chỉ còn test dùng.
    - Tách class validator riêng: loại, vì quá mức cần thiết cho ba field; conventions đặt validation trong `CustomerService`.
- D5: `CustomerRepository` thêm hai truy vấn có loại trừ `id`. Hai truy vấn cũ `existsByEmail` và `existsByPhoneAndStatus` giữ nguyên và `create` vẫn dùng.
  - `boolean existsByEmailAndIdNot(String email, long id)`. Bản in-memory: `c.id() != id && c.email().equalsIgnoreCase(email)`.
  - `boolean existsByPhoneAndStatusAndIdNot(String phone, CustomerStatus status, long id)`. Bản in-memory: `c.id() != id && phone.equals(c.phone()) && c.status() == status`. Phải viết `phone.equals(c.phone())`, không viết ngược, vì `c.phone()` có thể `null` (bài học D5 của REQ-001).
  - Kết quả theo AC:
    - AC-5: email trùng khách hàng khác, bất kể trạng thái → `true`.
    - AC-6: số trùng khách hàng `ACTIVE` khác → `true`, kể cả khi khách hàng đang sửa là `INACTIVE` và đang giữ chính số đó.
    - AC-7: giá trị của chính khách hàng đang sửa → `false`.
    - AC-8: số chỉ do khách hàng `INACTIVE` khác giữ → `false`.
  - Lý do: tương đương `WHERE phone = ? AND status = 1 AND id <> ?` của legacy (dòng 27). Tên theo mẫu `existsByPhoneAndStatus`. Chỉ thêm method, nên TC-12 và `create` không bị đụng.
  - Đã cân nhắc:
    - Thêm tham số `id` vào hai method cũ: loại, vì đổi public API và buộc sửa test REQ-001 (TC-12).
    - `findByEmail`/`findByPhone` rồi so `id` ở service: loại. Kho không có ràng buộc duy nhất (kiểm tra rồi mới ghi, không nguyên tử), nên có thể có nhiều hơn một kết quả; `Optional` sẽ che mất.
    - `findAll()` rồi lọc trong service: loại, vì lệch mẫu `existsBy...` và không chuyển sang SQL được.
- D6: `CustomerRepository` thêm `Optional<Customer> update(long id, String name, String email, String phone)`: thay `name`, `email`, `phone` của khách hàng `id`, **giữ nguyên `id` và `status` đang lưu**. Trả khách hàng sau khi sửa, hoặc `Optional.empty()` khi không có khách hàng đó. **Không bao giờ thêm mới.**
  - Bản in-memory: `Optional.ofNullable(customers.computeIfPresent(id, (key, c) -> new Customer(c.id(), name, email, phone, c.status())))`. Hàm truyền vào phải thuần, vì `ConcurrentSkipListMap` có thể gọi lại nó khi có tranh chấp.
  - Repository vẫn chỉ lưu đúng giá trị nhận được và không quyết định nghiệp vụ nào. Quyết định "sửa không đổi trạng thái" (R3) là của service, thể hiện bằng việc gọi thao tác chỉ ghi ba trường.
  - Lý do:
    - Tương đương `UPDATE customers SET full_name = ?, email = ?, phone = ? WHERE id = ?`: cột không nêu thì không bị ghi (AC-3), và 0 dòng khớp thì không tạo gì (AC-9).
    - `status` được đọc ngay trong thao tác ghi, nên khi sau này có chức năng đổi trạng thái, sửa thông tin không ghi đè trạng thái vừa đổi.
    - `Optional` buộc service xử lý trường hợp khách hàng biến mất giữa bước 3 và bước 5 của D2.
  - Đã cân nhắc:
    - `update(Customer customer)` thay cả record, service tự chép `status` từ `findById`: loại. Có khe hở đọc rồi ghi với `status`, và mở đường cho call site sau này đổi `status` qua thao tác sửa.
    - `save(Customer)` kiểu upsert bằng `customers.put`: loại, vì có thể tạo khách hàng với `id` tuỳ ý (trái AC-9).
- D7: Giữ nguyên **có chủ ý** các hành vi dễ gây bất ngờ của legacy khi sửa (Q3). Không cần code riêng: chúng là hệ quả của D1, D4, D5. Developer và reviewer không được "sửa" các hành vi này.
  - (a) Không gửi số thì số đang có bị xoá (AC-2).
  - (b) Khách hàng `INACTIVE` vẫn sửa được và vẫn `INACTIVE` (AC-3).
  - (c) Kiểm tra trùng số không xét trạng thái của khách hàng đang sửa (AC-6, biến thể thứ ba).
  - (d) Mọi lần lưu đều kiểm tra lại số điện thoại; số theo quy tắc cũ phải sửa thì mới lưu được.
  - Lý do: requirement yêu cầu "giống hệ thống cũ" (RB).
  - Đã cân nhắc: bỏ qua kiểm tra số khi số không đổi, hoặc không kiểm tra trùng cho khách hàng `INACTIVE`. Loại, vì lệch legacy; nếu muốn khác thì người duyệt nói ở bước duyệt design.
- D8: `source-fe/src/api/customerApi.js` thêm hai hàm public, đi qua `request()` có sẵn. `request()` và `ApiError` không sửa.
  - `updateCustomer(id, customer, options)`: `request('/customers/' + encodeURIComponent(id), { ...options, method: 'PUT', body: JSON.stringify(customer) })`. Body là đúng object nhận vào, không thêm `id`, không chuẩn hoá, không kiểm tra (AC-10). Lỗi non-2xx ném `ApiError` qua `request()` (AC-11).
  - `getCustomer(id, options)`: `request('/customers/' + encodeURIComponent(id), options)`, phục vụ D11.
  - Lý do: theo mẫu `createCustomer`/`listCustomers`. `encodeURIComponent` để `id` không bao giờ đổi được path (`7` vẫn thành `/api/customers/7`).
  - Đã cân nhắc: gộp thêm và sửa thành một hàm `saveCustomer` chọn method theo `id`. Loại, vì lặp lại kiểu "một lối vào cho cả hai" của legacy.
- D9: `renderCustomerTable` thêm **cột thứ sáu** "Thao tác". Mỗi dòng có một ô `<td><button type="button" data-edit-id="{id}">Sửa</button></td>`, với `{id}` qua `escapeHtml`. Năm cột hiện có giữ nguyên nội dung và thứ tự (AC-12).
  - Header thành `...<th>Trạng thái</th><th>Thao tác</th></tr></thead>`. Không thêm `<tr>` nào. Trạng thái rỗng `<p>Chưa có khách hàng.</p>` không đổi.
  - **Phải sửa TC-36** (`source-fe/test/customerTable.test.js`), đúng hai assertion: regex tiêu đề neo ở `<th>Trạng thái</th></tr></thead>`, và số `<td>` mỗi dòng (5 thành 6). Các assertion khác của TC-36 và mọi test khác trong file không bị ảnh hưởng: test đầu tiên vẫn đếm 2 `<tr>`, TC-39 vẫn không gặp `<td></td>`.
  - Truy vết TC-36: test giữ nguyên mã và tên hiển thị, nên truy vết của REQ-001 vẫn đúng. TC-36 **không** được định nghĩa lại trong `03-test-spec.md` của REQ-002 và không nằm trong `tests` của task nào; nó được sửa nhờ `test/customerTable.test.js` thuộc file của nhóm FE-2. Kỳ vọng mới của REQ-002 (cột thứ sáu, nút "Sửa") thuộc một TC mới phủ AC-12.
  - Ô mới là `<td>` thường và có `<th>` tương ứng. **Không** né assertion cũ bằng `<td class="...">` hay bỏ `<th>`.
  - Lý do: `<button type="button">` vì đây là hành động trong trang, không điều hướng. `data-edit-id` cho phép `main.js` bắt sự kiện bằng delegation trên `#customers`, vùng bị gán lại `innerHTML` sau mỗi `refresh()`.
  - Đã cân nhắc:
    - Liên kết `<a href="#edit-7">`: loại, vì đổi URL và cần xử lý `hashchange`.
    - Đặt nút trong ô ID hoặc ô Họ tên để giữ 5 cột: loại, vì đổi nội dung cột hiện có (trái AC-12).
    - Bấm vào cả dòng để sửa: loại, vì không dùng được bằng bàn phím và không có nhãn "Sửa".
- D10: Form sửa là **form riêng**, dựng bằng component thuần mới `source-fe/src/components/customerEditForm.js`, export `renderCustomerEditForm(customer, fieldErrors = {})` trả chuỗi HTML. Lỗi của mỗi trường hiện **ngay dưới ô nhập của trường đó**, nguyên văn thông điệp của API (Q5, Q6).
  - `customer` là `{ id, name, email, phone }`: object API trả khi mở form, hoặc giá trị nhân viên vừa nhập khi dựng lại form sau một lần lưu lỗi. Cùng một hàm phục vụ AC-13 và AC-14.
  - HTML trả về (viết liền, không xuống dòng; mọi giá trị động qua `escapeHtml`):
    ```html
    <h2>Sửa khách hàng #7</h2>
    <form id="edit-form" data-id="7" novalidate>
    <div class="field"><label for="edit-name">Họ tên</label><input id="edit-name" name="name" type="text" value="Nguyen Van An"></div>
    <div class="field"><label for="edit-email">Email</label><input id="edit-email" name="email" type="email" value="an@example.com"></div>
    <div class="field"><label for="edit-phone">Điện thoại</label><input id="edit-phone" name="phone" type="tel" value="0912345678"></div>
    <button type="submit">Lưu</button><button type="button" data-cancel-edit>Huỷ</button>
    </form>
    ```
  - Trường `{field}` có lỗi trong `fieldErrors` thì `<input>` thêm hai thuộc tính ở cuối, và ngay sau `<input>` có phần tử lỗi:
    ```html
    <input id="edit-name" name="name" type="text" value="" aria-invalid="true" aria-describedby="edit-name-error"><span id="edit-name-error" class="error" role="alert">must not be blank</span>
    ```
  - Trường không có lỗi thì **không có** phần tử `edit-{field}-error` và không có `aria-invalid`. Key lạ trong `fieldErrors` bị bỏ qua.
  - `value` là `escapeHtml(customer[field])`:
    - `phone` là `null` hoặc thiếu field cho `value=""`.
    - Số điện thoại giữ dạng API trả (`0912345678`), không qua `formatPhone`.
    - `"><b>x</b>` thành `value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;"`.
  - `novalidate` để trình duyệt không tự chặn `type="email"`. FE không kiểm tra dữ liệu; BE là nguồn quy tắc duy nhất.
  - Lý do:
    - `index.html` và `main.js` không có seam unit test. Đưa toàn bộ việc dựng form và đặt lỗi vào hàm thuần thì AC-13, AC-14 kiểm được bằng so chuỗi HTML như `customerTable.test.js`.
    - `label`, `aria-invalid`, `aria-describedby` gắn thông điệp với ô nhập cho cả trình đọc màn hình.
    - `data-id` trên form giúp `main.js` không phải giữ trạng thái "đang sửa ai".
  - Đã cân nhắc:
    - Dùng lại `#create-form` ở "chế độ sửa": loại. Việc này đổi hành vi và cách hiển thị lỗi của form thêm, là việc ngoài phạm vi, và thêm trạng thái chế độ vào `main.js` (không test được).
    - Sửa ngay trong dòng của bảng: loại. `#customers` bị dựng lại sau mỗi `refresh()` nên mất dữ liệu đang nhập, và `renderCustomerTable` phải nhận thêm trạng thái sửa và lỗi.
    - Form tĩnh trong `index.html`, `main.js` gán `value` và `textContent`: loại, vì logic "lỗi nào vào ô nào" nằm ở `main.js` thì không unit test được (AC-14).
    - Dùng dòng `field: msg; ...` trong `#message` như form thêm (cách hiểu hẹp của Q5): loại, vì không gắn lỗi với ô nhập.
- D11: Khi nhân viên bấm "Sửa", FE gọi `GET /api/customers/{id}` (đã có ở BE, không đổi) để lấy giá trị điền form.
  - Lý do:
    - Sửa là ghi lại cả ba trường. Form điền bằng dữ liệu cũ sẽ âm thầm ghi đè thay đổi của nhân viên khác lên trường mà người dùng không định sửa. Lấy dữ liệu mới thu hẹp khoảng hở từ "lúc tải danh sách" xuống "lúc mở form".
    - FE hiện không giữ state hay cache phía client (`aiws/knowledge/conventions.md` → Frontend → State và render); cách này giữ nguyên điều đó.
    - Dùng lại endpoint đã có.
  - Đã cân nhắc: `main.js` giữ mảng khách hàng của lần `refresh()` gần nhất và điền form từ đó. Bớt một request, nhưng thêm state phía client và dữ liệu có thể cũ. Loại.
  - Chấp nhận: bấm "Sửa" liên tiếp trên hai dòng thì form của response về sau thắng. Không sai dữ liệu, vì `data-id` và tiêu đề luôn khớp với giá trị đang hiển thị.
- D12: Gắn vào trang: `source-fe/index.html` thêm vùng chứa `<div id="edit-customer"></div>` nằm giữa `#message` và `#customers`, cùng CSS `.field { display: flex; flex-direction: column; gap: .25rem; }`. `source-fe/src/main.js` thêm ba xử lý sự kiện, đều bằng delegation. `#create-form` và submit handler của nó không đổi.
  1. `click` trên `#customers`, phần tử khớp `button[data-edit-id]`: xoá `#message`, gọi `getCustomer(id)`, gán `editEl.innerHTML = renderCustomerEditForm(customer)`, đưa focus vào ô đầu tiên. Lỗi thì `#message` hiện "Không tải được khách hàng." và vùng form giữ nguyên.
  2. `submit` trên `#edit-customer`: `preventDefault()`, xoá `#message`, lấy `id` từ `form.dataset.id` và giá trị từ `new FormData(form)`, gọi `updateCustomer(id, { name, email, phone })` với giá trị thô.
     - Thành công: gán `editEl.innerHTML = ''` rồi `await refresh()`.
     - `ApiError` có `fieldErrors` khác rỗng: gán `editEl.innerHTML = renderCustomerEditForm({ id, name, email, phone }, error.fieldErrors)` với giá trị nhân viên vừa nhập (AC-14), đưa focus vào ô lỗi đầu tiên.
     - Lỗi khác (404, 500, mất mạng): `#message` hiện "Không lưu được khách hàng."; form giữ nguyên giá trị đang nhập.
  3. `click` trên `#edit-customer`, phần tử khớp `button[data-cancel-edit]`: gán `editEl.innerHTML = ''` và xoá `#message`.
  - Lý do: vùng form tách khỏi `#customers` nên không mất khi danh sách được tải lại. Form được dựng lại khi có lỗi nên phải bắt `submit` bằng delegation trên vùng chứa.
  - Đã cân nhắc: gắn listener trực tiếp lên từng nút sau mỗi lần render. Loại, vì phải gắn lại sau mỗi `refresh()` và dễ sót.

## API
Thêm **một** endpoint. Ba endpoint hiện có, schema `Customer` và format lỗi không đổi. Schema đầy đủ và ví dụ: `aiws/work/REQ-002/api-contract.yaml`.

| Method | Path | Thay đổi |
| --- | --- | --- |
| PUT | `/api/customers/{id}` | **Mới.** Body `UpdateCustomerRequest {name, email, phone}`. 200 + `Customer`; 400 Problem (`errors` hoặc `Malformed JSON`); 404 Problem |
| GET | `/api/customers/{id}` | Không đổi ở BE. Từ REQ-002 được FE gọi để điền form sửa (D11), nên có trong contract |
| GET, POST | `/api/customers` | Không đổi. `PUT /api/customers` (không có `id`) vẫn trả 404 fallback |

Kết quả của `PUT /api/customers/{id}` (thứ tự kiểm tra theo D2):

| Tình huống | Kết quả |
| --- | --- |
| `id` không phải chuỗi chữ số | 404, detail `No route for PUT /api/customers/abc` |
| Body không phải JSON hợp lệ | 400, `title = "Malformed JSON"`, không có `errors` |
| Không có khách hàng `id` | 404, `title = "Not Found"`, detail `Customer {id} not found` (AC-9) |
| `name`, `email`, `phone` vi phạm quy tắc của lúc tạo | 400, `title = "Validation failed"`, `errors` có đúng các field sai, thông điệp như `POST` (AC-4) |
| `email` trùng khách hàng **khác**, bất kể trạng thái, không phân biệt hoa thường | 400, `errors.email = "is already used by another customer"` (AC-5) |
| `phone` sau chuẩn hoá trùng khách hàng `ACTIVE` **khác** | 400, `errors.phone = "is already used by another customer"` (AC-6) |
| Giữ email và/hoặc số của chính mình | 200, lưu giá trị gửi lên (email sau trim, số sau chuẩn hoá) (AC-7) |
| Số chỉ do khách hàng `INACTIVE` khác giữ | 200 (AC-8) |
| Thiếu `phone`, `null`, `""`, chỉ gồm dấu cách | 200, `phone: null` (AC-2) |
| Hợp lệ | 200, `Customer` với `id` và `status` như trước, `name`/`email` đã trim, `phone` đã chuẩn hoá (AC-1, AC-3) |

- Mọi response lỗi là `application/problem+json` (RFC 9457) qua bảng map exception có sẵn trong `CustomerHandler.handle`. Không thêm mã lỗi hay `title` mới.
- Mọi trường hợp 400 và 404: không có gì bị ghi.

Đối chiếu với `source-legacy/customer_save.php`:

| Legacy | Hệ thống mới |
| --- | --- |
| Dòng 43: `UPDATE customers SET full_name = ?, email = ?, phone = ? WHERE id = ?` | `CustomerRepository.update(id, name, email, phone)` (D6) |
| Dòng 9, 21–22: không có số thì ghi `NULL` | Hàm kiểm tra trả `phone = null`, `update` ghi `null` (AC-2) |
| Dòng 27: `WHERE phone = ? AND status = 1 AND id <> ?` | `existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)` (D5) |
| Dòng 36–40: có lỗi thì trả hết lỗi một lần, không ghi | `ValidationException` ném trước khi gọi `update` (D4) |
| Dòng 42–50: `id` không tồn tại thì ghi 0 dòng, vẫn chuyển hướng | **Lệch có chủ ý**: 404 (D2) |
| Email trùng: dựa vào `UNIQUE uq_customers_email`, không đọc kết quả `execute()` | **Lệch có chủ ý**: 400 `errors.email` như lúc tạo (Q4). [CẦN XÁC NHẬN] hành vi thật của legacy |

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`).

- Kho in-memory `InMemoryCustomerRepository` thêm thao tác `update` và hai truy vấn có loại trừ `id` (D5, D6). Cấu trúc `Map<Long, Customer>` và record `Customer` không đổi.
- Không có index. Hai truy vấn mới duyệt tuyến tính như `existsByEmail`.
- Khi có DB thật, ba method mới tương ứng với các câu SQL legacy đang chạy: `UPDATE ... WHERE id = ?` và `... AND id <> ?`. Không cần cột hay index mới ngoài những gì `source-legacy/sql/schema.sql` đã có (`uq_customers_email`, `idx_customers_phone`).

## BE change
Thư mục gốc: `source-be/src/main/java/com/example/crm/` và `source-be/src/test/java/com/example/crm/`. Không thêm package hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `repository/CustomerRepository.java` | Sửa | Thêm `boolean existsByEmailAndIdNot(String email, long id)`, `boolean existsByPhoneAndStatusAndIdNot(String phone, CustomerStatus status, long id)`, `Optional<Customer> update(long id, String name, String email, String phone)`. Mỗi method mới một dòng Javadoc như `insert`. Năm method cũ không đổi (D5, D6) |
| `repository/InMemoryCustomerRepository.java` | Sửa | Cài đặt ba method trên theo D5, D6 |
| `service/CustomerService.java` | Sửa | Tách khối kiểm tra của `create` thành hàm private dùng chung; thêm `update(long id, String name, String email, String phone)` (D4). `create`, `list`, `get` giữ chữ ký và hành vi |
| `api/UpdateCustomerRequest.java` | Mới | `public record UpdateCustomerRequest(String name, String email, String phone) {}`, Javadoc một dòng "Request body of PUT /api/customers/{id}." (D3) |
| `api/CustomerHandler.java` | Sửa | Trong `route`, sau nhánh `GET` của `BY_ID`: `byId.matches() && method.equals("PUT")` thì đọc `UpdateCustomerRequest` bằng `JSON.readValue` rồi `send(exchange, 200, service.update(Long.parseLong(byId.group(1)), body.name(), body.email(), body.phone()))`. Cập nhật Javadoc của class để liệt kê `PUT /api/customers/{id}`. `handle` và `send` không đổi |
| `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | Sửa | Thêm test cho `update` (ghi ba trường, giữ `id` và `status`, `id` không có thì `Optional.empty()` và kho không đổi) và cho hai truy vấn có loại trừ `id` |
| `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | Sửa | Thêm test `update` cho AC-1..AC-9. Khách hàng `INACTIVE` dựng bằng `repository.insert(..., CustomerStatus.INACTIVE)` rồi tạo `CustomerService` trên chính repository đó, như TC-25. Test cũ không sửa |
| `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | Thêm helper `put(String path, String json)` theo mẫu `post`, và test HTTP cho `PUT` (200, 400 kèm `errors`, 404, `status` trong body bị bỏ qua). Test cũ không sửa |

Không đổi: `domain/Customer.java`, `domain/CustomerStatus.java`, `service/PhoneNumbers.java`, `api/CreateCustomerRequest.java`, `api/Problem.java`, `error/*`, `App.java` (context `/api/customers` đã bao cả path con).

**Nhóm phải biên dịch cùng nhau** (gợi ý cho planner; sau mỗi task orchestrator chạy toàn bộ `be_test`, giới hạn 10 file/task). Mỗi nhóm chỉ thêm, nên test cũ pass sau từng nhóm:
- **BE-1** (3 file, độc lập): `CustomerRepository.java`, `InMemoryCustomerRepository.java`, `InMemoryCustomerRepositoryTest.java`. Interface và bản cài đặt duy nhất của nó phải đổi trong cùng task.
- **BE-2** (2 file, phụ thuộc BE-1): `CustomerService.java`, `CustomerServiceTest.java`.
- **BE-3** (3 file, phụ thuộc BE-2): `UpdateCustomerRequest.java`, `CustomerHandler.java`, `CustomerHandlerTest.java`.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/api/customerApi.js` | Sửa | Thêm `getCustomer(id, options)` và `updateCustomer(id, customer, options)`, mỗi hàm một dòng JSDoc (D8). `request`, `ApiError`, `listCustomers`, `createCustomer` không đổi |
| `src/components/customerTable.js` | Sửa | Header thêm `<th>Thao tác</th>` sau `<th>Trạng thái</th>`. Mỗi dòng thêm ô `<td><button type="button" data-edit-id="${escapeHtml(c.id)}">Sửa</button></td>` sau ô trạng thái (D9) |
| `src/components/customerEditForm.js` | Mới | `export function renderCustomerEditForm(customer, fieldErrors = {})` theo D10, JSDoc một dòng. Import `escapeHtml` bằng đường dẫn tương đối có đuôi `.js`. Nhãn tiếng Việt đặt trong component |
| `index.html` | Sửa | Thêm `<div id="edit-customer"></div>` giữa `#message` và `#customers`; thêm CSS `.field` (D12). `#create-form` không đổi |
| `src/main.js` | Sửa | Import `getCustomer`, `updateCustomer`, `renderCustomerEditForm`; lấy `editEl = document.getElementById('edit-customer')`; thêm ba xử lý sự kiện của D12. `refresh()` và submit handler của `#create-form` không đổi |
| `test/customerApi.test.js` | Sửa | Thêm test `updateCustomer` (AC-10, AC-11) và `getCustomer` (`GET /api/customers/7`, trả body; non-2xx ném `ApiError`) bằng `fakeFetch` có sẵn. Test cũ không sửa |
| `test/customerTable.test.js` | Sửa | **Sửa TC-36** đúng hai assertion nêu ở D9. Thêm test cho nút "Sửa" (AC-12). Các test khác không sửa |
| `test/customerEditForm.test.js` | Mới | Test `renderCustomerEditForm` bằng so chuỗi HTML (AC-13, AC-14) |

- `index.html` và `main.js` không có seam unit test vì `node:test` không có DOM. Hai file này được kiểm bằng review hoặc chạy tay (`01-analysis.md` → Impact).
- Gợi ý nhóm task, độc lập với BE về biên dịch. Sau mỗi task orchestrator chạy toàn bộ `fe_test`:
  - **FE-1** (2 file): `customerApi.js`, `customerApi.test.js`.
  - **FE-2** (2 file): `customerTable.js`, `customerTable.test.js`. TC-36 phải sửa **trong chính task này**, nếu không `fe_test` fail.
  - **FE-3** (4 file, phụ thuộc FE-1 và FE-2): `customerEditForm.js`, `customerEditForm.test.js`, `index.html`, `main.js`.

## Migration
Không có script migration, vì không có DB.

- **Thứ tự deploy: BE trước, FE sau.**
  - FE mới gọi BE cũ: `GET /api/customers/{id}` vẫn chạy nên form mở được, nhưng `PUT` rơi vào fallback 404. Nhân viên thấy "Không lưu được khách hàng."; không có dữ liệu nào bị ghi sai.
  - FE cũ gọi BE mới: vô hại, FE cũ không gọi endpoint mới.
- **Rollback:** gỡ FE trước rồi mới gỡ BE. Dữ liệu in-memory mất khi restart, nên không có dữ liệu nào cần đưa về trạng thái cũ.
- Sau khi merge, phase knowledge cập nhật:
  - `aiws/knowledge/api-inventory.md`: bảng endpoint, cột "Được FE gọi ở" của `GET /api/customers/{id}`.
  - `aiws/knowledge/system-map.md`: dòng "Sửa … Chưa có" và câu "Điều kiện `id <> ?` … không có ở hệ thống mới".
  - `aiws/knowledge/db-schema.md`: câu "Hiện chưa có update/delete".
  - `aiws/knowledge/conventions.md`: mục Frontend (component form, lỗi theo trường).

## Rủi ro
- **R1: Tách hàm kiểm tra làm đổi hành vi của `create`.** Giảm thiểu: `create` giữ chữ ký; TC-13..TC-32 và các test cũ không mã TC chạy lại nguyên vẹn sau BE-2; D4 cấm đổi thứ tự kiểm tra và thông điệp.
- **R2: Developer hoặc reviewer "sửa" các hành vi của legacy ở D7.** Giảm thiểu: D7 ghi rõ từng hành vi kèm AC; mỗi hành vi nên có test case riêng (AC-2, AC-3, AC-6 biến thể thứ ba).
- **R3: Sửa đồng thời (Q7).** Yêu cầu ghi sau thắng, và kiểm tra trùng rồi mới ghi không nguyên tử: hai request đồng thời có thể cùng lấy một số hoặc một email. Chấp nhận như hiện trạng của `create` và như legacy (`SELECT` rồi `UPDATE`, không khoá). D11 chỉ thu hẹp, không loại bỏ, khả năng ghi đè thay đổi của người khác; phát hiện xung đột (ETag, version) nằm ngoài phạm vi.
- **R4: API không có xác thực** (`aiws/knowledge/api-inventory.md` → Quy ước → Auth). Ai gọi được API thì sửa được thông tin của mọi khách hàng. Đây là hiện trạng của `POST`; REQ-002 không làm khác đi, nhưng thêm một thao tác ghi lên dữ liệu đang có.
- **R5: PII.** Họ tên, email, số điện thoại là dữ liệu cá nhân. Chúng chỉ nằm trong body, không nằm trong URL. BE không log gì; thông điệp lỗi và message của `NotFoundException` không chứa giá trị người dùng nhập, chỉ chứa `id`.
- **R6: XSS qua giá trị điền sẵn.** Giá trị khách hàng được đặt vào thuộc tính `value` và `data-*`. Giảm thiểu: mọi giá trị động qua `escapeHtml` (escape cả `"` và `'`); AC-13 có biến thể kiểm tra.
- **R7: Sửa test của REQ-001 (TC-36).** Thay đổi có chủ ý, giới hạn ở hai assertion (D9), và phải làm trong cùng task với `customerTable.js`.
- **R8: Hiệu năng.** Hai truy vấn mới là O(n) như `existsByEmail`; mỗi lần mở form thêm một `GET`. Đủ cho kho in-memory.
- **R9: Thông điệp lỗi tiếng Anh ngay dưới ô nhập có nhãn tiếng Việt** (ví dụ `must not be blank`). Giống hiện trạng của form thêm (Q5).
- **R10: Hành vi biên kế thừa từ handler hiện có, không sửa trong REQ-002** để không đổi hành vi của `GET` và `POST` ngoài phạm vi. Test spec không nên đặt kỳ vọng khác cho `PUT`:
  - `id` gồm toàn chữ số nhưng vượt `long` (ví dụ 20 chữ số): `Long.parseLong` trong `CustomerHandler.route` ném `NumberFormatException`, nhánh `RuntimeException` của `handle` trả 500, như `GET /api/customers/{id}`.
  - Body là JSON `null`: `route` gọi `body.name()` ngay sau `JSON.readValue`, nên trả 500 như `POST /api/customers`. [CẦN XÁC NHẬN] suy ra từ code, chưa có test nào kiểm chứng.
- **R11: `main.js` và `index.html` không có unit test.** Giảm thiểu: logic dựng form và đặt lỗi nằm hết trong component thuần (D10); `main.js` chỉ nối sự kiện với API và component. Phần còn lại kiểm bằng review hoặc chạy tay theo D12.
- **R12: Deploy sai thứ tự.** FE mới trên BE cũ không lưu được nhưng báo lỗi rõ, không mất dữ liệu. Xem Migration.

## Quyết định cần duyệt
- **Endpoint mới `PUT /api/customers/{id}`** thay thế toàn bộ ba trường, trả 200 kèm `Customer` (Q1, D1). Chỉ thêm, không phá tương thích.
- **`id` không tồn tại trả 404**, là điểm lệch có chủ ý so với legacy (Q2, D2). Thứ tự: JSON hỏng (400) → không có khách hàng (404) → dữ liệu sai (400).
- **Giữ nguyên có chủ ý bốn hành vi của legacy** (Q3, D7):
  - (a) Không gửi số thì số đang có bị xoá.
  - (b) Khách hàng `INACTIVE` vẫn sửa được và vẫn `INACTIVE`.
  - (c) Khách hàng `INACTIVE` có số đã được cấp lại cho khách hàng `ACTIVE` khác thì không lưu được cho tới khi đổi hoặc xoá số, kể cả khi chỉ sửa họ tên.
  - (d) Mọi lần lưu đều kiểm tra lại số; số theo quy tắc cũ phải sửa thì mới lưu được.
- **Quy tắc kiểm tra là quy tắc của `POST /api/customers` ở hệ thống mới** (Q4, D4), kể cả những chỗ nó khác legacy. Email trùng khách hàng khác trả 400; legacy thì dựa vào `UNIQUE` của DB.
- **Lỗi theo trường hiện ngay dưới ô nhập, bằng nguyên văn thông điệp tiếng Anh của API** (Q5, D10). Nếu chỉ cần cách hẹp (dòng `field: msg; ...` trong `#message` như form thêm) thì bỏ AC-14 và phần hiển thị lỗi của D10.
- **Giao diện** (Q6, D9..D12). [CẦN XÁC NHẬN] repo legacy không có màn hình sửa nào để theo, nên bố cục dưới đây là đề xuất:
  - Cột thứ sáu "Thao tác" với nút "Sửa" ở mỗi dòng.
  - Form sửa riêng nằm giữa dòng thông báo và danh sách, tiêu đề "Sửa khách hàng #{id}", ba ô có nhãn "Họ tên", "Email", "Điện thoại", nút "Lưu" và "Huỷ".
  - Ô điện thoại hiện số dạng API trả (`0912345678`), không định dạng 4-3-3.
  - Form được điền bằng `GET /api/customers/{id}` lúc bấm "Sửa", không lấy từ danh sách đã tải (D11).
  - Form thêm khách hàng và cách hiển thị lỗi của nó không đổi.
- **Sửa test TC-36 của REQ-001** trong `source-fe/test/customerTable.test.js`: tiêu đề có thêm `<th>Thao tác</th>` và mỗi dòng có 6 `<td>` (D9).
- **Thêm public API Java và file mới, không đổi cấu trúc thư mục hay package** (D3..D6):
  - `CustomerRepository` thêm `update`, `existsByEmailAndIdNot`, `existsByPhoneAndStatusAndIdNot`. Mọi bản cài đặt interface phải có ba method này; hiện chỉ có `InMemoryCustomerRepository`.
  - `CustomerService` thêm `update`; khối kiểm tra của `create` được tách thành hàm private dùng chung, hành vi của `create` không đổi.
  - File mới: `api/UpdateCustomerRequest.java`, `src/components/customerEditForm.js`, `test/customerEditForm.test.js`.
- **Chấp nhận sửa đồng thời theo kiểu ghi sau thắng và kiểm tra trùng không nguyên tử** (Q7, R3).
- **Mã TC** (Q8): đề xuất test-designer đánh số tiếp từ TC-44, vì REQ-002 thêm test vào chính các file đang có TC-1..TC-43.
- **Thứ tự deploy BE → FE**, rollback theo chiều ngược lại (Migration).
