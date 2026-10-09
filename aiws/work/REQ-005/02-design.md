# REQ-005 — Thiết kế

## Tổng quan
REQ-005 cho nhân viên chọn danh sách muốn xem (tất cả, chỉ đang hoạt động, chỉ ngừng hoạt động), và việc lọc do API làm. Thiết kế xử lý đủ AC-1..AC-5 trong `01-analysis.md` và chốt các giả định Q1..Q8. Đây là vòng thiết kế đầu tiên, chưa có feedback reject.

- **API (AC-1, AC-2).** `GET /api/customers` nhận thêm tham số query tuỳ chọn `status` (D1). Không gửi thì trả tất cả như hiện nay. Gửi đúng một lần với giá trị `ACTIVE` hoặc `INACTIVE` thì chỉ trả khách hàng ở trạng thái đó. Mọi trường hợp khác có tham số `status` trả 400 kèm `errors.status` (D2). Đây là tham số query đầu tiên của API.
- **BE.** `CustomerHandler` tách query string thành danh sách giá trị thô của `status` (D3); `CustomerService` quyết định hợp lệ hay không bằng `parseStatus` có sẵn (D4); `CustomerRepository` thêm một truy vấn `findAllByStatus` (D5). `CustomerService.list()` và `CustomerRepository.findAll()` giữ nguyên chữ ký và hành vi.
- **FE.**
  - `listCustomers` nhận `status` trong tham số `options` đang có, nên mọi lời gọi cũ vẫn đúng (D6).
  - `index.html` thêm một `<select>` ba lựa chọn, nằm ngoài `#customers` (D7).
  - Đơn vị mới `createCustomerListLoader` đọc lựa chọn **ở từng lần tải** và đánh dấu lần tải đã bị một lần tải mới hơn vượt qua (D8). `main.js` chỉ nối các phần này lại (D9).
- **Không có DB, không migration.** API chỉ mở rộng: lời gọi không kèm `status` cho đúng kết quả cũ. **Không test có sẵn nào phải sửa**; mốc 311 lần chạy BE và 43 test FE giữ nguyên, cộng thêm test mới (D11).
- **Thứ tự deploy bắt buộc: BE trước, FE sau.** FE mới trên BE cũ sẽ hiện mọi khách hàng dưới lựa chọn "Đang hoạt động" mà không báo gì (Migration).
- **Hai điểm người duyệt nên xem trước:**
  - Thiết kế **có** bỏ qua response danh sách đến trễ (Q7, D8). Analysis giả định không xử lý nhưng đề nghị đưa vào nếu đủ nhỏ.
  - Thiết kế **không** chặn cú bấm đúp rơi vào khách hàng kế tiếp khi đang lọc (Q1, D10), đúng giả định của analysis. Phương án chặn đã sẵn ở "Quyết định cần duyệt".

Truy vết AC → thiết kế:

| AC | Phần thiết kế |
| --- | --- |
| AC-1 | D1 (tham số), D4 (không có giá trị lọc thì trả tất cả), D5 (truy vấn theo trạng thái, tăng dần theo `id`) |
| AC-2 | D2 (quy tắc và hình dạng lỗi), D3 (tách query), D4 (nơi quyết định) |
| AC-3 | D6 |
| AC-4 | D7 (điều khiển lọc), D8 (mỗi lần tải mang giá trị của lựa chọn lúc đó), D9 (nối sự kiện, lúc mở trang) |
| AC-5 | D8 (đọc lựa chọn lúc tải lại), D9 (bốn chỗ gọi `refresh()` dùng chung một đường) |
| Q1 | D10 |
| Truy vết TC | D11 |

Chi tiết schema nằm trong `api-contract.yaml`.

## Quyết định chính
- D1: Giá trị lọc là **tham số query `status` của `GET /api/customers`**, nhận `ACTIVE` hoặc `INACTIVE`. "Tất cả" là **không gửi** tham số (Q2).
  - Lý do:
    - Lời gọi hiện có (`/api/customers` không query) giữ nguyên nghĩa và kết quả: "mặc định là tất cả, như hiện nay" (R1).
    - Tên và giá trị trùng field `status` của `Customer` và enum `CustomerStatus`: API nhận lại đúng giá trị nó trả ra, và key lỗi `errors.status` đã có từ REQ-003.
    - `GET` kèm query là cách lọc một collection theo RFC 9110; không thêm route.
  - Quy ước mới đi kèm (API chưa có tham số query nào): tên tham số query viết như tên field JSON tương ứng, phân biệt hoa thường.
  - Đã cân nhắc:
    - Giá trị thứ ba `status=ALL`: loại. `ALL` không phải một trạng thái, và có hai cách viết cho cùng một danh sách.
    - Path riêng (`/api/customers/active`): loại. Thêm route, và đụng regex `BY_ID` của `/api/customers/{id}`.
    - Tham số boolean `active=true|false`: loại, lệch tên và kiểu của field `status`.
    - `POST /api/customers/search` với body: loại. Đọc dữ liệu bằng `POST`, và không cần cho một tiêu chí.

- D2: **Giá trị lọc hợp lệ khi tham số `status` xuất hiện đúng một lần và giá trị đúng bằng `ACTIVE` hoặc `INACTIVE`.** Mọi trường hợp khác có tham số `status` trả **400** `application/problem+json`, `title = "Validation failed"`, `errors` đúng bằng `{"status": "must be ACTIVE or INACTIVE"}` (Q3, Q4; AC-2).
  - So khớp chính xác trên giá trị đã giải mã percent-encoding (D3): không trim, không đổi hoa thường. Giá trị rỗng là **không hợp lệ**, không phải "không lọc".
  - **Tham số lặp lại luôn không hợp lệ, kể cả lặp cùng một giá trị hợp lệ** (`status=ACTIVE&status=ACTIVE`). Đây là phần Q4 để ngỏ cho architect.
  - Tham số có tên khác (`Status`, `state`, `foo`) bị bỏ qua như mọi query string hiện nay, nên `?Status=ACTIVE` trả tất cả (Q4; xem R4).
  - Giá trị lọc được kiểm tra **trước** khi đọc kho: 400 không phụ thuộc dữ liệu đang có.
  - `detail` vẫn là câu cố định `The request has invalid fields` của `CustomerHandler.handle` (dòng 38), dù thứ không hợp lệ lần này là một tham số query.
  - Lý do:
    - Cùng quy tắc và cùng thông điệp với trạng thái đích của `PUT /api/customers/{id}/status` (`aiws/work/REQ-003/02-design.md` D4): một tập giá trị, một cách kiểm tra, một câu lỗi.
    - Đường `ValidationException` → 400 có sẵn; không thêm exception, `title` hay dòng map nào.
    - "Đúng một lần" phát biểu được trong một câu và không phải chọn giữa giá trị đầu và giá trị cuối. Màn hình không bao giờ gửi tham số lặp, nên không client nào bị ảnh hưởng.
    - R3 cấm "lặng lẽ nhận về tất cả"; coi giá trị rỗng là "không lọc" là đúng điều đó.
  - Đã cân nhắc:
    - Trim hoặc không phân biệt hoa thường: loại, nới contract mà không client nào cần (như REQ-003 D4).
    - Chấp nhận tham số lặp khi mọi giá trị giống nhau: loại, thêm một nhánh chỉ để phục vụ một request không ai gửi.
    - Lấy giá trị đầu (hoặc cuối) khi tham số lặp: loại, `status=ACTIVE&status=INACTIVE` sẽ lặng lẽ trả một trong hai danh sách (trái AC-2).
    - 400 cho tham số có tên lạ: không chọn làm mặc định. R3 chỉ nói về **giá trị** lọc, và nó đổi hành vi "bỏ qua query string" của `GET /api/customers` với mọi client. Xem "Quyết định cần duyệt".
    - `title` hoặc exception riêng cho lỗi tham số query: loại, thêm một quy ước lỗi cho một tham số.

- D3: **`CustomerHandler` tách query string và trao cho service mọi giá trị thô của `status`**; handler không tự quyết định giá trị nào hợp lệ.
  - Hình dạng (khối route `GET /api/customers`, dòng 53–56, đổi một dòng; thêm một hàm private):
    ```java
    if (path.equals("/api/customers") && method.equals("GET")) {
      send(exchange, 200, service.list(queryValues(exchange.getRequestURI().getRawQuery(), "status")));
      return;
    }
    ```
    ```java
    /** Returns the decoded values of every occurrence of the query parameter, in request order; empty when absent. */
    private static List<String> queryValues(String rawQuery, String name) {
      List<String> values = new ArrayList<>();
      if (rawQuery == null) {
        return values;
      }
      for (String pair : rawQuery.split("&")) {
        int separator = pair.indexOf('=');
        String rawName = separator < 0 ? pair : pair.substring(0, separator);
        String rawValue = separator < 0 ? "" : pair.substring(separator + 1);
        if (URLDecoder.decode(rawName, StandardCharsets.UTF_8).equals(name)) {
          values.add(URLDecoder.decode(rawValue, StandardCharsets.UTF_8));
        }
      }
      return values;
    }
    ```
  - **Bắt buộc:**
    - Đọc `getRawQuery()` rồi **tách trước, giải mã sau**: tách theo `&`, mỗi đoạn tách tại dấu `=` **đầu tiên**, rồi mới giải mã tên và giá trị. Giải mã trước (`getQuery()`) thì `%26` và `%3D` trong một giá trị bị hiểu thành dấu tách.
    - Đoạn không có dấu `=` (`?status`) cho giá trị **chuỗi rỗng**, không phải "không có tham số". Nếu coi nó là vắng mặt thì `?status` lặng lẽ trả tất cả (trái AC-2).
    - Không có query string (`getRawQuery()` là `null`), query rỗng (`?`), hoặc không đoạn nào tên `status`: danh sách rỗng.
    - Tên tham số so khớp chính xác với `status` sau khi giải mã; phân biệt hoa thường.
    - Giữ đủ **mọi** lần xuất hiện, đúng thứ tự; handler không bỏ trùng, không lấy phần tử đầu.
    - Handler không ném `ValidationException`, không so giá trị với `ACTIVE`/`INACTIVE`.
    - Các route khác không đọc query string: `GET /api/customers/{id}?status=x`, `POST /api/customers?status=x`, `PUT ...?status=x` cho kết quả như hiện nay.
    - Tên hàm, tên biến và lời Javadoc là gợi ý.
  - Giải mã dùng `URLDecoder.decode(..., StandardCharsets.UTF_8)`: `%41CTIVE` thành `ACTIVE` (hợp lệ), `%20` và `+` thành dấu cách (`+ACTIVE` vì thế không hợp lệ).
  - Escape hỏng (`%ZZ`, `%` đứng cuối) không tới được hàm này: `getRequestURI()` trả một `java.net.URI`, và kiểu này không dựng được từ chuỗi có escape hỏng. [CẦN XÁC NHẬN] phản hồi của JDK `HttpServer` cho request line như vậy; nó không đi qua `CustomerHandler` nên không phải `problem+json`. Test spec không đặt kỳ vọng cho ca này (`URI.create` của test cũng không gửi được nó).
  - Javadoc của lớp (dòng 16–20) ghi thêm tham số lọc, ví dụ `GET /api/customers (optional ?status=ACTIVE|INACTIVE)` (`aiws/knowledge/conventions.md` → Backend → Định tuyến).
  - `handle`, `send`, `BY_ID`, `STATUS_BY_ID` và bốn khối route còn lại không đổi. `App.java` không đổi: `route` vẫn so `getPath()`, vốn không chứa query string.
  - Lý do:
    - "Tham số path được đổi kiểu trong handler; service nhận giá trị" và "All validation happens here, not in the HTTP layer" (`CustomerService.java` dòng 14): handler lo cú pháp HTTP, service lo giá trị.
    - Một `String` nullable không mang được "tham số xuất hiện hai lần". Danh sách thì mang được, nên quyết định từ chối tham số lặp vẫn nằm ở service và kiểm được bằng unit test của service.
    - `HttpServer` của JDK không có bộ tách query; hàm này khoảng mười dòng, dùng lại được cho tham số query sau này.
  - Đã cân nhắc:
    - Handler tự ném `ValidationException` khi tham số lặp: loại, đưa validation lên tầng HTTP.
    - Handler nối các giá trị lặp bằng dấu phẩy rồi trao một `String`: loại. Kết quả đúng (chuỗi có dấu phẩy không bao giờ khớp) nhưng quy tắc "đúng một lần" bị giấu trong một mẹo.
    - Lớp tiện ích riêng trong `api/` (kiểu `service/PhoneNumbers.java`): loại, thêm file cho một hàm chỉ một nơi gọi; mọi ca của AC-2 kiểm được qua HTTP.
    - Trao cả query string thô xuống service: loại, service phải biết cú pháp URL.

- D4: Thêm overload **`CustomerService.list(List<String> statusValues)`**; `list()` không đổi.
  - Hình dạng:
    ```java
    /** Lists customers; exactly one status value keeps only customers in that status, no value lists them all. */
    public List<Customer> list(List<String> statusValues) {
      if (statusValues.isEmpty()) {
        return list();
      }
      if (statusValues.size() > 1) {
        throw invalidStatus();
      }
      return repository.findAllByStatus(parseStatus(statusValues.get(0)));
    }
    ```
  - **Bắt buộc:**
    - Danh sách rỗng được tách ra **trước** `parseStatus` và cho đúng kết quả của `list()` (`parseStatus(null)` ném lỗi; analysis → Impact).
    - Nhiều hơn một giá trị: `ValidationException` với đúng map `{"status": "must be ACTIVE or INACTIVE"}`, bất kể các giá trị là gì.
    - Đúng một giá trị: qua `parseStatus` có sẵn (dòng 66–74). Hành vi của `parseStatus` với mọi đầu vào hiện có không đổi (TC-89, TC-97).
    - **Một** nguyên văn thông điệp cho mọi ca; không tạo câu thứ hai. `invalidStatus()` ở trên là gợi ý: một hàm private tạo `ValidationException` đó, dùng ở đây và ở dòng cuối của `parseStatus`. Developer được chọn cách khác (vd. một hằng) nếu giữ đúng hành vi.
    - Không đọc kho khi giá trị lọc không hợp lệ.
    - `list()`, `get`, `create`, `update`, `updateStatus`, `check` giữ chữ ký và hành vi.
  - Không quy định, test spec không đặt kỳ vọng: `statusValues` là `null` hoặc chứa phần tử `null` (handler không bao giờ tạo ra).
  - Lý do:
    - Overload cùng tên vì vẫn là một thao tác "liệt kê"; `list()` giữ nguyên nên 38 lời gọi trong `CustomerServiceTest` không đụng tới.
    - Nhánh rỗng gọi lại `list()`: "không lọc" có đúng một định nghĩa.
    - Tham số là danh sách giá trị thô, không phải `CustomerStatus`, để service là nơi duy nhất quyết định hợp lệ (như `updateStatus(long id, String status)`).
  - Đã cân nhắc:
    - Thêm tham số vào `list()`: loại, đổi chữ ký đang được 38 lời gọi test dùng (`conventions.md` → Backend → Đặt tên: "method cũ được giữ nguyên chữ ký").
    - `list(String status)` với `null` nghĩa là "tất cả": loại, không biểu diễn được tham số lặp (D3), và `null` thành cờ chế độ.
    - Hai method `list()` / `listByStatus(String)` do handler chọn: loại, handler phải tự xử lý "vắng mặt" và "lặp".
    - Service nhận `CustomerStatus`, handler đổi chuỗi sang enum: loại, đưa validation lên handler (REQ-003 D5).

- D5: `CustomerRepository` thêm **`List<Customer> findAllByStatus(CustomerStatus status)`**: mọi khách hàng có đúng `status` đó, tăng dần theo `id`. `findAll()` và tám method còn lại không đổi.
  - Bản in-memory: `customers.values().stream().filter(c -> c.status() == status).toList()`. Thứ tự tăng dần theo `id` có sẵn nhờ `ConcurrentSkipListMap` (dòng 14).
  - Javadoc một dòng trên interface, ví dụ `/** Returns the customers with the given status, ordered by id. */`.
  - Kết quả là một list mới, không phải view của kho. Test spec không đặt kỳ vọng về việc list có sửa được hay không (`findAll()` trả `ArrayList`, `toList()` trả list bất biến).
  - Lý do:
    - Truy vấn theo cột thuộc về repository, như `existsByPhoneAndStatus`. Khi có DB thật nó thành `WHERE status = ? ORDER BY id` mà service không phải đổi.
    - Tên theo mẫu `findAll` / `findById` / `...ByStatus`; method cũ giữ nguyên chữ ký (`conventions.md` → Backend → Đặt tên).
    - Repository chỉ lọc đúng giá trị nhận được; "không có giá trị lọc thì là tất cả" là quyết định của service (D4).
  - Đã cân nhắc:
    - Lọc ở service (`repository.findAll().stream().filter(...)`): bớt ba file, nhưng service tải cả kho rồi mới lọc, và phải viết lại khi có DB. Không chọn.
    - `findAll(CustomerStatus status)` với `null` là tất cả: loại, tham số nullable làm cờ chế độ.
    - `findAll(Predicate<Customer>)`: loại, không chuyển được thành SQL.

- D6: **`listCustomers` nhận `status` như một key của tham số `options` đang có**: `listCustomers({ status, ...options } = {})`. Chữ ký vẫn một tham số; mọi lời gọi hiện có giữ nguyên nghĩa (AC-3).
  - Hình dạng:
    ```js
    /** Lists customers; `status` ('ACTIVE' or 'INACTIVE') asks the API for customers in that status only. */
    export function listCustomers({ status, ...options } = {}) {
      return request(status ? `/customers?status=${encodeURIComponent(status)}` : '/customers', options);
    }
    ```
  - **Bắt buộc:**
    - `status` là `undefined`, `null` hoặc `''`: URL đúng bằng `/api/customers`, **không có `?`**.
    - Giá trị khác: `/api/customers?status=` nối `encodeURIComponent(status)`.
    - `status` được tách khỏi `options` **trước** khi gọi `request()`. Nếu không, `request()` rải nó vào tham số thứ hai của `fetch` (`...init`, dòng 15–18).
    - Hàm không kiểm tra giá trị, không lọc và không sắp xếp kết quả: trả nguyên body API trả. Lỗi non-2xx ném `ApiError` qua `request()` như mọi hàm khác; response 400 của D2 cho `fieldErrors = { status: 'must be ACTIVE or INACTIVE' }`.
    - Không gửi `method`, `body`, `Content-Type`.
    - `request()`, `ApiError` và bốn hàm còn lại không đổi.
  - Lời gọi và URL:
    | Lời gọi | URL |
    | --- | --- |
    | `listCustomers()`, `listCustomers({})`, `listCustomers({ fetchImpl })` | `/api/customers` (như hiện nay) |
    | `listCustomers({ status: '' })`, `{ status: undefined }`, `{ status: null }` | `/api/customers` |
    | `listCustomers({ status: 'ACTIVE' })` | `/api/customers?status=ACTIVE` |
    | `listCustomers({ status: 'INACTIVE' })` | `/api/customers?status=INACTIVE` |
    | `listCustomers({ status: 'A&B=C D' })` | `/api/customers?status=A%26B%3DC%20D` |
  - Lý do:
    - Test không mã TC `listCustomers calls GET /api/customers and returns the body` (`source-fe/test/customerApi.test.js` dòng 12–19) gọi `listCustomers({ fetchImpl })` và pass nguyên vẹn; `listCustomers()` của code cũ cũng vậy. Không có thay đổi phá tương thích nào ở public API của FE.
    - `''` là giá trị của lựa chọn "Tất cả" (D7), nên `main.js` trao thẳng giá trị của điều khiển mà không rẽ nhánh.
    - Tiêu chí của một lời gọi danh sách là tuỳ chọn và có tên; nếu sau này có thêm tiêu chí thì thêm key, không phải thêm tham số theo vị trí.
    - `encodeURIComponent` như tham số path hiện có (`getCustomer`, `updateCustomer`).
  - Lệch nhỏ so với hiện trạng: `options` của các hàm khác chỉ mang `fetchImpl`; ở `listCustomers` nó mang thêm một tiêu chí.
  - Đã cân nhắc:
    - `listCustomers(status, options)` (tham số theo vị trí, `options` cuối như `getCustomer(id, options)`): hợp mẫu của file hơn, nhưng **phá lời gọi `listCustomers({ fetchImpl })`** và buộc sửa một test có từ trước REQ-001. Không chọn; xem "Quyết định cần duyệt".
    - Hàm riêng `listCustomersByStatus(status, options)`: loại, `main.js` (không có unit test) phải chọn hàm theo lựa chọn.
    - Dựng query bằng `URLSearchParams`: không cần cho một tham số, và mã hoá dấu cách thành `+` thay vì `%20`.

- D7: Phần điều khiển lọc là **một `<select id="status-filter">` tĩnh trong `index.html`**, kèm `<label>`, đặt giữa `#edit-customer` và `#customers` (AC-4; Q8).
  - Hình dạng:
    ```html
    <div id="edit-customer"></div>
    <p>
      <label for="status-filter">Lọc theo trạng thái</label>
      <select id="status-filter" autocomplete="off">
        <option value="" selected>Tất cả</option>
        <option value="ACTIVE">Đang hoạt động</option>
        <option value="INACTIVE">Ngừng hoạt động</option>
      </select>
    </p>
    <div id="customers">Đang tải…</div>
    ```
  - **Bắt buộc:**
    - Đúng ba `<option>`, đúng thứ tự, đúng `value` (`''`, `ACTIVE`, `INACTIVE`) và nhãn ("Tất cả", "Đang hoạt động", "Ngừng hoạt động").
    - Nằm **ngoài** `#customers` (bị `refresh()` ghi đè), ngoài `#edit-customer`, và **ngoài mọi `<form>`**: `form.reset()` sau khi thêm khách hàng (`main.js` dòng 27) đưa mọi điều khiển trong `#create-form` về mặc định.
    - Có `autocomplete="off"` (Q8, bên dưới).
    - `id` là `status-filter`; nhãn "Lọc theo trạng thái" và thẻ bọc là đề xuất.
  - CSS: có thể thêm `select` vào luật `input` có sẵn (dòng 13: `input, select { ... }`). Không đổi luật nào khác.
  - **Lúc mở trang là "Tất cả" và yêu cầu đầu tiên khớp với điều khiển (Q8).** Trình duyệt có thể khôi phục giá trị của phần tử form khi tải lại trang. Ba lớp bảo đảm:
    1. `autocomplete="off"` trên `<select>`, để trình duyệt không khôi phục giá trị cũ.
    2. `main.js` gán `filterEl.value = ''` ngay trước lần `refresh()` đầu tiên (D9).
    3. Mỗi lần tải đọc giá trị của điều khiển lúc đó (D8), nên yêu cầu luôn khớp với thứ điều khiển đang hiện.
    - [CẦN XÁC NHẬN] hành vi khôi phục của từng trình duyệt (repo không khai báo trình duyệt hỗ trợ); kiểm bằng bước chạy tay 8 ở mục FE change. Việc này không phải "ghi nhớ lựa chọn": không có gì được lưu.
  - Lý do:
    - `<select>` là điều khiển gốc cho "chọn một trong ba": tự hiện lựa chọn đang chọn, dùng được bằng bàn phím và trình đọc màn hình nhờ `<label for>`, không cần CSS hay state trong JS.
    - Phần tử tĩnh trong `index.html` được gắn listener trực tiếp, như `#create-form` (`conventions.md` → Frontend → Sự kiện).
    - Lựa chọn nằm trong DOM và được đọc lại khi cần, đúng cách `main.js` đang làm với `data-edit-id` (`conventions.md` → State và render).
  - Hai nhãn trạng thái bị chép lại từ `STATUS_LABELS` (`customerTable.js` dòng 4, không export; `index.html` không import được). Nguồn chung là `aiws/knowledge/glossary.md`.
  - Đã cân nhắc:
    - Ba nút bấm (`aria-pressed`) do một component `render...` vẽ lại sau mỗi lần chọn: không bị trình duyệt khôi phục và có unit test cho ba lựa chọn. Loại vì cần CSS cho nút đang chọn, vẽ lại làm mất focus bàn phím, và `main.js` phải tự đọc "nút nào đang chọn".
    - Component `render...` trả chuỗi HTML của chính `<select>` này: có một test so chuỗi, nhưng là đưa markup tĩnh vào JS và thêm bước chèn lúc khởi động. Loại; ba `<option>` được kiểm bằng review và chạy tay.
    - Nhóm radio: nhiều markup hơn, cùng vấn đề khôi phục, không lợi hơn `<select>`.
    - Đặt trong `#customers` hoặc trong `#create-form`: loại, lý do ở mục bắt buộc.

- D8: Đơn vị mới **`source-fe/src/utils/createCustomerListLoader.js`** quyết định hai điều mà `main.js` không có unit test để giữ: mỗi lần tải mang giá trị lọc của lựa chọn **lúc đó**, và chỉ lần tải **mới nhất** được vẽ lên màn hình (AC-4, AC-5; Q7).
  - Hình dạng:
    ```js
    /** Creates a loader that asks for the status filter selected at the time of each call and tells whether a newer call has overtaken it. */
    export function createCustomerListLoader(listCustomers, getStatus) {
      let latest = 0;
      return async () => {
        const call = ++latest;
        try {
          const customers = await listCustomers({ status: getStatus() });
          return call === latest ? { current: true, customers } : { current: false };
        } catch (error) {
          if (call === latest) throw error;
          return { current: false };
        }
      };
    }
    ```
  - Hành vi của hàm được trả về (gọi là `load`):
    | Tình huống | Kết quả của lần gọi đó |
    | --- | --- |
    | Mỗi lần gọi | Gọi `getStatus()` đúng một lần, ngay lúc được gọi, rồi gọi `listCustomers({ status })` đúng một lần với giá trị đó |
    | API trả mảng, và không có lần gọi `load` nào muộn hơn | `{ current: true, customers }`, `customers` là **chính** mảng nhận được (không lọc, không sắp xếp, kể cả `[]`) |
    | API lỗi, và không có lần gọi `load` nào muộn hơn | Promise bị reject với chính lỗi đó |
    | Đã có lần gọi `load` muộn hơn (bị vượt), API trả mảng | `{ current: false }` |
    | Đã có lần gọi `load` muộn hơn (bị vượt), API lỗi | `{ current: false }`, **không** reject |
  - "Muộn hơn" tính theo thứ tự **gọi** `load`, không theo thứ tự response về. Lần gọi mới nhất luôn là `current`, dù response của nó về trước hay sau các lần cũ.
  - **Bắt buộc:**
    - `getStatus()` được gọi bên trong từng lần `load`, không gọi lúc tạo loader và không lưu lại giữa các lần.
    - Bộ đếm tăng **trước** khi gọi API, và phép so `call === latest` làm **sau** khi API trả về hoặc lỗi.
    - Hai loader tạo bằng hai lời gọi `createCustomerListLoader(...)` không chung state.
    - File không import gì, không đụng DOM: `listCustomers` và `getStatus` là tham số, nên test dùng hàm giả và promise tự điều khiển.
    - Tên file, tên export, thứ tự hai tham số, và hình dạng kết quả (`{ current: true, customers }` / `{ current: false }`) là cố định. Tên biến bên trong và lời JSDoc là gợi ý.
  - Hành vi để test-designer viết TC. Mỗi dòng là một kịch bản trên một loader mới; `listCustomers` giả ghi lại tham số và trả promise do test điều khiển:
    | Kịch bản | Kỳ vọng |
    | --- | --- |
    | `getStatus` trả lần lượt `''`, `'ACTIVE'`, `'INACTIVE'`, `''` qua bốn lần `load` nối tiếp | Bốn lời gọi `listCustomers`, tham số lần lượt `{ status: '' }`, `{ status: 'ACTIVE' }`, `{ status: 'INACTIVE' }`, `{ status: '' }`; mỗi lần `load` đúng một lời gọi (AC-4) |
    | Tạo loader khi `getStatus` trả `'ACTIVE'`; đổi sang `'INACTIVE'` rồi mới `load`; `load` lần nữa | Cả hai lời gọi mang `'INACTIVE'`: giá trị lúc tải, không phải lúc tạo (AC-5) |
    | `load` xong với `'ACTIVE'`; đổi sang `'INACTIVE'`; `load` | Lời gọi thứ hai mang `'INACTIVE'`: không giữ giá trị của lần trước (AC-5) |
    | API trả một mảng lẫn cả `ACTIVE` và `INACTIVE`; API trả `[]` | `customers` là chính mảng đó (AC-4: FE không lọc) |
    | API lỗi; sau đó `load` lần nữa và API trả mảng | Lần đầu reject với chính lỗi đó; lần sau `{ current: true, customers }` (AC-4: lỗi xong vẫn chọn lại được) |
    | `load` A rồi `load` B khi A chưa về; B về trước, A về sau | B `{ current: true, ... }`; A `{ current: false }` |
    | Như trên nhưng A về trước, B về sau | A `{ current: false }`; B `{ current: true, ... }` |
    | `load` A rồi `load` B; A lỗi | A `{ current: false }`, không reject; B không bị ảnh hưởng |
    | `load` A rồi `load` B; A trả mảng, B lỗi | A `{ current: false }`; B reject |
    | Hai loader; `load` trên loader thứ hai khi lần gọi của loader thứ nhất chưa về | Lần gọi của loader thứ nhất vẫn `current` |
  - Không quy định, test spec không đặt kỳ vọng: `getStatus` hoặc `listCustomers` ném lỗi đồng bộ.
  - **Về Q7.** Analysis giả định không xử lý response về sai thứ tự, và đề nghị đưa vào nếu cách chặn đủ nhỏ. Thiết kế đưa vào vì hai lý do:
    - Từ REQ-005 các yêu cầu danh sách không còn giống nhau, nên response đến trễ làm bảng lệch với lựa chọn đang hiện.
    - `<select>` làm ca này dễ gặp hơn analysis ước lượng: khi điều khiển đang có focus, mỗi phím mũi tên đổi lựa chọn và phát một sự kiện `change`, nên giữ phím tạo ra một loạt yêu cầu sát nhau. [CẦN XÁC NHẬN] tuỳ trình duyệt và hệ điều hành.
    - Phần thêm là bộ đếm và hai phép so ở trên, cùng một `if` trong `refresh()` (D9). **Không** huỷ yêu cầu (không `AbortController`), **không** có trạng thái "đang tải": hai việc này vẫn ngoài phạm vi.
  - Lý do:
    - `main.js` không có seam unit test (`conventions.md` → Test → FE). Đưa quyết định ra `src/utils/` thì AC-4 và AC-5 có TC bằng `node:test`, như `describeStatusError` (REQ-003) và `createDoubleClickGuard` (REQ-004).
    - Lựa chọn vẫn chỉ nằm ở một nơi là điều khiển (D7); loader đọc nó qua `getStatus` chứ không giữ bản sao, nên điều khiển và yêu cầu không lệch nhau được.
    - Factory giữ state trong closure, không `class`, không state ở mức module: đúng mẫu của `createDoubleClickGuard.js`; mỗi test có loader riêng.
    - Kết quả mang cờ `current` tường minh thay vì `null`/`undefined`: `request()` có thể trả `null` khi body 200 không phải JSON, và ca đó phải tiếp tục đi vào nhánh lỗi của `refresh()` như hiện nay.
  - Đã cân nhắc:
    - Viết thẳng `listCustomers({ status: filterEl.value })` trong `refresh()`, không có đơn vị mới: ít code nhất, nhưng AC-4 và AC-5 không có quyết định nào kiểm được bằng unit test, và Q7 để ngỏ.
    - Loader giữ lựa chọn trong state riêng (`select(status)` / `load()`): loại, có hai nguồn sự thật (điều khiển và loader) và chúng lệch nhau khi trình duyệt đổi giá trị điều khiển mà không phát `change` (Q8).
    - Đưa cả `refresh()` vào một đơn vị nhận callback vẽ bảng và báo lỗi: kiểm được nhiều hơn, nhưng là mẫu mới cho `main.js` (REQ-004 D4 đã loại cho listener đổi trạng thái).
    - Huỷ yêu cầu cũ bằng `AbortController`: loại, ngoài phạm vi và phải đổi `request()`.

- D9: `source-fe/src/main.js` nối điều khiển, loader và bảng. `refresh()` vẫn là **điểm tải danh sách duy nhất**; bốn chỗ gọi nó không đổi (AC-4, AC-5; Q5, Q6).
  - Hình dạng (phần đổi):
    ```js
    import { createCustomerListLoader } from './utils/createCustomerListLoader.js';
    // ...
    const filterEl = document.getElementById('status-filter');
    const loadCustomers = createCustomerListLoader(listCustomers, () => filterEl.value);

    async function refresh() {
      try {
        const { current, customers } = await loadCustomers();
        if (current) listEl.innerHTML = renderCustomerTable(customers);
      } catch {
        listEl.textContent = 'Không tải được danh sách khách hàng.';
      }
    }
    // ...
    filterEl.addEventListener('change', () => {
      messageEl.textContent = '';
      refresh();
    });

    filterEl.value = '';
    refresh();
    ```
  - **Bắt buộc:**
    - `getStatus` là `() => filterEl.value`: đọc điều khiển **mỗi lần** được gọi. Không gán `filterEl.value` vào một biến ở mức module hay ở đầu một handler.
    - Loader được tạo **một lần** ở mức module (cạnh `listEl`, `acceptStatusClick`), không tạo trong `refresh()`.
    - `refresh()` chỉ vẽ bảng khi `current` là `true`; lần tải bị vượt không đổi gì trên màn hình. Câu lỗi và việc ghi vào chính `#customers` giữ nguyên.
    - `refresh()` không đổi giá trị của điều khiển và không xoá `#message` (như hiện nay).
    - Listener `change` xoá `#message` rồi gọi `refresh()`, theo quy ước "mỗi handler của người dùng xoá `#message` trước khi chạy" (`conventions.md` → Xử lý lỗi). Nó không đụng `#edit-customer`: form sửa đang mở giữ nguyên.
    - `filterEl.value = ''` đứng ngay trước lời gọi `refresh()` cuối file (D7, Q8).
    - Không đổi: submit của `#create-form`, hai listener `click` trên `#customers`, hai listener trên `#edit-customer`, `acceptStatusClick` và key của nó (D10), `describeStatusError`, việc thao tác thất bại thì không tải lại danh sách.
  - Hệ quả, đều theo giả định của analysis:
    - Sau khi **thêm** khách hàng, danh sách cũng tải lại theo lựa chọn đang chọn (Q5): đang chọn "Ngừng hoạt động" thì khách hàng vừa thêm (`ACTIVE`) không hiện. Không tự đổi lựa chọn, không thêm thông báo (R6).
    - Không khách hàng nào khớp: vẫn là câu "Chưa có khách hàng." của `renderCustomerTable` (Q6). `customerTable.js` không đổi (R7).
  - Lý do:
    - Sửa, đổi trạng thái và thêm đều đã gọi `refresh()` (dòng 28, 60, 84); đổi một chỗ là cả bốn đường tải cùng theo lựa chọn đang chọn (R4).
    - Listener không cần `async` hay `try`: `refresh()` tự bắt lỗi.
  - Đã cân nhắc:
    - Sau khi thêm thì chuyển về "Tất cả", hoặc hiện thông báo đã thêm (Q5): không chọn, requirement không yêu cầu và analysis đặt ngoài phạm vi. Xem "Quyết định cần duyệt".
    - Câu riêng cho danh sách rỗng khi đang lọc (Q6): không chọn, AC-4 ghi "như hiện nay". Xem "Quyết định cần duyệt".
    - Đóng form sửa khi đổi lựa chọn: loại, form là vùng riêng và lưu theo `id`.

- D10: **Không chặn** cú bấm đúp đổi trạng thái của khách hàng kế tiếp khi đang lọc (Q1). `createDoubleClickGuard.js`, key theo `id` ở `main.js` dòng 80 và TC-108..TC-113 không đổi.
  - Cơ chế của rủi ro: khi đang lọc, đổi trạng thái thành công làm dòng đó rời bảng và dòng kế tiếp dời lên dưới con trỏ. Lần bấm thứ hai của cú bấm đúp rơi vào nút của khách hàng khác; guard tính theo từng `id` nên coi là lần bấm mới và xử lý. Kết quả là **hai** khách hàng đổi trạng thái, và cả hai rời bảng (R2).
  - Lý do không chặn trong thiết kế này:
    - Requirement không yêu cầu, analysis không có AC nào cho ca này và ghi nó vào "Ngoài phạm vi".
    - Mọi cách chặn đều đổi một quyết định đã duyệt của REQ-004 (bảng dưới), nên phải do người duyệt chọn.
  - Phương án để người duyệt chọn:
    | Phương án | Chặn được ca này | So với REQ-004 (D1, biến thể cuối của AC-2, TC-111) | Phần phải thêm |
    | --- | --- | --- | --- |
    | A. Không chặn (**thiết kế này**) | Không | Không đổi gì | Không |
    | B. Một key chung cho mọi nút đổi trạng thái, mọi lúc | Có | **Đảo D1 của REQ-004**, vốn đã loại "một khoá chung" (`aiws/work/REQ-004/02-design.md` dòng 52). Bấm nút của khách hàng khác trong vòng 500 ms bị bỏ qua cả khi đang xem "Tất cả", nơi dòng không rời bảng nên không có rủi ro. TC-111 vẫn pass (guard không đổi) nhưng không còn mô tả hành vi của trang | Một dòng ở `main.js`; một AC mới |
    | C. Key chung **chỉ khi lựa chọn khác "Tất cả"**; "Tất cả" vẫn theo từng `id` | Có | Giữ nguyên REQ-004 khi xem "Tất cả". Khi đang lọc, lần bấm chủ động vào khách hàng **khác** trong vòng 500 ms sau một lần bấm được xử lý bị bỏ qua, không có phản hồi | Một hàm thuần chọn key trong `src/utils/` kèm test; một dòng ở `main.js`; một AC mới. Guard và TC-108..TC-113 không đổi |
    | D. Dựa vào số đếm lần bấm của trình duyệt (`event.detail`) | [CẦN XÁC NHẬN] | REQ-004 D1 đã loại (dòng 49): bàn phím cho `detail = 0`, và chưa kiểm chứng khi phần tử dưới con trỏ bị thay | Không đề xuất |
  - Nhận định của architect: nếu chặn thì chọn **C**. Ca này rơi đúng vào cách dùng chính của REQ-005 (xem "Đang hoạt động" rồi ngừng một khách hàng), và với BE chạy local bảng vẽ lại trong vài mili giây nên lần bấm thứ hai gần như chắc chắn tới sau khi dòng đã dời. [CẦN XÁC NHẬN] chưa tái hiện bằng chạy tay; bước chạy tay 11 ở mục FE change dùng để tái hiện.

- D11: **Mã TC và truy vết.** Mã TC mới đánh số tiếp từ **TC-115** (analysis → Impact → FE → Test). **Không test có sẵn nào bị sửa hay định nghĩa lại.**
  | AC | Đơn vị mang TC | Phần chỉ kiểm bằng review và chạy tay |
  | --- | --- | --- |
  | AC-1 | `InMemoryCustomerRepositoryTest` (`findAllByStatus`), `CustomerServiceTest` (`list(statusValues)`), `CustomerHandlerTest` (HTTP) | Không |
  | AC-2 | `CustomerServiceTest` (từng giá trị và tham số lặp), `CustomerHandlerTest` (mọi biến thể qua HTTP) | Không |
  | AC-3 | `source-fe/test/customerApi.test.js` | Không |
  | AC-4 | `source-fe/test/createCustomerListLoader.test.js`: mỗi lựa chọn một yêu cầu mang đúng giá trị; kết quả API được chuyển nguyên; lỗi xong vẫn tải lại được | Ba `<option>` trong `index.html`; việc nối `change` và lúc mở trang trong `main.js` |
  | AC-5 | `source-fe/test/createCustomerListLoader.test.js`: giá trị được đọc ở từng lần tải, không phải lúc tạo hay ở lần tải trước | Bốn chỗ gọi `refresh()` trong `main.js`; điều khiển không bị `refresh()` đụng tới |
  - Các kịch bản "bị vượt" của D8 (hai lần `load` chồng nhau) **nằm ngoài tiền đề của AC-4 và AC-5**, vốn chỉ phát biểu cho trường hợp không có yêu cầu danh sách nào khác đang chờ (Q7). Đề xuất cho test-designer: vẫn ghi chúng vào ma trận dưới AC-4, kèm ghi chú "D8/Q7, ngoài tiền đề của AC"; nếu người duyệt không nhận phần Q7 thì các TC này bỏ đi.
  - Test có sẵn dùng làm ảnh chụp "không đổi gì" và phải pass nguyên vẹn: `listReturnsCustomers` và helper `customers()` (`CustomerHandlerTest.java` dòng 77–86, 67–69), 38 lời gọi `service.list()` trong `CustomerServiceTest`, các lời gọi `repository.findAll()` trong `InMemoryCustomerRepositoryTest`, và test `listCustomers calls GET /api/customers and returns the body`.
  - `renderCustomerTable` không đổi và đã có test cho việc vẽ mọi phần tử nhận được, cả hai trạng thái (TC-36, TC-74, TC-103); REQ-005 không cần TC mới ở `customerTable.test.js`.
  - Kiểu test theo từng lớp (`conventions.md` → Test): `CustomerHandlerTest` dùng `@ParameterizedTest(name = "[{index}]")` + `@MethodSource`; FE dùng một mảng dữ liệu lặp `for...of` trong một `test(...)`.

## API
Đổi **một** endpoint, theo hướng chỉ mở rộng. Schema `Customer`, format lỗi và bốn endpoint còn lại không đổi. Schema đầy đủ và ví dụ: `aiws/work/REQ-005/api-contract.yaml`.

| Method | Path | Thay đổi |
| --- | --- | --- |
| GET | `/api/customers` | **Đổi.** Thêm tham số query tuỳ chọn `status` (`ACTIVE` \| `INACTIVE`). Thêm response 400 Problem `errors.status`. Không kèm `status` thì như hiện nay |
| POST | `/api/customers` | Không đổi; query string vẫn bị bỏ qua |
| GET, PUT | `/api/customers/{id}`; PUT `/api/customers/{id}/status` | Không đổi; query string vẫn bị bỏ qua |

Kết quả của `GET /api/customers` theo query string (kho gồm khách hàng 1 `ACTIVE`, 2 `INACTIVE`, 3 `ACTIVE`, 4 `INACTIVE`):

| Query string | Giá trị `status` service nhận | Kết quả |
| --- | --- | --- |
| (không có), `?` | `[]` | 200: 1, 2, 3, 4 (như hiện nay) |
| `?foo=1`, `?Status=ACTIVE`, `?STATUS=ACTIVE`, `?state=ACTIVE` | `[]` | 200: 1, 2, 3, 4 (tham số tên khác bị bỏ qua, Q4) |
| `?status=ACTIVE` | `["ACTIVE"]` | 200: 1, 3 |
| `?status=INACTIVE` | `["INACTIVE"]` | 200: 2, 4 |
| `?status=ACTIVE&foo=1`, `?foo=1&status=ACTIVE` | `["ACTIVE"]` | 200: 1, 3 |
| `?status=%41CTIVE` | `["ACTIVE"]` | 200: 1, 3 (giải mã rồi mới so) |
| `?status=INACTIVE` khi kho chỉ có khách hàng `ACTIVE` (và ngược lại) | một giá trị hợp lệ | 200: `[]`, không phải 404 |
| `?status=ACTIVE` / `?status=INACTIVE` sau `PUT /api/customers/1/status` → `INACTIVE` | một giá trị hợp lệ | 200: 3 / 1, 2, 4 (theo trạng thái đang lưu) |
| `?status=DELETED`, `?status=ALL` | `["DELETED"]`, `["ALL"]` | 400 |
| `?status=active`, `?status=Inactive` | sai hoa thường | 400 |
| `?status=`, `?status` | `[""]` | 400 |
| `?status=%20ACTIVE`, `?status=INACTIVE%20`, `?status=+ACTIVE` | có dấu cách | 400 |
| `?status=ACTIVE,INACTIVE` | `["ACTIVE,INACTIVE"]` | 400 |
| `?status=ACTIVE&status=INACTIVE`, `?status=ACTIVE&status=ACTIVE`, `?status=ACTIVE&status=` | hai giá trị | 400 |

- Mọi dòng 200: `Content-Type: application/json`, body là mảng tăng dần theo `id`, mỗi phần tử đủ `id`, `name`, `email`, `phone` (kể cả khi `null`), `status`.
- Mọi dòng 400: `Content-Type: application/problem+json`, `title = "Validation failed"`, `status = 400`, `detail = "The request has invalid fields"`, `errors` đúng bằng `{"status": "must be ACTIVE or INACTIVE"}`. Body không bao giờ là mảng. Thông điệp không lặp lại giá trị client gửi.
- `errors` vốn chỉ mô tả field của body. Từ REQ-005, key của `errors` có thể là **tên một tham số query**; `status` là key đầu tiên như vậy.
- Không thêm mã lỗi, `title` hay exception. Bảng map trong `CustomerHandler.handle` dùng nguyên.
- FE không phụ thuộc hình dạng lỗi 400: điều khiển lọc chỉ gửi giá trị hợp lệ, và `refresh()` hiện cùng một câu cho mọi lỗi.

Đối chiếu với legacy: `source-legacy/customer_list.php` dòng 5 đọc `SELECT ... FROM customers ORDER BY id`, không có lọc. Không có quy tắc legacy nào phải giữ; thứ tự tăng dần theo `id` giống legacy.

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`).

- Kho in-memory `InMemoryCustomerRepository` thêm truy vấn `findAllByStatus` (D5). Cấu trúc `Map<Long, Customer>` và record `Customer` không đổi.
- Truy vấn mới duyệt tuyến tính cả kho, như `findAll()` và bốn truy vấn trùng hiện có.
- Khi có DB thật: `findAllByStatus` tương ứng `SELECT ... FROM customers WHERE status = ? ORDER BY id` trên cột `customers.status TINYINT(1)` của `source-legacy/sql/schema.sql` (1 = `ACTIVE`, 0 = `INACTIVE`). Bảng đó không có index trên `status`. Cột chỉ có hai giá trị nên index riêng ít tác dụng; việc này để cho REQ đưa DB vào quyết định.

## BE change
Thư mục gốc: `source-be/src/main/java/com/example/crm/` và `source-be/src/test/java/com/example/crm/`. Không thêm file, package hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `repository/CustomerRepository.java` | Sửa | Thêm `List<Customer> findAllByStatus(CustomerStatus status)` kèm một dòng Javadoc. Chín method cũ không đổi (D5) |
| `repository/InMemoryCustomerRepository.java` | Sửa | Cài đặt `findAllByStatus` theo D5 |
| `service/CustomerService.java` | Sửa | Thêm `list(List<String> statusValues)` kèm một dòng Javadoc (D4). `parseStatus` giữ nguyên hành vi; được phép tách phần tạo `ValidationException` của nó thành một hàm private để dùng chung. `list()` và các method khác không đổi |
| `api/CustomerHandler.java` | Sửa | Khối route `GET /api/customers` gọi `service.list(queryValues(...))`; thêm hàm private `queryValues` (D3); cập nhật Javadoc của lớp; thêm import `java.net.URLDecoder`, `java.nio.charset.StandardCharsets`, `java.util.ArrayList`, `java.util.List`. `handle`, `send` và bốn route khác không đổi |
| `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | Sửa | Thêm test cho `findAllByStatus`: chỉ khách hàng đúng trạng thái, tăng dần theo `id`; không ai khớp thì list rỗng; phản ánh `updateStatus`; `findAll()` vẫn trả đủ. Test cũ không sửa |
| `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | Sửa | Thêm test cho `list(statusValues)`: rỗng cho kết quả của `list()`; một giá trị hợp lệ; không ai khớp; từng giá trị không hợp lệ của AC-2; hai giá trị (khác nhau và giống nhau). Khách hàng `INACTIVE` dựng bằng `repository.insert(..., CustomerStatus.INACTIVE)` như các test hiện có. Test cũ không sửa |
| `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | Thêm test HTTP theo bảng ở mục API, dùng helper `get(path)` có sẵn (`get("?status=ACTIVE")`). Kho bốn khách hàng của AC-1 dựng qua chính API: ba `post(...)` rồi `put("/2/status", ...)`, `put("/4/status", ...)`. Dấu cách trong URL viết `%20` (`URI.create` không nhận dấu cách thô). Test cũ không sửa |

Không đổi: `domain/Customer.java`, `domain/CustomerStatus.java`, `service/PhoneNumbers.java`, `api/Problem.java`, ba request record trong `api/`, `error/*`, `App.java`.

Mốc số lần chạy hiện nay: `CustomerHandlerTest` 68, `InMemoryCustomerRepositoryTest` 40, `CustomerServiceTest` 133, `PhoneNumbersTest` 70, tổng 311 (`aiws/work/REQ-004/evidence/test-results/T1-attempt-1.yaml`). Sau REQ-005: 311 cộng số lần chạy của test mới; không lần chạy cũ nào đổi kết quả.

**Nhóm phải biên dịch cùng nhau** (gợi ý cho planner; sau mỗi task orchestrator chạy toàn bộ `be_test`). Mỗi nhóm chỉ thêm, nên test cũ pass sau từng nhóm:
- **BE-1** (3 file, độc lập): `CustomerRepository.java`, `InMemoryCustomerRepository.java`, `InMemoryCustomerRepositoryTest.java`. Interface và bản cài đặt duy nhất của nó phải đổi trong cùng task.
- **BE-2** (2 file, phụ thuộc BE-1): `CustomerService.java`, `CustomerServiceTest.java`.
- **BE-3** (2 file, phụ thuộc BE-2): `CustomerHandler.java`, `CustomerHandlerTest.java`.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/api/customerApi.js` | Sửa | `listCustomers({ status, ...options } = {})` kèm một dòng JSDoc (D6). `request`, `ApiError` và bốn hàm còn lại không đổi |
| `test/customerApi.test.js` | Sửa | Thêm test `listCustomers` theo bảng của D6 (AC-3) bằng `fakeFetch` có sẵn. **Test cũ không sửa** |
| `src/utils/createCustomerListLoader.js` | Mới | `export function createCustomerListLoader(listCustomers, getStatus)` theo D8; JSDoc một dòng; không import |
| `test/createCustomerListLoader.test.js` | Mới | Test loader theo bảng hành vi của D8 (AC-4, AC-5): `listCustomers` giả, promise do test điều khiển |
| `src/main.js` | Sửa | Import và tạo loader; `filterEl`; `refresh()` dùng loader và chỉ vẽ khi `current`; listener `change`; `filterEl.value = ''` trước `refresh()` cuối file (D9). Năm listener hiện có không đổi |
| `index.html` | Sửa | Thêm `<label>` + `<select id="status-filter">` giữa `#edit-customer` và `#customers` (D7); có thể thêm `select` vào luật CSS của `input` |

- Không đổi: `src/components/customerTable.js`, `src/components/customerEditForm.js`, `src/utils/createDoubleClickGuard.js`, `src/utils/describeStatusError.js`, `src/utils/escapeHtml.js`, `src/utils/formatPhone.js`, `scripts/build.mjs` (tự quét `src/**/*.js` và chép `index.html`), `package.json`, và mọi file test hiện có ngoài `customerApi.test.js`.
- Mốc: FE hiện 43 test, đều pass (`aiws/work/REQ-004/evidence/test-results/T3-attempt-1.yaml`); sau REQ-005 là 43 cộng số test mới.
- Gợi ý nhóm task, độc lập với BE về build và test. Sau mỗi task orchestrator chạy toàn bộ `fe_test`:
  - **FE-1** (2 file): `customerApi.js`, `customerApi.test.js`. Mã TC của task: các TC của AC-3.
  - **FE-2** (4 file, phụ thuộc FE-1): `createCustomerListLoader.js`, `createCustomerListLoader.test.js`, `main.js`, `index.html`. `main.js` và `index.html` không có TC nào nên đi cùng nhóm có test; hai file này phải đổi cùng nhau (`main.js` tìm `#status-filter`). Mã TC của task: các TC của AC-4, AC-5.
- **Phần không có TC tự động**: `index.html` và việc nối trong `main.js` (`node:test` không có DOM). Kiểm bằng review (các điểm bắt buộc của D7, D9) và chạy tay với BE local, mở tab Network:
  1. Mở trang: điều khiển hiện "Tất cả"; có đúng một `GET /api/customers` không có `?`; bảng hiện mọi khách hàng.
  2. Chọn "Đang hoạt động": đúng một `GET /api/customers?status=ACTIVE`, bảng chỉ còn dòng "Đang hoạt động". Chọn "Ngừng hoạt động": `?status=INACTIVE`. Chọn lại "Tất cả": `GET /api/customers`, bảng hiện lại mọi khách hàng.
  3. Đang chọn "Đang hoạt động", bấm "Ngừng hoạt động" ở dòng A: danh sách tải lại bằng `?status=ACTIVE`, A không còn trong bảng, điều khiển vẫn là "Đang hoạt động". Chuyển sang "Ngừng hoạt động": A có mặt. Bấm "Kích hoạt lại" ở A: A rời bảng.
  4. Đang lọc, sửa họ tên một khách hàng rồi "Lưu": danh sách tải lại theo lựa chọn đang chọn; dòng đó còn trong bảng với tên mới.
  5. Đang chọn "Ngừng hoạt động", thêm một khách hàng: form trắng lại, danh sách tải lại bằng `?status=INACTIVE`, khách hàng mới **không** có trong bảng (Q5). Chuyển "Tất cả" thì thấy.
  6. Chọn một lựa chọn không ai khớp: vùng danh sách hiện "Chưa có khách hàng." (Q6); điều khiển vẫn dùng được.
  7. Tắt BE rồi đổi lựa chọn: vùng danh sách hiện "Không tải được danh sách khách hàng."; điều khiển vẫn hiện lựa chọn vừa chọn. Bật BE, đổi lựa chọn: bảng hiện lại.
  8. Chọn "Ngừng hoạt động" rồi tải lại trang (F5 và Ctrl+F5); sang trang khác rồi bấm Back: điều khiển và bảng phải khớp nhau, và sau khi tải lại là "Tất cả" (Q8). Thử trên từng trình duyệt đích.
  9. Đưa focus vào điều khiển, bấm nhanh mũi tên xuống hai lần: bảng cuối cùng khớp lựa chọn đang hiện (D8).
  10. Mở form sửa rồi đổi lựa chọn: form sửa giữ nguyên; câu lỗi đang có trong `#message` bị xoá.
  11. Đang chọn "Đang hoạt động" với ít nhất hai dòng, bấm đúp nhanh "Ngừng hoạt động" ở dòng đầu: ghi lại số `PUT .../status` được gửi và số khách hàng đổi trạng thái (tái hiện R2 cho người duyệt; D10).
  12. Gọi thẳng `GET /api/customers?status=DELETED`: 400 `application/problem+json` với `errors.status`.

## Migration
Không có script migration, vì không có DB.

- **Thứ tự deploy: BE trước, FE sau. Bắt buộc.**
  - FE mới gọi BE cũ: BE cũ bỏ qua query string, nên `GET /api/customers?status=ACTIVE` trả **mọi** khách hàng. Màn hình hiện cả khách hàng ngừng hoạt động dưới lựa chọn "Đang hoạt động", không báo lỗi nào. Đây đúng là điều R3 cấm, xảy ra từ phía client.
  - FE cũ gọi BE mới: vô hại, FE cũ không gửi `status`.
- **Rollback:** gỡ FE trước rồi mới gỡ BE, vì cùng lý do. Không có dữ liệu nào phải đưa về như cũ: REQ-005 chỉ đọc.
- **Dữ liệu legacy:** không đọc hay ghi `source-legacy`. Khi dữ liệu `customers` được migrate (chưa có kế hoạch, `aiws/knowledge/db-schema.md` → Migration), dòng `status = 0` nhập thành `INACTIVE` và lọc được ngay, không cần xử lý riêng.
- Sau khi merge, phase knowledge cập nhật:
  - `aiws/knowledge/api-inventory.md`: dòng `GET /api/customers` ("Không phân trang, không lọc"); mục Quy ước: câu "`GET /api/customers` trả toàn bộ danh sách", quy ước tham số query (tên, tách và giải mã, đúng một lần, tên lạ bị bỏ qua), key `errors` cho tham số query, chữ ký `listCustomers`.
  - `aiws/knowledge/system-map.md`: luồng 1; dòng "FE: trang chính", "FE: entry", "FE: API client", "FE: tiện ích" (thêm `createCustomerListLoader.js`); dòng "BE: nghiệp vụ" và "BE: lưu trữ".
  - `aiws/knowledge/db-schema.md`: bảng method của repository (thêm `findAllByStatus`).
  - `aiws/knowledge/conventions.md`: Gọi API (`options` của `listCustomers` mang `status`; tham số query qua `encodeURIComponent`); State và render (lựa chọn lọc nằm trong `<select>`, loader đọc lại ở mỗi lần tải, chỉ lần tải mới nhất được vẽ); Backend → Định tuyến (`queryValues`); bảng mã TC của REQ-005 và câu "đánh số tiếp từ TC-108" đã cũ.
  - `aiws/knowledge/glossary.md`: thuật ngữ "lọc theo trạng thái", "lựa chọn lọc".

## Rủi ro
- **R1: `index.html` và phần nối trong `main.js` không có unit test.** Loader đúng nhưng nối sai (đọc lựa chọn một lần lúc khởi động, quên `if (current)`, đặt `<select>` trong `#create-form`) thì AC-4, AC-5 hỏng mà `fe_test` vẫn pass. Giảm thiểu: D7 và D9 ghi thành điểm bắt buộc kèm đoạn mã mẫu; mười hai bước chạy tay ở mục FE change.
- **R2: Bấm đúp khi đang lọc đổi trạng thái của khách hàng kế tiếp (Q1).** Rủi ro do chính REQ-005 tạo ra; cơ chế và các phương án chặn ở D10. Nặng hơn lỗi REQ-004 đã sửa: khách hàng bị đổi là người nhân viên không chọn, và dòng đó cũng rời bảng nên khó nhận ra. Thao tác đảo lại được bằng "Kích hoạt lại", trừ khi số điện thoại đã bị khách hàng khác lấy (BR-09). Thiết kế này không chặn; xem "Quyết định cần duyệt".
- **R3: Deploy sai thứ tự.** FE mới trên BE cũ hiện sai danh sách mà không báo lỗi (Migration). Giảm thiểu: thứ tự BE → FE là bắt buộc; bước chạy tay 12 xác nhận BE đã nhận tham số.
- **R4: Tham số tên lạ bị bỏ qua.** `?Status=ACTIVE` hay `?state=ACTIVE` trả tất cả, cũng là một kiểu "lặng lẽ nhận về tất cả" với người gọi API bằng tay (Q4). Màn hình không gặp vì `listCustomers` luôn gửi đúng tên. Chặt hơn (400 cho tham số lạ) là một lựa chọn ở "Quyết định cần duyệt".
- **R5: Quy ước lỗi được mở rộng.** `errors.status` lần đầu mô tả một tham số query, trong khi `detail` vẫn nói "invalid fields". Client đọc `errors` theo tên field của body không phân biệt được nguồn. Chấp nhận: endpoint này không có body, nên không có field nào trùng tên.
- **R6: Thêm khách hàng khi đang chọn "Ngừng hoạt động" (Q5).** Khách hàng mới không hiện trong bảng; form trắng lại là dấu hiệu duy nhất đã lưu. Nhân viên có thể nhập lại và nhận lỗi trùng email.
- **R7: Câu "Chưa có khách hàng." khi đang lọc (Q6).** Kho vẫn có khách hàng, chỉ là không ai khớp; ca thường gặp là ngừng hoạt động khách hàng cuối cùng dưới "Đang hoạt động".
- **R8: Lần tải bị vượt không để lại dấu vết (D8).** Response và cả lỗi của nó bị bỏ qua. Nếu yêu cầu mới nhất treo lâu thì bảng giữ nội dung cũ cho tới khi nó về hoặc lỗi; không có trạng thái "đang tải" (ngoài phạm vi). Mỗi lần đổi lựa chọn vẫn gửi một `GET`, kể cả khi giữ phím mũi tên; với kho in-memory là chấp nhận được.
- **R9: Trình duyệt khôi phục giá trị của `<select>` (Q8).** Nếu cả `autocomplete="off"` lẫn phép gán lúc khởi động đều không thắng được một trình duyệt nào đó, điều khiển có thể hiện lựa chọn cũ trong khi bảng hiện tất cả, cho tới lần tải kế tiếp. [CẦN XÁC NHẬN] bước chạy tay 8.
- **R10: Hành vi do JDK `HttpServer` quyết định, không sửa trong REQ-005.** Request line có escape hỏng hoặc ký tự không hợp lệ trong query không tới `CustomerHandler`, nên phản hồi không phải `problem+json`. [CẦN XÁC NHẬN] mã trạng thái cụ thể. Test spec không đặt kỳ vọng.
- **R11: `URLDecoder` đổi `+` thành dấu cách.** Không ảnh hưởng kết quả hiện nay (cả `+ACTIVE` lẫn ` ACTIVE` đều không hợp lệ), nhưng là một quy ước cho mọi tham số query sau này.
- **R12: Thêm method vào interface `CustomerRepository`.** Mọi bản cài đặt phải có `findAllByStatus`; hiện chỉ có `InMemoryCustomerRepository`, đổi trong cùng task (BE-1).
- **R13: Developer đưa việc kiểm tra giá trị lên handler, hoặc coi `?status` là vắng mặt.** Hệ quả: validation nằm sai tầng, hoặc `?status` lặng lẽ trả tất cả. Giảm thiểu: điểm bắt buộc của D3; AC-2 có biến thể riêng cho `?status` và `?status=`.
- **R14: Hiệu năng.** Lọc là một lượt duyệt O(n) như `findAll()`; response nhỏ hơn khi lọc. Đủ cho kho in-memory.
- **R15: Bảo mật và PII.** Giá trị lọc chỉ được so khớp chính xác với hai hằng, không đi vào truy vấn hay log nào; thông điệp lỗi không lặp lại giá trị client gửi. URL chỉ mang `ACTIVE`/`INACTIVE`, không có PII. Phía FE giá trị đi qua `encodeURIComponent`. API vẫn không có xác thực (hiện trạng).
- **R16: Hai tab hoặc hai nhân viên.** Danh sách không tự cập nhật khi người khác đổi trạng thái; dưới một lựa chọn lọc, bảng có thể còn dòng không còn khớp cho tới lần tải kế tiếp. Ngoài phạm vi, như hiện nay.

## Quyết định cần duyệt
- **Đổi API `GET /api/customers`** (D1, D2): thêm tham số query tuỳ chọn `status`, thêm response 400. Chỉ mở rộng, không phá tương thích: lời gọi không kèm `status` cho đúng kết quả cũ. "Tất cả" là không gửi tham số; không có giá trị `ALL`.
- **Quy ước mới, vì đây là tham số query đầu tiên của API** (D1..D3):
  - Tên tham số viết như field JSON (`status`), phân biệt hoa thường.
  - Giá trị được giải mã percent-encoding (và `+` thành dấu cách) rồi so khớp chính xác: không trim, không đổi hoa thường.
  - `errors` của Problem lần đầu mang **tên một tham số query** làm key; `detail` vẫn là câu chung "The request has invalid fields" (R5).
- **Thế nào là giá trị lọc không hợp lệ** (Q4; D2), đều trả 400 `errors.status = "must be ACTIVE or INACTIVE"`:
  - Giá trị lạ, sai hoa thường, có khoảng trắng, hai giá trị trong một tham số.
  - Giá trị rỗng: `?status=` và `?status` không có dấu `=`.
  - **Tham số lặp lại, kể cả lặp cùng một giá trị hợp lệ** (`status=ACTIVE&status=ACTIVE`). Analysis để ngỏ điểm này; nếu muốn chấp nhận lặp cùng giá trị thì nói ở bước này.
- **Tham số có tên lạ vẫn bị bỏ qua** (Q4; R4): `?Status=ACTIVE` trả tất cả. Phương án chặt hơn là 400 cho mọi tham số query không biết tên trên `GET /api/customers`; nó đổi hành vi hiện có của endpoint và cần thêm một AC.
- **Bấm đúp khi đang lọc (Q1; D10, R2). Người duyệt chọn một trong ba:**
  - **A. Không chặn**: thiết kế này, theo giả định của analysis. Một cú bấm đúp khi đang lọc có thể đổi trạng thái của hai khách hàng.
  - **B. Key chung cho mọi nút đổi trạng thái, mọi lúc**: đảo D1 của REQ-004 cả khi xem "Tất cả".
  - **C. Key chung chỉ khi đang lọc**: giữ nguyên REQ-004 khi xem "Tất cả"; khi đang lọc, lần bấm vào khách hàng khác trong vòng 500 ms bị bỏ qua im lặng. Architect đề xuất phương án này nếu chặn.
  - Chọn B hoặc C thì cần một AC mới và một vòng thiết kế nữa; `createDoubleClickGuard.js` và TC-108..TC-113 không đổi ở cả hai phương án. [CẦN XÁC NHẬN] ca này chưa được tái hiện bằng chạy tay (bước 11).
- **Bỏ qua response danh sách đến trễ** (Q7; D8): khác giả định mặc định của analysis ("không xử lý"), theo đúng đề nghị của analysis là đưa vào nếu đủ nhỏ. Không huỷ yêu cầu, không có trạng thái "đang tải". Nếu không muốn phần này thì nói ở bước này: loader chỉ còn đọc lựa chọn ở từng lần tải, các kịch bản "bị vượt" của D8 và `if (current)` ở D9 bỏ đi.
- **Giao diện** (D7). [CẦN XÁC NHẬN] legacy không có màn hình lọc để theo, nên các điểm dưới đây là đề xuất:
  - Điều khiển là một `<select>` có nhãn "Lọc theo trạng thái", đặt ngay trên bảng; ba lựa chọn "Tất cả", "Đang hoạt động", "Ngừng hoạt động".
  - Đổi lựa chọn thì xoá câu lỗi đang có trong `#message`; form sửa đang mở giữ nguyên.
  - Lúc mở trang luôn là "Tất cả", kể cả khi trình duyệt muốn khôi phục lựa chọn cũ (Q8; R9).
- **Sau khi thêm khách hàng, danh sách tải lại theo lựa chọn đang chọn** (Q5; D9, R6): đang chọn "Ngừng hoạt động" thì khách hàng vừa thêm không hiện. Phương án khác: chuyển về "Tất cả" sau khi thêm, hoặc hiện thông báo đã thêm.
- **Danh sách rỗng khi đang lọc vẫn hiện "Chưa có khách hàng."** (Q6; D9, R7). Phương án khác: `renderCustomerTable` nhận thêm một tham số tuỳ chọn cho biết đang lọc và hiện một câu riêng (vd. "Không có khách hàng nào khớp lựa chọn lọc."); test không mã TC `renderCustomerTable shows an empty state` vẫn pass vì giá trị mặc định giữ câu cũ.
- **Public API và file mới, không đổi cấu trúc thư mục hay package** (D4..D6, D8):
  - `CustomerRepository` thêm `findAllByStatus`; `CustomerService` thêm overload `list(List<String>)`. `findAll()` và `list()` giữ nguyên.
  - `listCustomers` nhận thêm key `status` trong `options`; mọi lời gọi cũ giữ nguyên nghĩa. Phương án đã loại là `listCustomers(status, options)`: hợp mẫu "`options` cuối cùng" hơn, nhưng phá lời gọi `listCustomers({ fetchImpl })` và buộc sửa một test có sẵn. Nếu muốn chữ ký đó thì nói ở bước này.
  - File mới: `source-fe/src/utils/createCustomerListLoader.js`, `source-fe/test/createCustomerListLoader.test.js`. Đây là factory thứ hai trong `src/utils/` (sau `createDoubleClickGuard.js`) và là đơn vị đầu tiên ở đó nhận hàm gọi API làm tham số.
  - `main.js` giữ thêm một state nhỏ trong loader: số thứ tự của lần tải mới nhất, mất khi tải lại trang.
- **Không test có sẵn nào bị sửa** (D11). Mã TC mới đánh số tiếp từ TC-115.
- **Kiểm chứng AC-4, AC-5 ở mức trang là chạy tay** (R1): `index.html` và phần nối trong `main.js` không có unit test; người review PR chạy mười hai bước ở mục FE change.
- **Thứ tự deploy BE → FE là bắt buộc**, rollback theo chiều ngược lại (Migration, R3).
- **Không có DB, không migration**; không đọc hay ghi `source-legacy`.
