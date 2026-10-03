# REQ-001 — Review

## Tóm tắt
**Sẵn sàng mở PR.** Không có finding mức critical hay major; có 3 finding minor, đều nằm trong file test và không đổi hành vi.

- **Phạm vi đã đọc**: toàn bộ 19 file nguồn đổi trên `aiws/REQ-001` so với `8daa5ec`, 5 commit `feat` có trailer `REQ-ID: REQ-001` (T1..T5), và mã legacy dùng làm đặc tả (`source-legacy/lib/phone.php`, `customer_save.php`, `customer_list.php`).
- **Design**: D1..D10 đều được hiện thực đúng (xem Đối chiếu design). Bản port khớp legacy từng bước: tập ký tự trim, lớp ký tự phân cách, quy tắc `+84`/`84`, regex hợp lệ, thứ tự kiểm tra rỗng → chuẩn hoá → hợp lệ → trùng `ACTIVE`, định dạng theo độ dài.
- **Contract**: BE expose đúng và FE gọi đúng path, method, schema của cả ba endpoint (xem Đối chiếu api-contract).
- **Test**: đủ TC-1..TC-43, dữ liệu từng dòng khớp `03-test-spec.md`, mỗi AC-1..AC-22 có test chứng minh. Mã TC gắn đúng chuẩn (`@DisplayName("TC-n: ...")`, `test('TC-n: ...')`). Test cũ chỉ đổi 6 call site (thêm đối số `null`), không test nào bị xoá hay nới lỏng.
- **Cấu trúc**: diff chỉ chứa thay đổi cần thiết. Danh sách file của từng commit `50be8fe`, `4ac989e`, `73594aa`, `2a1bdf3`, `4becff9` trùng đúng `allowed_files` của T1..T5 trong `04-plan.yaml`. Không đổi tên, di chuyển hay reformat; `git diff --check` sạch. Thay đổi public API Java (`Customer`, `CustomerService.create`, `CustomerRepository.insert`) đều nằm trong "Quyết định cần duyệt". `src/api/customerApi.js` không bị sửa, đúng design.
- **Bảo mật (OWASP)**: ô điện thoại được escape sau khi định dạng (`customerTable.js:14`, TC-40, TC-41). Thông điệp lỗi và message của `ValidationException` không chứa giá trị người dùng nhập; không có log mới (R8). Hai regex mới (`PhoneNumbers.java:10-11`) không có backtracking lồng nhau.

Người review PR cần biết:
- Reviewer **không chạy lại test**. Kết luận "pass" dựa trên `evidence/test-results/T1..T5-attempt-1.yaml` (exit code 0) và `trace.md`. Evidence BE có `output_tail` rỗng vì lệnh chạy với `-q`, nên không có số test đã chạy; evidence FE có đủ TAP.
- `source-fe/index.html:22` và `source-fe/src/main.js:21` không có test tự động (không có DOM). Hai dòng này đã được đối chiếu bằng cách đọc code với D10; nên chạy tay một lần trước khi merge.
- [CẦN XÁC NHẬN] R1 của design vẫn mở: bản PCRE và locale của server legacy. Nếu PCRE < 8.34 hoặc locale coi NBSP là khoảng trắng, phải đổi các dòng dữ liệu VT/NBSP/EM SPACE trong TC-2, TC-3, TC-6, TC-10, TC-13, TC-17, TC-21 cùng `SEPARATORS` (`PhoneNumbers.java:10`).
- Thứ tự deploy: BE trước, FE sau (design → Migration, R5).

## Findings
- [minor] source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java:54 — Literal chứa khoảng trắng ngoài ASCII viết thô, không nhìn thấy được (dòng 54, 133: EM SPACE U+2003; dòng 55, 132, 214: NBSP U+00A0; dòng 57: LINE SEPARATOR U+2028), trái Google Java Style §2.3.1 và dự án không có formatter nào bắt; nếu editor đổi thành dấu cách thường thì dòng 214 vẫn pass (`isValid` trả `false` với cả hai) nên TC-10 mất ca NBSP mà không ai biết — đổi sang escape ` `, ` `, ` ` và giữ comment tên ký tự; dòng 215–216 (chữ số nhìn thấy được) giữ nguyên.
- [minor] source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java:240 — Cùng vấn đề: NBSP viết thô trong dữ liệu TC-21, không phân biệt được với dấu cách thường khi đọc code — đổi thành `"0912 345678"`.
- [minor] source-fe/test/customerApi.test.js:64 — Biến lặp tên `phone` nhưng giữ thông điệp lỗi, dễ đọc nhầm với số điện thoại `'0412345678'` ở dòng 74 — đổi tên thành `message`, viết `errors: { phone: message }` và so `error.fieldErrors.phone === message`.

## Đối chiếu design
| Quyết định | Kết quả | Dẫn chứng |
| --- | --- | --- |
| D1: `service/PhoneNumbers` package-private, `final`, constructor `private`, ba hàm `static` | Đúng | `PhoneNumbers.java:5-6` (Javadoc một dòng dẫn chiếu `source-legacy/lib/phone.php`, BR-07), `:13`, `:15`, `:30`, `:40`. `Pattern` là hằng `private static final` UPPER_SNAKE_CASE (`:10-11`) |
| D2: port đúng từng ký tự hành vi PHP | Đúng | `trim` (`:15-28`): `null` → `""`, chỉ bỏ space, `\t`, `\n`, `\r`, NUL, VT ở hai đầu (`:8`), không dùng `String.trim()`/`strip()`. `normalize` (`:30-38`): trim → xoá `[ \t\n\x0B\f\r.()-]` (`:10`) → `+84` thành `"0" + substring(3)` → ngược lại `84` và `length() == 11` thành `"0" + substring(2)`. `isValid` (`:40-42`): `0[35789][0-9]{8}\|02[0-9]{9}` với `matches()`. Không có lớp ký tự Unicode. TC-1..TC-10 phủ đủ các ca biên của design (`\f`, `\u001F`, NUL, VT, NBSP, EM SPACE, `"+84"` đứng một mình) |
| D3: thứ tự kiểm tra trong `CustomerService.create` | Đúng | `CustomerService.java:35` (trim), `:48` (rỗng → `null`), `:49` (chuẩn hoá), `:50-51` (hợp lệ), `:52-53` (trùng `ACTIVE`, chỉ chạy khi số hợp lệ). Nhánh phone nằm sau `name`/`email` và không phụ thuộc lỗi của chúng (TC-26). Hai thông điệp đúng câu chữ đã duyệt |
| D4: API trả `phone` dạng chuẩn hoá, field luôn có mặt | Đúng | `Customer.java:4` không có `@JsonInclude`; `CustomerHandler.JSON` (`CustomerHandler.java:22-23`) không đổi. TC-27 và TC-31 assert `has("phone")` và `isNull()`; TC-28 assert `"0912345678"` |
| D5: `existsByPhoneAndStatus`, so sánh `phone.equals(c.phone())` | Đúng | `CustomerRepository.java:15`, `InMemoryCustomerRepository.java:32-35` (đúng chiều `equals`, không NPE với khách hàng không có số; TC-12 chèn bản ghi `phone = null` đầu tiên). Service truyền `ACTIVE` (`CustomerService.java:52`) |
| D6: `insert(name, email, phone, status)`, service truyền `ACTIVE` | Đúng | `CustomerRepository.java:17-18` (Javadoc đã cập nhật), `InMemoryCustomerRepository.java:37-42` (lưu `status` nhận được), `CustomerService.java:59`. TC-25 dựng `INACTIVE` bằng repository thật (`CustomerServiceTest.java:297-311`), không mock |
| D7: `Customer(id, name, email, phone, status)` | Đúng | `Customer.java:4` |
| D8: `create(name, email, phone)`, bỏ overload 2 tham số | Đúng | `CustomerService.java:32`, không còn overload. Call site cũ truyền `null`: `App.java:24-25`, `CustomerHandlerTest.java:33`, `CustomerServiceTest.java:39`, `:51`, `:61`, `:69`, `:71` |
| D9: `formatPhone` chỉ dựa vào độ dài; `—` nằm trong component; định dạng trước, escape sau | Đúng | `formatPhone.js:1-6` (10 → 4-3-3, 11 → 3-4-4, khác → nguyên văn, không escape, không tự trả `—`). `customerTable.js:2`, `:5`, `:14`, `:18`. `NO_PHONE` là U+2014, cùng ký tự với `source-legacy/customer_list.php:19` và với test TC-36, TC-39 |
| D10: ô `phone` `type="tel"`, không `required`; `main.js` gửi giá trị thô; `customerApi.js` không sửa | Đúng | `index.html:22` (sau ô email, trước nút "Thêm"), `main.js:21`, khối `catch` giữ nguyên. Kiểm bằng đọc code, không có test tự động |

Ghi chú, không phải finding:
- `PhoneNumbers.isValid` dùng `matches()` nên từ chối `"0912345678\n"`, trong khi `phone_is_valid` của PHP (`$` không có cờ `D`) chấp nhận chuỗi này. Khác biệt không quan sát được: `normalize` luôn xoá `\n` trước khi gọi `isValid`, và D2 quy định dùng `matches()`. Chỉ cần lưu ý nếu sau này gọi `isValid` trực tiếp trên dữ liệu chưa chuẩn hoá.
- R3 (kiểm tra trùng không nguyên tử) và R7 (`"0"` và ký tự ngoài ASCII khi hiển thị) giữ đúng như design đã chấp nhận; code không cố xử lý thêm.

## Đối chiếu api-contract
| Endpoint | BE (`CustomerHandler` → `CustomerService`) | FE |
| --- | --- | --- |
| `GET /api/customers` | Đúng. Mảng `Customer`, mỗi phần tử có `phone` là chuỗi chuẩn hoá hoặc `null` (TC-31). Thứ tự field `id, name, email, phone, status` theo record | Đúng. `listCustomers` gọi `GET /api/customers` (`customerApi.js:25-27`, không đổi); `renderCustomerTable` đọc `c.phone`, chịu được `null`, `''` và thiếu field (TC-39) |
| `POST /api/customers` | Đúng. `CreateCustomerRequest(name, email, phone)`; `phone` tuỳ chọn, nullable (thiếu field và `null` đều thành `null`, TC-27). 201 trả `Customer` có `phone` (TC-27, TC-28). 400 `application/problem+json`, `title` "Validation failed", `errors.phone` là `must be a valid phone number` (TC-29) hoặc `is already used by another customer` (TC-30); lỗi các field gom trong một response (TC-26). Nhánh "Malformed JSON" và 500 không đổi (`CustomerHandler.java:39-42`) | Đúng. `main.js:21` gửi `{ name, email, phone }` qua `createCustomer`, giá trị thô, không chuẩn hoá hay kiểm tra (TC-42). `errors.phone` vào `ApiError.fieldErrors` (TC-43) và hiển thị ở `#message`. 400 không có `errors` và 500 rơi vào thông báo chung "Không lưu được khách hàng." (`main.js:25-28`) |
| `GET /api/customers/{id}` | Đúng. `Customer` có `phone` (TC-28, TC-32). 404 không đổi | FE không gọi endpoint này; không có màn hình chi tiết trong phạm vi REQ |

- Schema `Customer`: `required: [id, name, email, phone, status]` được đáp ứng vì Jackson ghi `"phone": null` theo mặc định. Không có `pattern` cho `phone` ở response, đúng contract.
- Schema `Problem` và format lỗi RFC 9457 không đổi. Path, method và mã trạng thái không đổi; thay đổi chỉ là thêm field, tương thích ngược như contract ghi.
