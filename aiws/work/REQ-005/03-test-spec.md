# REQ-005 — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
**Phạm vi**: AC-1..AC-5 trong `01-analysis.md`, hiện thực theo `02-design.md` (D1..D11) và `api-contract.yaml` (`GET /api/customers` với tham số query `status`, response 200 và 400). Mọi test chạy trong CI bằng lệnh sẵn có (`be_test`, `fe_test` trong `aiws/config/policies.yaml`), không cần mạng, DB, trình duyệt hay đồng hồ thật.

Ký hiệu dùng trong file: D1..D11, Q1..Q8 và R1..R16 là quyết định, câu hỏi và rủi ro của `02-design.md` / `01-analysis.md`. Bốn yêu cầu của requirement (R1..R4 trong `01-analysis.md` → Truy vết) luôn được ghi kèm chữ "của requirement".

**Mức test và framework** (`aiws/knowledge/conventions.md` → Test):
- BE, `unit`: JUnit Jupiter. Bảng dữ liệu dùng `@ParameterizedTest` + `@MethodSource`, provider `private static` đặt ngay sau test; mã TC gắn một lần ở `@DisplayName`. Tên từng lần chạy theo cách của từng class: `@ParameterizedTest` trần trong `InMemoryCustomerRepositoryTest`, `name = ROW_NAME` trong `CustomerServiceTest`.
  - Repository test tạo `InMemoryCustomerRepository` ngay trong từng test.
  - Service test dùng `repository` và `service` của `@BeforeEach`, không mock framework; khách hàng `INACTIVE` dựng bằng `repository.insert(..., CustomerStatus.INACTIVE)`.
- BE, `integration`: `CustomerHandlerTest` khởi động `App.start(0, service)` trong cùng tiến trình, port ngẫu nhiên, nên vẫn chạy trong `be_test`. Dùng `@ParameterizedTest(name = "[{index}]")` + `@MethodSource` và nguyên helper có sẵn `get(path)`, `post(json)`, `put(path, json)`, `customers()`, `errorsOf(body)`. `path` nối vào `/api/customers`, nên query string viết thẳng trong `path`: `get("?status=ACTIVE")`, `get("/1?status=DELETED")`. Dấu cách trong URL viết `%20` (`URI.create` không nhận dấu cách thô).
- FE, `unit`: `node:test` + `node:assert/strict`. Bảng dữ liệu là một mảng, lặp bằng `for...of` trong **một** `test(...)`; không dùng `describe` hay subtest.
  - `listCustomers` (`source-fe/test/customerApi.test.js`): HTTP giả bằng `fakeFetch(status, body, calls)` có sẵn, truyền qua `{ fetchImpl }`; mỗi dòng dữ liệu dùng mảng `calls` mới.
  - `createCustomerListLoader` (file test mới `source-fe/test/createCustomerListLoader.test.js`): không `fetch`, không DOM, không timer. Hai hàm giả do test tự viết:
    - `getStatus`: trả giá trị của một biến `selected` mà test gán lại, và đếm số lần được gọi.
    - `listCustomers` giả: ghi tham số nhận được vào mảng `calls`, trả một promise **do test điều khiển** (deferred: test giữ `resolve`/`reject` của từng lời gọi; `Promise.withResolvers()` có sẵn từ Node.js 22, hoặc tự dựng bằng `new Promise`).
    - Với lần `load` mong đợi bị reject: gắn `assert.rejects(promise, ...)` **trước** khi cho API của lần đó lỗi, giữ promise của assertion rồi `await` sau. Nếu không, `node:test` có thể báo unhandled rejection.

**Đánh số TC**: mã mới là **TC-115..TC-134**, đánh số tiếp sau TC-114 của REQ-004 (D11; `01-analysis.md` → Impact → FE → Test).
- **Không test có sẵn nào bị sửa hay định nghĩa lại** (D11). Khác REQ-004, file này không chứa mã TC cũ nào.
- Test có sẵn dùng làm ảnh chụp "lời gọi không kèm giá trị lọc không đổi gì", phải pass nguyên vẹn: `listReturnsCustomers` và helper `customers()` (`CustomerHandlerTest`), mọi lời gọi `service.list()` (`CustomerServiceTest`) và `repository.findAll()` (`InMemoryCustomerRepositoryTest`), test không mã TC `listCustomers calls GET /api/customers and returns the body` (`customerApi.test.js`).
- `renderCustomerTable` không đổi; việc vẽ mọi phần tử nhận được đã có TC-36, TC-74, TC-103 và test không mã TC `renderCustomerTable shows an empty state`. REQ-005 không thêm TC ở `customerTable.test.js`.
- Ba TC cuối (TC-132..TC-134) là phần Q7 của D8. Chúng được xếp cuối để dãy mã vẫn liền nhau nếu người duyệt không nhận phần này (xem "Kỳ vọng phụ thuộc quyết định đang chờ duyệt").

**Độ chi tiết của TC**: một TC kiểm một hành vi; biến thể dữ liệu là dòng trong `test data` và thành một test tham số hoá. Ca "không khách hàng nào khớp" là **dòng dữ liệu** ở repository và service, vì kho dựng được từ một danh sách trạng thái (TC-115, TC-118). Ở HTTP nó là **TC riêng** (TC-121), vì kho phải dựng qua API theo cách khác với kho bốn khách hàng.

**Kỹ thuật thiết kế** (ISTQB):
- Phân vùng tương đương:
  - Tham số `status` trong query string: vắng mặt / một lần, hợp lệ (`ACTIVE`, `INACTIVE`) / một lần, không hợp lệ (giá trị lạ, sai hoa thường, rỗng, có khoảng trắng, hai giá trị trong một tham số) / lặp lại / chỉ có tham số tên khác.
  - Kho so với giá trị lọc: có khách hàng khớp xen kẽ với khách hàng không khớp / mọi khách hàng đều khớp / không ai khớp / kho rỗng.
  - Lựa chọn lọc ở FE: `''` ("Tất cả"), `'ACTIVE'`, `'INACTIVE'`; `status` không có giá trị trong `options` (`undefined`, `null`, thiếu key).
  - Kết quả của API với loader: trả mảng (có phần tử, rỗng) / trả `null` / lỗi.
  - Lần `load`: không bị vượt / đã có lần `load` muộn hơn.
- Giá trị biên:
  - Giá trị lọc khớp **chính xác** so với lệch một ký tự hoa thường hoặc một dấu cách (TC-119, TC-123).
  - Số lần `status` xuất hiện: 0, 1, 2, 3 (TC-117..TC-120, TC-123).
  - Số khách hàng khớp: 0, 1, nhiều; khách hàng khớp đứng đầu và đứng cuối kho (TC-115, TC-118, TC-121).
- Bảng quyết định cho giá trị lọc (D2, D4):

  | Số lần `status` xuất hiện | Giá trị | Kết quả | TC |
  | --- | --- | --- | --- |
  | 0 | — | 200, mọi khách hàng | TC-117, TC-120 |
  | 1 | đúng bằng `ACTIVE` hoặc `INACTIVE` | 200, chỉ khách hàng khớp (có thể là `[]`) | TC-115, TC-118, TC-120, TC-121 |
  | 1 | bất kỳ giá trị khác, kể cả rỗng | 400 `errors.status` | TC-119, TC-123 |
  | từ 2 trở lên | bất kỳ, kể cả cùng một giá trị hợp lệ | 400 `errors.status` | TC-119, TC-123 |

- Chuyển trạng thái của một khách hàng A so với hai danh sách lọc (AC-1, biến thể cuối):

  | Trạng thái của A | Sự kiện | Có trong `status=ACTIVE` | Có trong `status=INACTIVE` | TC |
  | --- | --- | --- | --- | --- |
  | `ACTIVE` | (chưa đổi) | có | không | TC-115, TC-118, TC-120 |
  | `ACTIVE` → `INACTIVE` | `updateStatus` / `PUT /api/customers/{id}/status` | không | có | TC-116, TC-122 |
  | `INACTIVE` → `ACTIVE` | như trên | có | không | TC-116, TC-122 |

- Bảng quyết định cho kết quả của một lần `load` (D8):

  | Đã có lần `load` muộn hơn | API | Kết quả của lần `load` đó | TC |
  | --- | --- | --- | --- |
  | không | trả về | `{ current: true, customers }` | TC-128, TC-130 |
  | không | lỗi | reject với chính lỗi đó | TC-131 |
  | có | trả về | `{ current: false }` | TC-132 |
  | có | lỗi | `{ current: false }`, không reject | TC-133 |

- Đoán lỗi (error guessing) cho các cách hiện thực sai mà design đã cảnh báo:
  - Lọc bằng so chuỗi (`c.status().name().equals(value)`) nên giá trị lạ lặng lẽ cho `[]` thay vì lỗi (AC-2: "kể cả mảng rỗng"): TC-119, TC-123.
  - `CustomerStatus.valueOf(value)` ném `IllegalArgumentException` thành 500: TC-119, TC-123.
  - Gọi `parseStatus` khi không có giá trị lọc, làm lời gọi cũ thành 400 (D4): TC-117, dòng không có query của TC-120.
  - Coi "không có giá trị lọc" là "chỉ `ACTIVE`": dòng kho toàn `INACTIVE` của TC-117.
  - Lấy giá trị đầu hoặc cuối khi tham số lặp; bỏ trùng; bỏ giá trị rỗng; chỉ chặn đúng hai giá trị (D2, D4): các dòng nhiều giá trị của TC-119, TC-123.
  - Coi `?status` (không có dấu `=`) hoặc `?status=` là vắng mặt (D3, R13): TC-123.
  - Giải mã trước rồi mới tách (`getQuery()`), làm `%26` và `%3D` thành dấu tách (D3): dòng `?status=ACTIVE%26foo%3D1` của TC-123; dòng `?foo=1%26status%3DACTIVE` và `?status%3DACTIVE` của TC-120.
  - Tách tại dấu `=` cuối, hoặc `split("=")` rồi lấy phần tử thứ hai (D3): dòng `?status=ACTIVE=1` của TC-123.
  - Không giải mã tên hoặc giá trị (D3): dòng `?status=%41CTIVE`, `?%73tatus=INACTIVE` của TC-120.
  - Tìm `status=` ở bất kỳ đâu trong query, hoặc so tên không phân biệt hoa thường (D1, D3): dòng `?xstatus=INACTIVE`, `?Status=ACTIVE`, `?STATUS=ACTIVE` của TC-120.
  - Trim hoặc không phân biệt hoa thường với giá trị (D2): TC-119, TC-123.
  - Kiểm tra query string ở mọi route (D3): TC-124.
  - Trả 404 khi không ai khớp (AC-1): TC-121.
  - Lọc theo trạng thái lúc `insert` thay vì trạng thái đang lưu: TC-116, TC-122.
  - `listCustomers` nối `?status=` cả khi lựa chọn là `''`, làm lần tải lúc mở trang nhận 400 (D6): dòng `''` của TC-125.
  - `listCustomers` để `status` rơi vào tham số thứ hai của `fetch` (D6): TC-125.
  - Không qua `encodeURIComponent`, hoặc dùng `URLSearchParams` (dấu cách thành `+`) (D6): dòng `'A&B=C D'` của TC-125.
  - FE tự lọc hoặc sắp xếp lại (R2 của requirement): TC-126, TC-130.
  - Loader đọc `getStatus` lúc tạo, hoặc giữ giá trị của lần tải trước (D8): TC-129. Truyền giá trị theo vị trí thay vì `{ status }`: TC-128.
  - Loader coi kết quả falsy (`[]`, `null`) là "không current" (D8): TC-130.
  - Lỗi của lần tải mới nhất bị nuốt: TC-131, TC-133. Lỗi của lần tải bị vượt làm reject: TC-133.
  - So `call === latest` trước khi API trả về, hoặc quên tăng bộ đếm (D8): TC-132. State ở mức module (D8): TC-134.

**Ánh xạ biến thể của AC-4 và AC-5.** `index.html` và phần nối trong `main.js` không có TC tự động (`node:test` không có DOM). Mỗi biến thể vì thế tách làm hai phần: **quyết định** nằm trong `listCustomers` và `createCustomerListLoader` (có TC), và **phần nối** (review và chạy tay, số bước theo `02-design.md` → FE change). Loader chỉ nhận `getStatus` và `listCustomers` (D8): nó không biết lần tải đến từ lúc mở trang, sự kiện `change`, hay sau thao tác thêm, sửa, đổi trạng thái. Các biến thể của AC-5 vì thế rơi vào cùng một vùng tương đương ở mức unit.

| Biến thể | TC (quyết định) | Phần nối, kiểm bằng review và chạy tay |
| --- | --- | --- |
| AC-4: đúng ba lựa chọn, đúng thứ tự; hiện lựa chọn đang chọn | không có | ba `<option>` trong `index.html` (D7); bước 1, 2 |
| AC-4: trang vừa mở, "Tất cả", yêu cầu không mang giá trị lọc | TC-128 (`''` → `{ status: '' }`), TC-125 (`''` → `/api/customers`) | `filterEl.value = ''` ngay trước `refresh()` cuối file; bước 1, 8 |
| AC-4: chọn "Đang hoạt động" / "Ngừng hoạt động" | TC-128, TC-125 | listener `change` gọi `refresh()`; bước 2 |
| AC-4: chọn lại "Tất cả" | TC-128 (giá trị thứ tư của dòng đầu), TC-125 | bước 2 |
| AC-4: bảng hiện đúng các khách hàng API trả, đúng thứ tự (FE không lọc) | TC-126, TC-130; TC-36, TC-74, TC-103 có sẵn | `if (current) listEl.innerHTML = renderCustomerTable(customers)`; bước 2 |
| AC-4: API trả mảng rỗng | dòng `[]` của TC-126, TC-130; test có sẵn `renderCustomerTable shows an empty state` | `<select>` nằm ngoài `#customers`; bước 6 |
| AC-4: yêu cầu lấy danh sách thất bại, chọn lại được | TC-127, TC-131 | `catch` của `refresh()` giữ nguyên câu lỗi; bước 7 |
| AC-5: lưu form sửa khi L = "Đang hoạt động" hoặc "Ngừng hoạt động" | TC-129 | `refresh()` sau `updateCustomer` không đổi; bước 4 |
| AC-5: ngừng hoạt động hoặc kích hoạt lại A khi đang lọc, A rời bảng | TC-129 (yêu cầu mang giá trị của L); phía API: TC-122 (A rời danh sách cũ, vào danh sách kia) | `refresh()` sau `updateCustomerStatus` không đổi; bước 3 |
| AC-5: L = "Tất cả" | dòng `''` của TC-129 | bước 3 |
| AC-5: thêm khách hàng khi L = "Ngừng hoạt động" (Q5) | TC-129 | `<select>` nằm ngoài `#create-form` (`form.reset()`); bước 5 |
| AC-5: lựa chọn lúc **tải lại**, không phải lúc mở trang hay lúc bắt đầu thao tác | TC-129 | `getStatus` là `() => filterEl.value`, không gán vào biến; loader tạo một lần ở mức module |
| AC-5: phần điều khiển lọc vẫn hiện L | không có | `refresh()` không gán `filterEl.value`; bước 3, 4, 5 |

**Dữ liệu chung**:
- **Bốn khách hàng chuẩn** (AC-1), dùng cho mọi test BE. Cả hai danh sách lọc đều có một khách hàng `phone = null` và một khách hàng có số:

  | id | name | email | phone | status trong kho K4 |
  | --- | --- | --- | --- | --- |
  | 1 | `Nguyen Van An` | `an@example.com` | `null` | `ACTIVE` |
  | 2 | `Tran Thi Binh` | `binh@example.com` | `0912345678` | `INACTIVE` |
  | 3 | `Le Van Cuong` | `cuong@example.com` | `0987654321` | `ACTIVE` |
  | 4 | `Pham Thi Dung` | `dung@example.com` | `null` | `INACTIVE` |

  - **Kho K4** là kho gồm đủ bốn dòng trên.
  - Repository và service test: `repository.insert(name, email, phone, status)` theo thứ tự id. **Kho theo danh sách trạng thái** `[s1, .., sn]` (n ≤ 4) là kho gồm n khách hàng đầu của bảng, khách hàng thứ i mang `status = si`; K4 là `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `[]` là kho rỗng. Test giữ các `Customer` do `insert` trả về để dựng list mong đợi.
  - HTTP test: khách hàng 1 là seed của `@BeforeEach`. K4 dựng qua chính API, mọi bước phải trả mã mong đợi: `post` khách hàng 2 (có `phone`), 3 (có `phone`), 4 (không có `phone`) → 201 mỗi lần; rồi `put("/2/status", "{\"status\":\"INACTIVE\"}")` và `put("/4/status", ...)` → 200. Nên gom vào một helper `private` (TC-120, TC-122 dùng chung), tên do developer chọn.
- "Danh sách bằng đúng": so cả list (`assertEquals(List<Customer>, ...)`; HTTP: so `JsonNode` từng phần tử) nên sai số lượng, sai thứ tự hay sai một field đều fail.
- Lỗi validation được so **cả map** `errors`: đúng một key `status`, đúng thông điệp `must be ACTIVE or INACTIVE`.
- Mỗi dòng dữ liệu BE chạy trên kho mới.
- FE, bốn object dùng chung (cùng dữ liệu với bảng trên):
  - `AN = { id: 1, name: 'Nguyen Van An', email: 'an@example.com', phone: null, status: 'ACTIVE' }`
  - `BINH = { id: 2, name: 'Tran Thi Binh', email: 'binh@example.com', phone: '0912345678', status: 'INACTIVE' }`
  - `CUONG = { id: 3, name: 'Le Van Cuong', email: 'cuong@example.com', phone: '0987654321', status: 'ACTIVE' }`
  - `DUNG = { id: 4, name: 'Pham Thi Dung', email: 'dung@example.com', phone: null, status: 'INACTIVE' }`
- **Mỗi dòng dữ liệu của TC-128..TC-134 chạy trên loader mới**, với `calls` và bộ đếm `getStatus` mới.

**TC sinh từ design, không có AC riêng**: được truy vết tới AC gần nhất.
- Truy vấn mới của repository (D5): TC-115, TC-116, truy vết tới AC-1.
- Route khác không đọc query string (D3 → Bắt buộc; `01-analysis.md` → Impact → API): TC-124, truy vết tới AC-2 vì nó giữ phạm vi của quy tắc 400 ở đúng `GET /api/customers`.
- Quy tắc tách và giải mã query của D3: các dòng "D3" của TC-120 (AC-1) và TC-123 (AC-2).
- `listCustomers` ném `ApiError` cho response non-2xx (D6): TC-127, truy vết tới AC-3 (hàm lấy danh sách của API client) và AC-4 (biến thể "yêu cầu lấy danh sách thất bại").
- Các kịch bản "bị vượt" và hai loader độc lập (D8, Q7): TC-132..TC-134, truy vết tới AC-4 theo đề xuất của D11. Chúng **nằm ngoài tiền đề của AC-4**, vốn chỉ phát biểu cho trường hợp không có yêu cầu danh sách nào khác đang chờ.

**Đường lỗi**:
- Validation: 400 `errors.status` ở service (TC-119) và qua HTTP (TC-123); phía FE, `ApiError` mang `fieldErrors.status` (TC-127).
- Không tìm thấy: không khách hàng nào khớp **không** phải lỗi, trả 200 kèm `[]` (TC-115, TC-118, TC-121). 404 của route khác không bị query string đổi thành 400 (một dòng của TC-124).
- Lỗi khi tải danh sách ở FE: TC-127, TC-131, TC-133.
- Không có quyền: không có TC 401/403, vì hệ thống chưa có đăng nhập hay phân quyền (`02-design.md` R15).

**Không đặt kỳ vọng** (không TC nào dùng các đầu vào này):
- Request line có escape hỏng (`%ZZ`, `%` đứng cuối) hoặc ký tự không hợp lệ trong query (D3, R10): do JDK `HttpServer` quyết định, và `URI.create` của test không gửi được.
- Đoạn rỗng trong query (`?a&&b`, dấu `&` đứng cuối): D3 không nêu.
- `statusValues` là `null` hoặc chứa phần tử `null` (D4); `getStatus` hoặc `listCustomers` ném lỗi đồng bộ (D8).
- List do `findAllByStatus` trả về có sửa được hay không (D5).
- `POST /api/customers?status=x`: helper `post(json)` không nhận `path`. Khối route `POST` không đổi (D3), kiểm bằng review.
- `listCustomers()` không tham số: không có `fetchImpl` thì hàm dùng `fetch` toàn cục, và dự án không có mẫu thay `globalThis.fetch` trong test. Nhánh mặc định `= {}` kiểm bằng review; lời gọi `listCustomers({ fetchImpl })` do test có sẵn và dòng đầu của TC-125 giữ.
- Bấm đúp khi đang lọc đổi trạng thái của khách hàng kế tiếp (Q1, D10, R2): thiết kế không chặn, không có AC. Bước chạy tay 11 chỉ để tái hiện cho người duyệt.
- Câu "Chưa có khách hàng." khi đang lọc (Q6, R7) và việc khách hàng vừa thêm không hiện dưới "Ngừng hoạt động" (Q5, R6): hành vi của trang, chỉ có bước chạy tay 5 và 6.
- Thao tác thất bại thì không tải lại danh sách (`01-analysis.md`: "Giữ nguyên, không thuộc AC nào"): `main.js` không đổi phần này.
- Hai tab hoặc hai nhân viên (R16); hiệu năng (R14).

**Không có TC tự động**: `source-fe/index.html` và phần nối trong `source-fe/src/main.js` (R1). Loader và API client đúng mà nối sai thì `fe_test` vẫn pass.
- Reviewer đối chiếu diff với các điểm bắt buộc của D7:
  - Đúng ba `<option>`, đúng thứ tự, `value` lần lượt `''`, `ACTIVE`, `INACTIVE`; nhãn "Tất cả", "Đang hoạt động", "Ngừng hoạt động".
  - `<select id="status-filter" autocomplete="off">` có `<label for="status-filter">`, nằm ngoài `#customers`, ngoài `#edit-customer` và ngoài mọi `<form>`.
- Reviewer đối chiếu diff với các điểm bắt buộc của D9:
  - `getStatus` là `() => filterEl.value`; không gán `filterEl.value` vào biến ở mức module hay ở đầu một handler.
  - Loader tạo **một lần** ở mức module, không tạo trong `refresh()`.
  - `refresh()` chỉ vẽ bảng khi `current` là `true`; câu lỗi và việc ghi vào `#customers` giữ nguyên; `refresh()` không đổi giá trị điều khiển, không xoá `#message`.
  - Listener `change` xoá `#message` rồi gọi `refresh()`, không đụng `#edit-customer`.
  - `filterEl.value = ''` đứng ngay trước lời gọi `refresh()` cuối file.
  - Submit của `#create-form`, hai listener `click` trên `#customers`, hai listener trên `#edit-customer`, `acceptStatusClick` và key của nó không đổi.
- Người review PR chạy tay mười hai bước của `02-design.md` → FE change với BE local, mở tab Network. Bước 1..7 và 10 ứng với AC-4, AC-5 (bảng ánh xạ ở trên); bước 8 cho Q8; bước 9 cho D8; bước 11 cho Q1; bước 12 cho AC-2.
- **Ca query rỗng `?`** (D3: "query rỗng cho danh sách rỗng"): dòng `?` của TC-120 có thể không tới server dưới dạng query rỗng. [CẦN XÁC NHẬN] `java.net.http.HttpClient` nhiều khả năng bỏ dấu `?` khi query là chuỗi rỗng; khi đó dòng này trùng với dòng không có query (vẫn pass) và nhánh query rỗng của `queryValues` chỉ được kiểm bằng review.
- "Không đọc kho khi giá trị lọc không hợp lệ" (D4) không quan sát được với repository thật. TC-119 chỉ khẳng định điều quan sát được: cùng một lỗi trên kho K4 và trên kho rỗng.

**Kỳ vọng phụ thuộc quyết định đang chờ duyệt** (`02-design.md` → Quyết định cần duyệt). Nếu người duyệt chọn khác, các TC sau phải đổi theo:
- Tham số query `status`, "Tất cả" là không gửi tham số (Q2, D1): TC-120..TC-125.
- Hình dạng lỗi 400 (Q3, D2): TC-119, TC-123, dòng 400 của TC-127.
- So khớp chính xác; giá trị rỗng là không hợp lệ (Q4, D2): các dòng tương ứng của TC-119, TC-123.
- **Tham số lặp cùng một giá trị hợp lệ là không hợp lệ** (D2): dòng `["ACTIVE","ACTIVE"]`, `["INACTIVE","INACTIVE"]`, `["ACTIVE","ACTIVE","ACTIVE"]` của TC-119 và dòng `?status=ACTIVE&status=ACTIVE` của TC-123. Nếu chấp nhận lặp cùng giá trị thì các dòng này chuyển sang TC-118 và TC-120.
- **Tham số tên lạ bị bỏ qua** (Q4, R4): bảy dòng "tên khác" của TC-120, cùng hai dòng có `foo=1` đi kèm `status`. Nếu chọn 400 cho tham số lạ thì chúng chuyển sang TC-123 và cần một AC mới.
- Lọc ở repository bằng `findAllByStatus` (D5): TC-115, TC-116. Overload `list(List<String>)` (D4): TC-117..TC-119.
- Chữ ký `listCustomers({ status, ...options })` và `''` là "Tất cả" (D6, D7): TC-125..TC-127, và hình dạng tham số `{ status }` trong TC-128, TC-129. Nếu chọn `listCustomers(status, options)` thì các TC này đổi và test có sẵn `listCustomers calls GET /api/customers and returns the body` phải sửa.
- Tên file, tên export, thứ tự tham số và hình dạng kết quả của `createCustomerListLoader` (D8): TC-128..TC-134.
- **Bỏ qua response danh sách đến trễ** (Q7, D8): TC-132..TC-134. Nếu người duyệt không nhận phần này thì ba TC đó bỏ đi; hình dạng `{ current: true, customers }` trong TC-128, TC-130, TC-131 cũng phải xét lại theo design mới.
- Bấm đúp khi đang lọc (Q1, D10): chọn phương án B hoặc C thì cần một AC mới và TC mới; TC-108..TC-113 không đổi.
- Sau khi thêm khách hàng (Q5) và câu cho danh sách rỗng (Q6): không TC nào ở đây đổi. Chọn câu riêng cho ca đang lọc thì cần TC mới ở `customerTable.test.js`.

**Gắn mã TC trong code**:
- BE: `@DisplayName("TC-n: ...")` ở mức method, kể cả `@ParameterizedTest`. Tên method camelCase, không chứa mã TC.
- FE: `test('TC-n: <tên hàm> ...', ...)`.
- Mọi test theo Arrange-Act-Assert, ba phần tách bằng dòng trống; comment `// Arrange`, `// Act`, `// Assert` theo cách đang có của từng class hoặc file (`aiws/knowledge/conventions.md` → Test).

**Phân bổ TC theo file và nhóm task** (design → BE change / FE change). Mỗi TC chỉ nằm trong một file test; test mới của một file là một khối liền nhau. Tên hiển thị là gợi ý.

| TC | File test | Nhóm | Tên hiển thị trong code |
| --- | --- | --- | --- |
| TC-115 | `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | BE-1 | `TC-115: findAllByStatus returns only the customers with the given status, ordered by id` |
| TC-116 | như trên | BE-1 | `TC-116: findAllByStatus follows the status stored by updateStatus` |
| TC-117 | `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | BE-2 | `TC-117: list with no status value returns the same customers as list()` |
| TC-118 | như trên | BE-2 | `TC-118: list with one valid status value returns only the customers in that status, ordered by id` |
| TC-119 | như trên | BE-2 | `TC-119: list rejects status values other than exactly one ACTIVE or INACTIVE` |
| TC-120 | `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | BE-3 | `TC-120: GET /api/customers returns 200 with exactly the customers matching the status query parameter` |
| TC-121 | như trên | BE-3 | `TC-121: GET /api/customers with a valid status that no customer has returns 200 with an empty array` |
| TC-122 | như trên | BE-3 | `TC-122: GET /api/customers filters by the status currently stored after a status change` |
| TC-123 | như trên | BE-3 | `TC-123: GET /api/customers with an invalid status query parameter returns 400 with errors.status` |
| TC-124 | như trên | BE-3 | `TC-124: routes other than GET /api/customers ignore the status query parameter` |
| TC-125 | `source-fe/test/customerApi.test.js` | FE-1 | `TC-125: listCustomers sends one GET whose URL carries the status filter` |
| TC-126 | như trên | FE-1 | `TC-126: listCustomers returns the array sent by the API without filtering or sorting` |
| TC-127 | như trên | FE-1 | `TC-127: listCustomers throws ApiError with the status and field errors of the API` |
| TC-128 | `source-fe/test/createCustomerListLoader.test.js` (mới) | FE-2 | `TC-128: createCustomerListLoader asks for the selected status once per load` |
| TC-129 | như trên | FE-2 | `TC-129: createCustomerListLoader reads the selected status at each load, not at creation or from an earlier load` |
| TC-130 | như trên | FE-2 | `TC-130: createCustomerListLoader returns the list of the API unchanged when no newer load exists` |
| TC-131 | như trên | FE-2 | `TC-131: createCustomerListLoader rejects with the API error and loads again afterwards` |
| TC-132 | như trên | FE-2 | `TC-132: createCustomerListLoader marks a load overtaken by a newer one as not current, whatever the response order` |
| TC-133 | như trên | FE-2 | `TC-133: createCustomerListLoader swallows the error of an overtaken load and rejects with the error of the latest one` |
| TC-134 | như trên | FE-2 | `TC-134: createCustomerListLoader returns loaders that do not share state` |

**Số test mong đợi sau REQ-005**, tính theo đúng số dòng dữ liệu của file này (developer thêm dòng thì số tăng tương ứng):
- BE: hiện 311 lần chạy, đều pass (`aiws/work/REQ-004/evidence/test-results/T1-attempt-1.yaml`). Sau REQ-005 là **399**; không lần chạy cũ nào đổi kết quả.

  | Class | Hiện nay | Thêm | Sau REQ-005 |
  | --- | --- | --- | --- |
  | `InMemoryCustomerRepositoryTest` | 40 | TC-115: 7, TC-116: 2 | 49 |
  | `CustomerServiceTest` | 133 | TC-117: 3, TC-118: 5, TC-119: 32 | 173 |
  | `CustomerHandlerTest` | 68 | TC-120: 15, TC-121: 2, TC-122: 2, TC-123: 16, TC-124: 4 | 107 |
  | `PhoneNumbersTest` | 70 | không | 70 |

- FE: hiện 43 test, đều pass (`aiws/work/REQ-004/evidence/test-results/T3-attempt-1.yaml`). FE-1 thêm 3 (TC-125..TC-127), FE-2 thêm 7 (TC-128..TC-134); sau cả hai nhóm là **53**.

**Chưa chạy kiểm chứng.** Run này không chạy lệnh nào; các nhận định dưới đây suy ra từ đọc code. [CẦN XÁC NHẬN] developer xác nhận khi viết test:
- Trên code hiện tại (`CustomerHandler.route` bỏ qua query string), TC-124 và các dòng 200 "mọi khách hàng" của TC-120 đã pass; các dòng lọc của TC-120, cùng TC-121, TC-122, TC-123 fail cho tới khi BE-3 xong.
- Trên `listCustomers` hiện tại, bốn dòng đầu của TC-125 pass ở phần URL; các dòng có `status` fail (URL thiếu query, và `status` nằm trong tham số thứ hai của `fetch`).
- Hành vi của `java.net.http.HttpClient` với query rỗng (dòng `?` của TC-120), nêu ở mục "Không có TC tự động".
- `URI.create` nhận các query string của TC-120, TC-123, TC-124 (chúng chỉ chứa ký tự hợp lệ của URI: chữ, số, `=`, `&`, `,`, `+`, `%xx`).

## Test cases

### TC-115: InMemoryCustomerRepository.findAllByStatus chỉ trả khách hàng có đúng status đó, tăng dần theo id
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5: `findAllByStatus(status)` trả mọi khách hàng có đúng `status` đó và chỉ những khách hàng đó, tăng dần theo `id`, nguyên bản ghi (kể cả `phone = null`). Không ai khớp thì trả list rỗng, không `null` và không exception. `findAll()` không đổi.
- preconditions: `InMemoryCustomerRepository` mới tạo trong test; `insert` kho theo danh sách trạng thái của dòng dữ liệu (xem "Dữ liệu chung"), giữ các `Customer` được trả về.
- test data: (danh sách trạng thái của kho, `status` hỏi → `id` mong đợi)
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `ACTIVE` → 1, 3 (khớp xen kẽ; khách hàng 1 có `phone = null`)
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `INACTIVE` → 2, 4 (khách hàng 4 có `phone = null`)
  - `[INACTIVE, ACTIVE, ACTIVE, ACTIVE]`, `ACTIVE` → 2, 3, 4 (khách hàng đầu kho không khớp)
  - `[INACTIVE, ACTIVE, ACTIVE, ACTIVE]`, `INACTIVE` → 1 (đúng một khách hàng khớp)
  - `[ACTIVE, ACTIVE]`, `INACTIVE` → (rỗng)
  - `[INACTIVE, INACTIVE]`, `ACTIVE` → (rỗng)
  - `[]`, `ACTIVE` → (rỗng; kho rỗng)
- steps: Given kho theo dòng dữ liệu / When gọi `repository.findAllByStatus(status)` / Then so kết quả với list mong đợi và đọc lại `repository.findAll()`.
- expected result:
  - kết quả bằng đúng (`assertEquals`) list các `Customer` do `insert` trả về cho các `id` mong đợi, theo đúng thứ tự đó
  - dòng "(rỗng)": kết quả bằng `List.of()`
  - `repository.findAll()` bằng đúng list mọi `Customer` đã `insert`, tăng dần theo `id`

### TC-116: InMemoryCustomerRepository.findAllByStatus theo trạng thái đang lưu sau updateStatus
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D5; AC-1, biến thể "theo trạng thái đang lưu": sau `updateStatus`, khách hàng rời danh sách của trạng thái cũ và vào danh sách của trạng thái mới, đúng vị trí theo `id`. List đã trả về trước đó là list riêng, không phải view của kho.
- preconditions: `InMemoryCustomerRepository` mới với kho K4; chụp `activeBefore = repository.findAllByStatus(ACTIVE)` và `inactiveBefore = repository.findAllByStatus(INACTIVE)`.
- test data: (`id`, trạng thái mới → `id` trong `ACTIVE`; `id` trong `INACTIVE`)
  - `1`, `INACTIVE` → 3; 1, 2, 4
  - `2`, `ACTIVE` → 1, 2, 3; 4
- steps: Given kho K4 và hai list đã chụp / When gọi `repository.updateStatus(id, trạng thái mới)` rồi `findAllByStatus(ACTIVE)` và `findAllByStatus(INACTIVE)` / Then so hai kết quả mới và hai list đã chụp.
- expected result:
  - hai kết quả mới bằng đúng list các khách hàng có `id` mong đợi, theo đúng thứ tự
  - phần tử của khách hàng vừa đổi là `new Customer(id, <name>, <email>, <phone>, trạng thái mới)`: chỉ `status` đổi
  - `activeBefore` vẫn bằng đúng list khách hàng 1, 3 và `inactiveBefore` vẫn bằng đúng list khách hàng 2, 4, với bản ghi **trước** khi đổi
  - `repository.findAll()` có 4 phần tử, `id` 1, 2, 3, 4

### TC-117: CustomerService.list không có giá trị lọc trả đúng kết quả của list()
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D4: danh sách giá trị rỗng nghĩa là không lọc. `list(statusValues)` tách ca này ra trước `parseStatus` và trả đúng kết quả của `list()`: mọi khách hàng, tăng dần theo `id`, không exception. "Không lọc" không có nghĩa là "chỉ `ACTIVE`".
- preconditions: `repository` và `service` của `@BeforeEach`; `insert` kho theo danh sách trạng thái của dòng dữ liệu.
- test data: (danh sách trạng thái của kho)
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`
  - `[INACTIVE, INACTIVE]` (bắt cách hiện thực mặc định về `ACTIVE`)
  - `[]` (kho rỗng)
- steps: Given kho theo dòng dữ liệu / When gọi `service.list(List.of())` / Then so với `service.list()` và với các `Customer` đã `insert`.
- expected result:
  - không ném exception
  - kết quả bằng đúng `service.list()`
  - kết quả bằng đúng list mọi `Customer` đã `insert`, tăng dần theo `id` (dòng thứ ba: list rỗng)

### TC-118: CustomerService.list với một giá trị lọc hợp lệ chỉ trả khách hàng ở trạng thái đó, tăng dần theo id
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: D4, D5: đúng một giá trị `"ACTIVE"` hoặc `"INACTIVE"` thì `list(statusValues)` trả đúng các khách hàng có `status` đó, tăng dần theo `id`, nguyên bản ghi. Không ai khớp thì trả list rỗng, không ném `NotFoundException` hay `ValidationException`.
- preconditions: `repository` và `service` của `@BeforeEach`; `insert` kho theo danh sách trạng thái của dòng dữ liệu, giữ các `Customer` được trả về.
- test data: (danh sách trạng thái của kho, giá trị lọc → `id` mong đợi)
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `"ACTIVE"` → 1, 3
  - `[ACTIVE, INACTIVE, ACTIVE, INACTIVE]`, `"INACTIVE"` → 2, 4
  - `[ACTIVE, ACTIVE]`, `"INACTIVE"` → (rỗng)
  - `[INACTIVE, INACTIVE]`, `"ACTIVE"` → (rỗng)
  - `[]`, `"ACTIVE"` → (rỗng; kho rỗng)
- steps: Given kho theo dòng dữ liệu / When gọi `service.list(List.of(giá trị lọc))` / Then so kết quả với list mong đợi và đọc lại `service.list()`.
- expected result:
  - không ném exception
  - kết quả bằng đúng list các `Customer` đã `insert` có `id` mong đợi, theo đúng thứ tự; dòng "(rỗng)": bằng `List.of()`
  - `service.list()` vẫn bằng đúng list mọi `Customer` đã `insert`

### TC-119: CustomerService.list từ chối giá trị lọc không phải đúng một giá trị ACTIVE hoặc INACTIVE
- covers: AC-2
- side: be
- level: unit
- type: negative
- priority: high
- objective: D2, D4: giá trị lọc hợp lệ khi có **đúng một** giá trị và giá trị đó đúng bằng `ACTIVE` hoặc `INACTIVE` (không trim, không đổi hoa thường). Mọi trường hợp khác ném `ValidationException` với cùng một map `{"status": "must be ACTIVE or INACTIVE"}`, kể cả khi mọi giá trị lặp đều hợp lệ. Service không trả list nào (kể cả list rỗng), và kết quả không phụ thuộc dữ liệu trong kho.
- preconditions: `repository` và `service` của `@BeforeEach`. Mỗi dòng dữ liệu chạy **hai lần**: trên kho K4 và trên kho rỗng (provider nhân chéo, như TC-89). Chụp `before = service.list()`.
- test data: (`statusValues`, kiểu `List<String>`)
  - một giá trị lạ: `["DELETED"]`, `["ALL"]`
  - sai hoa thường: `["active"]`, `["Inactive"]`
  - rỗng hoặc chỉ dấu cách: `[""]` (handler trao giá trị này cho cả `?status=` và `?status`), `["   "]`
  - thừa dấu cách: `[" ACTIVE"]`, `["INACTIVE "]` (bắt cách hiện thực có trim)
  - hai giá trị trong một tham số: `["ACTIVE,INACTIVE"]`
  - tham số lặp, hai giá trị hợp lệ khác nhau: `["ACTIVE", "INACTIVE"]`, `["INACTIVE", "ACTIVE"]` (bắt cách lấy giá trị đầu và cách lấy giá trị cuối)
  - tham số lặp, cùng một giá trị hợp lệ: `["ACTIVE", "ACTIVE"]`, `["INACTIVE", "INACTIVE"]` (bắt cách bỏ trùng)
  - tham số lặp, có giá trị rỗng: `["ACTIVE", ""]`, `["", "ACTIVE"]` (bắt cách bỏ giá trị rỗng)
  - ba giá trị: `["ACTIVE", "ACTIVE", "ACTIVE"]` (bắt cách chỉ chặn đúng hai giá trị)
- steps: Given kho K4 hoặc kho rỗng / When gọi `service.list(statusValues)` / Then bắt exception và đọc lại `service.list()`.
- expected result: mọi dòng dữ liệu, trên cả hai kho
  - ném `ValidationException` (`assertThrows`); không trả list nào
  - `error.errors()` bằng đúng `Map.of("status", "must be ACTIVE or INACTIVE")`
  - `service.list()` bằng đúng `before`

### TC-120: GET /api/customers trả 200 kèm đúng các khách hàng khớp tham số status của query string
- covers: AC-1
- side: be
- level: integration
- type: functional
- priority: high
- objective: D1, D3, D4, D5; bảng ở `02-design.md` → API. Không có tham số `status` thì trả mọi khách hàng như trước REQ-005. `status` xuất hiện đúng một lần với `ACTIVE` hoặc `INACTIVE` thì chỉ trả khách hàng khớp, tăng dần theo `id`, mỗi phần tử đủ năm field. Query được tách trước, giải mã sau; tên tham số so khớp chính xác sau khi giải mã; tham số tên khác bị bỏ qua.
- preconditions: server đang chạy; kho K4 dựng qua API (xem "Dữ liệu chung"); chụp `all = customers()` và xác nhận `all` có 4 phần tử với `id` 1, 2, 3, 4 và `status` lần lượt `ACTIVE`, `INACTIVE`, `ACTIVE`, `INACTIVE`.
- test data: (`path` truyền cho `get(path)` → `id` mong đợi)
  - AC-1, không kèm giá trị lọc: `""` → 1, 2, 3, 4
  - AC-1, giá trị hợp lệ: `"?status=ACTIVE"` → 1, 3
  - AC-1, giá trị hợp lệ: `"?status=INACTIVE"` → 2, 4
  - D3, kèm tham số khác: `"?status=ACTIVE&foo=1"` → 1, 3
  - D3, `status` không đứng đầu: `"?foo=1&status=ACTIVE"` → 1, 3
  - D3, giá trị được giải mã rồi mới so: `"?status=%41CTIVE"` → 1, 3
  - D3, tên được giải mã rồi mới so: `"?%73tatus=INACTIVE"` → 2, 4
  - D3, query rỗng: `"?"` → 1, 2, 3, 4 ([CẦN XÁC NHẬN] `HttpClient` có thể không gửi dấu `?`; xem Chiến lược)
  - tên khác bị bỏ qua (Q4): `"?foo=1"` → 1, 2, 3, 4
  - tên khác, sai hoa thường: `"?Status=ACTIVE"` → 1, 2, 3, 4
  - tên khác, sai hoa thường: `"?STATUS=ACTIVE"` → 1, 2, 3, 4
  - tên khác: `"?state=ACTIVE"` → 1, 2, 3, 4
  - tên khác, chứa chữ `status`: `"?xstatus=INACTIVE"` → 1, 2, 3, 4 (bắt cách tìm `status=` ở bất kỳ đâu trong query)
  - D3, `%26` và `%3D` là dữ liệu của `foo`: `"?foo=1%26status%3DACTIVE"` → 1, 2, 3, 4 (giải mã trước sẽ cho 1, 3)
  - D3, `%3D` thuộc về tên: `"?status%3DACTIVE"` → 1, 2, 3, 4 (đoạn không có dấu `=` thô, tên sau giải mã là `status=ACTIVE`; giải mã trước sẽ cho 1, 3)
- steps: Given kho K4 và `all` / When gọi `get(path)` / Then kiểm tra status, `Content-Type` và body.
- expected result: mọi dòng dữ liệu
  - status 200; `Content-Type` bắt đầu bằng `application/json`
  - body là mảng JSON; `id` của các phần tử, theo thứ tự, đúng bằng các `id` mong đợi (đúng số lượng, không thừa, không thiếu)
  - mỗi phần tử bằng đúng (so `JsonNode`) phần tử cùng `id` trong `all`
  - mỗi phần tử có đúng năm field `id`, `name`, `email`, `phone`, `status`; phần tử `id` 1 và 4 có field `phone` với giá trị JSON `null` (`has("phone")` và `isNull()`), phần tử `id` 2 và 3 có `phone` là `"0912345678"` và `"0987654321"`
  - ở các dòng có lọc (kết quả 1, 3 hoặc 2, 4): mọi phần tử có `status` đúng bằng giá trị lọc, không phần tử nào mang trạng thái kia

### TC-121: GET /api/customers với giá trị lọc hợp lệ mà không khách hàng nào khớp trả 200 kèm mảng rỗng
- covers: AC-1
- side: be
- level: integration
- type: boundary
- priority: high
- objective: AC-1, biến thể "không khách hàng nào khớp": giá trị lọc hợp lệ nhưng không ai ở trạng thái đó thì trả 200 `application/json` với body `[]`, không phải 404 và không phải Problem. Kiểm cả hai chiều.
- preconditions: server đang chạy với seed id 1; đã `post` khách hàng 2 của bảng chuẩn → 201 (kho có 2 khách hàng, đều `ACTIVE`). Tuỳ dòng dữ liệu, đã `put("/{id}/status", "{\"status\":\"INACTIVE\"}")` → 200 cho các `id` phải ngừng hoạt động.
- test data: (các `id` ngừng hoạt động trước, `path`)
  - không ai, `"?status=INACTIVE"` (kho chỉ có khách hàng `ACTIVE`)
  - 1 và 2, `"?status=ACTIVE"` (kho chỉ có khách hàng `INACTIVE`)
- steps: Given kho theo dòng dữ liệu / When gọi `get(path)` rồi `customers()` / Then kiểm tra response.
- expected result: mọi dòng dữ liệu
  - status 200 (không phải 404); `Content-Type` bắt đầu bằng `application/json`
  - body là mảng JSON có 0 phần tử (`isArray()` và `size() == 0`)
  - `customers()` (không lọc) vẫn có 2 phần tử

### TC-122: GET /api/customers lọc theo trạng thái đang lưu sau khi một khách hàng đổi trạng thái
- covers: AC-1
- side: be
- level: integration
- type: functional
- priority: high
- objective: AC-1, biến thể "theo trạng thái đang lưu" (R4 của requirement nhìn từ phía API): ngay sau `PUT /api/customers/{id}/status` thành công, khách hàng đó rời danh sách của trạng thái cũ và có mặt trong danh sách của trạng thái mới, đúng vị trí theo `id`; các khách hàng khác không đổi chỗ.
- preconditions: server đang chạy; kho K4 dựng qua API; chụp `all = customers()`.
- test data: (`id`, body của `PUT /api/customers/{id}/status` → `id` trong `?status=ACTIVE`; `id` trong `?status=INACTIVE`)
  - `1`, `{"status":"INACTIVE"}` → 3; 1, 2, 4 (đúng dòng của AC-1)
  - `2`, `{"status":"ACTIVE"}` → 1, 2, 3; 4 (chiều kích hoạt lại; số của khách hàng 2 không ai khác dùng)
- steps: Given kho K4 / When `put("/" + id + "/status", body)` rồi `get("?status=ACTIVE")` và `get("?status=INACTIVE")` / Then kiểm tra ba response.
- expected result:
  - PUT trả 200
  - hai GET trả 200, body là mảng có `id` đúng bằng các `id` mong đợi, theo đúng thứ tự
  - phần tử của khách hàng vừa đổi có `status` mới; `name`, `email`, `phone` bằng đúng phần tử cùng `id` trong `all`
  - mọi phần tử khác bằng đúng (so `JsonNode`) phần tử cùng `id` trong `all`

### TC-123: GET /api/customers với giá trị lọc không hợp lệ trả 400 Problem kèm errors.status
- covers: AC-2
- side: be
- level: integration
- type: negative
- priority: high
- objective: D2, D3; AC-2: có tham số `status` nhưng không phải đúng một lần với `ACTIVE` hoặc `INACTIVE` thì trả 400 `application/problem+json`, `title` là `Validation failed`, `errors` đúng một key `status`. Body không bao giờ là mảng khách hàng, kể cả mảng rỗng; không phải 200 kèm tất cả, không phải 500.
- preconditions: server đang chạy với seed id 1 (`ACTIVE`); chụp `before = customers()`.
- test data: (`path` truyền cho `get(path)`)
  - giá trị lạ: `"?status=DELETED"`, `"?status=ALL"`
  - sai hoa thường: `"?status=active"`, `"?status=Inactive"`
  - giá trị rỗng: `"?status="`, `"?status"` (không có dấu `=`; không được coi là vắng mặt)
  - có khoảng trắng: `"?status=%20ACTIVE"`, `"?status=INACTIVE%20"`, `"?status=+ACTIVE"` (`+` giải mã thành dấu cách)
  - hai giá trị trong một tham số: `"?status=ACTIVE,INACTIVE"`
  - tham số lặp: `"?status=ACTIVE&status=INACTIVE"`, `"?status=ACTIVE&status=ACTIVE"` (cùng một giá trị hợp lệ), `"?status=ACTIVE&status="`
  - giá trị sai khi `status` không đứng đầu: `"?foo=1&status=DELETED"`
  - D3, tách trước giải mã sau: `"?status=ACTIVE%26foo%3D1"` (giá trị là `ACTIVE&foo=1`; giải mã trước sẽ trả 200)
  - D3, tách tại dấu `=` đầu tiên: `"?status=ACTIVE=1"` (giá trị là `ACTIVE=1`)
- steps: Given khách hàng 1 đang có trong kho / When gọi `get(path)` rồi `customers()` / Then kiểm tra response.
- expected result: mọi dòng dữ liệu
  - status 400; `Content-Type` bắt đầu bằng `application/problem+json`
  - body là object JSON, không phải mảng (`isObject()`)
  - `type` là `"about:blank"`; `title` là `"Validation failed"`; `status` là `400`; `detail` là `"The request has invalid fields"`
  - `errorsOf(body)` bằng đúng `Map.of("status", "must be ACTIVE or INACTIVE")` (thông điệp cố định, không lặp lại giá trị client gửi)
  - `customers()` bằng đúng `before`

### TC-124: Các route khác GET /api/customers bỏ qua tham số status trong query string
- covers: AC-2
- side: be
- level: integration
- type: functional
- priority: medium
- objective: D3 → Bắt buộc: chỉ khối route `GET /api/customers` đọc query string. Quy tắc 400 của AC-2 không lan sang route khác: `GET` và `PUT /api/customers/{id}`, `PUT /api/customers/{id}/status` kèm `?status=DELETED` cho kết quả như khi không có query string. TC này pass cả trước lẫn sau REQ-005.
- preconditions: server đang chạy với seed id 1 (`Nguyen Van An`, `an@example.com`, không có số, `ACTIVE`).
- test data: (method, `path`, body → status mong đợi; field kiểm thêm = giá trị)
  - `GET`, `"/1?status=DELETED"`, không có body → 200; `email` = `an@example.com`
  - `GET`, `"/999?status=DELETED"`, không có body → 404; `detail` = `Customer 999 not found`
  - `PUT`, `"/1?status=DELETED"`, `{"name":"Nguyen Van Anh","email":"an@example.com"}` → 200; `name` = `Nguyen Van Anh`
  - `PUT`, `"/1/status?status=DELETED"`, `{"status":"INACTIVE"}` → 200; `status` = `INACTIVE` (theo body, không theo query)
- steps: Given khách hàng 1 / When gửi request của dòng dữ liệu bằng `get(path)` hoặc `put(path, body)` / Then kiểm tra status và body.
- expected result: mọi dòng dữ liệu
  - status đúng bằng status mong đợi (không dòng nào là 400)
  - field kiểm thêm của body có đúng giá trị của dòng dữ liệu
  - body không có key `errors`

### TC-125: listCustomers gửi đúng một GET tới URL mang giá trị lọc
- covers: AC-3
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D6: `listCustomers({ status, ...options })` gửi đúng một request `GET` không body, không `Content-Type`. `status` không có giá trị (`undefined`, `null`, `''`, thiếu key) thì URL đúng bằng `/api/customers`, không có `?`. Giá trị khác thì URL là `/api/customers?status=` nối `encodeURIComponent(status)`. `status` được tách khỏi `options`, không rơi vào tham số thứ hai của `fetch`.
- preconditions: mỗi dòng dùng mảng `calls` mới và `fakeFetch(200, [AN], calls)`; lời gọi là `listCustomers({ ...options, fetchImpl })`.
- test data: (`options` → `url`)
  - `{}` → `'/api/customers'` (như lời gọi hiện có)
  - `{ status: '' }` → `'/api/customers'` ("Tất cả", giá trị của `<option value="">`)
  - `{ status: undefined }` → `'/api/customers'`
  - `{ status: null }` → `'/api/customers'`
  - `{ status: 'ACTIVE' }` → `'/api/customers?status=ACTIVE'`
  - `{ status: 'INACTIVE' }` → `'/api/customers?status=INACTIVE'`
  - `{ status: 'A&B=C D' }` → `'/api/customers?status=A%26B%3DC%20D'` (giá trị đi qua `encodeURIComponent`; dấu cách là `%20`, không phải `+`)
- steps: Given `fakeFetch` ghi lại request / When gọi `listCustomers({ ...options, fetchImpl })` / Then đọc `calls`.
- expected result: mọi dòng dữ liệu
  - `calls.length` là 1
  - `calls[0].url` đúng bằng `url` của dòng (so chuỗi chính xác; bốn dòng đầu không có ký tự `?`)
  - `calls[0].init.method` là `undefined`; `calls[0].init.body` là `undefined`
  - `calls[0].init.headers` bằng đúng `{ Accept: 'application/json' }` (không có `Content-Type`)
  - `'status' in calls[0].init` là `false`
  - gọn nhất: `assert.deepEqual(calls[0].init, { headers: { Accept: 'application/json' } })` phủ ba dòng trên

### TC-126: listCustomers trả nguyên mảng API trả, không lọc và không sắp xếp lại
- covers: AC-3
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D6; R2 của requirement (việc lọc do API làm): hàm trả nguyên body API trả, cả khi API (giả lập) trả khách hàng không khớp giá trị lọc, trả sai thứ tự `id`, hoặc trả mảng rỗng.
- preconditions: mỗi dòng dùng `fakeFetch(200, body)` truyền qua `{ fetchImpl }`.
- test data: (`status`, `body` API trả)
  - `'ACTIVE'`, `[AN, BINH, CUONG, DUNG]` (có cả khách hàng `INACTIVE` dù đang lọc `ACTIVE`)
  - `'INACTIVE'`, `[CUONG, BINH, AN]` (không theo thứ tự `id`, có khách hàng không khớp)
  - `'INACTIVE'`, `[]`
  - `''`, `[]`
- steps: Given `fakeFetch` trả `body` / When gọi `listCustomers({ status, fetchImpl })` / Then so giá trị trả về.
- expected result: mọi dòng dữ liệu
  - giá trị trả về bằng đúng `body` (`assert.deepEqual`, so chặt: đúng số phần tử, đúng thứ tự, đúng từng field)
  - dòng `[]`: giá trị trả về là mảng có `length` 0

### TC-127: listCustomers ném ApiError mang status và lỗi theo field của API
- covers: AC-3, AC-4
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: D6: response non-2xx của `GET /api/customers` làm `listCustomers` ném `ApiError` qua `request()`, không trả body lỗi như một danh sách. Response 400 của AC-2 cho `fieldErrors.status`. Hàm không tự kiểm tra giá trị: giá trị lạ vẫn được gửi đi. Đây là nguồn của biến thể "yêu cầu lấy danh sách thất bại" ở AC-4.
- preconditions: mỗi dòng dùng mảng `calls` mới và `fakeFetch(status, problem, calls)` truyền qua `{ fetchImpl }`.
- test data: (`options`; status và `problem` API trả → `url`; `fieldErrors`)
  - `{ status: 'DELETED' }`; 400, `{ type: 'about:blank', title: 'Validation failed', status: 400, detail: 'The request has invalid fields', errors: { status: 'must be ACTIVE or INACTIVE' } }` → `'/api/customers?status=DELETED'`; `{ status: 'must be ACTIVE or INACTIVE' }`
  - `{ status: 'ACTIVE' }`; 500, `{ type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' }` → `'/api/customers?status=ACTIVE'`; `{}`
  - `{}`; 500, cùng `problem` 500 → `'/api/customers'`; `{}`
- steps: Given `fakeFetch` trả lỗi / When gọi `listCustomers({ ...options, fetchImpl })` / Then kiểm tra lỗi bị ném bằng `assert.rejects` và đọc `calls`.
- expected result: mọi dòng dữ liệu
  - promise bị reject; lỗi là `instanceof ApiError`
  - `error.status` bằng status của dòng
  - `error.fieldErrors` bằng đúng (`assert.deepEqual`) `fieldErrors` của dòng
  - `calls.length` là 1 và `calls[0].url` đúng bằng `url` của dòng

### TC-128: createCustomerListLoader hỏi đúng lựa chọn đang chọn, mỗi lần tải một yêu cầu
- covers: AC-4
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8; AC-4: mỗi lần `load` gọi `getStatus()` đúng một lần và gọi `listCustomers` đúng một lần với tham số `{ status: <giá trị vừa đọc> }`. Chọn lại cùng một lựa chọn vẫn là một yêu cầu mới (không cache, không bỏ lần trùng). Các lần tải nối tiếp đều là `current`.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu tạo loader mới bằng `createCustomerListLoader(listCustomers giả, getStatus giả)`; `listCustomers` giả trả `[]` cho mọi lời gọi.
- test data: (chuỗi lựa chọn, mỗi giá trị một lần `load` nối tiếp)
  - `''`, `'ACTIVE'`, `'INACTIVE'`, `''` (mở trang, chọn "Đang hoạt động", chọn "Ngừng hoạt động", chọn lại "Tất cả")
  - `'INACTIVE'`, `'INACTIVE'` (tải lại khi lựa chọn không đổi)
  - `'ACTIVE'`
- steps: Given một loader mới / When với từng giá trị `s` của chuỗi: gán `selected = s` rồi `await load()` / Then sau mỗi lần tải, đọc `calls`, bộ đếm của `getStatus` và kết quả.
- expected result: mọi dòng dữ liệu
  - sau lần tải thứ k: `calls.length` là k và `getStatus` đã được gọi đúng k lần
  - `calls[k - 1]` bằng đúng (`assert.deepEqual`) `{ status: s }`: một object có đúng một key `status`
  - kết quả của mỗi lần tải có `current` là `true`
  - dòng thứ nhất: `calls` bằng đúng `[{ status: '' }, { status: 'ACTIVE' }, { status: 'INACTIVE' }, { status: '' }]`

### TC-129: createCustomerListLoader đọc lựa chọn ở từng lần tải, không phải lúc tạo hay ở lần tải trước
- covers: AC-5
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8 → Bắt buộc; AC-5: yêu cầu lấy danh sách mang giá trị của lựa chọn đang chọn **lúc tải lại**. `getStatus()` không được gọi lúc tạo loader, không được lưu lại giữa các lần tải, và được đọc ngay lúc `load` được gọi: đổi lựa chọn trong khi yêu cầu còn chờ không làm đổi yêu cầu đó. Loader không biết lần tải đến từ thao tác nào, nên TC này phủ cả sáu biến thể của AC-5.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu: gán `selected` bằng giá trị "lúc tạo" rồi tạo loader mới; `listCustomers` giả trả promise do test điều khiển.
- test data: (`selected` lúc tạo loader → `selected` ở từng lần tải, theo thứ tự)
  - `'ACTIVE'` → `'INACTIVE'`, `'INACTIVE'` (đổi lựa chọn sau khi tạo, trước lần tải đầu)
  - `'ACTIVE'` → `'ACTIVE'`, `'INACTIVE'` (đổi lựa chọn giữa hai lần tải)
  - `'INACTIVE'` → `'INACTIVE'`, `''` (trở về "Tất cả")
  - `''` → `''`, `'ACTIVE'`, `''`
- steps: Given loader vừa tạo / When với từng giá trị `s`: gán `selected = s`; gọi `const pending = load()`; gán `selected = 'CHANGED'` khi yêu cầu còn chờ; cho API trả `[]`; `await pending` / Then đọc bộ đếm của `getStatus` và `calls`.
- expected result: mọi dòng dữ liệu
  - ngay sau khi tạo loader và trước lần tải đầu: `getStatus` được gọi 0 lần, `calls.length` là 0
  - sau n lần tải: `getStatus` được gọi đúng n lần
  - `calls` bằng đúng mảng `{ status: s }` của từng lần tải, theo thứ tự (dòng thứ nhất: `[{ status: 'INACTIVE' }, { status: 'INACTIVE' }]`; dòng thứ hai: `[{ status: 'ACTIVE' }, { status: 'INACTIVE' }]`)
  - không lời gọi nào mang `'CHANGED'`

### TC-130: createCustomerListLoader trả nguyên kết quả của API khi không có lần tải nào muộn hơn
- covers: AC-4
- side: fe
- level: unit
- type: functional
- priority: high
- objective: D8; AC-4 ("bảng hiện đúng các khách hàng API trả, FE không lọc"): lần tải không bị vượt trả `{ current: true, customers }`, với `customers` là **chính** giá trị API trả: không lọc theo lựa chọn, không sắp xếp, kể cả `[]`. Giá trị falsy không bị coi là "không current": `null` (thứ `request()` trả khi body 200 không phải JSON) được chuyển nguyên để `refresh()` rơi vào nhánh lỗi như hiện nay.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu tạo loader mới; `getStatus` trả lựa chọn của dòng; `listCustomers` giả trả giá trị của dòng.
- test data: (lựa chọn, giá trị API trả)
  - `'ACTIVE'`, `[AN, BINH, CUONG, DUNG]` (có khách hàng không khớp lựa chọn)
  - `''`, `[CUONG, AN, BINH]` (không theo thứ tự `id`)
  - `'INACTIVE'`, `[]`
  - `'ACTIVE'`, `null` (theo lý do của D8)
- steps: Given một loader mới / When `const result = await load()` / Then so `result`.
- expected result: mọi dòng dữ liệu
  - `result` bằng đúng (`assert.deepEqual`) `{ current: true, customers: <giá trị API trả> }`
  - `result.customers` là chính giá trị đó (`assert.equal`, cùng tham chiếu với mảng test trao cho `listCustomers` giả)

### TC-131: createCustomerListLoader reject với chính lỗi của API, rồi lần tải sau vẫn chạy
- covers: AC-4
- side: fe
- level: unit
- type: negative
- priority: high
- objective: D8; AC-4, biến thể "yêu cầu lấy danh sách thất bại": khi API lỗi và không có lần tải nào muộn hơn, promise của lần tải bị reject với **chính** lỗi đó, để `refresh()` hiện câu lỗi. Loader không kẹt sau lỗi: lần tải kế tiếp đọc lựa chọn lúc đó và trả kết quả bình thường (chọn lại được).
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu tạo loader mới; `listCustomers` giả reject ở lời gọi thứ nhất với `error` của dòng và trả `[BINH]` ở lời gọi thứ hai.
- test data: (`error`)
  - `new Error('network down')`
  - `Object.assign(new Error('The request has invalid fields'), { status: 400, fieldErrors: { status: 'must be ACTIVE or INACTIVE' } })` (hình dạng của `ApiError`)
- steps: Given `selected = 'ACTIVE'` / When gọi `load()` và kiểm lỗi bằng `assert.rejects`; rồi gán `selected = 'INACTIVE'` và `const second = await load()` / Then so lỗi, `second` và `calls`.
- expected result: mọi dòng dữ liệu
  - lần tải thứ nhất bị reject, và lỗi nhận được là chính `error` (`assert.equal(caught, error)`)
  - `second` bằng đúng `{ current: true, customers: [BINH] }`
  - `calls` bằng đúng `[{ status: 'ACTIVE' }, { status: 'INACTIVE' }]`

### TC-132: createCustomerListLoader đánh dấu lần tải bị vượt là không current, bất kể thứ tự response về
- covers: AC-4
- side: fe
- level: unit
- type: functional
- priority: medium
- objective: D8, Q7 (ngoài tiền đề của AC-4): khi nhiều lần `load` chồng nhau, chỉ lần được **gọi** sau cùng là `current`, dù response của nó về trước hay sau các lần cũ. Lần bị vượt trả `{ current: false }`, không mang `customers`. Loader không huỷ yêu cầu: lần nào cũng gọi API.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu tạo loader mới. Các lần tải A, B, C được gọi theo thứ tự đó khi chưa response nào về, với `selected` lần lượt `'ACTIVE'`, `'INACTIVE'`, `''`; API của chúng trả `[AN]`, `[BINH]`, `[CUONG]`.
- test data: (các lần tải được gọi; thứ tự response về → lần `current`)
  - A, B; B rồi A → B
  - A, B; A rồi B → B
  - A, B, C; C, A, B → C
  - A, B, C; A, B, C → C
- steps: Given một loader mới / When gọi các lần `load` theo thứ tự, không `await`; rồi cho API trả về theo thứ tự của dòng, `await` promise của từng lần tải ngay sau khi API của nó trả về / Then so kết quả từng lần và `calls`.
- expected result: mọi dòng dữ liệu
  - lần tải được gọi sau cùng: bằng đúng `{ current: true, customers: <mảng của chính nó> }` (`[BINH]` ở hai dòng đầu, `[CUONG]` ở hai dòng sau)
  - mọi lần tải khác: bằng đúng (`assert.deepEqual`) `{ current: false }`, kể cả khi response của nó về trước
  - `calls.length` bằng số lần tải; `calls` mang `{ status: 'ACTIVE' }`, `{ status: 'INACTIVE' }` (và `{ status: '' }`) theo thứ tự gọi

### TC-133: createCustomerListLoader nuốt lỗi của lần tải bị vượt và reject với lỗi của lần tải mới nhất
- covers: AC-4
- side: fe
- level: unit
- type: negative
- priority: medium
- objective: D8, Q7 (ngoài tiền đề của AC-4): lỗi của lần tải đã bị vượt không được làm `refresh()` hiện câu lỗi đè lên bảng của lần tải mới hơn, nên lần đó trả `{ current: false }` chứ không reject. Lỗi của lần tải mới nhất vẫn reject với chính lỗi của nó, dù lần cũ thành công hay thất bại.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Mỗi dòng dữ liệu tạo loader mới. Gọi `load` A rồi `load` B khi A chưa về. `eA = new Error('A failed')`, `eB = new Error('B failed')`. Với dòng mà B lỗi: gắn `assert.rejects(b, ...)` **trước** khi cho API của B lỗi, `await` assertion sau.
- test data: (API của A; API của B; thứ tự response về → kết quả của A; kết quả của B)
  - lỗi `eA`; trả `[BINH]`; A rồi B → `{ current: false }`; `{ current: true, customers: [BINH] }`
  - lỗi `eA`; trả `[BINH]`; B rồi A → `{ current: false }`; `{ current: true, customers: [BINH] }`
  - trả `[AN]`; lỗi `eB`; A rồi B → `{ current: false }`; reject với `eB`
  - lỗi `eA`; lỗi `eB`; A rồi B → `{ current: false }`; reject với `eB` (không phải `eA`)
- steps: Given một loader mới với hai lần tải A, B đang chờ / When cho API của A và B trả về hoặc lỗi theo dòng dữ liệu / Then `await` promise của A và kiểm promise của B.
- expected result: mọi dòng dữ liệu
  - promise của A **không** bị reject; kết quả bằng đúng `{ current: false }`
  - promise của B: bằng đúng `{ current: true, customers: [BINH] }` ở hai dòng đầu; bị reject với chính `eB` (`assert.equal(caught, eB)`) ở hai dòng sau

### TC-134: createCustomerListLoader tạo các loader không chung state
- covers: AC-4
- side: fe
- level: unit
- type: functional
- priority: low
- objective: D8 → Bắt buộc: mỗi lời gọi `createCustomerListLoader(...)` trả một loader có bộ đếm riêng (factory, state trong closure, không ở mức module). Lần tải trên loader thứ hai không làm lần tải đang chờ của loader thứ nhất thành "bị vượt"; nhờ vậy các test không phụ thuộc thứ tự chạy.
- preconditions: file test import `createCustomerListLoader` từ `../src/utils/createCustomerListLoader.js`. Tạo hai loader bằng hai lời gọi riêng: `loadFirst` với `getStatus` trả `'ACTIVE'`, `loadSecond` với `getStatus` trả `'INACTIVE'`; mỗi loader có `listCustomers` giả riêng, trả promise do test điều khiển.
- test data: API của `loadFirst` trả `[AN]`; API của `loadSecond` trả `[BINH]`.
- steps: Given hai loader / When gọi `const first = loadFirst()` (chưa về), rồi `const second = loadSecond()`; cho API của `loadSecond` trả về và `await second`; rồi cho API của `loadFirst` trả về và `await first` / Then so hai kết quả.
- expected result:
  - kết quả của `second` bằng đúng `{ current: true, customers: [BINH] }`
  - kết quả của `first` bằng đúng `{ current: true, customers: [AN] }` (vẫn `current`, dù loader kia được gọi sau)

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-115, TC-116, TC-117, TC-118, TC-120, TC-121, TC-122 |
| AC-2 | TC-119, TC-123, TC-124 |
| AC-3 | TC-125, TC-126, TC-127 |
| AC-4 | TC-127, TC-128, TC-130, TC-131, TC-132, TC-133, TC-134 |
| AC-5 | TC-129 |

Ghi chú cho ma trận:
- TC-132, TC-133, TC-134 thuộc D8/Q7, **ngoài tiền đề của AC-4** (D11). Nếu người duyệt không nhận phần Q7 thì ba TC này bỏ đi; AC-4 vẫn còn TC-127, TC-128, TC-130, TC-131.
- AC-4 và AC-5 chỉ có TC cho phần quyết định nằm trong `listCustomers` và `createCustomerListLoader`. Phần `index.html` và `main.js` kiểm bằng review và chạy tay (Chiến lược → "Không có TC tự động").
