# Conventions

## Frontend
source-fe là JavaScript ES modules thuần, chạy thẳng trên trình duyệt. Không framework, không bundler, không dependency npm (`source-fe/package.json`: `"type": "module"`, không có `dependencies`). Node.js ≥ 22 chỉ dùng để build và test.

**Cấu trúc thư mục**
| Thư mục/file | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `index.html` | Trang duy nhất, CSS inline, nạp `./src/main.js` bằng `<script type="module">` | `source-fe/index.html` |
| `src/main.js` | Entry: lấy phần tử DOM theo `id`, gắn sự kiện, gọi API và component | `source-fe/src/main.js` |
| `src/api/` | Gọi HTTP tới BE, mỗi resource một file | `source-fe/src/api/customerApi.js` |
| `src/components/` | Hàm thuần nhận data, trả về chuỗi HTML | `source-fe/src/components/customerTable.js` |
| `src/utils/` | Hàm tiện ích thuần, mỗi file export một hàm cùng tên file | `source-fe/src/utils/escapeHtml.js`, `source-fe/src/utils/formatPhone.js` |
| `scripts/` | Script build (Node) | `source-fe/scripts/build.mjs` |
| `test/` | Unit test `<module>.test.js` | `source-fe/test/customerApi.test.js` |

**Gọi API**: mọi request đi qua hàm nội bộ `request(path, { fetchImpl = fetch, ...init })` trong `source-fe/src/api/customerApi.js`:
- Ghép `API_BASE = '/api'` với path.
- Luôn gửi `Accept: application/json`. Chỉ gửi `Content-Type: application/json` khi có body.
- Parse body bằng `response.json().catch(() => null)`.
- Response non-2xx ném `ApiError(status, problem)` với `fieldErrors = problem?.errors ?? {}`.
- Hàm public (`listCustomers`, `createCustomer`) nhận `options` cuối cùng để truyền `fetchImpl` khi test.
- Import dùng đường dẫn tương đối, ghi rõ đuôi `.js`.

**State và render**: không có thư viện state hay cache phía client. Sau mỗi thay đổi, `refresh()` gọi lại API và gán `listEl.innerHTML = renderCustomerTable(...)` (`source-fe/src/main.js`). Component là hàm thuần trả về chuỗi. **Mọi dữ liệu động đi qua `escapeHtml`** (`source-fe/src/components/customerTable.js`). Nhãn hiển thị tiếng Việt đặt ngay trong component (`STATUS_LABELS`). Nếu không có nhãn cho một giá trị thì hiển thị giá trị gốc (`STATUS_LABELS[c.status] ?? c.status`).

**Giá trị hiển thị**: BE trả giá trị thô, FE đổi sang dạng hiển thị lúc render (`status` → `STATUS_LABELS`, `phone` → `formatPhone`). FE không tự chuẩn hoá hay kiểm tra dữ liệu nhập: `source-fe/src/main.js` gửi nguyên giá trị của form. Trong `source-fe/src/components/customerTable.js`:
- Hàm định dạng nằm ở `src/utils/` và không biết gì về ô trống. Quyết định "trống thì hiện gì" nằm trong component, qua hằng (`c.phone ? formatPhone(c.phone) : NO_PHONE`).
- **Định dạng trước, escape sau**: `escapeHtml(...)` bọc ngoài kết quả định dạng, vì định dạng dựa trên độ dài chuỗi gốc.

**Xử lý lỗi**: `source-fe/src/main.js` bắt lỗi quanh từng thao tác.
- Nếu có `ApiError.fieldErrors`, ghép thành `field: msg; ...` rồi ghi vào `#message` (có `role="alert"`).
- Nếu không, hiển thị thông báo tiếng Việt chung: "Không tải được danh sách khách hàng." hoặc "Không lưu được khách hàng."
- Gán nội dung dạng text bằng `textContent`.

**Đặt tên và style**
- File `.js` đặt tên camelCase (`customerApi.js`, `escapeHtml.js`). Hàm camelCase, bắt đầu bằng động từ (`listCustomers`, `renderCustomerTable`). Class PascalCase (`ApiError`). Hằng UPPER_SNAKE_CASE (`API_BASE`, `STATUS_LABELS`, `NO_PHONE`, `ENTITIES`).
- Chuỗi dùng nháy đơn, có chấm phẩy, thụt lề 2 dấu cách, dùng `async/await`.
- Một số export có JSDoc một dòng `/** ... */` (`ApiError`, `renderCustomerTable`, `escapeHtml`, `formatPhone`). `listCustomers`, `createCustomer` và `API_BASE` chưa có JSDoc. Đầu `customerApi.js` và `build.mjs` có comment `//` mô tả file.
- Text UI tiếng Việt. Comment và tên code tiếng Anh.
- Không có cấu hình ESLint/Prettier trong `source-fe/`.

## Backend
source-be là Java 21 (`maven.compiler.release=21`), Maven qua wrapper (`source-be/mvnw`, `source-be/mvnw.cmd`; Maven 3.9.16). HTTP dùng `com.sun.net.httpserver.HttpServer` của JDK, JSON dùng Jackson `jackson-databind` 2.22.3 (`source-be/pom.xml`). Không có framework hay DI container.

**Layering** (package `com.example.crm`, thư mục `source-be/src/main/java/com/example/crm/`)
| Package | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `api` | HTTP handler, định tuyến, request record, body lỗi `Problem` | `api/CustomerHandler.java`, `api/CreateCustomerRequest.java`, `api/Problem.java` |
| `service` | Toàn bộ validation và quy tắc nghiệp vụ ("All validation happens here, not in the HTTP layer"). Quy tắc của một kiểu giá trị được tách thành class tiện ích package-private chỉ có hàm `static` | `service/CustomerService.java`, `service/PhoneNumbers.java` |
| `repository` | Interface lưu trữ và bản cài đặt in-memory | `repository/CustomerRepository.java`, `repository/InMemoryCustomerRepository.java` |
| `domain` | Model bất biến (`record`) và `enum` | `domain/Customer.java`, `domain/CustomerStatus.java` |
| `error` | Exception nghiệp vụ, kế thừa `RuntimeException` | `error/ValidationException.java`, `error/NotFoundException.java` |
| (gốc) | Tạo server, nối dependency bằng tay qua constructor, seed dữ liệu | `App.java` |

Luồng: `CustomerHandler` → `CustomerService` → `CustomerRepository`. Dependency được truyền qua constructor (`new CustomerService(new InMemoryCustomerRepository())` trong `App.main`).

**Định tuyến**: `CustomerHandler.route` so sánh `path` + `method` bằng `equals`, dùng regex `Pattern` cho path có tham số (`BY_ID = ^/api/customers/(\d+)$`). Route không khớp trả 404 Problem. `ObjectMapper` dùng chung là hằng `CustomerHandler.JSON` (package-private, test cũng dùng lại).

**Validation**: `CustomerService.create` trim input (coi `null` là chuỗi rỗng), gom lỗi theo field vào `LinkedHashMap<String, String>`, rồi ném `ValidationException(errors)` một lần. Thông điệp lỗi tiếng Anh, chữ thường, dạng `must ...` / `is ...`, không lặp lại giá trị người dùng nhập. Giới hạn đặt thành hằng (`NAME_MAX_LENGTH = 100`).
- `name` và `email` dùng `String.trim()`. `phone` dùng `PhoneNumbers.trim`, vì phải bỏ đúng tập ký tự của `trim()` PHP.
- Mỗi field một khối `if / else if`, nên mỗi field có tối đa một thông điệp. Các field được kiểm tra độc lập: field này lỗi không chặn việc kiểm tra field khác.
- Truy vấn repository (`existsByEmail`, `existsByPhoneAndStatus`) chỉ chạy khi giá trị đã qua kiểm tra định dạng.
- Field tuỳ chọn: rỗng sau trim thì bỏ qua mọi kiểm tra và lưu `null` (`phone`).

**Port quy tắc legacy**: `service/PhoneNumbers.java` port `phone_normalize` và `phone_is_valid` của `source-legacy/lib/phone.php` theo từng bước, kể cả các trường hợp biên (vd. `84` chỉ được đổi khi chuỗi dài đúng 11 ký tự, `"+84"` đứng một mình thành `"0"`). Javadoc của class dẫn chiếu file legacy và mã quy tắc (BR-07). Tập ký tự được viết tường minh thành hằng (`TRIM_CHARACTERS`, `SEPARATORS`, `VALID`), không dùng `String.trim()`/`strip()` hay lớp ký tự Unicode; comment `//` ngay trên `TRIM_CHARACTERS` và `SEPARATORS` ghi hành vi PHP/PCRE tương ứng.

**Xử lý lỗi**: service ném exception, còn `CustomerHandler.handle` map sang HTTP với body `Problem` theo RFC 9457, `Content-Type: application/problem+json`. Bảng map xem `aiws/knowledge/api-inventory.md` → Quy ước. `exchange.close()` nằm trong `finally`.

**Logging**: không có framework logging. Chỉ có `System.out.println` khi khởi động (`App.main`). Lỗi 500 không được log (`CustomerHandler.handle`).

**Đặt tên và style**
- Class PascalCase, method/field camelCase, hằng `static final` UPPER_SNAKE_CASE (`NAME_MAX_LENGTH`, `EMAIL`, `BY_ID`, `JSON`, `TRIM_CHARACTERS`, `SEPARATORS`, `VALID`). `Pattern` biên dịch sẵn là hằng `private static final`. Mỗi file một top-level type; type đó là `public`, trừ class chỉ dùng trong package thì để package-private (`PhoneNumbers`).
- Thụt lề 2 dấu cách. Class tiện ích là `final` với constructor `private` (`App`, `PhoneNumbers`).
- Phần lớn type có Javadoc một dòng (`Customer`, `CustomerService`, `CustomerHandler`, `PhoneNumbers`...). Riêng `CustomerStatus` và interface `CustomerRepository` chưa có Javadoc ở mức type; trong `CustomerRepository` chỉ `insert` có Javadoc ở mức method.
- Repository đặt tên method kiểu `findAll`, `findById`, `existsByEmail`, `existsByPhoneAndStatus`, `insert`, và trả `Optional` cho truy vấn một bản ghi. Repository chỉ truy vấn và lưu đúng giá trị nhận được; quyết định nghiệp vụ (vd. khách hàng mới là `ACTIVE`, chỉ khách hàng `ACTIVE` giữ số) nằm ở service và được truyền xuống qua tham số.
- Không có plugin lint/format (Checkstyle, Spotless...) trong `source-be/pom.xml`.
- Line ending: `mvnw` dùng LF, `*.cmd` dùng CRLF (`source-be/.gitattributes`).

## Test
**BE**: JUnit Jupiter, version quản lý bởi `junit-bom` **6.1.3**, chạy qua `maven-surefire-plugin` 3.6.0 (`source-be/pom.xml`).
- Vị trí: `source-be/src/test/java`, cùng package với class được test (nên test gọi được class và hằng package-private như `PhoneNumbers`, `CustomerHandler.JSON`). Tên class là `<Class>Test` (`service/CustomerServiceTest.java`, `service/PhoneNumbersTest.java`, `repository/InMemoryCustomerRepositoryTest.java`, `api/CustomerHandlerTest.java`).
- Tên method camelCase mô tả hành vi (`createRejectsDuplicateEmail`), kèm `@DisplayName("...")` bằng câu tiếng Anh.
- Arrange-Act-Assert. Comment `// Arrange`, `// Act`, `// Assert` (hoặc `// Arrange / Act`) chỉ có ở test đầu tiên của mỗi class (`CustomerServiceTest.createStoresTrimmedActiveCustomer`, `PhoneNumbersTest.trimStripsPhpTrimCharactersFromBothEnds`, `InMemoryCustomerRepositoryTest.insertStoresGivenPhoneAndStatus`); các test khác theo AAA, tách ba phần bằng dòng trống, không có comment. `CustomerHandlerTest` không có comment AAA.
- **Test theo bảng dữ liệu**: `@ParameterizedTest` + `@MethodSource("<tênProvider>")`. Provider là method `private static` đặt ngay sau test, trả `Stream<Arguments>` (dùng `Arguments.arguments(...)`, nhiều tham số) hoặc `Stream<String>` (một tham số). Thêm `@NullSource` khi cần ca `null` (`CustomerServiceTest`, TC-13). Khi dòng dữ liệu chứa ký tự điều khiển, tên từng lần chạy chỉ là số thứ tự: `@ParameterizedTest(name = ROW_NAME)` với `ROW_NAME = "[{index}]"` (`PhoneNumbersTest`, `CustomerServiceTest`; `CustomerHandlerTest` viết thẳng `name = "[{index}]"`). Dòng dữ liệu khó hiểu có comment `//` cuối dòng. Package `org.junit.jupiter.params` có sẵn qua artifact `junit-jupiter`; `source-be/pom.xml` không khai báo thêm dependency nào cho việc này.
- Không dùng mock framework. Service test dùng `InMemoryCustomerRepository` thật, tạo mới trong `@BeforeEach`. Trạng thái mà API public không tạo ra được (khách hàng `INACTIVE`) được dựng bằng cách gọi thẳng `repository.insert(..., CustomerStatus.INACTIVE)` trên repository thật rồi tạo `CustomerService` trên chính repository đó (`CustomerServiceTest`, TC-25). Repository test tạo `InMemoryCustomerRepository` ngay trong từng test (`InMemoryCustomerRepositoryTest`). HTTP test khởi động `App.start(0, service)` trên port ngẫu nhiên, gọi bằng `java.net.http.HttpClient`, và dừng server bằng `server.stop(0)` trong `@AfterEach` (`source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`).
- Assertion dùng `org.junit.jupiter.api.Assertions` (`assertEquals`, `assertNull`, `assertThrows`, `assertTrue`, `assertFalse`). Lỗi validation được so cả map khi cần chắc không có lỗi thừa (`assertEquals(Map.of("phone", "..."), error.errors())`). Parse JSON response bằng `CustomerHandler.JSON.readTree`.

**FE**: `node:test` + `node:assert/strict`, không có thư viện test ngoài.
- Vị trí: `source-fe/test/<module>.test.js`.
- Tên test là câu tiếng Anh, bắt đầu bằng tên hàm (`'renderCustomerTable escapes HTML in customer data'`).
- Mock HTTP bằng `fakeFetch(status, body, calls)`, truyền vào qua `{ fetchImpl }` (`source-fe/test/customerApi.test.js`).
- Test component bằng cách so chuỗi HTML (`assert.match`, `assert.doesNotMatch`) (`source-fe/test/customerTable.test.js`).
- Test theo bảng dữ liệu: một mảng dữ liệu (cặp `[value, expected]` hoặc giá trị đơn), lặp bằng `for...of` trong **một** `test(...)` (`source-fe/test/formatPhone.test.js`; `source-fe/test/customerApi.test.js` TC-42, TC-43). Không dùng `describe` hay subtest.
- AAA có comment ở test đầu tiên của `customerTable.test.js` và `formatPhone.test.js`.
- `source-fe/index.html` và `source-fe/src/main.js` không có test tự động, vì `node:test` không có DOM.

**Mã TC**: test viết từ REQ-001 trở đi mang mã TC ở đầu tên hiển thị (quy tắc truy vết, AGENTS.md mục 8), đúng hình thức trong `aiws/skills/be-conventions/SKILL.md` và `aiws/skills/fe-conventions/SKILL.md`. Tên method Java **không** chứa mã TC. Ở REQ-001, mã TC đánh số liên tục TC-1..TC-43 theo `aiws/work/REQ-001/03-test-spec.md`. [CẦN XÁC NHẬN] REQ sau đánh số tiếp hay bắt đầu lại từ TC-1: tên test hiện không chứa mã REQ, nên nếu bắt đầu lại thì mã TC sẽ trùng nhau trong cùng một file test.
- BE: `@DisplayName("TC-n: ...")`, kể cả trên `@ParameterizedTest`. Ví dụ `@DisplayName("TC-11: insert stores the given phone and status")`.
- FE: `test('TC-n: ...', ...)`, sau mã TC vẫn bắt đầu bằng tên hàm. Ví dụ `test('TC-33: formatPhone formats a 10-character string as 4-3-3', ...)`.

| Mã TC (REQ-001) | File |
| --- | --- |
| TC-1..TC-10 | `source-be/src/test/java/com/example/crm/service/PhoneNumbersTest.java` |
| TC-11, TC-12 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` |
| TC-13..TC-26 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` |
| TC-27..TC-32 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-33..TC-35 | `source-fe/test/formatPhone.test.js` |
| TC-36..TC-41 | `source-fe/test/customerTable.test.js` |
| TC-42, TC-43 | `source-fe/test/customerApi.test.js` |

15 test có từ trước REQ-001 vẫn **không có mã TC**: 5 trong `CustomerServiceTest`, 4 trong `CustomerHandlerTest`, 3 trong `customerTable.test.js`, 3 trong `customerApi.test.js`.

## Build & lệnh
Lệnh dưới đây khớp với `aiws/config/policies.yaml` → `commands`, chạy từ gốc workspace:

| Lệnh | Windows | POSIX | Thực chất |
| --- | --- | --- | --- |
| `be_build` | `cd source-be && .\mvnw.cmd -q -DskipTests package` | `cd source-be && ./mvnw -q -DskipTests package` | Maven `package` → `source-be/target/crm-api-0.1.0-SNAPSHOT.jar` |
| `be_test` | `cd source-be && .\mvnw.cmd -q test` | `cd source-be && ./mvnw -q test` | Surefire chạy JUnit |
| `fe_build` | `npm run build --prefix source-fe` | (giống) | script `build` = `node scripts/build.mjs`: `node --check` mọi `src/**/*.js` rồi chép sang `dist/` |
| `fe_test` | `npm test --prefix source-fe` | (giống) | script `test` = `node --test` (tự tìm file theo pattern mặc định, gồm `test/*.test.js`) |

- Yêu cầu: JDK 21 (wrapper `distributionType=only-script` tự tải Maven nhưng không tải JDK), Node.js ≥ 22 (`source-fe/package.json` → `engines`).
- Lint: không có ở cả hai phía.
- Chạy BE local: `App.main` đọc `PORT` (mặc định 8080). [CẦN XÁC NHẬN] lệnh chạy chính thức, vì `pom.xml` không có exec/shade plugin và jar không có `Main-Class`.
- Chạy FE local: [CẦN XÁC NHẬN] không có dev server. FE cần được phục vụ cùng origin với BE để `/api` hoạt động.
