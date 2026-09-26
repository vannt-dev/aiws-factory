# REQ-001 — Thiết kế

## Tổng quan
Số điện thoại là một field tuỳ chọn mới của khách hàng. Toàn bộ quy tắc (chuẩn hoá, BR-07, BR-09) chạy ở BE, còn FE chỉ lo định dạng khi hiển thị. Đây là cách legacy đang làm: lưu dạng chuẩn hoá, định dạng lúc render (`source-legacy/lib/phone.php`, `customer_list.php`). Thiết kế này xử lý đủ AC-1..AC-22 trong `01-analysis.md`.

- **BE: quy tắc số điện thoại (AC-1..AC-10).** Lớp mới `service/PhoneNumbers` port 1-1 các hàm `phone_normalize` và `phone_is_valid`, kể cả tập ký tự của `trim()` PHP (D1, D2).
- **BE: kiểm tra khi tạo (AC-11..AC-13).** `CustomerService.create` kiểm tra số điện thoại theo đúng thứ tự của `customer_save.php`: rỗng → chuẩn hoá → hợp lệ → trùng với khách hàng `ACTIVE` (D3, D5). Lỗi được gom chung với lỗi `name`/`email`.
- **BE: lưu và đọc (AC-12, AC-14, AC-15).** `Customer` có thêm component `phone`. Repository lưu được `phone` và `status`, và có thêm truy vấn `existsByPhoneAndStatus` (D5..D7). JSON luôn có `phone`, là chuỗi đã chuẩn hoá hoặc `null` (D4).
- **FE (AC-16..AC-22).**
  - `customerApi.js` giữ nguyên, vì hàm này đã gửi nguyên object và đã đọc `errors`.
  - Form có thêm ô `phone`, và `main.js` gửi giá trị thô.
  - Bảng có thêm cột "Điện thoại", định dạng qua util mới `formatPhone` (port `phone_format`). Ô trống hiển thị `—` (D9, D10).
- **Không có DB, không có migration.** HTTP API chỉ **thêm field**, nên vẫn tương thích ngược.

Chi tiết schema nằm trong `api-contract.yaml`. Đây là vòng thiết kế đầu tiên, chưa có feedback reject.

## Quyết định chính
- D1: Quy tắc số điện thoại ở BE nằm trong lớp mới `com.example.crm.service.PhoneNumbers`. Lớp này package-private, `final`, có constructor `private` và ba hàm `static`: `trim`, `normalize`, `isValid`. Đây là bản port của `source-legacy/lib/phone.php`.
  - Lý do:
    - Theo `aiws/knowledge/conventions.md` → Layering, package `service` chứa toàn bộ quy tắc nghiệp vụ.
    - Tách thành lớp riêng giúp test trực tiếp từng quy tắc legacy bằng bảng đầu vào → đầu ra, không cần repository, và giữ `create` gọn.
    - Để package-private thì không mở rộng public API. `CustomerService` và test dùng cùng package.
  - Đã cân nhắc:
    - Value object `domain/PhoneNumber` (record): loại. `domain` hiện chỉ có record/enum không chứa logic. Ngoài ra Jackson sẽ serialize record thành object, trừ khi thêm `@JsonValue`, nghĩa là đổi format JSON.
    - Viết thẳng trong `CustomerService.create`: loại, vì hàm phình to và không test được chuẩn hoá tách khỏi repository.
    - Đặt ở `domain`: loại, vì validation thuộc `service`.
- D2: Port **đúng từng ký tự** hành vi PHP để đạt "giống hệt" (RB, Q4, Q5):
  - `trim(raw)`: `null` → `""`. Bỏ ở **hai đầu** các ký tự thuộc tập của `trim()` PHP: space, `\t`, `\n`, `\r`, NUL (U+0000), VT (U+000B).
    - **Không** dùng `String.trim()` (bỏ mọi ký tự ≤ U+0020, kể cả `\f`) hay `String.strip()` (bỏ khoảng trắng Unicode).
    - Nếu viết bằng regex thì neo bằng `\A` và `\z`, không dùng `^`/`$`. `$` của Java khớp được trước ký tự kết thúc dòng cuối chuỗi.
  - `normalize(raw)`:
    1. `trim(raw)`. Legacy trim hai lần (`customer_save.php` rồi `phone_normalize`), việc này không đổi kết quả.
    2. Xoá **mọi** ký tự thuộc lớp `[ \t\n\x0B\f\r.()-]`. Lớp này đúng bằng `[\s.\-()]` của PCRE không cờ `u` (PCRE ≥ 8.34 tính VT vào `\s`), và cũng đúng bằng `\s` mặc định của Java. Ghi tường minh để không ai bật `UNICODE_CHARACTER_CLASS`.
    3. Nếu bắt đầu bằng `+84`: đổi thành `"0" + s.substring(3)`. `"+84"` đứng một mình cho ra `"0"`, giống PHP 5.6 (`'0' . false`).
    4. Ngược lại, nếu bắt đầu bằng `84` **và** `length() == 11`: đổi thành `"0" + s.substring(2)`.
    5. Mọi trường hợp khác giữ nguyên, kể cả ký tự lạ như `/`, `_`, chữ cái, NBSP.
  - `isValid(normalized)`: `Pattern.compile("0[35789][0-9]{8}|02[0-9]{9}").matcher(s).matches()`. Dùng `[0-9]` để chỉ nhận chữ số ASCII.
  - Ghi chú về độ dài:
    - PHP `strlen` đếm byte, Java `length()` đếm đơn vị UTF-16. Hai cách chỉ lệch khi chuỗi có ký tự ngoài ASCII.
    - Khi đó ký tự lạ vẫn còn sau chuẩn hoá, nên cả hai hệ thống đều báo "không hợp lệ" với cùng thông điệp. Hành vi nhìn thấy được vì vậy vẫn giống hệt.
  - Lý do: requirement yêu cầu "giống hệt", và AC-1/AC-10 tách nhau đúng ở tập ký tự trim. Ví dụ `"\f"`: `String.trim()` cho `""`, tức "không nhập". PHP giữ `"\f"`, nên legacy báo "không hợp lệ".
  - Đã cân nhắc: dùng `String.trim()`/`strip()` hoặc lớp ký tự Unicode (`\p{Space}`) cho gọn. Loại, vì lệch legacy (Q5).
- D3: `CustomerService.create(String name, String email, String phone)` kiểm tra số điện thoại **sau** `name`/`email`, theo thứ tự của `customer_save.php`:
  1. `trimmedPhone = PhoneNumbers.trim(phone)`.
  2. Nếu `trimmedPhone.isEmpty()`: không có số, lưu `phone = null` (AC-1).
  3. Ngược lại, `normalized = PhoneNumbers.normalize(trimmedPhone)`.
  4. Nếu `!isValid(normalized)`: `errors.put("phone", "must be a valid phone number")` (AC-7..AC-10).
  5. Ngược lại, nếu `repository.existsByPhoneAndStatus(normalized, CustomerStatus.ACTIVE)`: `errors.put("phone", "is already used by another customer")` (AC-11).
  6. Nếu không có lỗi nào: lưu `normalized` (AC-2..AC-6, AC-12).

  Quy tắc đi kèm:
  - Nhánh phone chạy **bất kể** `name`/`email` có lỗi hay không (AC-13).
  - Truy vấn trùng chỉ chạy khi số hợp lệ.
  - Thông điệp viết thẳng trong code như các thông điệp hiện có, không lặp lại giá trị người dùng nhập.

  - Lý do: giống legacy về thứ tự và điều kiện. Theo mẫu `LinkedHashMap` + `ValidationException` hiện có. Thông điệp theo `conventions.md` → Validation: tiếng Anh, chữ thường, dạng `must ...`/`is ...` (Q2).
  - Đã cân nhắc:
    - Kiểm tra ở FE: loại. AC-16 cấm, và nếu FE cũng kiểm tra thì có hai nguồn quy tắc có thể lệch nhau.
    - Thông điệp tiếng Việt của legacy: loại, vì lệch convention BE (Q2).
- D4: API trả `phone` ở dạng **đã chuẩn hoá, chưa định dạng** (`"0912345678"`). Field luôn có mặt trong `Customer`, giá trị `null` khi không có số (Q1).
  - Lý do:
    - Legacy lưu dạng chuẩn hoá và chỉ định dạng khi hiển thị.
    - FE đã có sẵn mẫu "BE trả giá trị thô, FE dịch sang dạng hiển thị" (`STATUS_LABELS`).
    - `Customer` không có `@JsonInclude` và `CustomerHandler.JSON` dùng cấu hình mặc định, nên Jackson tự ghi `"phone": null`.
  - Đã cân nhắc:
    - Thêm `phoneDisplay` đã định dạng: loại, vì trùng lặp và khác legacy.
    - Bỏ field khi `null` (`NON_NULL`): loại, vì schema sẽ không ổn định. FE vẫn chịu được trường hợp thiếu field (AC-21).
- D5: BR-09 dùng method mới `boolean existsByPhoneAndStatus(String phone, CustomerStatus status)` trong `CustomerRepository`. Bản in-memory so sánh `phone.equals(c.phone()) && c.status() == status`. Service truyền `ACTIVE`.
  - Lý do:
    - Tương đương `WHERE phone = ? AND status = 1` của legacy.
    - Quy tắc "chỉ khách hàng đang hoạt động mới giữ số" nằm ở service, repository chỉ truy vấn.
    - Tên theo mẫu `existsByEmail`.
    - So sánh chính xác bằng `equals` tương đương so sánh theo collation MySQL, vì giá trị đem so luôn là chuỗi chữ số đã chuẩn hoá.
    - Phải viết `phone.equals(c.phone())`, **không** viết `c.phone().equals(phone)`. `phone` đem so luôn khác `null`, còn `c.phone()` có thể `null` (khách hàng không có số). Viết ngược sẽ ném `NullPointerException` thành lỗi 500.
    - Điều kiện `id <> ?` của legacy chỉ dùng khi sửa khách hàng, nên bỏ (Ngoài phạm vi).
  - Đã cân nhắc:
    - `existsActiveByPhone(phone)`: loại, vì đẩy quy tắc nghiệp vụ xuống repository.
    - `findAll()` rồi lọc trong service: loại, vì lệch mẫu `existsByEmail`.
- D6: Đổi `CustomerRepository.insert` thành `insert(String name, String email, String phone, CustomerStatus status)`. Service luôn truyền `CustomerStatus.ACTIVE`, và repository chỉ lưu đúng giá trị nhận được.
  - Lý do:
    - AC-12 cần khách hàng `INACTIVE` trong một `InMemoryCustomerRepository` **thật**, không dùng mock và không thêm endpoint (Q6). Test gọi `repository.insert(..., "0912345678", CustomerStatus.INACTIVE)` rồi tạo `CustomerService` trên chính repository đó.
    - Giống legacy: câu `INSERT` ghi `status = 1` tường minh từ code nghiệp vụ.
    - Việc migrate legacy sau này cũng phải nhập được dòng `status = 0` kèm số điện thoại.
  - Đã cân nhắc:
    - Fake repository viết tay trong test: loại. Test khi đó không kiểm được `existsByPhoneAndStatus` thật, và trái convention "dùng `InMemoryCustomerRepository` thật".
    - Method hoặc constructor chỉ để test (`save(Customer)`, seed qua constructor): loại, vì là API chỉ phục vụ test.
    - Endpoint đổi trạng thái: nằm ngoài phạm vi.
- D7: `Customer` thành `record Customer(long id, String name, String email, String phone, CustomerStatus status)`. `phone` có thể `null`.
  - Lý do: thứ tự giống cột legacy (`full_name, email, phone, status`), và JSON có dạng `{id, name, email, phone, status}`.
  - Đã cân nhắc: đặt `phone` cuối record. Không có lợi ích gì: constructor đổi số tham số nên mọi call site đều phải sửa, và compiler bắt hết.
- D8: Thay chữ ký `CustomerService.create(String name, String email)` bằng `create(String name, String email, String phone)`. Ba call site hiện có truyền `null`: `App.main` (seed), `CustomerServiceTest`, `CustomerHandlerTest` (`@BeforeEach`). Seed vẫn không có số (Ngoài phạm vi).
  - Lý do: một lối vào duy nhất, mọi lần tạo khách hàng đều qua cùng một bộ kiểm tra.
  - Đã cân nhắc: giữ thêm overload 2 tham số để test cũ khỏi sửa. Loại, vì overload đó chỉ tồn tại cho test và mở thêm một lối vào.
- D9: FE thêm util `src/utils/formatPhone.js`, export `formatPhone(phone)`. Đây là bản port `phone_format`, **chỉ dựa vào độ dài**:
  - 10 ký tự → 4-3-3.
  - 11 ký tự → 3-4-4.
  - Độ dài khác → giữ nguyên.

  Quy tắc "trống thì hiện `—`" nằm trong component (`customerTable.js`), giống `customer_list.php` dòng 19: `c.phone ? formatPhone(c.phone) : NO_PHONE`, với `NO_PHONE = '—'` (U+2014). **Định dạng trước, escape sau**: `escapeHtml(...)` bọc kết quả.
  - Lý do:
    - Legacy tách `phone_format` (thư viện, "used on every screen") khỏi quyết định hiển thị ô trống của từng màn hình.
    - Util thuần test riêng được, và dùng lại được cho màn hình sau này.
    - Escape sau vì định dạng dựa trên độ dài chuỗi **gốc** (AC-22). Nếu escape trước, `<b>1</b>` sẽ dài hơn và bị định dạng sai.
  - Đã cân nhắc:
    - Viết thẳng trong component: loại, vì khó dùng lại.
    - Cho `formatPhone` tự trả `—`: loại, vì lệch cách tách của legacy.
- D10: Form FE thêm `<input name="phone" type="tel" placeholder="Điện thoại">` giữa ô email và nút "Thêm", không `required`. Submit handler trong `main.js` gửi thêm `phone: data.phone`.
  - Ô trống cho `""`, và BE hiểu là không có số (AC-1).
  - FE không tự chuẩn hoá hay kiểm tra (AC-16).
  - `customerApi.js` **không sửa**. Lỗi `phone` hiển thị qua cơ chế `fieldErrors` → `#message` có sẵn (AC-17).
  - Lý do: `type="tel"` mở bàn phím số trên di động. Form có `novalidate` nên trình duyệt không tự kiểm tra thêm gì.
  - Đã cân nhắc: `type="text"`. Chấp nhận được nhưng kém tiện cho người nhập trên di động.

## API
Chỉ **thêm field**, không đổi path, method, mã trạng thái hay format lỗi. Client cũ vẫn chạy được. Schema đầy đủ và ví dụ: `aiws/work/REQ-001/api-contract.yaml`.

| Method | Path | Thay đổi |
| --- | --- | --- |
| POST | `/api/customers` | Request `CreateCustomerRequest` thêm `phone` (string, tuỳ chọn, nullable, giá trị thô). Response 201 `Customer` có `phone`. 400 có thể có `errors.phone` |
| GET | `/api/customers` | Mỗi `Customer` có `phone` (string đã chuẩn hoá hoặc `null`) |
| GET | `/api/customers/{id}` | `Customer` có `phone` |

Ngữ nghĩa `phone` trong request (`POST`):

| Đầu vào | Kết quả |
| --- | --- |
| Thiếu field, `null`, hoặc rỗng sau `trim` kiểu PHP (`""`, `"   "`) | 201, `phone: null` (AC-1) |
| Hợp lệ sau chuẩn hoá (D2) | 201, `phone` là dạng chuẩn hoá (AC-2..AC-6, AC-12) |
| Không hợp lệ sau chuẩn hoá (sai đầu số hoặc độ dài, ký tự lạ, `84` sai độ dài, `+84 0...`, chỉ gồm ký tự phân cách) | 400, `errors.phone = "must be a valid phone number"` (AC-7..AC-10) |
| Hợp lệ nhưng trùng số của khách hàng `ACTIVE` khác | 400, `errors.phone = "is already used by another customer"` (AC-11) |

- Lỗi phone được gom cùng lỗi `name`/`email` trong **một** Problem 400 (AC-13).
- Format lỗi giữ nguyên:
  - RFC 9457 `application/problem+json`, `title: "Validation failed"`, `detail: "The request has invalid fields"`.
  - `errors` là map field → message, không có thứ tự key cố định (`ValidationException` dùng `Map.copyOf`).
- `phone` trong response chỉ gồm chữ số, bắt đầu bằng `0`, chưa có dấu cách hiển thị.
  - Khách hàng tạo qua API luôn khớp `^(0[35789][0-9]{8}|02[0-9]{9})$`.
  - Contract **không** đặt `pattern` cho response, vì dữ liệu migrate từ legacy có thể theo quy tắc cũ (ví dụ `01234567890`, AC-20).

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`).

- Kho in-memory lưu thêm `phone` trong `Customer` (D7).
- Không có index. `existsByPhoneAndStatus` duyệt tuyến tính giống `existsByEmail`.

Tương thích dữ liệu với legacy `customers.phone VARCHAR(11) NULL` (`source-legacy/sql/schema.sql`):
- Giá trị lưu cùng dạng: tối đa 11 chữ số, bắt đầu bằng `0`, hoặc `null`. Migrate sau này chép 1-1, không cần chuyển đổi.
- `status` 1/0 map sang `ACTIVE`/`INACTIVE` qua `insert(..., status)` (D6).

## BE change
Thư mục gốc: `source-be/src/main/java/com/example/crm/` và `source-be/src/test/java/com/example/crm/`. Không thêm package hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `service/PhoneNumbers.java` | Mới | Package-private `final class`, constructor `private`, Javadoc một dòng dẫn chiếu `source-legacy/lib/phone.php` (BR-07). `static String trim(String raw)`, `static String normalize(String raw)`, `static boolean isValid(String normalized)` theo D2. Các `Pattern` là hằng `private static final` UPPER_SNAKE_CASE |
| `domain/Customer.java` | Sửa | Thêm component `String phone` giữa `email` và `status` (D7) |
| `repository/CustomerRepository.java` | Sửa | Thêm `boolean existsByPhoneAndStatus(String phone, CustomerStatus status)`. Đổi `insert(String name, String email, String phone, CustomerStatus status)` và cập nhật Javadoc của `insert` (repository gán `id`, lưu `status` được truyền vào) (D5, D6) |
| `repository/InMemoryCustomerRepository.java` | Sửa | Cài đặt hai method trên. `insert` dùng `status` được truyền, không tự gán `ACTIVE` |
| `service/CustomerService.java` | Sửa | `create(String name, String email, String phone)` theo D3. Gọi `repository.insert(trimmedName, trimmedEmail, normalizedPhone, CustomerStatus.ACTIVE)` |
| `api/CreateCustomerRequest.java` | Sửa | `record CreateCustomerRequest(String name, String email, String phone)` |
| `api/CustomerHandler.java` | Sửa | Chỉ sửa route POST: `service.create(body.name(), body.email(), body.phone())`. `handle` (map exception) giữ nguyên |
| `App.java` | Sửa | Seed: `service.create(..., ..., null)` |
| `source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java` | Mới | Test bảng đầu vào → đầu ra cho `trim`/`normalize`/`isValid` (test-designer quyết case) |
| `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | Sửa | Call site cũ thêm `null`. Thêm test phone (AC-1..AC-13), trong đó AC-12 dựng `INACTIVE` bằng `repository.insert(..., CustomerStatus.INACTIVE)` |
| `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | `@BeforeEach` thêm `null`. Thêm test HTTP cho `phone` trong 201/400/GET (AC-1, AC-7, AC-11, AC-13..AC-15 tuỳ test spec) |
| `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | Mới, tuỳ test spec | Test `existsByPhoneAndStatus` và `insert` lưu `status` |

**Nhóm phải biên dịch cùng nhau** (gợi ý cho planner, vì sau mỗi task orchestrator chạy `be_test`, giới hạn 10 file/task):
- **BE-1** (độc lập, 2 file): `PhoneNumbers.java` + `PhoneNumbersTest.java`.
- **BE-2** (lưu trữ, tối đa 5 file):
  - `Customer.java`, `CustomerRepository.java`, `InMemoryCustomerRepository.java`, `CustomerService.java`, cùng `InMemoryCustomerRepositoryTest.java` nếu có.
  - Trong task này `CustomerService.create` vẫn giữ 2 tham số và chỉ đổi lệnh gọi thành `insert(..., null, CustomerStatus.ACTIVE)`. Test cũ vẫn biên dịch và vẫn pass.
- **BE-3** (phụ thuộc BE-1 và BE-2, 6 file): `CustomerService.java` (chữ ký 3 tham số và luồng D3), `CreateCustomerRequest.java`, `CustomerHandler.java`, `App.java`, `CustomerServiceTest.java`, `CustomerHandlerTest.java`.
  - Chữ ký `create` đổi thì 5 file còn lại phải sửa trong cùng task.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/utils/formatPhone.js` | Mới | `/** ... */` một dòng. `export function formatPhone(phone)`: độ dài 10 → `slice(0,4) + ' ' + slice(4,7) + ' ' + slice(7)`. Độ dài 11 → `slice(0,3) + ' ' + slice(3,7) + ' ' + slice(7)`. Độ dài khác → trả nguyên `phone` (D9) |
| `src/components/customerTable.js` | Sửa | Import `formatPhone`. Hằng `NO_PHONE = '—'`. Header thành `ID, Họ tên, Email, Điện thoại, Trạng thái`. Mỗi dòng thêm `<td>${escapeHtml(c.phone ? formatPhone(c.phone) : NO_PHONE)}</td>` sau ô email (AC-18..AC-22) |
| `index.html` | Sửa | Trong `#create-form`, sau ô email: `<input name="phone" type="tel" placeholder="Điện thoại">`, không `required` (D10) |
| `src/main.js` | Sửa | `createCustomer({ name: data.name, email: data.email, phone: data.phone })`. Khối `catch` giữ nguyên |
| `src/api/customerApi.js` | Không sửa | `createCustomer` đã gửi nguyên object. `ApiError.fieldErrors` đã đọc `problem.errors` |
| `test/formatPhone.test.js` | Mới | Test `formatPhone` (tuỳ test spec) |
| `test/customerTable.test.js` | Sửa | Thêm test AC-18..AC-22. Test cũ không đổi (khách hàng không có `phone` hiển thị `—`, số `<tr>` không đổi) |
| `test/customerApi.test.js` | Sửa | Thêm test AC-16 (body giữ nguyên `'0912 345 678'`) và AC-17 (`fieldErrors.phone`) bằng `fakeFetch` có sẵn |

- `index.html` và `main.js` không có seam unit test vì `node:test` không có DOM. Hai file này được kiểm bằng review hoặc chạy tay (`01-analysis.md` → Impact).
- Gợi ý nhóm task, độc lập với BE về biên dịch:
  - **FE-1**: `formatPhone.js`, `formatPhone.test.js`, `customerTable.js`, `customerTable.test.js`.
  - **FE-2**: `index.html`, `main.js`, `customerApi.test.js`.

## Migration
Không có script migration, vì không có DB.

- **Thứ tự deploy: BE trước, FE sau.**
  - FE mới gọi BE cũ: BE cũ đọc body với `FAIL_ON_UNKNOWN_PROPERTIES = false` nên **âm thầm bỏ** `phone`. Khách hàng được tạo nhưng mất số điện thoại.
  - FE cũ gọi BE mới: vô hại. FE không gửi `phone` (BE lưu `null`) và bỏ qua field `phone` trong response.
- **Rollback:** gỡ FE trước rồi mới gỡ BE, cùng lý do. Dữ liệu in-memory mất khi restart, nên không có dữ liệu nào cần đưa về trạng thái cũ.
- Migrate dữ liệu legacy nằm ngoài phạm vi. Dạng lưu đã tương thích (xem DB change).
- Sau khi merge, phase knowledge cập nhật `aiws/knowledge/api-inventory.md`, `glossary.md`, `system-map.md` và `db-schema.md`: có `phone`, và `insert` giờ nhận `status`.

## Rủi ro
- **R1: Lệch tập khoảng trắng giữa PHP/PCRE và Java (Q5).** Giảm thiểu:
  - Tập ký tự ghi tường minh (D2). Cấm `String.trim()`/`strip()` và lớp ký tự Unicode.
  - Test spec nên có ca biên cho `\t`, `\f`, NUL, VT và NBSP.
  - Còn lại: [CẦN XÁC NHẬN] bản PCRE và locale thật của server legacy. Nếu server dùng PCRE hệ thống < 8.34, VT ở **giữa** chuỗi sẽ không bị bỏ.
- **R2: Developer hoặc reviewer "sửa" các hành vi lạ của legacy (Q4 a–d).** Giảm thiểu:
  - D2/D3 ghi rõ từng hành vi.
  - Javadoc của `PhoneNumbers` dẫn chiếu `lib/phone.php`.
  - Mỗi hành vi có test case riêng (AC-9, AC-10, AC-20, AC-22).
- **R3: Kiểm tra trùng rồi mới `insert`, không nguyên tử (Q7).** Hai request đồng thời có thể lưu cùng một số. Chấp nhận như hiện trạng email và như legacy.
- **R4: Hiệu năng.** `existsByPhoneAndStatus` là O(n) giống `existsByEmail`, đủ cho kho in-memory. Khi có DB thật thì dùng index tương tự `idx_customers_phone`.
- **R5: Deploy sai thứ tự làm mất số điện thoại mà không báo lỗi.** Xem Migration: BE trước, FE sau.
- **R6: Đổi chữ ký Java nội bộ làm vỡ biên dịch giữa các task.** Planner theo nhóm BE-1/BE-2/BE-3 ở mục BE change.
- **R7: Khác biệt hiển thị không xảy ra với dữ liệu hợp lệ.**
  - PHP coi `"0"` là rỗng (hiện `—`), còn JS coi `"0"` là truthy.
  - PHP `strlen` đếm byte, còn JS `.length` đếm đơn vị UTF-16.
  - Hai điểm này chỉ khác nhau khi `phone` là `"0"` hoặc có ký tự ngoài ASCII. BE không bao giờ lưu những giá trị đó. Chấp nhận và không port.
- **R8: PII.** Số điện thoại là dữ liệu cá nhân.
  - Không log. Hiện BE không có logging.
  - Thông điệp lỗi và message của `ValidationException` không chứa giá trị người dùng nhập.
- **R9: UI hiển thị thông điệp lỗi tiếng Anh**, ví dụ `phone: must be a valid phone number`. Giống hiện trạng của `name`/`email` (Q2).

## Quyết định cần duyệt
- **Giữ nguyên có chủ ý các hành vi lạ của legacy** (Q4, D2):
  - (a) Chuỗi chỉ gồm ký tự phân cách bị báo không hợp lệ, không được coi là "không nhập".
  - (b) `84` không có `+` chỉ được đổi khi chuỗi dài 11 ký tự.
  - (c) `+84 0...` thành `00...` và không hợp lệ.
  - (d) Hiển thị chỉ dựa vào độ dài chuỗi.
- **Tập ký tự trim và ký tự phân cách lấy theo PHP/PCRE ASCII** (Q5, D2). Khoảng trắng Unicode như NBSP không bị bỏ, nên số chứa nó không hợp lệ.
- **Thông điệp lỗi tiếng Anh** (Q2, D3):
  - Số không hợp lệ: `must be a valid phone number`.
  - Số trùng: `is already used by another customer`, cùng câu với lỗi trùng email.
- **API chỉ thêm field** (Q1, D4):
  - `phone` trả dạng chuẩn hoá, chưa định dạng.
  - Field luôn có mặt, `null` khi không có số.
  - Request nhận giá trị thô.
- **Đổi public API Java nội bộ, không đổi cấu trúc thư mục hay package** (D5..D8):
  - `Customer` thêm component `phone`.
  - `CustomerService.create` thêm tham số `phone`; overload 2 tham số bị bỏ.
  - `CustomerRepository.insert` thêm `phone` và `status`. Quyết định "khách hàng mới là `ACTIVE`" chuyển từ repository lên service.
  - Thêm `CustomerRepository.existsByPhoneAndStatus`.
  - File mới: `service/PhoneNumbers.java`, `src/utils/formatPhone.js`, cùng test tương ứng.
- **AC-12 được kiểm chứng** bằng `InMemoryCustomerRepository` thật, dựng khách hàng `INACTIVE` qua `insert(..., CustomerStatus.INACTIVE)` (Q6, D6). Không có endpoint chỉ để test.
- **Chấp nhận kiểm tra trùng không nguyên tử** (Q7, R3).
- **Thứ tự deploy BE → FE**, rollback theo chiều ngược lại (Migration, R5).
- **Giao diện** (Q3, D9, D10):
  - Cột "Điện thoại" nằm giữa Email và Trạng thái; số trống hiển thị `—`.
  - Ô nhập `type="tel"`, placeholder "Điện thoại", không bắt buộc.
  - Dữ liệu seed trong `App.main` vẫn không có số.
