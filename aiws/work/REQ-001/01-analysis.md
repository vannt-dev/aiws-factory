# REQ-001 — Phân tích requirement

## Mục tiêu
Bộ phận CSKH cần lưu và xem số điện thoại khách hàng trên hệ thống mới (`source-be` + `source-fe`). Hiện chỉ hệ thống cũ có dữ liệu này (`aiws/knowledge/system-map.md` → Legacy → Dữ liệu: `phone` "Chưa có ở hệ thống mới").
Dữ liệu `customers` sẽ được migrate từ legacy (`source-legacy/README.md`), nên hệ thống mới phải xử lý số điện thoại **giống hệt** legacy ở bốn điểm:
- chuẩn hoá: `phone_normalize`
- quy tắc hợp lệ BR-07: `phone_is_valid`
- quy tắc trùng số BR-09: `source-legacy/customer_save.php`
- định dạng hiển thị: `phone_format` + `source-legacy/customer_list.php`

Các hàm `phone_*` đều nằm trong `source-legacy/lib/phone.php`.

Đo thành công:
- Cùng một đầu vào, hệ thống mới cho cùng kết quả chấp nhận/từ chối, cùng giá trị lưu và cùng chuỗi hiển thị như legacy.
- Giá trị lưu có đúng dạng chuẩn hoá của legacy (`customers.phone`, `source-legacy/sql/schema.sql`), nên migrate sau này không cần chuyển đổi.

## Acceptance criteria
Truy vết:
- R1..R4 là bốn gạch đầu dòng trong mục "Yêu cầu" của `requirements/REQ-001-customer-phone.md`, theo đúng thứ tự.
- RB là mục "Bối cảnh" ("giống hệt hệ thống cũ").
- Trong các AC dưới đây, "lưu" nghĩa là giá trị `phone` trả về trong response 201 và trong các lần `GET` sau đó.

**Thêm khách hàng: `POST /api/customers` (BE)**
- AC-1: Given `name` và `email` hợp lệ, when `POST /api/customers` không có số điện thoại (thiếu field `phone`, `phone = null`, `phone = ""` hoặc chỉ gồm dấu cách như `"   "`), then trả 201 và khách hàng được tạo với `phone = null`. (R1; `customer_save.php`: `trim` rồi so với `''`)
- AC-2: Given chưa có khách hàng đang hoạt động nào dùng số đó, when `POST` với một số di động hợp lệ (10 chữ số, đầu số `03`, `05`, `07`, `08` hoặc `09`; ví dụ `0312345678`, `0512345678`, `0712345678`, `0812345678`, `0912345678`), then trả 201 và lưu đúng số đó. (R1, RB; `phone_is_valid`, BR-07)
- AC-3: Given chưa có khách hàng đang hoạt động nào dùng số đó, when `POST` với số cố định hợp lệ (11 chữ số, đầu số `02`, ví dụ `02438251234`), then trả 201 và lưu `02438251234`. (R1, RB; `phone_is_valid`)
- AC-4: Given `name` và `email` hợp lệ, when `POST` với số có dấu cách thừa đầu cuối và các ký tự phân cách (dấu cách, `.`, `-`, `(`, `)`), ví dụ `" 0912.345-678 "` hoặc `"(0912) 345 678"`, then trả 201 và lưu dạng đã chuẩn hoá `0912345678`. (RB; `phone_normalize`)
- AC-5: Given `name` và `email` hợp lệ, when `POST` với số bắt đầu bằng `+84` (sau khi bỏ ký tự phân cách), then `+84` được đổi thành `0` và kết quả được lưu. Ví dụ: `"+84 912.345.678"` → `0912345678`; `"(+84) 912-345-678"` → `0912345678`; `"+84 24 3825 1234"` → `02438251234`. (RB; `phone_normalize`)
- AC-6: Given `name` và `email` hợp lệ, when `POST` với số bắt đầu bằng `84` (không có `+`) và dài đúng 11 ký tự sau khi bỏ ký tự phân cách, ví dụ `"84 912 345 678"`, then `84` được đổi thành `0` và lưu `0912345678`. (RB; `phone_normalize`)
- AC-7: Given `name` và `email` hợp lệ, when `POST` với số sai đầu số hoặc sai độ dài sau chuẩn hoá, then trả 400 `application/problem+json`, `errors.phone` là thông điệp "số không hợp lệ", và không có khách hàng nào được tạo (số phần tử của `GET /api/customers` không đổi). Ví dụ:
  - sai đầu số: `0123456789`, `01234567890` (đầu số di động cũ trước BR-07), `0412345678`, `0612345678`
  - sai độ dài: `091234567`, `09123456789`, `0243825123`, `024382512345`

  (R2, RB; `phone_is_valid`)
- AC-8: Given `name` và `email` hợp lệ, when `POST` với số chứa ký tự không nằm trong danh sách được bỏ khi chuẩn hoá (ví dụ `0912a45678`, `0912/345/678`, `0912_345_678`, `+0912345678`), then trả 400, `errors.phone` là thông điệp "số không hợp lệ", và không tạo khách hàng. (R2, RB; `phone_normalize` + `phone_is_valid`)
- AC-9: Given `name` và `email` hợp lệ, when `POST` với số có mã quốc gia nhưng không khớp quy tắc chuyển đổi của legacy, then trả 400, `errors.phone` là thông điệp "số không hợp lệ", và không tạo khách hàng. Ba trường hợp:
  - `"84 24 3825 1234"`: 12 ký tự nên không đổi `84`
  - `"8491234567"`: 10 ký tự nên không đổi `84`
  - `"+84 0912 345 678"`: bị đổi thành `00912345678`

  (R2, RB; `phone_normalize`)
- AC-10: Given `name` và `email` hợp lệ, when `POST` với `phone` chỉ gồm ký tự phân cách (ví dụ `"-"`, `"()"`, `" . "`), then trả 400, `errors.phone` là thông điệp "số không hợp lệ", và không tạo khách hàng. Giá trị này **không** được coi là "không nhập". (R2, RB; `customer_save.php` kiểm tra rỗng sau `trim` và **trước** chuẩn hoá)
- AC-11: Given đã có khách hàng **đang hoạt động** (`ACTIVE`) với số `0912345678`, when `POST` khách hàng mới với số viết khác nhưng trùng sau chuẩn hoá (ví dụ `"+84 912 345 678"`), then kết quả là:
  - trả 400 `application/problem+json`
  - `errors.phone` là thông điệp "số đã được khách hàng khác sử dụng", khác với thông điệp "số không hợp lệ"
  - không tạo khách hàng

  (R2, RB; BR-09, `customer_save.php`: `WHERE phone = ? AND status = 1`)
- AC-12: Given kho dữ liệu đã có một khách hàng **ngừng hoạt động** (`INACTIVE`) với số `0912345678` và không có khách hàng đang hoạt động nào dùng số này, when `POST` khách hàng mới với `phone = "0912345678"`, then trả 201 và lưu `0912345678`. (RB; BR-09: khách hàng ngừng hoạt động không giữ số)
- AC-13: Given đã có khách hàng đang hoạt động dùng số `0912345678`, when `POST` với `name` trống, `email = "x"` và `phone = "0912345678"`, then trả 400 và `errors` có đủ ba key `name`, `email`, `phone`. Kiểm tra số điện thoại chạy độc lập với lỗi của các field khác. (R2; `customer_save.php` gom mọi lỗi rồi trả một lần)

**Đọc khách hàng (BE)**
- AC-14: Given có khách hàng A với số `0912345678` và khách hàng B không có số, when `GET /api/customers`, then mỗi phần tử có field `phone`: A là `"0912345678"` (dạng chuẩn hoá, không định dạng hiển thị), B là `null`. (R3)
- AC-15: Given có khách hàng với số `02438251234`, when `GET /api/customers/{id}` của khách hàng đó, then response có `phone = "02438251234"`. (R3)

**Gọi API (FE, `source-fe/src/api/customerApi.js`)**
- AC-16: Given nhân viên nhập họ tên, email và số điện thoại, when gọi `createCustomer({ name, email, phone: '0912 345 678' })`, then request `POST /api/customers` có body JSON chứa `phone` với đúng giá trị đã nhập `'0912 345 678'`. FE không tự chuẩn hoá hay kiểm tra. (R1)
- AC-17: Given API trả 400 Problem có `errors.phone`, when gọi `createCustomer`, then hàm ném `ApiError` có `fieldErrors.phone` bằng đúng thông điệp của API. Nhờ đó `#message` hiển thị `phone: <thông điệp>` theo cơ chế sẵn có của `source-fe/src/main.js`. (R2)

**Danh sách khách hàng (FE, `renderCustomerTable`)**
- AC-18: Given danh sách có ít nhất một khách hàng, when `renderCustomerTable`, then bảng có cột tiêu đề "Điện thoại" nằm giữa "Email" và "Trạng thái" (thứ tự `ID, Họ tên, Email, Điện thoại, Trạng thái` như `customer_list.php`), và mỗi dòng có đúng một ô điện thoại ở vị trí tương ứng. (R4, RB)
- AC-19: Given khách hàng có `phone` dài 10 ký tự, ví dụ `0912345678`, when `renderCustomerTable`, then ô điện thoại hiển thị dạng 4-3-3: `0912 345 678`. (R4, RB; `phone_format`)
- AC-20: Given khách hàng có `phone` dài 11 ký tự, when `renderCustomerTable`, then ô điện thoại hiển thị dạng 3-4-4. Ví dụ `02438251234` → `024 3825 1234`, và `01234567890` (dữ liệu cũ, không có đầu số `02`) → `012 3456 7890`. Định dạng chỉ dựa vào độ dài, không dựa vào đầu số. (R4, RB; `phone_format`)
- AC-21: Given khách hàng có `phone` là `null`, là `""` hoặc không có field `phone`, when `renderCustomerTable`, then ô điện thoại hiển thị `—` (U+2014). (R4, RB; `customer_list.php` dòng 19)
- AC-22: Given khách hàng có `phone` với độ dài khác 10 và 11, ví dụ `091234567` hoặc `<b>1</b>`, when `renderCustomerTable`, then ô điện thoại hiển thị nguyên giá trị (`091234567`) và giá trị đã được escape HTML (`&lt;b&gt;1&lt;/b&gt;`, không có thẻ `<b>`). (R4, RB; `phone_format` trả nguyên chuỗi; escape theo convention FE)

## Impact
- **Module (BE)**, `source-be/src/main/java/com/example/crm/`:
  - `domain/Customer.java`: thêm component `phone` (`String`, có thể `null`). Record thay đổi constructor, nên mọi chỗ gọi `new Customer(...)` đều bị ảnh hưởng (hiện chỉ có `InMemoryCustomerRepository.insert`).
  - `service/CustomerService.java`: `create(String name, String email)` phải nhận thêm số điện thoại. Hàm này cũng cần thêm chuẩn hoá, kiểm tra BR-07 và kiểm tra trùng BR-09, rồi gom vào `errors` với key `phone` theo mẫu `LinkedHashMap` + `ValidationException` hiện có.
  - Quy tắc số điện thoại (chuẩn hoá, hợp lệ) là phần **mới** ở BE. Vị trí đặt (class mới trong `service` hoặc `domain`) do architect quyết.
  - `repository/CustomerRepository.java` và `repository/InMemoryCustomerRepository.java`:
    - `insert(String name, String email)` phải lưu thêm `phone`.
    - Cần thêm truy vấn "có khách hàng `ACTIVE` nào dùng số X không", tương đương `SELECT id FROM customers WHERE phone = ? AND status = 1` của legacy.
    - Để kiểm chứng AC-12, repository (hoặc test double) phải chứa được khách hàng `INACTIVE`. Hiện `insert` luôn gán `CustomerStatus.ACTIVE`.
  - `App.java`: `main` seed hai khách hàng bằng `service.create(name, email)`, nên phải cập nhật theo signature mới.
  - Test hiện có gọi `create(name, email)` và sẽ phải cập nhật call site:
    - `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java`
    - `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` (trong `@BeforeEach`)

    Test mới đặt mã TC theo `aiws/knowledge/conventions.md` → Mã TC.
- **API**, `aiws/knowledge/api-inventory.md`:
  - `POST /api/customers`:
    - `api/CreateCustomerRequest.java` thêm `phone` (tuỳ chọn).
    - `api/CustomerHandler.java:route` truyền `body.phone()` sang service.
    - Response 201 có thêm `phone`.
    - Lỗi 400 có thêm key `phone` trong `errors`. Format `Problem` và bảng map exception ở `CustomerHandler.handle` giữ nguyên.
  - `GET /api/customers` và `GET /api/customers/{id}`: schema `Customer` có thêm `phone` (string hoặc `null`). Đây là thay đổi dạng thêm field, tương thích ngược với FE hiện tại.
  - Sau khi merge, cần cập nhật `aiws/knowledge/api-inventory.md`, `glossary.md` (hiện ghi "Chỉ có ở legacy") và `system-map.md` ở phase knowledge.
- **DB**:
  - Hệ thống mới **không có DB** (`aiws/knowledge/db-schema.md`). Dữ liệu nằm trong `InMemoryCustomerRepository`, nên không có migration.
  - Chỉ tham chiếu để tương thích dữ liệu: legacy `customers.phone VARCHAR(11) NULL` lưu dạng chuẩn hoá (chỉ chữ số, bắt đầu bằng `0`) và có `KEY idx_customers_phone` (`source-legacy/sql/schema.sql`). Giá trị lưu ở hệ thống mới phải cùng dạng này.
- **FE**, `source-fe/`:
  - `src/components/customerTable.js`: thêm cột "Điện thoại" và logic định dạng tương đương `phone_format`. Đặt logic ngay trong component hay tách ra `src/utils/` do architect quyết.
  - `index.html`: thêm ô nhập số điện thoại vào `#create-form`, không `required`.
  - `src/main.js`: submit handler hiện chỉ gửi `createCustomer({ name: data.name, email: data.email })`, nên phải truyền thêm `phone`.
  - `index.html` và `main.js` phụ thuộc DOM và không có seam unit test (`node:test` không có DOM). Phần ô nhập và việc truyền `phone` được kiểm chứng bằng review hoặc chạy tay. AC-16 và AC-17 kiểm chứng tại seam `customerApi.js`.
  - `src/api/customerApi.js`: dự kiến **không cần sửa**, vì `createCustomer` gửi nguyên object và `ApiError` đã đọc `problem.errors` vào `fieldErrors`.
  - Test: bổ sung test vào `test/customerTable.test.js` và `test/customerApi.test.js`. Các test hiện có không assert tiêu đề cột nên dự kiến không vỡ.

## Reuse
- **Đặc tả tham chiếu** (port logic sang Java/JS, không gọi trực tiếp):
  - `source-legacy/lib/phone.php`: `phone_normalize`, `phone_is_valid` (regex `^(0[35789][0-9]{8}|02[0-9]{9})$`), `phone_format`.
  - `source-legacy/customer_save.php`: điều kiện "không nhập" (`trim` rồi `=== ''`), thứ tự kiểm tra (hợp lệ trước, trùng sau), truy vấn trùng BR-09.
  - `source-legacy/customer_list.php`: thứ tự cột và `—` khi trống.
- **BE**:
  - `CustomerService.create`: mẫu `trim()`, coi `null` là rỗng, gom lỗi vào `LinkedHashMap` rồi ném `ValidationException` một lần. Thêm key `phone` theo đúng mẫu này.
  - `error/ValidationException.java` + `CustomerHandler.handle`: đã map sang 400 Problem có `errors`, không cần sửa.
  - `CustomerRepository.existsByEmail` / `InMemoryCustomerRepository.existsByEmail`: mẫu cho truy vấn tồn tại theo số điện thoại (thêm điều kiện `status == ACTIVE`).
  - `domain/CustomerStatus.java` (`ACTIVE`, `INACTIVE`): dùng cho BR-09.
  - Test: `CustomerHandlerTest` dùng `App.start(0, service)` + `HttpClient`; `CustomerServiceTest` dùng `InMemoryCustomerRepository` thật.
- **FE**:
  - `src/utils/escapeHtml.js`: `null`/`undefined` thành `''`, dùng cho ô điện thoại.
  - Mẫu `STATUS_LABELS[c.status] ?? c.status` trong `customerTable.js`: BE trả giá trị thô, FE chuyển sang dạng hiển thị. Định dạng số điện thoại theo cùng cách.
  - `ApiError.fieldErrors` + khối `catch` trong `src/main.js` (ghép `field: msg; ...` vào `#message`): hiển thị lỗi `phone` mà không cần code mới.
  - Test: `fakeFetch` trong `test/customerApi.test.js`; so chuỗi HTML bằng `assert.match` trong `test/customerTable.test.js`.

## Ngoài phạm vi
- Sửa khách hàng đã có (requirement → Ngoài phạm vi). Vì vậy không cần loại trừ chính khách hàng đang sửa khi kiểm tra trùng: điều kiện `id <> ?` của legacy chỉ có ý nghĩa khi sửa.
- Migrate dữ liệu thật từ legacy (requirement → Ngoài phạm vi).
- API hay màn hình đổi trạng thái khách hàng (ngừng hoạt động). BR-09 vẫn được hiện thực và kiểm chứng ở tầng service/repository với dữ liệu `INACTIVE` dựng sẵn. **Không** thêm endpoint chỉ để phục vụ test.
- Các khác biệt khác với legacy đã ghi trong `aiws/knowledge/system-map.md` → Legacy → Hành vi. REQ này không xử lý chúng:
  - quy tắc kiểm tra email (`filter_var` so với regex)
  - đơn vị đo độ dài họ tên (byte so với UTF-16)
  - giới hạn 150 ký tự của email
  - `created_at`
  - ngôn ngữ và format body lỗi của legacy
- DB thật hoặc lưu trữ bền vững. Dữ liệu vẫn nằm trong bộ nhớ.
- Tìm kiếm hay lọc theo số điện thoại, màn hình chi tiết khách hàng ở FE, và số điện thoại cho dữ liệu seed trong `App.main` (không bắt buộc).

## Câu hỏi mở
- [non-blocking] Q1: `phone` trong API ở dạng nào? Giả định:
  - API trả giá trị **đã chuẩn hoá, chưa định dạng** (`"0912345678"`), FE định dạng khi hiển thị. Cách này giống legacy (lưu chuẩn hoá, định dạng lúc hiển thị) và giống cách FE đang dịch `status`.
  - Khách hàng không có số thì field `phone` vẫn có mặt với giá trị `null`. FE vẫn xử lý được trường hợp thiếu field (AC-21).
- [non-blocking] Q2: Thông điệp lỗi viết bằng ngôn ngữ nào? Giả định theo convention của hệ thống mới (`aiws/knowledge/conventions.md` → Backend → Validation): key `phone`, tiếng Anh, chữ thường, dạng `must ...` / `is ...`.
  - Không dùng nguyên văn tiếng Việt của legacy (`Số điện thoại không hợp lệ`, `Số điện thoại đã được khách hàng khác sử dụng`), vì "giống hệt" trong requirement áp dụng cho chuẩn hoá, hợp lệ, trùng và hiển thị, không áp dụng cho câu chữ thông điệp.
  - Architect chốt câu chữ. AC chỉ yêu cầu lỗi "không hợp lệ" và lỗi "trùng" có hai thông điệp khác nhau.
- [non-blocking] Q3: Nhãn và vị trí cột, ô nhập? Giả định:
  - Cột dùng nhãn legacy "Điện thoại", đặt giữa Email và Trạng thái như `customer_list.php`.
  - Ô nhập trong form có placeholder "Điện thoại" và không bắt buộc.
- [non-blocking] Q4: Có giữ nguyên các hành vi "lạ" của legacy không? Giả định **giữ nguyên có chủ ý** vì requirement yêu cầu "giống hệt". Developer và reviewer không được "sửa" các hành vi sau:
  - (a) Chuỗi chỉ gồm ký tự phân cách bị báo không hợp lệ, không được coi là "không nhập" (AC-10).
  - (b) `84` không có `+` chỉ được đổi khi đủ 11 ký tự. Vì vậy `84 24 3825 1234` không hợp lệ, trong khi `+84 24 3825 1234` hợp lệ (AC-5, AC-9).
  - (c) `+84 0...` thành `00...` và không hợp lệ (AC-9).
  - (d) Hiển thị chỉ dựa vào độ dài, không dựa vào đầu số. Độ dài khác 10 và 11 hiển thị nguyên văn (AC-20, AC-22).

  Nếu muốn khác, người duyệt cần nói ở bước duyệt design.
- [non-blocking] Q5: Ký tự khoảng trắng nào được bỏ? [CẦN XÁC NHẬN] Legacy dùng `trim()` của PHP (space, `\t`, `\n`, `\r`, `\0`, `\x0B`) rồi bỏ `\s` của PCRE không có cờ `u`. Tập này khác `String.trim()` / `\s` của Java ở vài ký tự điều khiển (ví dụ `\f`) và có thể khác với ký tự Unicode như NBSP, tuỳ locale của server legacy.
  - Giả định: hiện thực theo tập ký tự ASCII của PHP. Khoảng trắng Unicode (NBSP...) không bị bỏ nên số chứa nó không hợp lệ.
  - Không đưa vào AC vì repo không xác minh được cấu hình PCRE hay locale của server legacy.
- [non-blocking] Q6: Kiểm chứng AC-12 bằng cách nào? Hệ thống mới không tạo được khách hàng `INACTIVE` qua API hay service. Giả định test dựng dữ liệu `INACTIVE` ở tầng repository. Cách làm do architect và test-designer quyết theo convention không dùng mock framework, ví dụ cho repository lưu `Customer` có sẵn `status`, hoặc dùng một test double viết tay.
- [non-blocking] Q7: Có cần đảm bảo tính duy nhất khi hai request ghi đồng thời? Kiểm tra trùng rồi mới `insert` không phải thao tác nguyên tử. Điều này giống kiểm tra trùng email hiện có (`CustomerService.create`) và giống legacy (`SELECT` rồi `INSERT`, không khoá). Giả định chấp nhận như hiện trạng, không yêu cầu đảm bảo tính duy nhất khi ghi đồng thời.
