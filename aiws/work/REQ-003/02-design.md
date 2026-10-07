# REQ-003 — Thiết kế

## Tổng quan
REQ-003 thêm thao tác **đổi trạng thái** khách hàng (ngừng hoạt động ↔ kích hoạt lại): một endpoint mới ở BE và một nút ở mỗi dòng của màn hình danh sách ở FE. Thiết kế xử lý đủ AC-1..AC-10 trong `01-analysis.md` và chốt các giả định Q1..Q7. Đây là vòng thiết kế đầu tiên, chưa có feedback reject.

- **BE: endpoint đặt trạng thái đích (AC-1..AC-6).** Thêm `PUT /api/customers/{id}/status` với body `{"status": "ACTIVE" | "INACTIVE"}`, trả 200 kèm `Customer` (D1). Thứ tự xử lý cố định: JSON hỏng → không có khách hàng → trạng thái đích không hợp lệ → đã ở đúng trạng thái → trùng số khi kích hoạt lại → ghi (D2).
- **BE: quy tắc.** `CustomerService.updateStatus` **không** đi qua hàm `check` của thêm/sửa, nên không kiểm tra lại họ tên, email hay định dạng số (D5). Điều kiện duy nhất là BR-09 ở chiều kích hoạt lại, dùng nguyên truy vấn `existsByPhoneAndStatusAndIdNot` đã có. Repository thêm một thao tác ghi chỉ đổi `status` (D6).
- **BE: lỗi.** Trùng số và trạng thái đích không hợp lệ đều là `ValidationException` → 400 kèm `errors`, như `POST` và `PUT` hiện có (D3, D4). Không thêm exception, không thêm mã lỗi.
- **FE (AC-7..AC-10).**
  - `customerApi.js` thêm `updateCustomerStatus`, đi qua `request()` có sẵn (D8).
  - Ô "Thao tác" của mỗi dòng thêm một nút đổi trạng thái cạnh nút "Sửa"; bảng vẫn 6 cột (D9).
  - Câu thông báo lỗi tiếng Việt do hàm thuần mới `describeStatusError` chọn (D10); `main.js` nối nút với API và tải lại danh sách sau khi đổi thành công (D11).
- **Không có DB, không có migration.** HTTP API chỉ **thêm một endpoint**; bốn endpoint cũ, schema `Customer` và format lỗi không đổi, nên vẫn tương thích ngược. `PUT /api/customers/{id}` vẫn bỏ qua `status` (REQ-002, TC-63).
- **Một test của REQ-002 phải sửa:** TC-74 trong `source-fe/test/customerTable.test.js` (D9). Mọi test cũ khác giữ nguyên và phải pass.

Truy vết AC → thiết kế:

| AC | Phần thiết kế |
| --- | --- |
| AC-1 | D1, D5 (chiều ngừng hoạt động không có điều kiện), D6 (chỉ ghi `status`) |
| AC-2 | D5 (chỉ kiểm tra trùng số; bỏ qua khi không có số; không kiểm tra lại định dạng), D6 |
| AC-3 | D3, D5 |
| AC-4 | D5 (xét "đã ở đúng trạng thái" trước kiểm tra trùng, không ghi) |
| AC-5 | D2 (404 trước mọi kiểm tra của service) |
| AC-6 | D4 |
| AC-7, AC-8 | D8 |
| AC-9 | D9 |
| AC-10 | D10 |
| R5, nửa nối dây (Q7) | D11 |

Chi tiết schema nằm trong `api-contract.yaml`.

## Quyết định chính
- D1: Endpoint đổi trạng thái là `PUT /api/customers/{id}/status`, body `{"status": "ACTIVE" | "INACTIVE"}` là **trạng thái đích**. Thành công trả **200** kèm `Customer` sau khi đổi (Q1).
  - `id` chỉ lấy từ path. Field khác trong body bị bỏ qua nhờ `FAIL_ON_UNKNOWN_PROPERTIES = false` của `CustomerHandler.JSON`.
  - Không thêm `GET /api/customers/{id}/status`: trạng thái đã đọc được qua `GET /api/customers/{id}` và `GET /api/customers`. Method khác trên path này rơi vào fallback 404 như mọi route lạ hiện nay.
  - Lý do:
    - "Đặt trạng thái đích" là idempotent, khớp R4 (đặt lại đúng trạng thái đang có thì không lỗi) và đúng ngữ nghĩa `PUT` (skill api-design; `PUT /api/customers/{id}` của REQ-002 cũng là "thay thế").
    - Nhân viên bấm hai lần liên tiếp, hoặc bấm trên một danh sách đã cũ, gửi lại **cùng** trạng thái đích: lần sau là thao tác không đổi gì. Với endpoint kiểu "đảo trạng thái" thì lần bấm thứ hai sẽ đảo ngược lần đầu.
    - Path con `/status` theo quy ước sub-resource của skill api-design và không đụng tới `PUT /api/customers/{id}`.
    - Trả 200 kèm object theo quy ước "sửa trả 200 kèm object sau khi sửa" (`aiws/knowledge/api-inventory.md` → Quy ước → Mã thành công).
  - Đã cân nhắc:
    - Gộp vào `PUT /api/customers/{id}` (nhận thêm `status`): loại. REQ-002 đã chốt và có test rằng endpoint này bỏ qua `status` (TC-51, TC-63); gộp vào là phá tương thích, và khách hàng có số theo quy tắc cũ sẽ không đổi trạng thái được vì `PUT` kiểm tra lại số (TC-54).
    - Hai endpoint hành động `POST .../activate`, `POST .../deactivate`: loại. `POST` không idempotent theo nghĩa của HTTP, thêm hai route cho một thao tác, và dự án chưa có endpoint kiểu hành động nào.
    - `PATCH /api/customers/{id}`: loại. Dự án chưa có `PATCH` (`api-inventory.md` → Quy ước), và một `PATCH` chung mời gọi việc sửa từng phần các trường khác, là việc ngoài phạm vi.
    - Trả 204 không body: loại, vì lệch quy ước của `PUT` hiện có.
- D2: Thứ tự xử lý của endpoint cố định như sau (Q1, AC-4, AC-5, AC-6).
  1. Khớp route: path khớp `^/api/customers/(\d+)/status$` và method là `PUT`. Không khớp thì rơi vào fallback 404 `No route for <METHOD> <path>` như hiện nay.
  2. Đọc body JSON. Hỏng thì 400 `Malformed JSON`, **kể cả khi `id` không tồn tại** (handler đọc body trước khi gọi service, như `PUT /api/customers/{id}`).
  3. Tìm khách hàng. Không có thì 404 `Not Found`, detail `Customer {id} not found`, **kể cả khi trạng thái đích không hợp lệ**.
  4. Kiểm tra trạng thái đích (D4). Không hợp lệ thì 400 kèm `errors.status`.
  5. Khách hàng đã ở đúng trạng thái đích: trả 200 kèm `Customer` đang lưu, **không ghi và không kiểm tra trùng số** (AC-4).
  6. Trạng thái đích là `ACTIVE`: kiểm tra BR-09 (D5). Số đang được khách hàng `ACTIVE` khác dùng thì 400 kèm `errors.phone` (D3).
  7. Ghi `status` (D6) và trả 200.
  - Lý do:
    - Bước 2 → 3 → 4 là đúng thứ tự "JSON hỏng → 404 → validation" đã duyệt ở `aiws/work/REQ-002/02-design.md` D2; một client xử lý lỗi của `PUT /api/customers/{id}` xử lý được endpoint mới theo cùng cách. Điều này trả lời phần còn mở của Q1: `id` không tồn tại **và** trạng thái đích không hợp lệ thì trả **404**.
    - Bước 4 trước bước 5: giá trị không hợp lệ không thể "đúng bằng trạng thái đang có", nên phải loại trước khi so.
    - Bước 5 trước bước 6 là yêu cầu của AC-4 (hai biến thể cuối): đặt lại đúng trạng thái đang có không bao giờ báo lỗi trùng số, kể cả khi dữ liệu trùng đã có sẵn.
  - Đã cân nhắc: kiểm tra trạng thái đích trước khi tìm khách hàng (400 trước 404). Loại, vì lệch thứ tự đã duyệt của REQ-002 mà không có lợi ích gì cho người dùng.
- D3: Kích hoạt lại bị từ chối vì trùng số trả **400** `Validation failed` với `errors.phone = "is already used by another customer"`, qua `ValidationException` có sẵn (Q2, AC-3).
  - Lý do:
    - Cùng một quy tắc BR-09 đang được báo đúng bằng response này ở `POST /api/customers` và `PUT /api/customers/{id}` (`CustomerService.check`). Một quy tắc, một hình dạng lỗi.
    - `CustomerHandler.handle` và `ApiError.fieldErrors` của FE dùng lại nguyên; không thêm exception hay dòng map.
    - Key `phone` chỉ đúng trường của khách hàng mà nhân viên phải sửa để kích hoạt lại được.
  - Đã cân nhắc: **409 Conflict** với exception mới trong `error/` và một dòng map mới trong `handle`. Về ngữ nghĩa HTTP thì 409 sát hơn: request hợp lệ, chỉ xung đột với trạng thái dữ liệu, còn `detail` của 400 hiện có là "The request has invalid fields". Loại vì nó thêm một quy ước lỗi mới chỉ dùng cho một endpoint, và làm cùng quy tắc BR-09 trả hai mã khác nhau tuỳ thao tác (skill api-design: không phát minh quy ước mới khi chưa được duyệt). Nếu người duyệt muốn 409 thì AC-3, AC-8, AC-10 và D10 đổi theo; xem "Quyết định cần duyệt".
- D4: Trạng thái đích không hợp lệ trả **400** `Validation failed` với `errors.status = "must be ACTIVE or INACTIVE"` (AC-6). Body được đọc vào record mới `api/UpdateCustomerStatusRequest(String status)`; field là **`String`**, không phải `CustomerStatus`.
  - Giá trị hợp lệ là đúng hai chuỗi `ACTIVE` và `INACTIVE`, so khớp chính xác: **không trim, không đổi hoa thường**. Mọi giá trị khác (thiếu field, `null`, `""`, `"DELETED"`, `"active"`, `" ACTIVE "`) nhận cùng một thông điệp.
  - Lý do:
    - Nếu field là enum, Jackson ném `InvalidFormatException` (một `JsonProcessingException`) cho `"DELETED"` và `""`, và `handle` sẽ trả 400 `Malformed JSON` không có `errors`, trước cả bước tìm khách hàng. Như vậy sai `title`, sai thứ tự của D2, và đưa validation lên tầng HTTP (trái convention "All validation happens here, not in the HTTP layer").
    - `String` cho phép service quyết định, như `name`, `email`, `phone` của hai request record hiện có.
    - Không trim và không nhận chữ thường: đây là giá trị do code client gửi, không phải chữ người dùng gõ; API chỉ nhận đúng giá trị mà chính nó trả ra trong `Customer.status` (đề xuất của Q1). Convention "trim trước khi kiểm tra" áp dụng cho giá trị thô người dùng nhập.
    - Thông điệp theo dạng "must ..." của convention và nêu luôn tập giá trị hợp lệ.
  - Đã cân nhắc:
    - Field kiểu `CustomerStatus`: loại, lý do ở trên.
    - Trim và không phân biệt hoa thường: loại, vì nới contract mà không client nào cần.
    - Hai thông điệp (`must not be blank` cho thiếu/rỗng, thông điệp khác cho giá trị lạ): loại, vì một thông điệp đã nói đủ cách sửa.
- D5: Thêm `CustomerService.updateStatus(long id, String status)`. Method này **không gọi hàm private `check`**.
  - Hình dạng:
    ```java
    /** Sets the status of an existing customer; its name, email and phone are kept. */
    public Customer updateStatus(long id, String status) {
      Customer current = get(id); // 404 before any other check (D2)
      CustomerStatus target = parseStatus(status); // 400 errors.status (D4)
      if (current.status() == target) {
        return current; // AC-4: nothing is written, no duplicate check
      }
      if (target == CustomerStatus.ACTIVE
          && current.phone() != null
          && repository.existsByPhoneAndStatusAndIdNot(current.phone(), CustomerStatus.ACTIVE, id)) {
        throw new ValidationException(Map.of("phone", "is already used by another customer"));
      }
      return repository.updateStatus(id, target)
          .orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
    }
    ```
  - `parseStatus` là hàm private trả `CustomerStatus` khi `status` đúng bằng tên của một hằng trong `CustomerStatus`, ngược lại ném `ValidationException` với `errors.status` của D4. Phải xử lý `null` tường minh (`CustomerStatus.valueOf(null)` ném `NullPointerException`, sẽ thành 500).
  - **Bắt buộc:**
    - Không gọi `check`, không gọi `PhoneNumbers`. Số đang lưu được đem so **nguyên văn**, không trim, không chuẩn hoá, không kiểm tra định dạng (Q3; AC-1 và AC-2, biến thể số theo quy tắc cũ).
    - **Bỏ qua kiểm tra trùng khi `current.phone()` là `null`.** `InMemoryCustomerRepository.existsByPhoneAndStatusAndIdNot` gọi `phone.equals(...)`, nên truyền `null` sẽ ném `NullPointerException` và thành 500 (AC-2, biến thể đầu).
    - Chiều `INACTIVE` không có điều kiện nào (AC-1).
    - Nguyên văn hai thông điệp: `is already used by another customer` (trùng với thông điệp của `check`) và `must be ACTIVE or INACTIVE`.
    - Không kiểm tra email khi kích hoạt lại (`01-analysis.md` → Ngoài phạm vi).
    - Tên `parseStatus` là gợi ý; developer được đặt tên khác nếu giữ đúng các điểm trên. `create`, `update`, `check`, `list`, `get` không đổi.
  - Lý do:
    - R3 nêu đúng một điều kiện chặn; `check` kiểm tra thêm họ tên, email và định dạng số, nên khách hàng migrate có số theo quy tắc cũ sẽ không đổi trạng thái được, trái R1 và R2.
    - `existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)` tương đương `WHERE phone = ? AND status = 1 AND id <> ?` của `source-legacy/customer_save.php` dòng 27; quy tắc BR-09 vẫn do service truyền xuống qua tham số `CustomerStatus.ACTIVE`.
    - Trả `current` ở nhánh "đã đúng trạng thái" mà không ghi: cách chắc nhất để "không đổi gì".
    - `get(id)` trước rồi `orElseThrow` sau thao tác ghi là đúng mẫu của `CustomerService.update`.
  - Đã cân nhắc:
    - Tái dùng `check` với giá trị đang lưu: loại, lý do ở trên.
    - Service nhận `CustomerStatus` và để handler đổi chuỗi sang enum: loại, vì đưa validation lên handler.
    - Hai method `activate(id)` và `deactivate(id)`: loại. Handler phải rẽ nhánh theo giá trị, và bước "đã đúng trạng thái" bị chép hai lần.
    - Luôn ghi, kể cả khi trạng thái không đổi: loại, vì không cần và làm AC-4 phụ thuộc vào việc ghi lại đúng giá trị cũ.
- D6: `CustomerRepository` thêm `Optional<Customer> updateStatus(long id, CustomerStatus status)`: thay `status` của khách hàng `id`, **giữ nguyên `id`, `name`, `email`, `phone` đang lưu**. Trả khách hàng sau khi đổi, hoặc `Optional.empty()` khi không có khách hàng đó. **Không bao giờ thêm mới.** Chữ ký của `update` và các method khác không đổi.
  - Bản in-memory: `Optional.ofNullable(customers.computeIfPresent(id, (key, c) -> new Customer(c.id(), c.name(), c.email(), c.phone(), status)))`. Ba trường được chép từ giá trị `c` đang nằm trong map, không phải từ lần đọc trước đó của service; hàm truyền vào phải thuần.
  - Lý do:
    - Tương đương `UPDATE customers SET status = ? WHERE id = ?`: cột không nêu thì không bị ghi (R2), 0 dòng khớp thì không tạo gì.
    - Đúng convention "thao tác ghi chỉ nhận các trường được phép đổi" và mẫu `computeIfPresent` của `update` (`aiws/knowledge/conventions.md` → Backend → Đặt tên và style). Một `PUT /api/customers/{id}` chạy đồng thời không bị ghi đè họ tên, email hay số.
    - Tên `updateStatus` đi cùng `update`; repository không quyết định nghiệp vụ nào.
  - Đã cân nhắc:
    - Thêm tham số `status` vào `update(id, name, email, phone)`: loại. Đổi public API, buộc sửa TC-44..TC-47 và `CustomerService.update`, và mở đường cho thao tác sửa đổi trạng thái.
    - `save(Customer)` thay cả record: loại, đã loại ở REQ-002 D6 (khe hở đọc rồi ghi, có thể tạo `id` tuỳ ý).
- D7: `CustomerHandler` thêm hằng `private static final Pattern STATUS_BY_ID = Pattern.compile("^/api/customers/(\\d+)/status$")` và một khối route `PUT`, đặt sau các khối của `BY_ID` và trước fallback.
  - Khối route đọc `UpdateCustomerStatusRequest` bằng `JSON.readValue` rồi gọi `send(exchange, 200, service.updateStatus(Long.parseLong(statusById.group(1)), body.status()))`.
  - Javadoc của class liệt kê thêm `PUT /api/customers/{id}/status`. `handle` và `send` không đổi. `App.java` không đổi: context `/api/customers` đã bao cả path con.
  - Lý do: `BY_ID` neo `$` ngay sau `(\d+)` nên không khớp path con; hiện `/api/customers/1/status` rơi vào fallback. Một `Pattern` riêng theo đúng kiểu định tuyến hiện có (`conventions.md` → Backend → Định tuyến).
  - Đã cân nhắc: nới `BY_ID` thành `^/api/customers/(\d+)(/status)?$` rồi rẽ nhánh theo nhóm thứ hai. Loại, vì làm đổi điều kiện khớp của hai route `GET`/`PUT` đang có test.
- D8: `source-fe/src/api/customerApi.js` thêm **một** hàm public `updateCustomerStatus(id, status, options)`, đi qua `request()` có sẵn. `request()` và `ApiError` không sửa (AC-7, AC-8).
  - Hình dạng: ``request(`/customers/${encodeURIComponent(id)}/status`, { ...options, method: 'PUT', body: JSON.stringify({ status }) })``. Hàm trả khách hàng mà API trả; lỗi non-2xx ném `ApiError` qua `request()`. Hàm không kiểm tra giá trị `status`.
  - Lý do: theo mẫu `updateCustomer` (`encodeURIComponent`, `JSON.stringify`, `options` cuối cùng để truyền `fetchImpl`). Một hàm nhận trạng thái đích khớp với một endpoint nhận trạng thái đích; nút trên bảng mang sẵn trạng thái đích (D9) nên `main.js` không phải rẽ nhánh.
  - Đã cân nhắc: hai hàm `activateCustomer(id)` và `deactivateCustomer(id)`. Loại, vì `main.js` (không có unit test) phải chọn hàm theo trạng thái.
- D9: `renderCustomerTable` thêm **một nút đổi trạng thái vào ô "Thao tác" đang có**, ngay sau nút "Sửa", cách nút "Sửa" đúng một dấu cách. Bảng vẫn 6 cột, không thêm `<th>`, `<td>` hay `<tr>` (AC-9, Q4).
  - Ô "Thao tác" của từng dòng (viết liền; `{id}` và trạng thái đích đều qua `escapeHtml`):
    - Khách hàng `ACTIVE`:
      ```html
      <td><button type="button" data-edit-id="1">Sửa</button> <button type="button" data-status-id="1" data-target-status="INACTIVE">Ngừng hoạt động</button></td>
      ```
    - Khách hàng `INACTIVE`:
      ```html
      <td><button type="button" data-edit-id="2">Sửa</button> <button type="button" data-status-id="2" data-target-status="ACTIVE">Kích hoạt lại</button></td>
      ```
    - Khách hàng có `status` ngoài hai giá trị trên: ô giữ như hiện nay, chỉ có nút "Sửa", không có dấu cách thừa và không có nút đổi trạng thái.
  - Thứ tự thuộc tính của nút mới cố định: `type`, `data-status-id`, `data-target-status` (test FE khớp nguyên chuỗi).
  - Trạng thái đích và nhãn nút đặt trong một hằng của component, cạnh `STATUS_LABELS`, ví dụ `STATUS_ACTIONS = { ACTIVE: { target: 'INACTIVE', label: 'Ngừng hoạt động' }, INACTIVE: { target: 'ACTIVE', label: 'Kích hoạt lại' } }`. Tên hằng là gợi ý.
  - Năm ô dữ liệu, nút "Sửa" (`data-edit-id`), `<thead>` và trạng thái rỗng `<p>Chưa có khách hàng.</p>` giữ nguyên.
  - **Phải sửa TC-74** (`source-fe/test/customerTable.test.js`), đúng hai assertion: hai regex khớp nguyên dòng của khách hàng 1 và khách hàng 2, hiện kết thúc bằng `<td><button type="button" data-edit-id="N">Sửa<\/button><\/td><\/tr>`. Hai regex này đổi phần ô "Thao tác" theo HTML ở trên. Các assertion khác của TC-74 (`<thead>`, 6 `<td>` mỗi dòng, một `data-edit-id=` mỗi dòng, 3 `<tr>`) và mọi test khác trong file không bị ảnh hưởng: TC-36 vẫn thấy 6 `<td>`, test đầu tiên vẫn đếm 2 `<tr>`, TC-75 vẫn khớp `data-edit-id="7&quot;..."`.
  - Truy vết TC-74: test giữ nguyên mã và tên hiển thị, nên truy vết của REQ-002 vẫn đúng. TC-74 **không** được định nghĩa lại trong `03-test-spec.md` của REQ-003; nó được sửa trong cùng task với `customerTable.js`. Kỳ vọng mới của REQ-003 thuộc các TC mới phủ AC-9.
  - Lý do:
    - Đặt trong ô có sẵn thì cột "Thao tác" đúng nghĩa là nơi chứa mọi thao tác của dòng, và chỉ một test cũ phải sửa.
    - `<button type="button">` mang `data-*` là mẫu nút hành động hiện có; `main.js` bắt bằng delegation trên `#customers`.
    - Nút mang sẵn trạng thái đích nên `main.js` không cần biết trạng thái hiện tại và không giữ state.
    - Dấu cách giữa hai nút tạo khoảng hở mà không phải sửa `index.html`.
    - Không hiện nút cho trạng thái lạ: không có trạng thái đích nào đúng để đề xuất (đề xuất của Q4).
  - Đã cân nhắc:
    - Cột thứ bảy riêng cho nút đổi trạng thái: loại, vì phải sửa thêm TC-36 và mọi assertion đếm 6 `<td>`, và tách các thao tác ra hai cột.
    - Biến ô "Trạng thái" thành nút bấm hoặc ô chọn: loại, vì đổi nội dung cột dữ liệu hiện có (trái AC-9).
    - Tạo khoảng hở bằng CSS trong `index.html`: loại, vì thêm một file không có unit test vào phạm vi sửa.
    - Nhãn ngắn "Ngừng" để khỏi trùng chữ với nhãn trạng thái `INACTIVE`: không chọn; xem "Quyết định cần duyệt".
- D10: Câu thông báo khi đổi trạng thái thất bại do hàm thuần mới `describeStatusError(error)` trong `source-fe/src/utils/describeStatusError.js` chọn (AC-10, Q4).
  - Hành vi:
    - `error?.fieldErrors?.phone` có giá trị → `'Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng.'`
    - Mọi trường hợp khác (`ApiError` không có `fieldErrors.phone` như 404, 500, 400 `errors.status`; lỗi không phải `ApiError` như mất mạng; `null`/`undefined`) → `'Không đổi được trạng thái khách hàng.'`
  - Hàm trả **chuỗi text thuần**, không phải HTML; `main.js` gán bằng `textContent`. Hai câu là hằng `UPPER_SNAKE_CASE` trong file. Hàm không import gì: nhận biết lỗi bằng hình dạng (`fieldErrors.phone`), không dùng `instanceof ApiError`.
  - Lý do:
    - `main.js` không có seam unit test; đưa phần "lỗi nào thì hiện câu nào" ra hàm thuần thì AC-10 kiểm được bằng `node:test` (convention "logic nằm trong hàm thuần, `main.js` chỉ nối sự kiện").
    - Đặt ở `src/utils/` vì kết quả là text, không phải HTML: `src/components/` chỉ chứa hàm `render...` trả chuỗi HTML. File export một hàm cùng tên file, tên bắt đầu bằng động từ, như `escapeHtml` và `formatPhone`.
    - Không import `ApiError` để `src/utils/` không phụ thuộc ngược vào `src/api/`; hai file utils hiện có (`escapeHtml.js`, `formatPhone.js`) không import gì.
  - Đã cân nhắc:
    - Viết thẳng điều kiện trong `main.js` như form thêm: loại, vì AC-10 không kiểm chứng được.
    - Component `render...` trong `src/components/`: loại, vì kết quả không phải HTML và sẽ là component đầu tiên không render gì.
    - Hiện nguyên văn `phone: is already used by another customer` như form thêm: loại. R3 đòi "báo lỗi rõ ràng", và nhân viên vừa bấm một nút chứ không nhập số nào.
- D11: `source-fe/src/main.js` thêm **một** listener `click` mới trên `#customers` cho nút đổi trạng thái; listener của nút "Sửa" không đổi (R5, Q5, Q7).
  - Hình dạng:
    ```js
    listEl.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-status-id]');
      if (!button) return;
      messageEl.textContent = '';
      try {
        await updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus);
        await refresh();
      } catch (error) {
        messageEl.textContent = describeStatusError(error);
      }
    });
    ```
  - Thành công: tải lại cả danh sách bằng `refresh()`, không tự vá một dòng. Thất bại: ghi câu của D10 vào `#message`; **không** tải lại danh sách.
  - Không có hộp thoại xác nhận trước khi ngừng hoạt động (Q5). Form sửa đang mở (`#edit-customer`) không bị đụng tới.
  - Lý do:
    - Delegation trên `#customers` vì vùng này bị gán lại `innerHTML` sau mỗi `refresh()`. Listener riêng thì handler của nút "Sửa" không phải sửa; mỗi listener tự thoát khi nút không phải của mình.
    - `refresh()` sau khi thành công giống form thêm và form sửa; FE không giữ state phía client.
    - Không tải lại khi thất bại: giống hai handler ghi hiện có, và khi mất mạng `refresh()` sẽ thay cả bảng bằng "Không tải được danh sách khách hàng.", làm mất danh sách đang xem. Khi bị từ chối vì trùng số, dòng đang hiển thị vẫn đúng (khách hàng vẫn `INACTIVE`).
    - Không xác nhận: requirement không yêu cầu, thao tác đảo ngược được và không làm mất dữ liệu (R2).
  - Đã cân nhắc:
    - Tải lại cả khi thất bại (đề xuất ở Q7): loại, lý do ở trên.
    - Gộp vào listener của nút "Sửa": loại, vì phải sửa code đang chạy và trộn hai luồng lỗi.
    - Vô hiệu hoá nút trong lúc chờ: không cần, vì request lặp lại là thao tác không đổi gì (D1).

## API
Thêm **một** endpoint. Bốn endpoint hiện có, schema `Customer` và format lỗi không đổi. Schema đầy đủ và ví dụ: `aiws/work/REQ-003/api-contract.yaml`.

| Method | Path | Thay đổi |
| --- | --- | --- |
| PUT | `/api/customers/{id}/status` | **Mới.** Body `UpdateCustomerStatusRequest {status}`. 200 + `Customer`; 400 Problem (`errors.phone`, `errors.status` hoặc `Malformed JSON`); 404 Problem |
| PUT | `/api/customers/{id}` | Không đổi. Vẫn bỏ qua `status` trong body và giữ nguyên trạng thái |
| GET, POST | `/api/customers`; GET `/api/customers/{id}` | Không đổi |

Kết quả của `PUT /api/customers/{id}/status` (thứ tự kiểm tra theo D2):

| Tình huống | Kết quả |
| --- | --- |
| Path không khớp `^/api/customers/(\d+)/status$` (vd. `/api/customers/abc/status`), hoặc method khác `PUT` trên path này | 404, detail `No route for <METHOD> <path>` |
| Body không phải JSON hợp lệ | 400, `title = "Malformed JSON"`, không có `errors`, kể cả khi `id` không tồn tại |
| Không có khách hàng `id` | 404, `title = "Not Found"`, detail `Customer {id} not found`, kể cả khi `status` không hợp lệ (AC-5) |
| `status` thiếu, `null`, `""`, hoặc không đúng bằng `ACTIVE`/`INACTIVE` (vd. `"DELETED"`, `"active"`) | 400, `title = "Validation failed"`, `errors` đúng bằng `{"status": "must be ACTIVE or INACTIVE"}` (AC-6) |
| Khách hàng đã ở đúng trạng thái đích | 200, `Customer` như đang lưu; không ghi, không kiểm tra trùng số (AC-4) |
| `ACTIVE` → `INACTIVE` | 200, `status = "INACTIVE"`; `id`, `name`, `email`, `phone` như trước (AC-1) |
| `INACTIVE` → `ACTIVE`, khách hàng không có số (`phone = null`) | 200, `status = "ACTIVE"` (AC-2) |
| `INACTIVE` → `ACTIVE`, số không được khách hàng `ACTIVE` **khác** nào dùng (kể cả khi một khách hàng `INACTIVE` khác giữ cùng số, và kể cả số theo quy tắc cũ) | 200, `status = "ACTIVE"`; `phone` như trước (AC-2) |
| `INACTIVE` → `ACTIVE`, số đang được một khách hàng `ACTIVE` **khác** dùng | 400, `title = "Validation failed"`, `errors` đúng bằng `{"phone": "is already used by another customer"}`; khách hàng vẫn `INACTIVE` (AC-3) |

- Mọi response lỗi là `application/problem+json` (RFC 9457) qua bảng map exception có sẵn trong `CustomerHandler.handle`. Không thêm mã lỗi hay `title` mới. `errors` có thêm một key mới là `status`.
- Mọi trường hợp 400 và 404: không có gì bị ghi.
- Cách gỡ khi kích hoạt lại bị từ chối: nhân viên sửa hoặc xoá số của khách hàng bằng `PUT /api/customers/{id}` (đã có), rồi kích hoạt lại. Hệ thống không tự đổi số (R2).

Đối chiếu với legacy: `source-legacy` không có code nào đổi cột `status` (`customer_save.php` dòng 43 và 46; Q8). Thứ duy nhất được giữ từ legacy là BR-09: câu `SELECT id FROM customers WHERE phone = ? AND status = 1 AND id <> ?` (`customer_save.php` dòng 27) tương ứng `existsByPhoneAndStatusAndIdNot(phone, ACTIVE, id)` ở bước 6 của D2.

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`).

- Kho in-memory `InMemoryCustomerRepository` thêm thao tác `updateStatus` (D6). Cấu trúc `Map<Long, Customer>` và record `Customer` không đổi; `Customer.status` đã có sẵn.
- Không thêm truy vấn hay index: kiểm tra trùng dùng `existsByPhoneAndStatusAndIdNot` đã có, duyệt tuyến tính như hiện nay.
- Khi có DB thật: `updateStatus` tương ứng `UPDATE customers SET status = ? WHERE id = ?` trên cột `customers.status TINYINT(1)` của `source-legacy/sql/schema.sql` (1 = `ACTIVE`, 0 = `INACTIVE`); kiểm tra trùng chạy trên `idx_customers_phone`. Không cần cột hay index mới.

## BE change
Thư mục gốc: `source-be/src/main/java/com/example/crm/` và `source-be/src/test/java/com/example/crm/`. Không thêm package hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `repository/CustomerRepository.java` | Sửa | Thêm `Optional<Customer> updateStatus(long id, CustomerStatus status)` kèm một dòng Javadoc như `update`. Tám method cũ không đổi (D6) |
| `repository/InMemoryCustomerRepository.java` | Sửa | Cài đặt `updateStatus` bằng `computeIfPresent` theo D6 |
| `service/CustomerService.java` | Sửa | Thêm `updateStatus(long id, String status)` kèm một dòng Javadoc, và hàm private đổi chuỗi sang `CustomerStatus` (D5). `list`, `get`, `create`, `update`, `check` giữ chữ ký và hành vi |
| `api/UpdateCustomerStatusRequest.java` | Mới | `public record UpdateCustomerStatusRequest(String status) {}`, Javadoc một dòng "Request body of PUT /api/customers/{id}/status." (D4) |
| `api/CustomerHandler.java` | Sửa | Thêm hằng `STATUS_BY_ID` và khối route `PUT` theo D7; cập nhật Javadoc của class. `handle`, `send`, `BY_ID` và bốn route cũ không đổi |
| `source-be/src/test/java/com/example/crm/repository/InMemoryCustomerRepositoryTest.java` | Sửa | Thêm test cho `updateStatus`: đổi `status` theo cả hai chiều, giữ `id`/`name`/`email`/`phone` (kể cả `phone = null`), `id` không có thì `Optional.empty()` và kho không đổi |
| `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` | Sửa | Thêm test `updateStatus` cho AC-1..AC-6. Khách hàng `INACTIVE`, số theo quy tắc cũ và hai khách hàng `ACTIVE` trùng số được dựng bằng `repository.insert(...)` như các test `update`. Test cũ không sửa |
| `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | Thêm test HTTP cho endpoint mới bằng helper `put(path, json)` có sẵn: 200 theo hai chiều, 400 `errors.phone` (kịch bản đầu-cuối của AC-3: tạo A có số, ngừng A, tạo hoặc sửa B sang số đó, kích hoạt lại A), 400 `errors.status`, 400 `Malformed JSON`, 404. Test cũ không sửa |

Không đổi: `domain/Customer.java`, `domain/CustomerStatus.java`, `service/PhoneNumbers.java`, `api/CreateCustomerRequest.java`, `api/UpdateCustomerRequest.java`, `api/Problem.java`, `error/*`, `App.java`.

**Nhóm phải biên dịch cùng nhau** (gợi ý cho planner; sau mỗi task orchestrator chạy toàn bộ `be_test`, giới hạn 10 file/task). Mỗi nhóm chỉ thêm, nên test cũ pass sau từng nhóm:
- **BE-1** (3 file, độc lập): `CustomerRepository.java`, `InMemoryCustomerRepository.java`, `InMemoryCustomerRepositoryTest.java`. Interface và bản cài đặt duy nhất của nó phải đổi trong cùng task.
- **BE-2** (2 file, phụ thuộc BE-1): `CustomerService.java`, `CustomerServiceTest.java`.
- **BE-3** (3 file, phụ thuộc BE-2): `UpdateCustomerStatusRequest.java`, `CustomerHandler.java`, `CustomerHandlerTest.java`.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/api/customerApi.js` | Sửa | Thêm `updateCustomerStatus(id, status, options)` kèm một dòng JSDoc (D8). `request`, `ApiError` và bốn hàm cũ không đổi |
| `src/components/customerTable.js` | Sửa | Thêm hằng trạng thái đích + nhãn nút, và nút đổi trạng thái trong ô "Thao tác" theo D9. `<thead>`, năm ô dữ liệu và nút "Sửa" không đổi |
| `src/utils/describeStatusError.js` | Mới | `export function describeStatusError(error)` theo D10, JSDoc một dòng; hai câu thông báo là hằng trong file |
| `src/main.js` | Sửa | Import `updateCustomerStatus` và `describeStatusError`; thêm listener `click` của D11. `refresh()` và bốn listener hiện có không đổi |
| `test/customerApi.test.js` | Sửa | Thêm test `updateCustomerStatus` (AC-7, AC-8) bằng `fakeFetch` có sẵn. Test cũ không sửa |
| `test/customerTable.test.js` | Sửa | **Sửa TC-74** đúng hai regex nêu ở D9. Thêm test cho nút đổi trạng thái (AC-9). Các test khác không sửa |
| `test/describeStatusError.test.js` | Mới | Test `describeStatusError` theo bảng dữ liệu (AC-10) |

- `index.html` không đổi: `#message` và `#customers` đã có, và D9 không cần CSS mới.
- `main.js` không có seam unit test vì `node:test` không có DOM. Listener của D11 được kiểm bằng review hoặc chạy tay (Q7): bấm "Ngừng hoạt động" thì dòng đổi nhãn và nút; kích hoạt lại một khách hàng bị trùng số thì `#message` hiện câu của D10 và dòng không đổi.
- Gợi ý nhóm task, độc lập với BE về biên dịch. Sau mỗi task orchestrator chạy toàn bộ `fe_test`:
  - **FE-1** (2 file): `customerApi.js`, `customerApi.test.js`.
  - **FE-2** (2 file): `customerTable.js`, `customerTable.test.js`. TC-74 phải sửa **trong chính task này**, nếu không `fe_test` fail.
  - **FE-3** (3 file, phụ thuộc FE-1 và FE-2): `describeStatusError.js`, `describeStatusError.test.js`, `main.js`. `main.js` đi cùng nhóm có test vì bản thân nó không có TC nào.

## Migration
Không có script migration, vì không có DB.

- **Thứ tự deploy: BE trước, FE sau.**
  - FE mới gọi BE cũ: `PUT /api/customers/{id}/status` rơi vào fallback 404. Nhân viên thấy "Không đổi được trạng thái khách hàng."; không có dữ liệu nào bị ghi sai.
  - FE cũ gọi BE mới: vô hại, FE cũ không gọi endpoint mới.
- **Rollback:** gỡ FE trước rồi mới gỡ BE. Dữ liệu in-memory mất khi restart, nên trạng thái đã đổi không cần đưa về như cũ.
- **Dữ liệu legacy:** không đọc hay ghi `source-legacy`. Khi dữ liệu `customers` được migrate (chưa có kế hoạch, `aiws/knowledge/db-schema.md` → Migration), dòng `status = 0` nhập thành `INACTIVE` qua `CustomerRepository.insert` và kích hoạt lại được bằng endpoint này mà không cần xử lý riêng, kể cả khi số theo quy tắc cũ (D5).
- Sau khi merge, phase knowledge cập nhật:
  - `aiws/knowledge/api-inventory.md`: bảng endpoint, key `status` của `errors`, thứ tự xử lý của endpoint mới.
  - `aiws/knowledge/db-schema.md`: câu "không có đường nào đổi `status` sau khi `insert`", câu "Hiện chưa có delete và chưa có thao tác đổi `status`", bảng method của repository.
  - `aiws/knowledge/system-map.md`: dòng "Đổi `status`" trong Legacy → Hành vi, mô tả `CustomerService` và component bảng, luồng đổi trạng thái.
  - `aiws/knowledge/glossary.md`: dòng "Thao tác", "Đang hoạt động", "Ngừng hoạt động", BR-09, và thuật ngữ mới "Kích hoạt lại".
  - `aiws/knowledge/conventions.md`: ghi chú "HTTP test không dựng được khách hàng `INACTIVE`", bảng mã TC, hàm thuần trả text trong `src/utils/`.

## Rủi ro
- **R1: Developer đưa `updateStatus` qua `check` hoặc quên trường hợp `phone = null`.** Hệ quả: khách hàng có số theo quy tắc cũ không đổi trạng thái được, hoặc kích hoạt lại khách hàng không có số trả 500. Giảm thiểu: D5 ghi thành điểm bắt buộc; AC-1 và AC-2 có biến thể dữ liệu riêng cho cả hai ca.
- **R2: Thao tác đồng thời (Q6).** Kiểm tra trùng rồi mới ghi không nguyên tử: hai yêu cầu kích hoạt lại đồng thời cho hai khách hàng `INACTIVE` cùng số có thể cùng thành công; một `PUT /api/customers/{id}` đổi số chen giữa bước đọc và bước ghi của `updateStatus` cũng lọt kiểm tra. Chấp nhận như hiện trạng của thêm và sửa (`aiws/work/REQ-002/02-design.md` R3). D6 bảo đảm phần còn lại: thao tác ghi trạng thái không ghi đè họ tên, email, số. Khoá hay phát hiện xung đột nằm ngoài phạm vi.
- **R3: Dữ liệu trùng có sẵn không được dọn.** Nếu đã có hai khách hàng `ACTIVE` cùng số, REQ này không báo và không sửa; đặt lại `ACTIVE` cho một trong hai vẫn trả 200 (AC-4). Ngừng một người rồi kích hoạt lại thì bị chặn đúng theo BR-09.
- **R4: Ngừng hoạt động do bấm nhầm (Q5).** Không có bước xác nhận. Trong lúc khách hàng ngừng hoạt động, số của họ có thể được cấp cho khách hàng khác; khi đó không kích hoạt lại được cho tới khi sửa hoặc xoá số.
- **R5: API không có xác thực** (`aiws/knowledge/api-inventory.md` → Quy ước → Auth). Ai gọi được API thì đổi được trạng thái của mọi khách hàng. Đây là hiện trạng của `POST` và `PUT`; REQ-003 thêm một thao tác ghi nữa và không ghi lại ai đổi (ngoài phạm vi theo requirement).
- **R6: PII.** Request và URL của endpoint mới chỉ chứa `id` và trạng thái; thông điệp lỗi không chứa số điện thoại hay giá trị người dùng nhập. BE không log gì.
- **R7: XSS qua thuộc tính của nút.** `id` và trạng thái đích nằm trong `data-status-id` và `data-target-status`. Giảm thiểu: cả hai qua `escapeHtml` (escape cả `"` và `'`); AC-9 có biến thể kiểm tra. Câu thông báo lỗi là hằng và được gán bằng `textContent`.
- **R8: Sửa test của REQ-002 (TC-74).** Thay đổi có chủ ý, giới hạn ở hai regex (D9), và phải làm trong cùng task với `customerTable.js`.
- **R9: Nhãn nút "Ngừng hoạt động" trùng chữ với nhãn trạng thái `INACTIVE`.** Một dòng `ACTIVE` hiện ô "Đang hoạt động" cạnh nút "Ngừng hoạt động". Giảm thiểu: nút nằm trong cột "Thao tác" và có dạng nút bấm; người duyệt có thể chọn nhãn ngắn hơn (xem "Quyết định cần duyệt").
- **R10: Ô "Thao tác" rộng hơn.** Hai nút trong một ô có thể xuống dòng trong bảng `max-width: 760px` của `index.html`. Chỉ ảnh hưởng trình bày; không sửa CSS trong REQ này.
- **R11: Hành vi biên kế thừa từ handler hiện có, không sửa trong REQ-003** để không đổi hành vi của các endpoint cũ. Test spec không nên đặt kỳ vọng khác cho endpoint mới:
  - `id` gồm toàn chữ số nhưng vượt `long`: `Long.parseLong` ném `NumberFormatException`, nhánh `RuntimeException` của `handle` trả 500, như `GET`/`PUT /api/customers/{id}`.
  - Body là JSON `null`: `route` gọi `body.status()` ngay sau `JSON.readValue`, nên trả 500 như `POST` và `PUT` hiện có. [CẦN XÁC NHẬN] suy ra từ code, chưa có test nào kiểm chứng (`aiws/work/REQ-002/02-design.md` R10).
  - `status` là JSON không phải chuỗi (số, boolean, object, mảng): kết quả do Jackson quyết định khi đọc vào field `String`, như field `name` của hai request record hiện có. [CẦN XÁC NHẬN] thiết kế không quy định ca này; dự kiến là 400 (`errors.status` hoặc `Malformed JSON`), không có gì bị ghi.
- **R12: `main.js` không có unit test.** Giảm thiểu: logic chọn thông báo nằm trong hàm thuần (D10), trạng thái đích nằm trong HTML đã render (D9); listener của D11 chỉ nối sự kiện với API. Phần còn lại kiểm bằng review hoặc chạy tay.
- **R13: Deploy sai thứ tự.** FE mới trên BE cũ không đổi được trạng thái nhưng báo lỗi rõ, không mất dữ liệu. Xem Migration.
- **R14: Hiệu năng.** Mỗi lần kích hoạt lại thêm một lượt duyệt O(n) như các truy vấn trùng hiện có; mỗi lần đổi thành công thêm một `GET /api/customers`. Đủ cho kho in-memory.

## Quyết định cần duyệt
- **Endpoint mới `PUT /api/customers/{id}/status`**, body `{"status": "ACTIVE" | "INACTIVE"}` là trạng thái đích, trả 200 kèm `Customer` (Q1, D1). Chỉ thêm, không phá tương thích. Không có `GET` trên path này. `PUT /api/customers/{id}` vẫn không đổi trạng thái.
- **Thứ tự lỗi** (D2): JSON hỏng (400) → không có khách hàng (404) → trạng thái đích không hợp lệ (400) → đã đúng trạng thái (200) → trùng số (400). `id` không tồn tại **và** trạng thái đích không hợp lệ thì trả 404.
- **Kích hoạt lại bị từ chối vì trùng số trả 400** `Validation failed` với `errors.phone = "is already used by another customer"`, như `POST` và `PUT` (Q2, D3). Phương án thay thế là **409 Conflict**: sát ngữ nghĩa HTTP hơn nhưng thêm một exception, một dòng map và một quy ước lỗi mới; nếu chọn 409 thì AC-3, AC-8, AC-10 và D10 đổi theo.
- **Trạng thái đích chỉ nhận đúng `ACTIVE` hoặc `INACTIVE`**, không trim, không nhận chữ thường; giá trị khác trả 400 với key lỗi **mới** `errors.status = "must be ACTIVE or INACTIVE"` (D4).
- **Đổi trạng thái không kiểm tra lại họ tên, email, định dạng số** (Q3, D5). Khách hàng có số theo quy tắc cũ vẫn ngừng hoạt động và kích hoạt lại được, dù **sửa** khách hàng đó thì bị chặn (REQ-002, TC-54). Khách hàng không có số luôn kích hoạt lại được. Nếu muốn kích hoạt lại cũng chặn số không còn hợp lệ thì nói ở bước này.
- **Đặt lại đúng trạng thái đang có được xét trước kiểm tra trùng số và không ghi gì** (AC-4, D5). Hệ quả: dữ liệu `ACTIVE` trùng số có sẵn không bị báo và không được dọn (R3).
- **Giao diện** (Q4, Q5, Q7; D9..D11). [CẦN XÁC NHẬN] legacy không có màn hình đổi trạng thái để theo, nên các điểm dưới đây là đề xuất:
  - Nút nằm trong ô "Thao tác" có sẵn, sau nút "Sửa"; bảng vẫn 6 cột.
  - Nhãn nút: "Ngừng hoạt động" cho khách hàng đang hoạt động, "Kích hoạt lại" cho khách hàng ngừng hoạt động. "Ngừng hoạt động" trùng chữ với nhãn trạng thái (R9); phương án thay thế là nhãn ngắn "Ngừng".
  - Khách hàng có trạng thái ngoài hai giá trị đã biết không có nút đổi trạng thái.
  - Không hỏi xác nhận trước khi ngừng hoạt động (R4).
  - Thông báo lỗi trong `#message`: "Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng." khi trùng số; "Không đổi được trạng thái khách hàng." cho mọi lỗi khác.
  - Sau khi đổi thành công thì tải lại cả danh sách; khi thất bại thì **không** tải lại (khác đề xuất ở Q7 của analysis, lý do ở D11).
- **Sửa test TC-74 của REQ-002** trong `source-fe/test/customerTable.test.js`: hai regex khớp nguyên dòng có thêm nút đổi trạng thái trong ô "Thao tác" (D9).
- **Thêm public API Java và file mới, không đổi cấu trúc thư mục hay package** (D4..D8, D10):
  - `CustomerRepository` thêm `updateStatus`. Mọi bản cài đặt interface phải có method này; hiện chỉ có `InMemoryCustomerRepository`.
  - `CustomerService` thêm `updateStatus`.
  - File mới: `api/UpdateCustomerStatusRequest.java`, `src/utils/describeStatusError.js`, `test/describeStatusError.test.js`.
  - `src/utils/describeStatusError.js` là hàm đầu tiên trong `src/utils/` chứa câu chữ tiếng Việt cho người dùng (D10).
- **Chấp nhận thao tác đồng thời theo kiểu ghi sau thắng và kiểm tra trùng không nguyên tử** (Q6, R2).
- **Legacy** (Q8): [CẦN XÁC NHẬN] repo `source-legacy` không có code đổi trạng thái, nên R1..R4 của requirement được coi là đặc tả đầy đủ và BR-09 là quy tắc legacy duy nhất phải giữ.
- **Mã TC**: test-designer đánh số tiếp từ TC-82 (`aiws/knowledge/conventions.md` → Test → Mã TC).
- **Thứ tự deploy BE → FE**, rollback theo chiều ngược lại (Migration).
