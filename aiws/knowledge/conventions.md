# Conventions

## Frontend
source-fe là JavaScript ES modules thuần, chạy thẳng trên trình duyệt. Không framework, không bundler, không dependency npm (`source-fe/package.json`: `"type": "module"`, không có `dependencies`). Node.js ≥ 22 chỉ dùng để build và test.

**Cấu trúc thư mục**
| Thư mục/file | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `index.html` | Trang duy nhất, CSS inline, nạp `./src/main.js` bằng `<script type="module">` | `source-fe/index.html` |
| `src/main.js` | Entry: lấy phần tử DOM theo `id`, gắn sự kiện, gọi API và component | `source-fe/src/main.js` |
| `src/api/` | Gọi HTTP tới BE, mỗi resource một file | `source-fe/src/api/customerApi.js` |
| `src/components/` | Hàm thuần nhận data, trả về chuỗi HTML. Mỗi file export một hàm `render<Tên>` | `source-fe/src/components/customerTable.js`, `source-fe/src/components/customerEditForm.js` |
| `src/utils/` | Hàm tiện ích thuần, mỗi file export một hàm cùng tên file. Ngoại lệ (REQ-004): `createDoubleClickGuard.js` export một **factory** trả về hàm có state riêng (closure, không `class`), không phải hàm thuần không state như ba file kia | `source-fe/src/utils/escapeHtml.js`, `source-fe/src/utils/formatPhone.js`, `source-fe/src/utils/describeStatusError.js` (REQ-003), `source-fe/src/utils/createDoubleClickGuard.js` (REQ-004) |
| `scripts/` | Script build (Node) | `source-fe/scripts/build.mjs` |
| `test/` | Unit test `<module>.test.js` | `source-fe/test/customerApi.test.js` |

**Gọi API**: mọi request đi qua hàm nội bộ `request(path, { fetchImpl = fetch, ...init })` trong `source-fe/src/api/customerApi.js`:
- Ghép `API_BASE = '/api'` với path.
- Luôn gửi `Accept: application/json`. Chỉ gửi `Content-Type: application/json` khi có body.
- Parse body bằng `response.json().catch(() => null)`.
- Response non-2xx ném `ApiError(status, problem)` với `fieldErrors = problem?.errors ?? {}`.
- Hàm public (`listCustomers`, `createCustomer`, `getCustomer`, `updateCustomer`, `updateCustomerStatus` (REQ-003)) nhận `options` cuối cùng để truyền `fetchImpl` khi test.
- Mỗi thao tác một hàm public riêng; không gộp thêm và sửa vào một hàm. Hàm ghi truyền `{ ...options, method, body: JSON.stringify(customer) }` và gửi đúng object nhận vào (không thêm `id`, không chuẩn hoá).
- Tham số trên path đi qua `encodeURIComponent` trong template literal: `` `/customers/${encodeURIComponent(id)}` `` (`getCustomer`, `updateCustomer`).
- **(REQ-005)** Tiêu chí lọc đi qua `options` đang có, không thêm tham số theo vị trí: `listCustomers({ status, ...options } = {})` tách `status` khỏi `options` **trước** khi gọi `request()` (nếu không, `status` sẽ rải vào tham số thứ hai của `fetch`). `status` có giá trị thì ghép vào query string qua `encodeURIComponent`, giống tham số path; rỗng/`undefined`/`null` thì gọi path không `?`. Đây là hàm FE đầu tiên thêm tiêu chí tuỳ chọn vào `options` thay vì chỉ mang `fetchImpl`.
- Import dùng đường dẫn tương đối, ghi rõ đuôi `.js`.

**State và render**: không có thư viện state hay cache phía client. Sau mỗi thay đổi, `refresh()` gọi lại API và gán `listEl.innerHTML = renderCustomerTable(...)` (`source-fe/src/main.js`). Component là hàm thuần trả về chuỗi.
- **(REQ-004)** `main.js` giữ state lần đầu tiên: `const acceptStatusClick = createDoubleClickGuard()` ở mức module (cạnh `listEl`, `messageEl`), một guard duy nhất cho nút đổi trạng thái. State thật (`Map` key → thời điểm) nằm trong `src/utils/createDoubleClickGuard.js`, không phải trong `main.js`; `main.js` chỉ gọi `acceptStatusClick(key, at)` ngay sau khi nhận ra nút và **trước** khi xoá thông báo, bỏ qua lần bấm khi hàm trả `false`. State mất khi tải lại trang (không có storage phía client). **(REQ-006)** `key` không còn luôn là `button.dataset.statusId`: `main.js` tính key bằng hàm thuần `chooseStatusClickKey(filterEl.value, button.dataset.statusId)` (`source-fe/src/utils/chooseStatusClickKey.js`) — khi đang lọc (`filterEl.value` truthy), mọi khách hàng dùng chung một key là một `Symbol` module-level (lần đầu guard nhận key không phải chuỗi); khi xem "Tất cả" (falsy), key vẫn là chính `customerId` như REQ-004. Guard và `createDoubleClickGuard.js` bản thân không đổi; "đang lọc hay không" và "key nào" nằm trong `chooseStatusClickKey`, không trong `main.js`. **Mọi dữ liệu động đi qua `escapeHtml`**, kể cả khi nằm trong thuộc tính (`value="..."`, `data-id="..."`, `data-edit-id="..."`) và kể cả thông điệp lỗi của API (`source-fe/src/components/customerTable.js`, `source-fe/src/components/customerEditForm.js`). `escapeHtml(null)` và `escapeHtml(undefined)` cho chuỗi rỗng (`source-fe/src/utils/escapeHtml.js`), nên field thiếu thành `value=""`. Nhãn hiển thị tiếng Việt đặt ngay trong component (`STATUS_LABELS`, `FIELDS`). Nếu không có nhãn cho một giá trị thì hiển thị giá trị gốc (`STATUS_LABELS[c.status] ?? c.status`).
- **(REQ-005)** Lựa chọn lọc nằm trong đúng **một** nơi là điều khiển tĩnh `<select id="status-filter">` (`source-fe/index.html`); không có state JS giữ bản sao của nó. `main.js` tạo `const loadCustomers = createCustomerListLoader(listCustomers, () => filterEl.value)` **một lần** ở mức module; mỗi lần `refresh()` gọi `loadCustomers()`, hàm trả về đọc `filterEl.value` **ngay tại thời điểm gọi** (qua `getStatus`), không phải lúc tạo loader và không lưu lại giữa các lần. State thật của REQ-005 là số thứ tự lần tải mới nhất, giữ trong closure của `createCustomerListLoader.js` (factory thứ hai sau `createDoubleClickGuard.js`, cùng mẫu: state trong closure, không `class`, không state ở mức module); mất khi tải lại trang. `refresh()` chỉ gán `listEl.innerHTML` khi kết quả mang `current: true`; lần tải bị một lần tải mới hơn vượt qua không đổi gì trên màn hình (kể cả khi nó lỗi). Bốn chỗ gọi `refresh()` (mở trang, đổi lựa chọn, sau khi thêm/sửa/đổi trạng thái) đều đi qua một loader duy nhất nên luôn theo lựa chọn đang chọn.
- **(REQ-006)** Lựa chọn lọc được đọc thêm ở hai chỗ ngoài `createCustomerListLoader`: `refresh()` đọc `filterEl.value` một lần vào biến cục bộ `statusFilter`, **trước** `await loadCustomers()` và không có `await` ở giữa (cùng giá trị với lần tải), để chọn câu trạng thái rỗng của `renderCustomerTable(customers, statusFilter)`; listener của nút đổi trạng thái đọc `filterEl.value` lúc bấm để chọn key của guard qua `chooseStatusClickKey(filterEl.value, button.dataset.statusId)`. Đây là điểm nới duy nhất của lệnh cấm "không gán `filterEl.value` vào một biến" (REQ-005 D9): biến `statusFilter` trong `refresh()` chỉ sống trong một lần gọi, không lên mức module; `getStatus` của loader (`() => filterEl.value`) không đổi.
- Vùng nội dung động là một phần tử chứa rỗng có `id` trong `source-fe/index.html` (`#customers`, `#edit-customer`); `main.js` gán `innerHTML` bằng kết quả của component và gán `''` để đóng.
- `main.js` không giữ trạng thái "đang sửa ai": `id` nằm trong HTML đã render (`data-edit-id` trên nút, `data-id` trên form) và được đọc lại qua `dataset`. Dữ liệu để điền form được lấy lại từ API lúc mở form (`getCustomer`), không lấy từ danh sách đã tải.
- Form có nhiều trường lặp cùng cấu trúc được khai báo bằng một mảng hằng (`FIELDS = [{ name, label, type }]`) rồi `map(...).join('')`. `id` của phần tử theo mẫu `edit-{field}`, phần tử lỗi là `edit-{field}-error` (`source-fe/src/components/customerEditForm.js`).

**Sự kiện**: phần tử tĩnh trong `index.html` được gắn listener trực tiếp (`#create-form`). Phần tử nằm trong vùng bị gán lại `innerHTML` thì dùng **event delegation** trên vùng chứa: `event.target.closest('button[data-edit-id]')` trên `#customers`, `submit` và `closest('button[data-cancel-edit]')` trên `#edit-customer` (`source-fe/src/main.js`). Nút hành động trong trang là `<button type="button">` mang thuộc tính `data-*`, không dùng liên kết. Sau khi dựng form, `main.js` đưa focus vào ô đầu tiên, hoặc vào ô `[aria-invalid="true"]` đầu tiên khi có lỗi.

**Giá trị hiển thị**: BE trả giá trị thô, FE đổi sang dạng hiển thị lúc render (`status` → `STATUS_LABELS`, `phone` → `formatPhone`). FE không tự chuẩn hoá hay kiểm tra dữ liệu nhập: `source-fe/src/main.js` gửi nguyên giá trị của form. Trong `source-fe/src/components/customerTable.js`:
- Hàm định dạng nằm ở `src/utils/` và không biết gì về ô trống. Quyết định "trống thì hiện gì" nằm trong component, qua hằng (`c.phone ? formatPhone(c.phone) : NO_PHONE`).
- **Định dạng trước, escape sau**: `escapeHtml(...)` bọc ngoài kết quả định dạng, vì định dạng dựa trên độ dài chuỗi gốc.

**Ô nhập không định dạng**: khác với bảng, form sửa điền nguyên giá trị API trả vào `value` (`0912345678`, không phải `0912 345 678`; `null` thành `value=""`, không phải `—`). `source-fe/src/components/customerEditForm.js` không dùng `formatPhone` hay `NO_PHONE`. Form có `novalidate`; BE là nguồn quy tắc duy nhất.

**Xử lý lỗi**: `source-fe/src/main.js` bắt lỗi quanh từng thao tác. Mỗi handler của người dùng (submit form thêm, bấm "Sửa", submit form sửa, bấm "Huỷ", bấm nút đổi trạng thái, **(REQ-006)** đổi lựa chọn lọc) xoá thông báo trước khi chạy; `refresh()` thì không. **(REQ-004)** Ngoại lệ: handler của nút đổi trạng thái chỉ xoá thông báo khi `acceptStatusClick(...)` trả `true`; lần bấm bị bỏ qua (chống bấm đúp, `source-fe/src/utils/createDoubleClickGuard.js`) thoát trước dòng xoá, nên không đổi gì trên màn hình, kể cả câu lỗi của lần bấm trước. **(REQ-006)** "Xoá thông báo" nghĩa là gọi hàm cục bộ `clearMessages()` (`messageEl.textContent = ''; noticeEl.textContent = '';`), dùng ở cả sáu handler trên thay cho gán trực tiếp `messageEl.textContent = ''`, để không handler nào xoá vùng lỗi `#message` mà quên vùng thông báo thành công `#notice` (hay ngược lại). `refresh()` không đụng `#notice`: thông báo thêm khách hàng còn nguyên nếu lần tải lại ngay sau đó thất bại. Có ba cách hiện lỗi theo field/thao tác, tuỳ handler:
- Form thêm (`#create-form`): nếu có `ApiError.fieldErrors`, ghép thành `field: msg; ...` rồi ghi vào `#message` (có `role="alert"`). **(REQ-006)** Khi thêm thành công: `form.reset()`, rồi `noticeEl.textContent = describeCreateNotice(created, filterEl.value)` (`source-fe/src/utils/describeCreateNotice.js`) **trước** `await refresh()` — câu "Đã thêm khách hàng." (text thuần, gán bằng `textContent`, vùng `#notice` có `role="status"`, không phải `role="alert"` như `#message`) chỉ khi đang lọc và khách hàng mới không khớp lựa chọn lọc đang chọn (xét theo `status` API trả, không mặc định `ACTIVE`); nhánh `catch` không gán `#notice`.
- Form sửa: nếu có `ApiError.fieldErrors`, dựng lại form bằng `renderCustomerEditForm(giá trị vừa nhập, error.fieldErrors)`. Component đặt lỗi ngay sau ô nhập của trường đó (`<span id="edit-{field}-error" class="error" role="alert">`), thêm `aria-invalid="true"` và `aria-describedby` vào ô nhập, và bỏ qua key không thuộc `FIELDS`. Thông điệp là nguyên văn tiếng Anh của API.
- **Đổi trạng thái** (REQ-003): không dựng lại gì và không tải lại danh sách; `#message` nhận câu do hàm thuần `describeStatusError(error)` chọn (`source-fe/src/utils/describeStatusError.js`), nhận biết lỗi trùng số bằng hình dạng `error?.fieldErrors?.phone` (không `instanceof ApiError`), trả chuỗi text thuần tiếng Việt cố định, không lặp lại thông điệp tiếng Anh của API.
- Nếu không có `fieldErrors`, hiển thị thông báo tiếng Việt chung: "Không tải được danh sách khách hàng." (`refresh()` ghi vào chính vùng `#customers`), "Không tải được khách hàng." (bấm "Sửa", ghi vào `#message`), "Không lưu được khách hàng." (form thêm và form sửa, ghi vào `#message`). Khi lỗi kiểu này, vùng form sửa không bị dựng lại nên giữ nguyên giá trị đang nhập.
- Gán nội dung dạng text bằng `textContent`.
- Logic "lỗi nào vào ô nào"/"lỗi nào thì hiện câu nào" nằm trong hàm thuần (component hoặc `src/utils/`) để unit test được; `main.js` chỉ nối sự kiện với API và hàm thuần đó.

**Đặt tên và style**
- File `.js` đặt tên camelCase (`customerApi.js`, `escapeHtml.js`, `describeStatusError.js`). Hàm camelCase, bắt đầu bằng động từ (`listCustomers`, `getCustomer`, `updateCustomer`, `updateCustomerStatus`, `renderCustomerTable`, `renderCustomerEditForm`, `describeStatusError`). Class PascalCase (`ApiError`). Hằng UPPER_SNAKE_CASE (`API_BASE`, `STATUS_LABELS`, `STATUS_ACTIONS`, `NO_PHONE`, `FIELDS`, `ENTITIES`, `PHONE_IN_USE_MESSAGE`, `GENERIC_MESSAGE`).
- Chuỗi dùng nháy đơn, có chấm phẩy, thụt lề 2 dấu cách, dùng `async/await`. HTML được dựng bằng template literal (nối bằng `+` khi dài), viết liền, không có xuống dòng trong chuỗi sinh ra.
- Một số export có JSDoc một dòng `/** ... */` (`ApiError`, `getCustomer`, `updateCustomer`, `renderCustomerTable`, `renderCustomerEditForm`, `escapeHtml`, `formatPhone`). `listCustomers`, `createCustomer` và `API_BASE` chưa có JSDoc. Đầu `customerApi.js` và `build.mjs` có comment `//` mô tả file.
- Text UI tiếng Việt. Comment và tên code tiếng Anh.
- Không có cấu hình ESLint/Prettier trong `source-fe/`.

## Backend
source-be là Java 21 (`maven.compiler.release=21`), Maven qua wrapper (`source-be/mvnw`, `source-be/mvnw.cmd`; Maven 3.9.16). HTTP dùng `com.sun.net.httpserver.HttpServer` của JDK, JSON dùng Jackson `jackson-databind` 2.22.3 (`source-be/pom.xml`). Không có framework hay DI container.

**Layering** (package `com.example.crm`, thư mục `source-be/src/main/java/com/example/crm/`)
| Package | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `api` | HTTP handler, định tuyến, request record (mỗi thao tác ghi một record riêng, Javadoc một dòng `Request body of <METHOD> <path>.`), body lỗi `Problem` | `api/CustomerHandler.java`, `api/CreateCustomerRequest.java`, `api/UpdateCustomerRequest.java`, `api/UpdateCustomerStatusRequest.java` (REQ-003), `api/Problem.java` |
| `service` | Toàn bộ validation và quy tắc nghiệp vụ ("All validation happens here, not in the HTTP layer"). Quy tắc của một kiểu giá trị được tách thành class tiện ích package-private chỉ có hàm `static` | `service/CustomerService.java`, `service/PhoneNumbers.java` |
| `repository` | Interface lưu trữ và bản cài đặt in-memory | `repository/CustomerRepository.java`, `repository/InMemoryCustomerRepository.java` |
| `domain` | Model bất biến (`record`) và `enum` | `domain/Customer.java`, `domain/CustomerStatus.java` |
| `error` | Exception nghiệp vụ, kế thừa `RuntimeException` | `error/ValidationException.java`, `error/NotFoundException.java` |
| (gốc) | Tạo server, nối dependency bằng tay qua constructor, seed dữ liệu | `App.java` |

Luồng: `CustomerHandler` → `CustomerService` → `CustomerRepository`. Dependency được truyền qua constructor (`new CustomerService(new InMemoryCustomerRepository())` trong `App.main`).

**Định tuyến**: `CustomerHandler.route` so sánh `path` + `method` bằng `equals`, dùng regex `Pattern` cho path có tham số (`BY_ID = ^/api/customers/(\d+)$`). Route không khớp trả 404 Problem. `ObjectMapper` dùng chung là hằng `CustomerHandler.JSON` (package-private, test cũng dùng lại).
- Mỗi route là một khối `if (<path khớp> && method.equals("<METHOD>")) { ...; return; }`. Một `Matcher` của `BY_ID` dùng chung cho mọi method trên path có `id` (`GET`, `PUT`).
- Route có body: `JSON.readValue(exchange.getRequestBody(), <Request>.class)` **trước** khi gọi service, rồi truyền từng field (`body.name()`, `body.email()`, `body.phone()`) chứ không truyền record xuống service. Vì vậy JSON hỏng trả 400 trước mọi kiểm tra của service.
- Tham số path được đổi kiểu trong handler (`Long.parseLong(byId.group(1))`); service nhận `long id`.
- Javadoc của `CustomerHandler` liệt kê mọi endpoint; thêm route thì cập nhật Javadoc này.
- **Tham số query** (REQ-005, `GET /api/customers` là route đầu tiên đọc query string): hàm private `queryValues(String rawQuery, String name)` đọc `exchange.getRequestURI().getRawQuery()`, tách theo `&` **trước**, tách mỗi đoạn tại dấu `=` đầu tiên, rồi mới `URLDecoder.decode(..., StandardCharsets.UTF_8)` tên và giá trị (tách trước-giải mã sau: giải mã trước thì `%26`/`%3D` trong giá trị bị hiểu sai thành dấu tách). Trả **mọi** giá trị khớp tên, đúng thứ tự xuất hiện, dạng `List<String>`; không có `=` thì giá trị là chuỗi rỗng (không phải "vắng mặt"); không có query string hoặc không khớp tên nào thì trả danh sách rỗng. Handler không tự quyết định giá trị nào hợp lệ (không ném `ValidationException`, không so với hằng) — chỉ tách cú pháp HTTP rồi trao nguyên cho service; service là nơi duy nhất quyết định hợp lệ hay không (vd. `CustomerService.list(List<String>)`).

**Validation**: hàm private `CustomerService.check` trim input (coi `null` là chuỗi rỗng), gom lỗi theo field vào `LinkedHashMap<String, String>`, rồi ném `ValidationException(errors)` một lần. Thông điệp lỗi tiếng Anh, chữ thường, dạng `must ...` / `is ...`, không lặp lại giá trị người dùng nhập. Giới hạn đặt thành hằng (`NAME_MAX_LENGTH = 100`).
- **Một nơi chứa quy tắc**: `create` và `update` cùng gọi `check(name, email, phone, Predicate<String> emailTaken, Predicate<String> phoneTaken)`. Chỗ khác nhau giữa hai thao tác (truy vấn trùng nào) được truyền vào dưới dạng predicate (`repository::existsByEmail`, hoặc lambda `e -> repository.existsByEmailAndIdNot(e, id)`). `check` không có tham số nullable hay cờ chế độ, không rẽ nhánh tạo/sửa và không gọi `repository` trực tiếp (`aiws/work/REQ-002/02-design.md` D4).
- `check` trả record private lồng trong service, `Checked(name, email, phone)`, mang giá trị đã trim/chuẩn hoá; `create` và `update` ghi các giá trị này xuống repository.
- Thao tác trên một bản ghi đã có kiểm tra tồn tại trước validation: `update` gọi `get(id)` (ném `NotFoundException`) rồi mới gọi `check`, nên 404 đi trước 400. Kết quả `Optional` của `repository.update` vẫn được xử lý bằng `orElseThrow` với cùng message.
- `name` và `email` dùng `String.trim()`. `phone` dùng `PhoneNumbers.trim`, vì phải bỏ đúng tập ký tự của `trim()` PHP.
- Mỗi field một khối `if / else if`, nên mỗi field có tối đa một thông điệp. Các field được kiểm tra độc lập: field này lỗi không chặn việc kiểm tra field khác.
- Truy vấn repository (`existsByEmail`, `existsByPhoneAndStatus` và hai bản `…AndIdNot`) chỉ chạy khi giá trị đã qua kiểm tra định dạng.
- Field tuỳ chọn: rỗng sau trim thì bỏ qua mọi kiểm tra và lưu `null` (`phone`).
- **Thao tác không đi qua `check`** (REQ-003): `CustomerService.updateStatus(id, status)` cố ý **không** gọi `check`, không kiểm tra lại họ tên/email/định dạng số đang lưu. Nó dùng một hàm private riêng (`parseStatus`) để đổi `String status` sang `CustomerStatus`, ném `ValidationException(Map.of("status", "must be ACTIVE or INACTIVE"))` khi không khớp chính xác `"ACTIVE"`/`"INACTIVE"` (không trim, không đổi hoa thường — khác quy ước "trim trước khi kiểm tra" áp dụng cho giá trị người dùng gõ tay, vì đây là giá trị do code client gửi). Điều kiện nghiệp vụ duy nhất còn lại là BR-09 khi kích hoạt lại, kiểm tra trên số **nguyên văn** đang lưu qua `repository.existsByPhoneAndStatusAndIdNot`, có canh `phone != null` trước (tránh `NullPointerException`). Mẫu `get(id)` trước rồi ném `NotFoundException` từ thao tác ghi sau vẫn theo đúng `update` (`aiws/work/REQ-003/02-design.md` D5).
- **(REQ-005)** `CustomerService.list(List<String> statusValues)` cũng không gọi `check`: danh sách rỗng gọi lại `list()` trước khi chạm `parseStatus` (tránh `parseStatus(null)` ném lỗi); nhiều hơn một giá trị ném `ValidationException` qua hàm private `invalidStatus()` (tách từ câu cuối của `parseStatus`, dùng chung cho cả hai nhánh); đúng một giá trị thì đi qua **chính** `parseStatus` có sẵn từ REQ-003, nên hành vi của nó với mọi đầu vào hiện có không đổi.

**Port quy tắc legacy**: `service/PhoneNumbers.java` port `phone_normalize` và `phone_is_valid` của `source-legacy/lib/phone.php` theo từng bước, kể cả các trường hợp biên (vd. `84` chỉ được đổi khi chuỗi dài đúng 11 ký tự, `"+84"` đứng một mình thành `"0"`). Javadoc của class dẫn chiếu file legacy và mã quy tắc (BR-07). Tập ký tự được viết tường minh thành hằng (`TRIM_CHARACTERS`, `SEPARATORS`, `VALID`), không dùng `String.trim()`/`strip()` hay lớp ký tự Unicode; comment `//` ngay trên `TRIM_CHARACTERS` và `SEPARATORS` ghi hành vi PHP/PCRE tương ứng.

**Xử lý lỗi**: service ném exception, còn `CustomerHandler.handle` map sang HTTP với body `Problem` theo RFC 9457, `Content-Type: application/problem+json`. Bảng map xem `aiws/knowledge/api-inventory.md` → Quy ước. `exchange.close()` nằm trong `finally`.

**Logging**: không có framework logging. Chỉ có `System.out.println` khi khởi động (`App.main`). Lỗi 500 không được log (`CustomerHandler.handle`).

**Đặt tên và style**
- Class PascalCase, method/field camelCase, hằng `static final` UPPER_SNAKE_CASE (`NAME_MAX_LENGTH`, `EMAIL`, `BY_ID`, `JSON`, `TRIM_CHARACTERS`, `SEPARATORS`, `VALID`). `Pattern` biên dịch sẵn là hằng `private static final`. Mỗi file một top-level type; type đó là `public`, trừ class chỉ dùng trong package thì để package-private (`PhoneNumbers`).
- Thụt lề 2 dấu cách. Class tiện ích là `final` với constructor `private` (`App`, `PhoneNumbers`).
- Phần lớn type có Javadoc một dòng (`Customer`, `CustomerService`, `CustomerHandler`, `UpdateCustomerRequest`, `PhoneNumbers`...). Riêng `CustomerStatus` và interface `CustomerRepository` chưa có Javadoc ở mức type. Ở mức method, chỉ một số method có Javadoc một dòng: trong `CustomerRepository` là `insert`, `update`, `existsByEmailAndIdNot`, `existsByPhoneAndStatusAndIdNot` (`findAll`, `findById`, `existsByEmail`, `existsByPhoneAndStatus` thì chưa); trong `CustomerService` là `update` và hàm private `check` (`list`, `get`, `create` thì chưa).
- Repository đặt tên method kiểu `findAll`, `findAllByStatus` (REQ-005), `findById`, `existsByEmail`, `existsByPhoneAndStatus`, `insert`, `update`, `updateStatus` (REQ-003), và trả `Optional` cho truy vấn một bản ghi cũng như cho thao tác ghi lên bản ghi có thể không tồn tại (`update`, `updateStatus`); `findAllByStatus` trả `List<Customer>` trực tiếp (không `Optional`) như `findAll`, vì luôn trả được (kể cả danh sách rỗng). Truy vấn loại trừ một bản ghi thêm hậu tố `AndIdNot` và tham số `long id` ở cuối (`existsByEmailAndIdNot`, `existsByPhoneAndStatusAndIdNot`); method cũ được giữ nguyên chữ ký, không thêm tham số. Repository chỉ truy vấn và lưu đúng giá trị nhận được; quyết định nghiệp vụ (vd. khách hàng mới là `ACTIVE`, chỉ khách hàng `ACTIVE` giữ số) nằm ở service và được truyền xuống qua tham số. Thao tác ghi chỉ nhận các trường được phép đổi (`update(id, name, email, phone)` không nhận `status`; `updateStatus(id, status)` chỉ nhận `status`, không nhận ba trường kia) và không upsert.
- So sánh với field có thể `null` viết theo chiều an toàn: `phone.equals(c.phone())`, không viết ngược (`InMemoryCustomerRepository`). Hàm truyền vào `computeIfPresent` là hàm thuần.
- Không có plugin lint/format (Checkstyle, Spotless...) trong `source-be/pom.xml`.
- Line ending: `mvnw` dùng LF, `*.cmd` dùng CRLF (`source-be/.gitattributes`).

## Test
**BE**: JUnit Jupiter, version quản lý bởi `junit-bom` **6.1.3**, chạy qua `maven-surefire-plugin` 3.6.0 (`source-be/pom.xml`).
- Vị trí: `source-be/src/test/java`, cùng package với class được test (nên test gọi được class và hằng package-private như `PhoneNumbers`, `CustomerHandler.JSON`). Tên class là `<Class>Test` (`service/CustomerServiceTest.java`, `service/PhoneNumbersTest.java`, `repository/InMemoryCustomerRepositoryTest.java`, `api/CustomerHandlerTest.java`).
- Tên method camelCase mô tả hành vi (`createRejectsDuplicateEmail`), kèm `@DisplayName("...")` bằng câu tiếng Anh.
- Arrange-Act-Assert, ba phần tách bằng dòng trống. Comment `// Arrange`, `// Act`, `// Assert` (hoặc `// Arrange / Act`) **không đồng đều giữa các class**: `CustomerServiceTest` và `PhoneNumbersTest` chỉ có ở test đầu tiên (`createStoresTrimmedActiveCustomer`, `trimStripsPhpTrimCharactersFromBothEnds`); `InMemoryCustomerRepositoryTest` có ở TC-11 và ở cả bốn test TC-44..TC-47 (TC-12 thì không); `CustomerHandlerTest` không có comment AAA. [CẦN XÁC NHẬN] quy ước mong muốn: comment ở mọi test hay chỉ ở test đầu tiên của class.
- **Test theo bảng dữ liệu**: `@ParameterizedTest` + `@MethodSource("<tênProvider>")`. Provider là method `private static` đặt ngay sau test, trả `Stream<Arguments>` (nhiều tham số; `CustomerServiceTest` và `InMemoryCustomerRepositoryTest` dùng `arguments(...)` import static, `CustomerHandlerTest` dùng `Arguments.of(...)`) hoặc `Stream<String>`/`Stream<CustomerStatus>`/`Stream<Long>` (một tham số). Thêm `@NullSource` khi cần ca `null` (`CustomerServiceTest`, TC-13). Bảng một cột toàn hằng dùng `@ValueSource` (`longs` ở TC-45, `strings` ở TC-57). **(REQ-004)** `CustomerHandlerTest` không còn dùng `@ValueSource`: TC-92 và TC-97 chuyển từ `@ValueSource` sang `@MethodSource` với provider `private static` riêng (`reactivatedCustomerIds` trả `Stream<Long>`, kiểu provider một cột đầu tiên không phải `String` của lớp; `invalidTargetStatusBodies` trả `Stream<String>`), vì class này dùng `@MethodSource` cho mọi test tham số hoá khác. `@ValueSource` vẫn là kiểu hợp lệ ở `CustomerServiceTest` và `InMemoryCustomerRepositoryTest` (TC-45, TC-57), không đổi. Một provider có thể dùng lại cho test khác (`blankPhones` cho TC-13 và TC-50). Mỗi dòng dữ liệu chạy trên kho mới. Tên từng lần chạy **theo cách của từng class**, áp dụng cho mọi `@ParameterizedTest` trong class đó: `PhoneNumbersTest` và `CustomerServiceTest` đặt `@ParameterizedTest(name = ROW_NAME)` với hằng `ROW_NAME = "[{index}]"` (comment của hằng nêu lý do gốc: có dòng dữ liệu chứa ký tự điều khiển; các test REQ-002 trong `CustomerServiceTest` vẫn dùng `ROW_NAME` dù dữ liệu không có ký tự điều khiển); `CustomerHandlerTest` viết thẳng `name = "[{index}]"`; `InMemoryCustomerRepositoryTest` dùng `@ParameterizedTest` trần với tên mặc định. Thêm test vào class nào thì theo cách của class đó. Dòng dữ liệu khó hiểu có comment `//` cuối dòng. Package `org.junit.jupiter.params` có sẵn qua artifact `junit-jupiter`; `source-be/pom.xml` không khai báo thêm dependency nào cho việc này.
  - Ngoại lệ hiện có: TC-53 (`CustomerServiceTest.updateCollectsErrorsOfAllFields`) và TC-65 (`CustomerHandlerTest.updateWithValueOfAnotherCustomerReturnsProblem`) chạy hai dòng dữ liệu nối tiếp trong một `@Test`. `aiws/work/REQ-002/05-review.md` ghi nhận đây là finding minor chưa xử lý, **không phải mẫu để theo**.
- Không dùng mock framework. Service test dùng `InMemoryCustomerRepository` thật: `@BeforeEach setUp` tạo field `repository` và `service = new CustomerService(repository)` mới cho mỗi test. Trạng thái mà API public không tạo ra được (khách hàng `INACTIVE`, số theo quy tắc cũ, `id` cố định) được dựng bằng cách gọi thẳng `repository.insert(..., status)` trên chính repository đó; thứ tự `insert` quyết định `id` (test `update` chèn một khách hàng "Seed" trước để khách hàng đang sửa có `id = 2`). Dữ liệu nền lặp lại được gom vào helper `private void insertSeedAndAn()`. TC-25 có từ REQ-001 vẫn tự tạo repository cục bộ, biến này che field cùng tên (`aiws/work/REQ-002/05-review.md`, finding minor). Repository test tạo `InMemoryCustomerRepository` ngay trong từng test (`InMemoryCustomerRepositoryTest`). HTTP test khởi động `App.start(0, service)` trên port ngẫu nhiên, gọi bằng `java.net.http.HttpClient`, và dừng server bằng `server.stop(0)` trong `@AfterEach`; mỗi method HTTP có một helper `private` (`get(path)`, `post(json)`, `put(path, json)`), cùng `customers()` (đọc danh sách) và `errorsOf(body)` (đổi `errors` thành `Map`). `startServer` seed một khách hàng (`id = 1`, không có số) bằng `service.create`; test cần thêm khách hàng thì tạo qua chính API bằng `post(...)`. Từ REQ-003, HTTP test dựng được khách hàng `INACTIVE` qua chính API bằng `put(id + "/status", "{\"status\":\"INACTIVE\"}")`, nên không còn cần truy cập thẳng repository cho ca này (`source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` TC-92..TC-95).
- Assertion dùng `org.junit.jupiter.api.Assertions` (`assertEquals`, `assertNull`, `assertThrows`, `assertTrue`, `assertFalse`). Lỗi validation được so cả map khi cần chắc không có lỗi thừa (`assertEquals(Map.of("phone", "..."), error.errors())`). Kết quả ghi được so cả record (`assertEquals(new Customer(2, ..., CustomerStatus.ACTIVE), updated)`) rồi đọc lại (`service.get(2)`, `GET` sau `PUT`). Test từ chối chụp trạng thái trước khi Act và so lại sau đó để chứng minh không ghi gì (`List<Customer> before = service.list(); ... assertEquals(before, service.list())`; HTTP: `JsonNode before = customers()`). Parse JSON response bằng `CustomerHandler.JSON.readTree`.

**FE**: `node:test` + `node:assert/strict`, không có thư viện test ngoài.
- Vị trí: `source-fe/test/<module>.test.js`.
- Tên test là câu tiếng Anh, bắt đầu bằng tên hàm (`'renderCustomerTable escapes HTML in customer data'`).
- Mock HTTP bằng `fakeFetch(status, body, calls)`, truyền vào qua `{ fetchImpl }` (`source-fe/test/customerApi.test.js`).
  - Mỗi lần gọi tạo `calls = []` mới rồi kiểm `calls[0].url`, `calls[0].init.method`, `calls[0].init.headers['Content-Type']` và `JSON.parse(calls[0].init.body)` (TC-70, TC-72).
  - Lỗi được kiểm bằng `await assert.rejects(promise, (error) => { ...; return true; })`, so `error.status` và `assert.deepEqual(error.fieldErrors, ...)` (TC-71, TC-73).
- Test component bằng cách so chuỗi HTML (`assert.match`, `assert.doesNotMatch`), đếm số lần xuất hiện bằng `html.match(/.../g).length` (`source-fe/test/customerTable.test.js`, `source-fe/test/customerEditForm.test.js`). Regex khớp nguyên cả đoạn thẻ kèm thuộc tính theo đúng thứ tự, nên đổi thứ tự thuộc tính trong component là làm fail test. Mỗi component có test escape riêng cho giá trị nằm trong thuộc tính (TC-75, TC-78) và trong nội dung (TC-80).
- Test theo bảng dữ liệu: một mảng dữ liệu (cặp `[value, expected]`, giá trị đơn, hoặc object có tên field như `{ id, input }`), lặp bằng `for...of` trong **một** `test(...)` (`source-fe/test/formatPhone.test.js`; `source-fe/test/customerApi.test.js` TC-42, TC-43, TC-70..TC-73; `source-fe/test/customerEditForm.test.js` TC-77, TC-79). Không dùng `describe` hay subtest.
- Comment AAA **không đồng đều**: có ở test đầu tiên của `customerTable.test.js` và `formatPhone.test.js`, ở TC-74, TC-75, và ở năm trong sáu test của `customerEditForm.test.js` (TC-77 thì không); `customerApi.test.js` không có.
- `source-fe/index.html` và `source-fe/src/main.js` không có test tự động, vì `node:test` không có DOM.

**Mã TC**: test viết từ REQ-001 trở đi mang mã TC ở đầu tên hiển thị (quy tắc truy vết, AGENTS.md mục 8), đúng hình thức trong `aiws/skills/be-conventions/SKILL.md` và `aiws/skills/fe-conventions/SKILL.md`. Tên method Java **không** chứa mã TC. Mã TC **đánh số tiếp qua các REQ, không bắt đầu lại từ TC-1**: REQ-001 dùng TC-1..TC-43 (`aiws/work/REQ-001/03-test-spec.md`), REQ-002 dùng TC-44..TC-81 (`aiws/work/REQ-002/03-test-spec.md` → "Đánh số TC"), REQ-003 dùng TC-82..TC-107 (`aiws/work/REQ-003/03-test-spec.md`), REQ-004 dùng TC-108..TC-114 (`aiws/work/REQ-004/03-test-spec.md`), REQ-005 dùng TC-115..TC-134 (`aiws/work/REQ-005/03-test-spec.md`), REQ-006 dùng TC-135..TC-144 (`aiws/work/REQ-006/03-test-spec.md`). Lý do ghi trong test spec của REQ-002: orchestrator tìm mã TC trong toàn bộ nội dung các file test mà task đã sửa, và REQ-002 thêm test vào chính các file đang mang mã TC của REQ-001; nếu bắt đầu lại từ TC-1 thì một TC chưa viết vẫn "có mặt" nhờ test cũ cùng mã. Theo quy tắc này, REQ kế tiếp (sau REQ-006) đánh số tiếp từ **TC-145**. Test mới của một file được thêm thành khối liền nhau; vị trí trong file không theo thứ tự mã (vd. TC-70..TC-73 nằm trước TC-43 trong `customerApi.test.js`).
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

| Mã TC (REQ-002) | File |
| --- | --- |
| TC-44..TC-47 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` |
| TC-48..TC-60 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` |
| TC-61..TC-69 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-70..TC-73 | `source-fe/test/customerApi.test.js` |
| TC-74, TC-75 | `source-fe/test/customerTable.test.js` |
| TC-76..TC-81 | `source-fe/test/customerEditForm.test.js` |

TC-36 (REQ-001) đã bị **sửa ở REQ-002**, đúng hai assertion: tiêu đề bảng có thêm `<th>Thao tác</th>` và mỗi dòng có 6 `<td>` thay vì 5. Test giữ nguyên mã và tên hiển thị, và được sửa trong cùng task với `source-fe/src/components/customerTable.js` (`aiws/work/REQ-002/02-design.md` D9, R7).

| Mã TC (REQ-003) | File |
| --- | --- |
| TC-82, TC-83 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` |
| TC-84..TC-90 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` |
| TC-91..TC-100 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-101, TC-102 | `source-fe/test/customerApi.test.js` |
| TC-103..TC-105 | `source-fe/test/customerTable.test.js` |
| TC-106, TC-107 | `source-fe/test/describeStatusError.test.js` (mới) |

TC-74 (REQ-002) đã bị **sửa ở REQ-003**, đúng hai regex khớp nguyên dòng khách hàng 1 và 2 trong ô "Thao tác" (thêm nút đổi trạng thái sau nút "Sửa"). Test giữ nguyên mã và tên hiển thị, sửa trong cùng task với `source-fe/src/components/customerTable.js` (`aiws/work/REQ-003/02-design.md` D9, R8). Các assertion khác của TC-74 và mọi TC khác trong file không đổi.

| Mã TC (REQ-004) | File |
| --- | --- |
| TC-92, TC-97 (sửa, mã của REQ-003) | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-105 (sửa, mã của REQ-003) | `source-fe/test/customerTable.test.js` |
| TC-108..TC-113 | `source-fe/test/createDoubleClickGuard.test.js` (mới) |
| TC-114 | `source-fe/test/customerTable.test.js`, liền sau TC-105 |

TC-92, TC-97 (REQ-003) và TC-105 (REQ-003) bị **sửa ở REQ-004**, giữ nguyên mã và tên hiển thị (`aiws/work/REQ-004/02-design.md` D7, D6, D8): TC-92 và TC-97 chỉ đổi nguồn dữ liệu (`@ValueSource` → `@MethodSource`, xem Backend → Test ở trên); TC-105 thêm assertion "6 `<td>`" và đổi dòng "thiếu field `status`" sang object không có key đó. Ba test này là trường hợp **khác tiền lệ** của TC-36/TC-74: mã TC của chúng được **định nghĩa lại** trong `aiws/work/REQ-004/03-test-spec.md` (không chỉ ghi chú sửa), vì AC-4 không thể có mã mới (mã nằm trong `@DisplayName`, tên hiển thị phải giữ nguyên) và plan chỉ gán được cho task những mã có trong test spec của REQ đó.

15 test có từ trước REQ-001 vẫn **không có mã TC**: 5 trong `CustomerServiceTest`, 4 trong `CustomerHandlerTest`, 3 trong `customerTable.test.js`, 3 trong `customerApi.test.js`.

| Mã TC (REQ-005) | File |
| --- | --- |
| TC-115, TC-116 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` |
| TC-117..TC-119 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` |
| TC-120..TC-124 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-125..TC-127 | `source-fe/test/customerApi.test.js` |
| TC-128..TC-134 | `source-fe/test/createCustomerListLoader.test.js` (mới) |

Không có mã TC nào của REQ-001..REQ-004 bị sửa hay định nghĩa lại ở REQ-005 (`aiws/work/REQ-005/02-design.md` D11). TC-127 vừa truy vết AC-3 (`listCustomers` ném `ApiError` đúng hình dạng) vừa truy vết AC-4 (lỗi của API vẫn đi tới loader) trong `aiws/work/REQ-005/trace.md`, nhưng chỉ là một test, không lặp lại.

| Mã TC (REQ-006) | File |
| --- | --- |
| TC-135, TC-136 | `source-fe/test/customerTable.test.js` |
| TC-137..TC-142 | `source-fe/test/chooseStatusClickKey.test.js` (mới) |
| TC-143, TC-144 | `source-fe/test/describeCreateNotice.test.js` (mới) |
| TC-117, TC-118 (sửa, mã của REQ-005) | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` |
| TC-120, TC-122 (sửa, mã của REQ-005) | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` |
| TC-127 (sửa, mã của REQ-005) | `source-fe/test/customerApi.test.js` |

TC-117, TC-118, TC-120, TC-122, TC-127 bị **sửa ở REQ-006**, giữ nguyên mã và tên hiển thị (`aiws/work/REQ-006/02-design.md` D7..D10) — cùng kiểu tiền lệ với TC-92/TC-97/TC-105 ở REQ-004 (mã được **định nghĩa lại** trong `aiws/work/REQ-006/03-test-spec.md`, không chỉ ghi chú sửa, vì rule `every_ac_has_tc` cần chúng khai dưới AC-5/AC-6 của REQ-006). Nội dung sửa: TC-117, TC-118 chỉ đổi dữ liệu của helper `insertByStatuses` (không đổi thân test, provider, `@DisplayName`); TC-120, TC-122 chỉ thêm assertion, không bớt hay đổi assertion cũ; TC-127 chỉ đổi tên biến cục bộ `notFound500` thành `internalError500` ở ba chỗ. **TC-119 không đổi** (không dùng chung helper `insertByStatuses`).

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
