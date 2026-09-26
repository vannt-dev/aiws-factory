# REQ-001 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-22 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D10) và `api-contract.yaml`. Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB hay dịch vụ ngoài.

**Mức test và framework** (theo `aiws/knowledge/conventions.md` → Test):
- BE, `unit`: JUnit Jupiter (`junit-jupiter` từ `junit-bom` 6.1.3, `source-be/pom.xml`). Bảng dữ liệu dùng `@ParameterizedTest` (có sẵn trong artifact tổng hợp `junit-jupiter`, không thêm dependency) hoặc vòng lặp trong một `@Test`.
  - Dữ liệu chứa ký tự điều khiển nên dùng `@MethodSource`, không dùng `@CsvSource`.
  - Trong literal Java dùng `"\0"`, `"\u000B"` (hoặc `"\013"`), `"\f"`, `"\t"`. **Không** viết `\u000A`/`\u000D` trong literal, vì Java dịch Unicode escape trước khi lexing; dùng `"\n"`/`"\r"`. `\0` không được đứng ngay trước chữ số `0`–`7` (sẽ thành escape octal khác); khi đó dùng `\u0000`.
- BE, `integration`: `CustomerHandlerTest` khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, gọi bằng `java.net.http.HttpClient` (convention hiện có). Chạy trong `be_test`, không cần môi trường ngoài.
- FE, `unit`: `node:test` + `node:assert/strict`. HTTP giả bằng `fakeFetch` có sẵn trong `test/customerApi.test.js`. Component kiểm bằng so chuỗi HTML (`assert.match`/`assert.doesNotMatch`).
- Không dùng mock framework. Service test dùng `InMemoryCustomerRepository` thật (D6). `index.html` và `main.js` không có seam unit test (không có DOM), được kiểm bằng review hoặc chạy tay như `01-analysis.md` → Impact đã ghi.

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương cho đầu vào `phone`: không nhập / hợp lệ di động / hợp lệ cố định / có ký tự phân cách / có mã quốc gia / sai đầu số / sai độ dài / ký tự lạ / mã quốc gia không khớp / chỉ ký tự phân cách.
- Giá trị biên:
  - độ dài 9/10/11/12 (BE `isValid`, FE `formatPhone`)
  - `84` + 10/11/12 ký tự
  - đầu số biên `0300000000`, `0999999999`, `02000000000`, `02999999999`
  - `"+84"` đứng một mình
- Bảng quyết định cho BR-09: (số khớp? × `status` khớp?) ở repository; khách hàng `ACTIVE` trùng / `INACTIVE` trùng / nhiều khách hàng không có số ở service.
- Đoán lỗi (error guessing) cho các cách port sai mà design đã cảnh báo (D2, D5, D9, R1):
  - dùng `String.trim()`, `String.strip()` hoặc regex neo bằng `$`
  - dùng lớp ký tự Unicode (`\p{Space}`, `UNICODE_CHARACTER_CLASS`, `Character::isWhitespace`)
  - `find()` thay cho `matches()`
  - `c.phone().equals(phone)` gây `NullPointerException`
  - escape trước rồi mới định dạng

**Dữ liệu chung**:
- Kho có sẵn một khách hàng `ACTIVE` **không có số** trong mọi test service/HTTP có kiểm tra trùng hoặc lưu số hợp lệ, để bắt lỗi NPE của D5. HTTP test có sẵn nhờ seed trong `@BeforeEach`. Service test tự tạo trong phần Arrange (`service.create("Seed", "seed@example.com", null)`).
- Test âm tính dùng `name`/`email` hợp lệ và chưa bị dùng, nên `errors` chỉ có đúng một key `phone`.
- "Lưu" = giá trị trong kết quả `create`/response 201 **và** trong lần đọc lại (`service.get(id)`/`GET`).
- Khi hai dòng dữ liệu chuẩn hoá ra cùng một số, mỗi dòng chạy trên kho mới (tránh lỗi trùng BR-09 giả).

**Giả định kế thừa từ design** [CẦN XÁC NHẬN] (Q5, R1): tập ký tự trim/phân cách theo PHP/PCRE ASCII. Cụ thể:
- VT (`\u000B`) ở giữa chuỗi bị bỏ (PCRE ≥ 8.34).
- NBSP (` `) và EM SPACE (` `) **không** bị bỏ.

Nếu người duyệt xác nhận server legacy khác, các dòng dữ liệu này (TC-2, TC-3, TC-6, TC-10, TC-13, TC-17, TC-21) phải đổi theo.

**Gắn mã TC trong code**:
- BE: `@DisplayName("TC-n: ...")` ở mức method (kể cả `@ParameterizedTest`).
- FE: `test('TC-n: <tên hàm> ...', ...)`.
- Test cũ không có mã TC giữ nguyên hành vi; chỉ sửa call site theo D8.

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test:

| TC | File test | Nhóm |
| --- | --- | --- |
| TC-1..TC-10 | `source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java` (mới) | BE-1 |
| TC-11..TC-12 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` (mới) | BE-2 (không dùng `create` 3 tham số) |
| TC-13..TC-26 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | BE-3 |
| TC-27..TC-32 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-3 |
| TC-33..TC-35 | `source-fe/test/formatPhone.test.js` (mới) | FE-1 |
| TC-36..TC-41 | `source-fe/test/customerTable.test.js` | FE-1 |
| TC-42..TC-43 | `source-fe/test/customerApi.test.js` | FE-2 |

## Test cases

### TC-1: PhoneNumbers.trim bỏ đúng tập ký tự của PHP trim() ở hai đầu
- covers: AC-1, AC-4
- side: be
- level: unit
- type: functional
- priority: high
- objective: `trim` coi `null` là `""` và chỉ bỏ space, `\t`, `\n`, `\r`, NUL, VT ở hai đầu (D2); ký tự ở giữa giữ nguyên.
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `null` → `""`
  - `""` → `""`
  - `"   "` → `""`
  - `" \t\n\r\0\u000B"` → `""`
  - `" \t0912.345-678\r\n "` → `"0912.345-678"`
  - `"\0\u000B0912345678\u000B\0"` → `"0912345678"`
  - `"0912 345 678"` → `"0912 345 678"`
- steps: Given từng đầu vào / When gọi `PhoneNumbers.trim(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả đúng chuỗi mong đợi; không ném exception với `null`.

### TC-2: PhoneNumbers.trim giữ ký tự ngoài tập của PHP trim()
- covers: AC-1, AC-10
- side: be
- level: unit
- type: boundary
- priority: high
- objective: chứng minh `trim` không phải `String.trim()`, `String.strip()` hay regex neo bằng `$` (D2, R1). Đây là ranh giới giữa "không nhập" (AC-1) và "không hợp lệ" (AC-10).
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `"\f"` → `"\f"`. `String.trim()` và `strip()` đều cho `""`.
  - `"\u001F"` → `"\u001F"`. `String.trim()` và `strip()` đều cho `""`.
  - `" "` → `" "`. `strip()` cho `""`.
  - `" "` → `" "`
  - `"\f0912345678\f"` → `"\f0912345678\f"`
  - `"0912345678  "` → `"0912345678  "`. Regex `[...]+$` sẽ bỏ dấu cách trước ` `.
- steps: Given từng đầu vào / When gọi `PhoneNumbers.trim(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả nguyên đầu vào.

### TC-3: PhoneNumbers.normalize bỏ khoảng trắng ASCII và ký tự phân cách ở mọi vị trí
- covers: AC-4
- side: be
- level: unit
- type: functional
- priority: high
- objective: `normalize` xoá mọi ký tự thuộc `[ \t\n\x0B\f\r.()-]` (D2 bước 2), kể cả `\f` và VT ở giữa chuỗi.
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `" 0912.345-678 "` → `"0912345678"`
  - `"(0912) 345 678"` → `"0912345678"`
  - `"0912\t345\n678"` → `"0912345678"`
  - `"0912\f345\r678"` → `"0912345678"`
  - `"0912\u000B345678"` → `"0912345678"` [CẦN XÁC NHẬN] PCRE ≥ 8.34
  - `"\f0912345678"` → `"0912345678"`
  - `"024.3825.1234"` → `"02438251234"`
- steps: Given từng đầu vào / When gọi `PhoneNumbers.normalize(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả chuỗi chỉ gồm chữ số như cột kết quả.

### TC-4: PhoneNumbers.normalize đổi +84 và 84 (đúng 11 ký tự) thành 0
- covers: AC-5, AC-6
- side: be
- level: unit
- type: functional
- priority: high
- objective: bước 3 và 4 của D2: `+84` luôn đổi; `84` chỉ đổi khi chuỗi sau khi bỏ ký tự phân cách dài đúng 11.
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `"+84 912.345.678"` → `"0912345678"`
  - `"(+84) 912-345-678"` → `"0912345678"`
  - `"+84 24 3825 1234"` → `"02438251234"`
  - `"84 912 345 678"` → `"0912345678"`
  - `"84912345678"` → `"0912345678"`
  - `"+84"` → `"0"` (biên: giống PHP `'0' . false`)
- steps: Given từng đầu vào / When gọi `PhoneNumbers.normalize(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả đúng chuỗi mong đợi, không ném `StringIndexOutOfBoundsException` với `"+84"`.

### TC-5: PhoneNumbers.normalize không đổi mã quốc gia khi không khớp quy tắc legacy
- covers: AC-9
- side: be
- level: unit
- type: boundary
- priority: high
- objective: giữ nguyên hành vi lạ Q4 (b), (c): `84` với độ dài khác 11 không đổi; `+84 0...` thành `00...`.
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `"84 24 3825 1234"` → `"842438251234"` (12 ký tự)
  - `"8491234567"` → `"8491234567"` (10 ký tự)
  - `"+84 0912 345 678"` → `"00912345678"`
- steps: Given từng đầu vào / When gọi `PhoneNumbers.normalize(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả đúng chuỗi mong đợi.

### TC-6: PhoneNumbers.normalize giữ nguyên ký tự không nằm trong danh sách bỏ
- covers: AC-8
- side: be
- level: unit
- type: negative
- priority: high
- objective: D2 bước 5: ký tự lạ (chữ cái, `/`, `_`, `+` không đứng trước `84`, khoảng trắng Unicode) không bị bỏ. Bắt cách port dùng `\p{Space}`, `UNICODE_CHARACTER_CLASS` hoặc `Character::isWhitespace`.
- preconditions: không có.
- test data (đầu vào → kết quả):
  - `"0912a45678"` → `"0912a45678"`
  - `"0912/345/678"` → `"0912/345/678"`
  - `"0912_345_678"` → `"0912_345_678"`
  - `"+0912345678"` → `"+0912345678"`
  - `"0912 345678"` → `"0912 345678"` [CẦN XÁC NHẬN] locale legacy
  - `"0912 345678"` → `"0912 345678"`
- steps: Given từng đầu vào / When gọi `PhoneNumbers.normalize(input)` / Then kết quả bằng giá trị mong đợi.
- expected result: mọi dòng trả nguyên đầu vào.

### TC-7: PhoneNumbers.normalize biến chuỗi chỉ gồm ký tự phân cách thành rỗng
- covers: AC-10
- side: be
- level: unit
- type: boundary
- priority: medium
- objective: chuỗi chỉ gồm ký tự phân cách cho kết quả `""` sau chuẩn hoá (sau đó `isValid` từ chối, TC-10).
- preconditions: không có.
- test data (đầu vào → kết quả): `"-"` → `""`; `"()"` → `""`; `" . "` → `""`; `"\f"` → `""`.
- steps: Given từng đầu vào / When gọi `PhoneNumbers.normalize(input)` / Then kết quả là `""`.
- expected result: mọi dòng trả `""`.

### TC-8: PhoneNumbers.isValid chấp nhận di động 10 số đầu 03/05/07/08/09 và cố định 11 số đầu 02
- covers: AC-2, AC-3
- side: be
- level: unit
- type: functional
- priority: high
- objective: phân vùng hợp lệ của BR-07 (`^(0[35789][0-9]{8}|02[0-9]{9})$`), kể cả giá trị biên của từng phân vùng.
- preconditions: không có.
- test data: `"0312345678"`, `"0512345678"`, `"0712345678"`, `"0812345678"`, `"0912345678"`, `"0300000000"`, `"0999999999"`, `"02438251234"`, `"02000000000"`, `"02999999999"`.
- steps: Given từng số / When gọi `PhoneNumbers.isValid(number)` / Then kết quả là `true`.
- expected result: mọi dòng trả `true`.

### TC-9: PhoneNumbers.isValid từ chối số sai đầu số hoặc sai độ dài
- covers: AC-7
- side: be
- level: unit
- type: negative
- priority: high
- objective: phân vùng không hợp lệ về đầu số và độ dài (biên 9/10/11/12 ký tự cho di động và cố định).
- preconditions: không có.
- test data:
  - sai đầu số: `"0123456789"`, `"01234567890"`, `"0412345678"`, `"0612345678"`, `"0012345678"`, `"1912345678"`
  - sai độ dài: `"091234567"`, `"09123456789"`, `"0243825123"`, `"024382512345"`
- steps: Given từng số / When gọi `PhoneNumbers.isValid(number)` / Then kết quả là `false`.
- expected result: mọi dòng trả `false`.

### TC-10: PhoneNumbers.isValid từ chối chuỗi còn ký tự lạ, mã quốc gia hoặc rỗng sau chuẩn hoá
- covers: AC-8, AC-9, AC-10
- side: be
- level: unit
- type: negative
- priority: high
- objective: các kết quả chuẩn hoá của TC-5, TC-6, TC-7 đều không hợp lệ. Bắt thêm việc dùng `find()` + `$` thay cho `matches()` và việc chấp nhận chữ số không phải ASCII.
- preconditions: không có.
- test data:
  - rỗng/ngắn: `""`, `"0"`
  - ký tự lạ: `"0912a45678"`, `"+0912345678"`, `"0912 345678"`, `"091234567٩"` (chữ số Ả Rập-Ấn), `"０９１２３４５６７８"` (chữ số toàn độ rộng)
  - mã quốc gia không khớp: `"842438251234"`, `"8491234567"`, `"00912345678"`
  - ký tự xuống dòng cuối: `"0912345678\n"`
- steps: Given từng chuỗi / When gọi `PhoneNumbers.isValid(value)` / Then kết quả là `false`.
- expected result: mọi dòng trả `false`.

### TC-11: InMemoryCustomerRepository.insert lưu phone và status được truyền vào
- covers: AC-12, AC-14
- side: be
- level: unit
- type: functional
- priority: high
- objective: D6, D7: `insert` lưu đúng `phone` (kể cả `null`) và đúng `status` nhận được, không tự gán `ACTIVE`. Đây là điều kiện để dựng dữ liệu `INACTIVE` cho AC-12 và để đọc lại `phone` cho AC-14.
- preconditions: `InMemoryCustomerRepository` mới, rỗng.
- test data:
  - `insert("Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE)`
  - `insert("An", "an@example.com", null, CustomerStatus.ACTIVE)`
- steps: Given kho rỗng / When gọi hai lệnh `insert` trên / Then kiểm tra giá trị trả về, `findById` và `findAll`.
- expected result:
  - lần 1 trả `new Customer(1, "Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE)`
  - lần 2 trả `new Customer(2, "An", "an@example.com", null, CustomerStatus.ACTIVE)`
  - `findById(1)` và `findById(2)` trả đúng hai record trên; `findAll()` có đúng 2 phần tử theo thứ tự id.

### TC-12: InMemoryCustomerRepository.existsByPhoneAndStatus theo bảng quyết định số × trạng thái
- covers: AC-11, AC-12
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: chỉ trả `true` khi cả số và `status` đều khớp; không ném `NullPointerException` khi kho có khách hàng không có số.
- preconditions: kho mới, `insert` theo đúng thứ tự:
  1. C: `("C", "c@example.com", null, ACTIVE)`. Chèn đầu tiên để mọi truy vấn đều đi qua bản ghi `phone = null`.
  2. A: `("A", "a@example.com", "0912345678", ACTIVE)`
  3. B: `("B", "b@example.com", "0987654321", INACTIVE)`
- test data (phone, status → kết quả):
  - `"0912345678"`, `ACTIVE` → `true`
  - `"0912345678"`, `INACTIVE` → `false`
  - `"0987654321"`, `ACTIVE` → `false`
  - `"0987654321"`, `INACTIVE` → `true`
  - `"0911111111"`, `ACTIVE` → `false`
- steps: Given kho có A, B, C / When gọi `existsByPhoneAndStatus(phone, status)` cho từng dòng / Then kết quả bằng giá trị mong đợi.
- expected result: đúng 5 kết quả như bảng; không có exception.

### TC-13: CustomerService.create không có số điện thoại lưu phone = null
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D3 bước 1–2: `null`, rỗng hoặc rỗng sau trim kiểu PHP là "không nhập". `"\0"` bắt cách port bằng `String.strip()`.
- preconditions: `CustomerService` trên `InMemoryCustomerRepository` mới; mỗi dòng dữ liệu dùng kho mới.
- test data (`phone`): `null`, `""`, `"   "`, `" \t\r\n"`, `"\0"`, `"\u000B"`; `name = "Tran Thi Binh"`, `email = "binh@example.com"`.
- steps: Given kho mới / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: không ném exception; `created.phone()` là `null`, `created.status()` là `ACTIVE`; `service.get(created.id()).phone()` là `null`.

### TC-14: CustomerService.create cho phép nhiều khách hàng cùng không có số
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: medium
- objective: "không có số" không bị coi là trùng (legacy `WHERE phone = ?` không khớp `NULL`). Bắt việc chạy kiểm tra trùng với `null`/`""`.
- preconditions: `CustomerService` trên kho mới.
- test data: `create("An", "an@example.com", null)`, `create("Binh", "binh@example.com", "   ")`, `create("Chi", "chi@example.com", "")`.
- steps: Given kho mới / When gọi ba lệnh `create` trên theo thứ tự / Then kiểm tra `service.list()`.
- expected result: không ném exception; `service.list()` có 3 phần tử, cả 3 đều `phone() == null`.

### TC-15: CustomerService.create lưu nguyên số di động hợp lệ của cả 5 đầu số
- covers: AC-2
- side: be
- level: unit
- type: functional
- priority: high
- objective: số di động hợp lệ được lưu đúng giá trị; kiểm tra trùng không lỗi khi kho có khách hàng không có số (D5).
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`.
- test data: `"0312345678"`, `"0512345678"`, `"0712345678"`, `"0812345678"`, `"0912345678"`, mỗi số với tên và email riêng (ví dụ `"M3"`, `"m3@example.com"`).
- steps: Given kho có Seed / When gọi `service.create(name, email, phone)` cho từng số / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: không ném exception; với mỗi số, `created.phone()` và `service.get(created.id()).phone()` bằng đúng số đã nhập; `created.status()` là `ACTIVE`; `service.list()` có 6 phần tử.

### TC-16: CustomerService.create lưu số cố định hợp lệ
- covers: AC-3
- side: be
- level: unit
- type: functional
- priority: high
- objective: số cố định 11 chữ số đầu `02` được lưu đúng giá trị.
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`.
- test data: `create("Le Van Cuong", "cuong@example.com", "02438251234")`.
- steps: Given kho có Seed / When gọi `create` / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: `created.phone()` và `service.get(created.id()).phone()` là `"02438251234"`.

### TC-17: CustomerService.create chuẩn hoá khoảng trắng thừa và ký tự phân cách
- covers: AC-4
- side: be
- level: unit
- type: functional
- priority: high
- objective: giá trị lưu là dạng chuẩn hoá của `phone_normalize`.
- preconditions: mỗi dòng dùng kho mới đã có `service.create("Seed", "seed@example.com", null)`.
- test data (`phone` → giá trị lưu):
  - `" 0912.345-678 "` → `"0912345678"`
  - `"(0912) 345 678"` → `"0912345678"`
  - `"\t0912\f345\u000B678\n"` → `"0912345678"` [CẦN XÁC NHẬN] VT giữa chuỗi
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: `created.phone()` và `service.get(created.id()).phone()` bằng giá trị lưu mong đợi.

### TC-18: CustomerService.create đổi mã quốc gia +84 thành 0
- covers: AC-5
- side: be
- level: unit
- type: functional
- priority: high
- objective: `+84` (sau khi bỏ ký tự phân cách) được đổi thành `0` rồi lưu.
- preconditions: mỗi dòng dùng kho mới đã có `service.create("Seed", "seed@example.com", null)`.
- test data (`phone` → giá trị lưu):
  - `"+84 912.345.678"` → `"0912345678"`
  - `"(+84) 912-345-678"` → `"0912345678"`
  - `"+84 24 3825 1234"` → `"02438251234"`
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: `created.phone()` và `service.get(created.id()).phone()` bằng giá trị lưu mong đợi.

### TC-19: CustomerService.create đổi 84 thành 0 khi chuỗi dài 11 ký tự
- covers: AC-6
- side: be
- level: unit
- type: functional
- priority: high
- objective: `84` không có `+` được đổi khi chuỗi sau chuẩn hoá dài đúng 11.
- preconditions: mỗi dòng dùng kho mới đã có `service.create("Seed", "seed@example.com", null)`.
- test data (`phone` → giá trị lưu): `"84 912 345 678"` → `"0912345678"`; `"84912345678"` → `"0912345678"`.
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then kiểm tra khách hàng trả về và `service.get(id)`.
- expected result: `created.phone()` và `service.get(created.id()).phone()` là `"0912345678"`.

### TC-20: CustomerService.create từ chối số sai đầu số hoặc sai độ dài
- covers: AC-7
- side: be
- level: unit
- type: negative
- priority: high
- objective: BR-07: số sai đầu số hoặc sai độ dài bị từ chối với thông điệp "không hợp lệ", không tạo khách hàng.
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`; `service.list().size() == 1`.
- test data (`phone`): `"0123456789"`, `"01234567890"`, `"0412345678"`, `"0612345678"`, `"091234567"`, `"09123456789"`, `"0243825123"`, `"024382512345"`; `name = "Tran Thi Binh"`, `email = "binh@example.com"`.
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "must be a valid phone number"}` (một key); `service.list().size()` vẫn là 1.

### TC-21: CustomerService.create từ chối số chứa ký tự lạ
- covers: AC-8
- side: be
- level: unit
- type: negative
- priority: high
- objective: ký tự không nằm trong danh sách bỏ khiến số không hợp lệ, kể cả khoảng trắng Unicode.
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`; `service.list().size() == 1`.
- test data (`phone`): `"0912a45678"`, `"0912/345/678"`, `"0912_345_678"`, `"+0912345678"`, `"0912 345678"` [CẦN XÁC NHẬN] locale legacy.
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "must be a valid phone number"}`; `service.list().size()` vẫn là 1.

### TC-22: CustomerService.create từ chối số có mã quốc gia không khớp quy tắc legacy
- covers: AC-9
- side: be
- level: unit
- type: negative
- priority: high
- objective: giữ nguyên hành vi lạ Q4 (b), (c).
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`; `service.list().size() == 1`.
- test data (`phone`): `"84 24 3825 1234"`, `"8491234567"`, `"+84 0912 345 678"`.
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "must be a valid phone number"}`; `service.list().size()` vẫn là 1.

### TC-23: CustomerService.create coi chuỗi chỉ gồm ký tự phân cách là không hợp lệ, không phải "không nhập"
- covers: AC-10
- side: be
- level: unit
- type: boundary
- priority: high
- objective: Q4 (a): kiểm tra rỗng chạy sau trim kiểu PHP và **trước** chuẩn hoá. `"\f"` bắt cách port bằng `String.trim()`/`strip()` (sẽ cho "không nhập").
- preconditions: kho mới đã có `service.create("Seed", "seed@example.com", null)`; `service.list().size() == 1`.
- test data (`phone`): `"-"`, `"()"`, `" . "`, `"\f"`.
- steps: Given kho có Seed / When gọi `service.create("Tran Thi Binh", "binh@example.com", phone)` / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "must be a valid phone number"}`; `service.list().size()` vẫn là 1.

### TC-24: CustomerService.create từ chối số trùng với khách hàng ACTIVE sau chuẩn hoá
- covers: AC-11
- side: be
- level: unit
- type: negative
- priority: high
- objective: BR-09: so trùng trên dạng chuẩn hoá, chỉ với khách hàng `ACTIVE`; thông điệp khác thông điệp "không hợp lệ".
- preconditions: kho mới; tạo theo thứ tự `service.create("Seed", "seed@example.com", null)` rồi `service.create("An", "an@example.com", "0912345678")`; `service.list().size() == 2`.
- test data: `create("Binh", "binh@example.com", "+84 912 345 678")`.
- steps: Given kho có Seed và An / When gọi `create` với số viết khác / Then bắt `ValidationException`.
- expected result: ném `ValidationException`; `errors()` bằng đúng `{"phone": "is already used by another customer"}`; thông điệp khác `"must be a valid phone number"`; `service.list().size()` vẫn là 2.

### TC-25: CustomerService.create chấp nhận số đang thuộc khách hàng INACTIVE
- covers: AC-12
- side: be
- level: unit
- type: functional
- priority: high
- objective: BR-09: khách hàng ngừng hoạt động không giữ số. Dữ liệu `INACTIVE` dựng bằng `InMemoryCustomerRepository` thật (D6), không mock.
- preconditions: trong phần Arrange (không dùng `service` của `@BeforeEach`):
  - `InMemoryCustomerRepository repository = new InMemoryCustomerRepository()`
  - `repository.insert("Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE)`
  - `CustomerService service = new CustomerService(repository)`
- test data: `create("New", "new@example.com", "0912345678")`.
- steps: Given kho có khách hàng INACTIVE giữ `0912345678` / When gọi `create` với cùng số / Then kiểm tra khách hàng trả về và kho.
- expected result: không ném exception; `created.id()` là 2, `created.phone()` là `"0912345678"`, `created.status()` là `ACTIVE`; `service.get(2).phone()` là `"0912345678"`; `service.list()` có 2 phần tử.

### TC-26: CustomerService.create gom lỗi phone cùng lỗi name và email
- covers: AC-13
- side: be
- level: unit
- type: negative
- priority: high
- objective: nhánh kiểm tra phone chạy độc lập với lỗi của field khác, mọi lỗi trả trong một `ValidationException`.
- preconditions: kho mới; `service.create("An", "an@example.com", "0912345678")`; `service.list().size() == 1`.
- test data (name, email, phone → `errors.phone`):
  - `""`, `"x"`, `"0912345678"` → `"is already used by another customer"`
  - `" "`, `"x"`, `"0412345678"` → `"must be a valid phone number"`
- steps: Given kho có An / When gọi `service.create(name, email, phone)` cho từng dòng / Then bắt `ValidationException`.
- expected result: `errors().keySet()` bằng đúng `{"name", "email", "phone"}`; `errors.name` là `"must not be blank"`, `errors.email` là `"must be a valid email address"`, `errors.phone` như bảng; `service.list().size()` vẫn là 1.

### TC-27: POST /api/customers không có số trả 201 với "phone": null
- covers: AC-1
- side: be
- level: integration
- type: functional
- priority: high
- objective: request nhận `phone` tuỳ chọn; response luôn có field `phone`, giá trị JSON `null` khi không có số (D4, contract `Customer.required`).
- preconditions: server `App.start(0, service)`; kho có seed `("Nguyen Van An", "an@example.com", null)` từ `@BeforeEach`.
- test data (body):
  - `{"name":"Tran Thi Binh","email":"binh@example.com"}` (thiếu field)
  - `{"name":"Le Van Cuong","email":"cuong@example.com","phone":null}`
  - `{"name":"Pham Thi Dung","email":"dung@example.com","phone":"   "}`
- steps: Given server đang chạy / When `POST /api/customers` với từng body / Then đọc response bằng `CustomerHandler.JSON.readTree`.
- expected result: mỗi response có status 201; `body.has("phone")` là `true` và `body.get("phone").isNull()` là `true`; `status` là `"ACTIVE"`.

### TC-28: POST /api/customers chuẩn hoá số, trả về và đọc lại được dạng chuẩn hoá
- covers: AC-4, AC-5
- side: be
- level: integration
- type: functional
- priority: high
- objective: `CustomerHandler` truyền `body.phone()` sang service; response 201 và `GET` sau đó đều có dạng chuẩn hoá, chưa định dạng hiển thị.
- preconditions: server đang chạy với seed như TC-27.
- test data: body `{"name":"Tran Thi Binh","email":"binh@example.com","phone":" (+84) 912.345-678 "}`.
- steps: Given server đang chạy / When `POST /api/customers` rồi `GET /api/customers/{id}` với `id` trong response / Then kiểm tra `phone` của cả hai response.
- expected result: POST trả 201, `phone` là `"0912345678"`; GET trả 200, `phone` là `"0912345678"`.

### TC-29: POST /api/customers với số không hợp lệ trả 400 Problem
- covers: AC-7
- side: be
- level: integration
- type: negative
- priority: high
- objective: `ValidationException` có key `phone` được map sang RFC 9457 Problem 400; không tạo khách hàng.
- preconditions: server đang chạy với seed như TC-27; `GET /api/customers` có 1 phần tử.
- test data: body `{"name":"Tran Thi Binh","email":"binh@example.com","phone":"0412345678"}`.
- steps: Given server đang chạy / When `POST /api/customers` / Then kiểm tra response rồi `GET /api/customers`.
- expected result: status 400; header `Content-Type` bắt đầu bằng `application/problem+json`; `title` là `"Validation failed"`; `errors` có đúng 1 key, `errors.phone` là `"must be a valid phone number"`; `GET /api/customers` vẫn có 1 phần tử.

### TC-30: POST /api/customers với số trùng khách hàng ACTIVE trả 400 Problem
- covers: AC-11
- side: be
- level: integration
- type: negative
- priority: high
- objective: lỗi trùng BR-09 đi qua HTTP với thông điệp riêng; không tạo khách hàng.
- preconditions: server đang chạy với seed như TC-27; đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201.
- test data: body `{"name":"Le Van Cuong","email":"cuong@example.com","phone":"+84 912 345 678"}`.
- steps: Given đã có khách hàng ACTIVE với `0912345678` / When `POST /api/customers` với số viết khác / Then kiểm tra response rồi `GET /api/customers`.
- expected result: status 400; `Content-Type` bắt đầu bằng `application/problem+json`; `errors` có đúng 1 key, `errors.phone` là `"is already used by another customer"`; `GET /api/customers` có 2 phần tử.

### TC-31: GET /api/customers trả field phone cho mọi phần tử
- covers: AC-14
- side: be
- level: integration
- type: functional
- priority: high
- objective: mỗi phần tử có `phone`: chuỗi chuẩn hoá khi có số, JSON `null` khi không có (field vẫn có mặt).
- preconditions: server đang chạy với seed như TC-27 (id 1, không có số); đã `POST {"name":"Tran Thi Binh","email":"binh@example.com","phone":"0912345678"}` và nhận 201 (id 2).
- test data: không có.
- steps: Given kho có khách hàng có số và không có số / When `GET /api/customers` / Then kiểm tra từng phần tử.
- expected result: status 200; mảng có 2 phần tử; phần tử 0: `has("phone")` là `true` và `get("phone").isNull()` là `true`; phần tử 1: `get("phone").isTextual()` là `true` và giá trị là `"0912345678"`.

### TC-32: GET /api/customers/{id} trả phone của khách hàng
- covers: AC-15
- side: be
- level: integration
- type: functional
- priority: high
- objective: endpoint lấy một khách hàng trả `phone` dạng chuẩn hoá.
- preconditions: server đang chạy với seed như TC-27; đã `POST {"name":"Le Van Cuong","email":"cuong@example.com","phone":"02438251234"}` và nhận 201 (id 2).
- test data: `GET /api/customers/2`.
- steps: Given khách hàng id 2 có số cố định / When `GET /api/customers/2` / Then kiểm tra body.
- expected result: status 200; `id` là 2; `phone` là `"02438251234"`.

### TC-33: formatPhone định dạng chuỗi 10 ký tự theo 4-3-3
- covers: AC-19
- side: fe
- level: unit
- type: functional
- priority: high
- objective: port `phone_format`: 10 ký tự → `xxxx xxx xxx`, chỉ dựa vào độ dài.
- preconditions: không có.
- test data (đầu vào → kết quả): `'0912345678'` → `'0912 345 678'`; `'0312345678'` → `'0312 345 678'`; `'012345678&'` → `'0123 456 78&'`.
- steps: Given từng chuỗi / When gọi `formatPhone(value)` / Then so bằng `assert.equal`.
- expected result: mọi dòng trả đúng chuỗi mong đợi.

### TC-34: formatPhone định dạng chuỗi 11 ký tự theo 3-4-4
- covers: AC-20
- side: fe
- level: unit
- type: functional
- priority: high
- objective: 11 ký tự → `xxx xxxx xxxx`, không phụ thuộc đầu số (Q4 d).
- preconditions: không có.
- test data (đầu vào → kết quả): `'02438251234'` → `'024 3825 1234'`; `'01234567890'` → `'012 3456 7890'`; `'09123456789'` → `'091 2345 6789'`.
- steps: Given từng chuỗi / When gọi `formatPhone(value)` / Then so bằng `assert.equal`.
- expected result: mọi dòng trả đúng chuỗi mong đợi.

### TC-35: formatPhone trả nguyên văn chuỗi có độ dài khác 10 và 11
- covers: AC-22
- side: fe
- level: unit
- type: boundary
- priority: medium
- objective: biên độ dài 0/1/8/9/12 trả nguyên đầu vào; `formatPhone` không escape (việc của component).
- preconditions: không có.
- test data (đầu vào → kết quả): `''` → `''`; `'0'` → `'0'`; `'<b>1</b>'` → `'<b>1</b>'`; `'091234567'` → `'091234567'`; `'024382512345'` → `'024382512345'`.
- steps: Given từng chuỗi / When gọi `formatPhone(value)` / Then so bằng `assert.equal`.
- expected result: mọi dòng trả nguyên đầu vào.

### TC-36: renderCustomerTable có cột Điện thoại giữa Email và Trạng thái
- covers: AC-18
- side: fe
- level: unit
- type: functional
- priority: high
- objective: thứ tự cột `ID, Họ tên, Email, Điện thoại, Trạng thái` như `customer_list.php`; mỗi dòng có đúng một ô điện thoại ở vị trí thứ 4.
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }`
  - `{ id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: null, status: 'INACTIVE' }`
- steps: Given danh sách hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result:
  - khớp `<thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th></tr></thead>`
  - khớp `<td>an@example.com</td><td>0912 345 678</td><td>Đang hoạt động</td>`
  - khớp `<td>binh@example.com</td><td>—</td><td>Ngừng hoạt động</td>`
  - mỗi `<tr>` trong `<tbody>` có đúng 5 `<td>`

### TC-37: renderCustomerTable hiển thị số 10 ký tự dạng 4-3-3
- covers: AC-19
- side: fe
- level: unit
- type: functional
- priority: high
- objective: ô điện thoại dùng `formatPhone` cho số di động.
- preconditions: không có.
- test data: `{ id: 1, name: 'An', email: 'an@example.com', phone: '0912345678', status: 'ACTIVE' }`.
- steps: Given một khách hàng / When gọi `renderCustomerTable([customer])` / Then so chuỗi HTML.
- expected result: khớp `<td>0912 345 678</td>`; không khớp `<td>0912345678</td>`.

### TC-38: renderCustomerTable hiển thị số 11 ký tự dạng 3-4-4
- covers: AC-20
- side: fe
- level: unit
- type: functional
- priority: high
- objective: số cố định và dữ liệu cũ 11 ký tự (không đầu `02`) đều định dạng 3-4-4.
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'An', email: 'an@example.com', phone: '02438251234', status: 'ACTIVE' }`
  - `{ id: 2, name: 'Binh', email: 'binh@example.com', phone: '01234567890', status: 'ACTIVE' }`
- steps: Given hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result: khớp `<td>024 3825 1234</td>` và `<td>012 3456 7890</td>`.

### TC-39: renderCustomerTable hiển thị — khi không có số
- covers: AC-21
- side: fe
- level: unit
- type: boundary
- priority: high
- objective: `null`, `''` và thiếu field đều hiển thị `—` (U+2014), như `customer_list.php` dòng 19.
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: null, status: 'ACTIVE' }`
  - `{ id: 2, name: 'B', email: 'b@example.com', phone: '', status: 'ACTIVE' }`
  - `{ id: 3, name: 'C', email: 'c@example.com', status: 'ACTIVE' }`
- steps: Given ba khách hàng / When gọi `renderCustomerTable(customers)` / Then đếm ô `—`.
- expected result: `html.match(/<td>—<\/td>/g).length` là 3; không khớp `<td></td>`, `<td>null</td>`, `<td>undefined</td>`.

### TC-40: renderCustomerTable hiển thị nguyên văn và escape HTML số có độ dài khác 10 và 11
- covers: AC-22
- side: fe
- level: unit
- type: negative
- priority: high
- objective: giá trị độ dài khác hiển thị nguyên văn và luôn qua `escapeHtml` (chống XSS).
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: '091234567', status: 'ACTIVE' }`
  - `{ id: 2, name: 'B', email: 'b@example.com', phone: '<b>1</b>', status: 'ACTIVE' }`
- steps: Given hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result: khớp `<td>091234567</td>` và `<td>&lt;b&gt;1&lt;/b&gt;</td>`; không khớp `/<b>1<\/b>/`.

### TC-41: renderCustomerTable định dạng trên giá trị gốc rồi mới escape
- covers: AC-19, AC-22
- side: fe
- level: unit
- type: boundary
- priority: medium
- objective: D9 "định dạng trước, escape sau": độ dài tính trên chuỗi gốc. Escape trước sẽ định dạng sai.
- preconditions: không có.
- test data:
  - `{ id: 1, name: 'A', email: 'a@example.com', phone: '012345678&', status: 'ACTIVE' }` (10 ký tự gốc, 14 sau escape)
  - `{ id: 2, name: 'B', email: 'b@example.com', phone: '12345&', status: 'ACTIVE' }` (6 ký tự gốc, 10 sau escape)
- steps: Given hai khách hàng / When gọi `renderCustomerTable(customers)` / Then so chuỗi HTML.
- expected result: khớp `<td>0123 456 78&amp;</td>` và `<td>12345&amp;</td>`; không khớp `<td>012345678&amp;</td>` hay `<td>1234 5&a mp;</td>` (kết quả khi escape trước).

### TC-42: createCustomer gửi nguyên giá trị phone người dùng nhập
- covers: AC-16
- side: fe
- level: unit
- type: functional
- priority: high
- objective: FE không tự chuẩn hoá, không kiểm tra, không bỏ field `phone` (D10).
- preconditions: `fakeFetch(201, { id: 7 }, calls)` truyền qua `{ fetchImpl }`.
- test data:
  - `{ name: 'An', email: 'an@example.com', phone: '0912 345 678' }`
  - `{ name: 'Binh', email: 'binh@example.com', phone: '' }`
- steps: Given `fakeFetch` ghi lại request / When gọi `createCustomer(input, { fetchImpl })` cho từng input / Then đọc `calls[i].init`.
- expected result: `calls[i].url` là `'/api/customers'`, `init.method` là `'POST'`; `JSON.parse(init.body)` bằng đúng input (deepEqual), cụ thể `phone` là `'0912 345 678'` ở lần 1 và `''` ở lần 2.

### TC-43: createCustomer ném ApiError có fieldErrors.phone đúng thông điệp của API
- covers: AC-17
- side: fe
- level: unit
- type: negative
- priority: high
- objective: lỗi `phone` từ Problem 400 đi vào `ApiError.fieldErrors`, để `main.js` hiển thị `phone: <thông điệp>` bằng cơ chế sẵn có.
- preconditions: `fakeFetch(400, problem)` truyền qua `{ fetchImpl }`.
- test data (`problem.errors.phone`), với `problem = { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { phone } }`:
  - `'must be a valid phone number'`
  - `'is already used by another customer'`
- steps: Given API trả Problem 400 / When gọi `createCustomer({ name: 'An', email: 'an@example.com', phone: '0412345678' }, { fetchImpl })` / Then `assert.rejects`.
- expected result: promise bị reject với `error instanceof ApiError`, `error.status === 400`, `error.fieldErrors.phone` bằng đúng thông điệp của dòng dữ liệu.

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-1, TC-2, TC-13, TC-14, TC-27 |
| AC-2 | TC-8, TC-15 |
| AC-3 | TC-8, TC-16 |
| AC-4 | TC-1, TC-3, TC-17, TC-28 |
| AC-5 | TC-4, TC-18, TC-28 |
| AC-6 | TC-4, TC-19 |
| AC-7 | TC-9, TC-20, TC-29 |
| AC-8 | TC-6, TC-10, TC-21 |
| AC-9 | TC-5, TC-10, TC-22 |
| AC-10 | TC-2, TC-7, TC-10, TC-23 |
| AC-11 | TC-12, TC-24, TC-30 |
| AC-12 | TC-11, TC-12, TC-25 |
| AC-13 | TC-26 |
| AC-14 | TC-11, TC-31 |
| AC-15 | TC-32 |
| AC-16 | TC-42 |
| AC-17 | TC-43 |
| AC-18 | TC-36 |
| AC-19 | TC-33, TC-37, TC-41 |
| AC-20 | TC-34, TC-38 |
| AC-21 | TC-39 |
| AC-22 | TC-35, TC-40, TC-41 |
