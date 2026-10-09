# REQ-004 — Thiết kế

## Tổng quan
REQ-004 xử lý bốn finding minor mà review của REQ-003 để lại quanh nút đổi trạng thái. Nó không thêm chức năng, **không đổi API, không có DB**, và ở BE chỉ đổi code test. Thiết kế xử lý đủ AC-1..AC-4 trong `01-analysis.md` và chốt các giả định Q1..Q6. Đây là vòng thiết kế đầu tiên, chưa có feedback reject.

- **FE: chống bấm đúp (AC-1, AC-2).** Thêm một đơn vị mới `src/utils/createDoubleClickGuard.js` quyết định "xử lý hay bỏ qua lần bấm này" chỉ từ `id` khách hàng và thời điểm bấm (D1, D2). `main.js` truyền `event.timeStamp` (D3) và hỏi nó **trước** khi xoá `#message` hay gửi yêu cầu (D4). Một lần bấm tới dưới 500 ms sau lần bấm được xử lý gần nhất của **cùng** khách hàng thì bị bỏ qua.
- **FE: trạng thái lạ (AC-3).** `renderCustomerTable` tra `STATUS_ACTIONS` bằng `Object.hasOwn`, đổi đúng một dòng (D5).
- **FE test (AC-3).** Sửa TC-105 của REQ-003 cho đủ kỳ vọng của test spec; các dòng dữ liệu trùng tên thuộc tính có sẵn là test mới (D6).
- **BE test (AC-4).** TC-92 và TC-97 trong `CustomerHandlerTest` chuyển từ `@ValueSource` sang `@MethodSource` như mọi test tham số hoá khác của lớp; không file nào dưới `source-be/src/main/` đổi (D7).
- **REQ-004 đảo một quyết định đã duyệt của REQ-003**: D11 ("không vô hiệu hoá nút", `aiws/work/REQ-003/02-design.md` dòng 197) và câu "không giữ state" của plan T6 (`aiws/work/REQ-003/04-plan.yaml` dòng 219). Từ REQ này `main.js` giữ một state nhỏ: thời điểm lần bấm được xử lý gần nhất của từng khách hàng (D4).
- **Ba test có sẵn của REQ-003 bị sửa**: TC-105 (FE), TC-92 và TC-97 (BE). Cả ba giữ nguyên mã và tên hiển thị (D6, D7, D8).

Truy vết AC → thiết kế:

| AC | Phần thiết kế |
| --- | --- |
| AC-1 | D1 (quy tắc), D2 (đơn vị kiểm được bằng unit test), D3 (thời điểm bấm), D4 (kiểm guard trước khi xoá `#message`) |
| AC-2 | D1 (neo vào lần bấm được xử lý, theo từng `id`), D2, D4 (không có khoá nào phải nhả) |
| AC-3 | D5 (cách tra), D6 (TC-105 và test mới) |
| AC-4 | D7 |
| Q6 (truy vết TC) | D8 |

## Quyết định chính
- D1: **Quy tắc bỏ qua là một cửa sổ thời gian cố định 500 ms, tính riêng cho từng khách hàng, neo vào lần bấm được xử lý gần nhất** (Q1, Q2; AC-1, AC-2).
  - Ký hiệu: `at` là thời điểm của lần bấm (mili giây, D3); `last(id)` là thời điểm của lần bấm **được xử lý** gần nhất vào nút đổi trạng thái của khách hàng `id`.
    | Tình huống | Quyết định | Ghi nhận |
    | --- | --- | --- |
    | Chưa có `last(id)` | Xử lý | `last(id) = at` |
    | `at - last(id) < 500` | **Bỏ qua** | Không ghi gì: `last(id)` giữ nguyên |
    | `at - last(id) >= 500` | Xử lý | `last(id) = at` |
  - Biên: 499 ms thì bỏ qua, đúng 500 ms thì xử lý ("dưới 500 ms" của AC-1).
  - Quyết định **chỉ** phụ thuộc `(id, at)`. Nó không nhìn phần tử nút, không nhìn trạng thái đích, không biết yêu cầu của lần bấm trước đang chờ, đã thành công hay đã thất bại. Nhờ vậy một quy tắc thoả cả năm biến thể của AC-1:
    | Biến thể của AC-1 (lần bấm thứ hai tới trong khoảng bấm đúp) | Vì sao bị bỏ qua |
    | --- | --- |
    | Yêu cầu đầu chưa trả về; nút vẫn mang T | Cùng `id`, `at - last(id) < 500` |
    | Yêu cầu đã thành công, danh sách đang tải lại | Như trên |
    | Bảng đã vẽ lại; nút là phần tử mới, mang trạng thái đích ngược (F1) | Như trên: `id` lấy từ `data-status-id` của nút mới vẫn là `id` cũ; trạng thái đích không phải đầu vào |
    | Yêu cầu đầu đã thất bại; `#message` còn nguyên | Như trên; `#message` còn nguyên nhờ thứ tự ở D4 |
    | Cả hai chiều T = `INACTIVE` và T = `ACTIVE` | Quy tắc không có tham số T |
  - Trường hợp Q1 để ngỏ, lần bấm lại **sau** 500 ms khi yêu cầu đầu **chưa** trả về (mạng chậm): **được xử lý**. Bảng chưa vẽ lại nên nút vẫn mang cùng trạng thái đích T; yêu cầu lặp lại là thao tác không đổi gì ở BE (`aiws/knowledge/api-inventory.md` → `PUT /api/customers/{id}/status`, bước 5; TC-95).
  - Lý do:
    - Lần bấm gây đảo ngược luôn tới **sau** khi bảng đã vẽ lại (`01-analysis.md` → Impact → FE), tức là khi mọi khoá "đang chờ" đã nhả và nút cũ đã bị thay. Thứ duy nhất còn nối hai lần bấm là `id` khách hàng và khoảng cách thời gian.
    - Neo vào lần bấm **được xử lý** là đúng chữ của AC-1 ("khoảng thời gian ngắn sau một lần bấm được xử lý") và AC-2 ("không có lần bấm nào ... được xử lý trong khoảng bấm đúp vừa qua").
    - Theo từng `id` (Q2): nhân viên ngừng hai khách hàng liên tiếp không bị chặn (AC-2, biến thể cuối).
    - 500 ms là giả định của Q1 (khoảng bấm đúp mặc định thường gặp của hệ điều hành). [CẦN XÁC NHẬN] repo không có nguồn nào cho con số này; nó là một hằng, đổi được bằng một dòng.
    - Một cú bấm đúp thật (hai lần bấm cách nhau dưới 500 ms) luôn được chặn, bất kể mạng nhanh hay chậm: lần bấm thứ hai luôn rơi vào cửa sổ của lần đầu.
  - Đã cân nhắc:
    - Chỉ bỏ qua khi yêu cầu chưa xong (đề xuất của F1): loại, không chặn được ca "bảng đã vẽ lại" của AC-1.
    - Dùng số đếm lần bấm của trình duyệt (`event.detail >= 2`): loại. Kích hoạt nút bằng bàn phím cho `detail = 0`; hành vi của số đếm khi phần tử dưới con trỏ bị thay giữa hai lần bấm chưa được kiểm chứng [CẦN XÁC NHẬN]; ngưỡng phụ thuộc cấu hình hệ điều hành nên unit test không kiểm được "dưới 500 ms".
    - Cửa sổ trượt (mỗi lần bấm, kể cả lần bị bỏ qua, tính lại 500 ms): chặn được cả bấm ba lần liên tiếp, nhưng **trái chữ của AC-2**: lần bấm thứ ba ở ví dụ 0 / 300 / 600 ms không có lần bấm *được xử lý* nào trong 500 ms trước nó nên AC-2 đòi phải xử lý. Không chọn; xem R3 và "Quyết định cần duyệt".
    - Tính cửa sổ từ lúc bảng vẽ lại xong (giới hạn đã biết ở Q1): chặn được lần bấm sốt ruột khi mạng chậm, nhưng trái AC-2 (thao tác trước đã kết thúc và đã quá 500 ms kể từ lần bấm được xử lý mà vẫn bị bỏ qua), và cần thêm bước báo "đã vẽ lại xong" từ `main.js`. Không chọn; xem R2 và "Quyết định cần duyệt".
    - Một khoá chung cho mọi nút đổi trạng thái: loại, chặn thao tác hợp lệ trên hai khách hàng liên tiếp (Q2).
    - Chặn ở BE (gửi kèm trạng thái đang thấy để BE từ chối khi đã khác): loại, là đổi API và quy tắc đổi trạng thái (requirement → Ngoài phạm vi).
- D2: Quy tắc của D1 nằm trong **một đơn vị mới `source-fe/src/utils/createDoubleClickGuard.js`**, export đúng một hàm `createDoubleClickGuard()`. Hàm này tạo một guard có state riêng và trả về hàm `(key, at) => boolean`: `true` là "xử lý lần bấm này" (và ghi nhận nó), `false` là "bỏ qua".
  - Hình dạng:
    ```js
    const DOUBLE_CLICK_WINDOW_MS = 500;

    /** Creates a guard that rejects a click on a key arriving less than 500 ms after the last accepted click on that key. */
    export function createDoubleClickGuard() {
      const lastAcceptedAt = new Map();
      return (key, at) => {
        const last = lastAcceptedAt.get(key);
        if (last !== undefined && at - last < DOUBLE_CLICK_WINDOW_MS) return false;
        lastAcceptedAt.set(key, at);
        return true;
      };
    }
    ```
  - **Bắt buộc:**
    - State là `Map`, không phải object thường: `key` là `id` lấy từ dữ liệu, và object thường sẽ lặp lại đúng lỗi của F2 với `key = 'constructor'` hay `'__proto__'`.
    - So `last` với `undefined`, không dùng kiểm tra truthy: `0` là một thời điểm hợp lệ.
    - Chỉ ghi `lastAcceptedAt` khi trả `true` (D1: lần bấm bị bỏ qua không dời mốc).
    - Hai lần gọi `createDoubleClickGuard()` cho hai guard không chung state.
    - File không import gì, không đọc đồng hồ, không đụng DOM; thời điểm là tham số nên test không phải chờ thật.
    - Tên hàm bên trong, tên biến và lời JSDoc là gợi ý; tên file, tên export, chữ ký `(key, at) => boolean` và hằng 500 ms là cố định.
  - Hành vi để test-designer viết TC. **Mỗi dòng là một kịch bản riêng trên một guard mới**; các lời gọi trong một dòng chạy nối tiếp trên cùng guard đó:
    | Kịch bản (lời gọi theo thứ tự) | Kết quả từng lời gọi |
    | --- | --- |
    | `('1', 1000)` | `true` (lần gọi đầu tiên của một `key`) |
    | `('1', 0)`, `('1', 499)` | `true`, `false` (`0` là một mốc hợp lệ) |
    | `('1', 1000)`, `('1', 1000 + d)` với `d` = 0, 1, 499, 499.9 (mỗi `d` một guard mới) | `true`, `false` |
    | `('1', 1000)`, `('1', 1000 + d)` với `d` = 500, 501, 100000 (mỗi `d` một guard mới) | `true`, `true` |
    | `('1', 1000)`, `('1', 1300)`, `('1', 1500)` | `true`, `false`, `true` (1500 − 1000 = 500; lần bị bỏ qua ở 1300 không dời mốc) |
    | `('1', 1000)`, `('1', 1500)`, `('1', 1999)`, `('1', 2000)` | `true`, `true`, `false`, `true` (lần được xử lý ở 1500 dời mốc) |
    | `('1', 1000)`, `('2', 1001)`, `('1', 1002)`, `('2', 1003)` | `true`, `true`, `false`, `false` (từng `key` độc lập) |
    | `(k, 1000)`, `(k, 1001)` với `k` = `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'` (mỗi `k` một guard mới) | `true`, `false` (như mọi `key` khác) |
    | Guard A: `('1', 1000)`; guard B (tạo bằng lời gọi `createDoubleClickGuard()` khác): `('1', 1001)` | A `true`; B `true` (hai guard không chung state) |
  - Không quy định, test spec không nên đặt kỳ vọng: `at` nhỏ hơn mốc (nguồn thời gian của D3 không lùi); `at` không phải số; `key` khác kiểu nhưng cùng chữ (`7` và `'7'` là hai key của `Map`; `main.js` luôn truyền chuỗi từ `dataset`).
  - Lý do:
    - `main.js` không có seam unit test (`aiws/knowledge/conventions.md` → Test → FE). Đưa quyết định ra `src/utils/` thì AC-1 và AC-2 kiểm được bằng `node:test`, theo convention "logic nằm trong hàm thuần, `main.js` chỉ nối sự kiện" và theo cách REQ-003 tách `describeStatusError`.
    - Việc "theo từng `id`" và "chỉ lần được xử lý mới dời mốc" phải nằm **trong** đơn vị được test; nếu `Map` nằm ở `main.js` thì hai biến thể "cùng khách hàng" và "khách hàng khác" không kiểm được.
    - Một lời gọi vừa quyết định vừa ghi nhận: `main.js` không thể quên bước ghi, và không có bước "nhả" nào để quên.
    - Factory thay vì state ở mức module: mỗi test có guard riêng, các test không phụ thuộc thứ tự chạy.
    - Tên file trùng tên export, bắt đầu bằng động từ, hằng `UPPER_SNAKE_CASE`, JSDoc một dòng tiếng Anh, không import: như `escapeHtml.js`, `formatPhone.js`, `describeStatusError.js`.
  - Đã cân nhắc:
    - Hàm thuần `(last, at) => boolean`, còn `Map` và việc ghi nằm ở `main.js`: loại, lý do ở trên.
    - Hàm export thẳng với `Map` ở mức module (không factory): loại, state dính giữa các test trong cùng file.
    - `class`: loại. FE chỉ có một class là `ApiError`; closure đủ dùng.
    - Tham số `windowMs` cho factory: loại. Chỉ có một nơi dùng, và test sẽ kiểm ngưỡng do chính nó truyền vào thay vì ngưỡng đang chạy thật.
    - Tiêm đồng hồ vào factory (`{ now = () => performance.now() }`, kiểu `fetchImpl`): loại. Không dùng được thời điểm của chính sự kiện (D3), và giấu một phụ thuộc global sau giá trị mặc định.
    - Đặt ở `src/components/` hoặc thư mục mới (`src/state/`): loại. Không phải hàm `render...`, và thêm thư mục là đổi cấu trúc mà không cần.
- D3: Thời điểm của lần bấm là **`event.timeStamp`** của sự kiện `click`, do `main.js` truyền vào guard.
  - Lý do:
    - Đó là thời điểm lần bấm xảy ra, không phải lúc handler được chạy; khoảng cách giữa hai giá trị là khoảng cách thật giữa hai lần bấm, kể cả khi trang đang bận.
    - Là đồng hồ đơn điệu tính bằng mili giây (DOM Standard: `DOMHighResTimeStamp`), không nhảy khi đồng hồ hệ thống bị chỉnh. Guard chỉ dùng hiệu của hai giá trị nên gốc thời gian không quan trọng.
    - Có sẵn trên đối tượng `event` mà listener đã nhận; `main.js` không cần thêm lời gọi global nào.
  - Đã cân nhắc:
    - `Date.now()`: loại. Đồng hồ hệ thống bị chỉnh lùi sẽ làm `at - last` âm, và nút của khách hàng đó bị bỏ qua cho tới khi đồng hồ đuổi kịp.
    - `performance.now()` đọc lúc handler chạy: cũng đơn điệu và dùng được. Không chọn vì đo lúc handler chạy chứ không phải lúc bấm. Đây là phương án dự phòng nếu chạy tay cho thấy `event.timeStamp` có vấn đề trên trình duyệt đích (R5): chỉ đổi một biểu thức ở `main.js`, guard và test của nó không đổi.
- D4: `source-fe/src/main.js` tạo **một** guard cho nút đổi trạng thái và hỏi nó ngay sau khi nhận ra nút, **trước** khi xoá `#message`. Không thêm khoá "đang chờ", không vô hiệu hoá nút, không đổi gì khác trong listener (AC-1, AC-2).
  - Hình dạng (ba dòng mới: một `import`, một `const`, một `if`):
    ```js
    import { createDoubleClickGuard } from './utils/createDoubleClickGuard.js';
    // ...
    const acceptStatusClick = createDoubleClickGuard();
    // ...
    listEl.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-status-id]');
      if (!button) return;
      if (!acceptStatusClick(button.dataset.statusId, event.timeStamp)) return;
      messageEl.textContent = '';
      try {
        await updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus);
        await refresh();
      } catch (error) {
        messageEl.textContent = describeStatusError(error);
      }
    });
    ```
  - **Bắt buộc:**
    - Dòng `if (!acceptStatusClick(...)) return;` đứng **trước** `messageEl.textContent = ''`. Lần bấm bị bỏ qua không được đổi gì trên màn hình; nếu đảo thứ tự thì câu báo lỗi của lần bấm đầu bị xoá (AC-1, biến thể "đã thất bại").
    - Key là `button.dataset.statusId` (chuỗi), không phải phần tử nút hay trạng thái đích.
    - Guard được tạo **một lần** ở mức module (cạnh `listEl`, `messageEl`), không tạo trong listener và không tạo lại trong `refresh()`.
    - Không gọi guard ở `catch` hay `finally`: mốc không bị xoá khi yêu cầu thất bại (AC-1), và sau 500 ms nút tự dùng lại được mà không cần ai nhả (AC-2, biến thể "đã thất bại").
    - Không đổi: `refresh()`, listener của nút "Sửa", hai listener trên `#edit-customer`, submit của `#create-form`, cách báo lỗi (`describeStatusError`), và việc thất bại thì không tải lại danh sách.
  - **Đảo quyết định của REQ-003.** D11 của REQ-003 loại việc chặn lần bấm lặp vì "request lặp lại là thao tác không đổi gì (D1)" (`aiws/work/REQ-003/02-design.md` dòng 197); plan T6 chép lại thành "không vô hiệu hoá nút, không giữ state" (`aiws/work/REQ-003/04-plan.yaml` dòng 219). Lập luận đó chỉ đúng khi lần bấm thứ hai tới trước khi bảng vẽ lại. REQ-004 giữ nửa "không vô hiệu hoá nút" và bỏ nửa "không giữ state": `main.js` giữ một `Map` trong guard, mỗi khách hàng đã bấm một mục, mất khi tải lại trang.
  - Lý do:
    - Thay đổi nhỏ nhất ở file không có unit test: một lời gọi, không có nhánh mới ngoài `return`.
    - Không có khoá phải nhả nên không có đường nào làm nút bị khoá vĩnh viễn (AC-2: "nút không bị khoá sau lỗi").
    - Lần bấm trong lúc chờ nhưng đã quá 500 ms mang cùng trạng thái đích nên vô hại (D1); chặn nó không đổi kết quả nào ở BE.
  - Đã cân nhắc:
    - Thêm khoá "đang có yêu cầu cho `id` này" bên cạnh cửa sổ thời gian: loại. Không chặn thêm ca đảo ngược nào (lần bấm trong lúc chờ mang cùng trạng thái đích); đổi lại cần một bước nhả trong `finally` ở `main.js`, và quên bước đó là nút bị khoá mãi mà không test nào bắt được.
    - Đặt `disabled` lên nút: loại. Nút bị thay sau mỗi `refresh()` nên thuộc tính mất đúng lúc cần; và đổi cách nút hiển thị nằm ngoài phạm vi (`01-analysis.md` → Ngoài phạm vi).
    - Tách cả listener thành một hàm nhận phụ thuộc (`updateCustomerStatus`, `refresh`, `messageEl`) để unit test được phần nối: loại. Là một mẫu mới cho `main.js`, lớn hơn bốn finding minor của REQ này.
    - Gộp guard vào listener của nút "Sửa" hoặc áp cho form thêm/sửa: loại, ngoài phạm vi.
- D5: `renderCustomerTable` tra hằng `STATUS_ACTIONS` bằng **`Object.hasOwn`**; chỉ dòng 16 của `source-fe/src/components/customerTable.js` đổi (AC-3; F2).
  - Hình dạng:
    ```js
    const action = Object.hasOwn(STATUS_ACTIONS, c.status) ? STATUS_ACTIONS[c.status] : null;
    ```
  - Kết quả theo `status`:
    | `status` | `Object.hasOwn(STATUS_ACTIONS, status)` | Ô "Thao tác" |
    | --- | --- | --- |
    | `'ACTIVE'`, `'INACTIVE'` | `true` | Như hiện nay: nút "Sửa", một dấu cách, nút đổi trạng thái |
    | `'DELETED'`, `'active'`, `''`, `null`, thiếu key (`undefined`) | `false` | `<td><button type="button" data-edit-id="{id}">Sửa</button></td>` |
    | `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'` | `false` (thuộc tính kế thừa, không phải của riêng `STATUS_ACTIONS`) | Như dòng trên; **hiện nay** các giá trị này cho một nút `data-target-status=""` nhãn `undefined` |
  - Không đổi: hằng `STATUS_ACTIONS` (dòng 5–8), biểu thức dựng nút (dòng 17–19), `<thead>`, năm ô dữ liệu, nút "Sửa". HTML của dòng `ACTIVE`/`INACTIVE` giữ nguyên từng ký tự, nên TC-36, TC-74, TC-103, TC-104 không phải sửa.
  - **Dòng 23 (`STATUS_LABELS[c.status] ?? c.status`) không đổi** (Q3): nội dung ô "Trạng thái" của các dòng có trạng thái trùng tên thuộc tính có sẵn nằm ngoài phạm vi theo `01-analysis.md`. Test của REQ-004 không đặt kỳ vọng cho nội dung ô đó. Xem R7 và "Quyết định cần duyệt".
  - Lý do:
    - Sửa đúng nguyên nhân (tra cả thuộc tính kế thừa của `Object.prototype`) ngay tại chỗ tra; là đề xuất của F2.
    - `Object.hasOwn` đổi key sang chuỗi như phép tra `[...]`, nên `null`, `undefined` và giá trị không phải chuỗi cho `false` mà không cần nhánh riêng.
  - Đã cân nhắc:
    - Đổi `STATUS_ACTIONS` thành `Map` hoặc object không có prototype (`Object.create(null)`): loại. Đổi hình dạng của hằng trong khi chỉ cần đổi cách tra (`01-analysis.md` → Reuse).
    - So thẳng `c.status === 'ACTIVE' || c.status === 'INACTIVE'`: loại, lặp lại danh sách trạng thái đã có trong hằng.
    - `Object.prototype.hasOwnProperty.call(STATUS_ACTIONS, c.status)`: cùng hành vi, chạy được trên trình duyệt cũ hơn. Không chọn vì dài hơn và `Object.hasOwn` là cách viết chuẩn hiện nay (ES2022); là phương án dự phòng của R6.
- D6: **Sửa TC-105** trong `source-fe/test/customerTable.test.js` cho đủ kỳ vọng của `aiws/work/REQ-003/03-test-spec.md` (dòng 562–569), và **thêm test mới** cho các trạng thái trùng tên thuộc tính có sẵn (AC-3; F3).
  - TC-105, đúng hai thay đổi:
    - Dòng dữ liệu "thiếu field `status`" là một object **không có key `status`** (vd. `{ id: 1, name: 'A', email: 'a@example.com', phone: null }`, như dòng thứ ba của TC-39), thay cho `status: undefined` hiện nay. Bảng dữ liệu vì thế là danh sách khách hàng chứ không còn là danh sách giá trị `status` trộn vào `{ ..., status }`. Vẫn năm dòng, đúng thứ tự của test spec: `'DELETED'`, `'active'`, `''`, `null`, thiếu key.
    - Thêm assertion "dòng có đúng 6 `<td>`" theo cách đếm của TC-36, TC-74, TC-103 (`html.match(/<td>/g).length`).
    - Giữ nguyên: mã, tên hiển thị, vị trí trong file, năm assertion đang có, kiểu "một mảng, lặp `for...of` trong một `test(...)`".
  - Test mới (mã do test-designer cấp, D8), cùng file, đặt liền sau TC-105: `status` là `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'`. Kỳ vọng của AC-3 cho từng dòng: ô "Thao tác" kết thúc dòng đúng bằng `<td><button type="button" data-edit-id="1">Sửa</button></td></tr>`; không có `data-status-id`, `data-target-status`, "Kích hoạt lại", nút nhãn `undefined`; `<button ` đúng một lần; đúng 6 `<td>`. Không assertion nào nhìn vào nội dung ô "Trạng thái" (D5).
  - Test mới **fail trên code hiện tại** và pass sau D5; phần sửa TC-105 pass cả trước lẫn sau D5. Cả hai nằm cùng task với `customerTable.js`.
  - Không sửa và phải pass: TC-36, TC-74, TC-103, TC-104 và mọi test khác của file.
  - Lý do: hai thiếu sót của TC-105 là đúng nội dung F3; các dòng trùng tên thuộc tính là kỳ vọng **mới** (test spec của REQ-003 cố ý không đặt, `03-test-spec.md` dòng 91) nên không nhét vào TC-105.
  - Đã cân nhắc: thêm năm dòng trùng tên thuộc tính vào TC-105 (đề xuất của F2): loại. Mã TC-105 đã có sẵn trong file nên phép kiểm "mã TC có mặt" của orchestrator pass kể cả khi các dòng đó chưa được viết (Q6).
- D7: Trong `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`, **TC-92 và TC-97 chuyển từ `@ValueSource` sang `@MethodSource`**; import `ValueSource` (dòng 27) bị xoá. Không gì khác trong file đổi (AC-4; F4).
  - TC-92 (dòng 475–478): thay `@ValueSource(longs = {1, 2})` bằng `@MethodSource("reactivatedCustomerIds")`; thêm provider ngay sau test:
    ```java
    private static Stream<Long> reactivatedCustomerIds() {
      return Stream.of(1L, 2L);
    }
    ```
  - TC-97 (dòng 618–631): thay `@ValueSource(strings = {...})` bằng `@MethodSource("invalidTargetStatusBodies")`; thêm provider ngay sau test, `private static Stream<String>`, trả `Stream.of(...)` với **đúng 8 chuỗi hiện có, đúng thứ tự**: `{}`, `{"state":"INACTIVE"}`, `{"status":null}`, `{"status":""}`, `{"status":"DELETED"}`, `{"status":"active"}`, `{"status":"inactive"}`, `{"status":" INACTIVE "}`.
  - **Bắt buộc:**
    - Thứ tự annotation như các test khác của lớp: `@ParameterizedTest(name = "[{index}]")`, `@MethodSource(...)`, `@DisplayName(...)`.
    - Giữ nguyên từng ký tự: `@DisplayName`, tên method, chữ ký (`long id`, `String body`) và thân của hai test.
    - Literal của TC-92 là `1L`, `2L` (kiểu `Long`), để trình biên dịch kiểm kiểu phần tử.
    - Tên provider là gợi ý, miễn không trùng 13 provider đang có của lớp.
    - Không sửa: TC-98 (Q4), mọi test khác, helper, `@BeforeEach`/`@AfterEach`; không file nào dưới `source-be/src/main/`; không sửa `CustomerServiceTest` (TC-86) và `InMemoryCustomerRepositoryTest` (TC-83) (Q5).
  - Kết quả phải giữ: `CustomerHandlerTest` 68 lần chạy, toàn bộ BE 311, đều pass (mốc: `aiws/work/REQ-003/evidence/test-results/T3-attempt-1.yaml`). TC-92 vẫn 2 lần chạy (`id` = 1 rồi 2), TC-97 vẫn 8; tên từng lần chạy vẫn là `[1]`, `[2]`... vì `name = "[{index}]"` không đổi.
  - Lý do:
    - Mọi test tham số hoá khác của lớp dùng `@MethodSource` với provider `private static` đặt ngay sau test; plan T3 của REQ-003 yêu cầu đúng kiểu này (`aiws/work/REQ-003/04-plan.yaml` dòng 128–130).
    - `Stream<String>` cho TC-97 là kiểu của mọi bảng một cột trong lớp (`bodiesWithoutPhone`, `malformedUpdateRequests`, `malformedStatusPaths`).
    - `Stream<Long>` cho TC-92: lớp chưa có provider một cột nào không phải `String`; quy ước của dự án là provider một tham số trả `Stream` của chính kiểu tham số (`Stream<String>`, và `Stream<CustomerStatus>` ở `CustomerServiceTest.java` dòng 417; `aiws/knowledge/conventions.md` → Test → BE). JUnit tự chuyển `Long` sang tham số `long`. Không cần import mới: `Stream` đã có ở dòng 19.
  - Đã cân nhắc:
    - `Stream<Arguments>` với `Arguments.of(1L)` cho bảng một cột (đúng chữ "`Arguments.of(...)`" của plan T3): loại. Khác kiểu với năm provider một cột đang có của chính lớp này.
    - `LongStream.of(1, 2)`: loại. Cần import mới và chưa có tiền lệ trong dự án.
    - Đổi cả TC-98 sang `Stream<Arguments>` (F4 có nêu): loại. TC-98 đã cùng kiểu với TC-68, TC-27, TC-62, TC-67; đổi nó là tạo ra lệch kiểu mới (Q4).
    - Giữ `@ValueSource` và ghi nó thành kiểu được phép của lớp: loại, trái R4.
- D8: **Mã TC và truy vết** (Q6). Test có sẵn bị sửa giữ nguyên mã và tên hiển thị; mọi kỳ vọng mới mang mã mới, đánh số tiếp từ **TC-108** (`aiws/knowledge/conventions.md` → Test → Mã TC). Số cụ thể do test-designer cấp.
  | AC | Test | Mã |
  | --- | --- | --- |
  | AC-1, AC-2 | Test mới trong `source-fe/test/createDoubleClickGuard.test.js` (file mới) | Mới, từ TC-108 |
  | AC-3 | Test mới cho trạng thái trùng tên thuộc tính có sẵn, trong `source-fe/test/customerTable.test.js` | Mới, từ TC-108 |
  | AC-3 | TC-105 (sửa, D6) | Giữ TC-105 |
  | AC-4 | TC-92, TC-97 (sửa, D7) | Giữ TC-92, TC-97 |
  - AC-4 **không thể** có mã mới: mã TC nằm trong `@DisplayName`, mà AC-4(b) đòi tên hiển thị giữ nguyên. Đề xuất cho test-designer: test spec của REQ-004 ghi lại TC-92 và TC-97 như "TC bị sửa" để thoả `every_ac_has_tc`.
  - Lý do: như TC-36 ở REQ-002 và TC-74 ở REQ-003, truy vết của REQ trước vẫn đúng khi test giữ mã; kỳ vọng mới mang mã mới thì phép kiểm "mã TC có mặt trong file test" của orchestrator mới có nghĩa.
  - Đã cân nhắc: cấp mã mới cho TC-105 sau khi sửa: loại, làm đứt truy vết AC-9 → TC-105 của REQ-003.

## API
**Không đổi.** Không endpoint nào mới hay đổi path, method, schema, mã trạng thái, format lỗi. `aiws/work/REQ-004/api-contract.yaml` vì thế có `paths: {}`.

- FE vẫn gọi nguyên `PUT /api/customers/{id}/status` qua `updateCustomerStatus` (`source-fe/src/api/customerApi.js` dòng 44–46, không sửa), theo contract `aiws/work/REQ-003/api-contract.yaml`.
- Thay đổi duy nhất nhìn thấy được ở phía mạng: một cú bấm đúp gửi **một** `PUT` (và một `GET /api/customers` sau đó) thay vì hai. Lần bấm bị bỏ qua không gửi yêu cầu nào.
- REQ-004 vẫn dựa vào tính idempotent của endpoint (`aiws/knowledge/api-inventory.md`, bước 5 của thứ tự xử lý) cho lần bấm lặp lại sau 500 ms trong lúc chờ (D1).

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`); kho in-memory và record `Customer` không đổi.

## BE change
Thư mục gốc: `source-be/`. **Chỉ code test; không file nào dưới `source-be/src/main/` đổi.**

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | TC-92 và TC-97 sang `@MethodSource` + provider `private static` ngay sau test; xoá import `org.junit.jupiter.params.provider.ValueSource` (D7) |

- Sau thay đổi, file không còn chữ `ValueSource` nào. Đây là phần (a) của AC-4, kiểm bằng review diff.
- Phần (b) của AC-4 kiểm bằng `be_test`: 311 lần chạy, `CustomerHandlerTest` 68, đều pass.
- **Nhóm task BE-1** (1 file, độc lập với FE): `CustomerHandlerTest.java`. Mã TC của task: TC-92, TC-97.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/utils/createDoubleClickGuard.js` | Mới | `export function createDoubleClickGuard()` theo D2; hằng `DOUBLE_CLICK_WINDOW_MS = 500`; JSDoc một dòng; không import |
| `test/createDoubleClickGuard.test.js` | Mới | Test guard theo bảng hành vi của D2 (`node:test` + `node:assert/strict`; mỗi test tự tạo guard; bảng dữ liệu là một mảng lặp `for...of`) |
| `src/main.js` | Sửa | Import `createDoubleClickGuard`; tạo `acceptStatusClick` một lần ở mức module; thêm một dòng `if (!acceptStatusClick(...)) return;` vào listener của nút đổi trạng thái, trước `messageEl.textContent = ''` (D4). Mọi thứ khác không đổi |
| `src/components/customerTable.js` | Sửa | Dòng 16: tra bằng `Object.hasOwn` (D5). Mọi dòng khác không đổi |
| `test/customerTable.test.js` | Sửa | **Sửa TC-105** đúng hai điểm của D6; thêm test mới cho trạng thái trùng tên thuộc tính có sẵn. Các test khác không sửa |

- Không đổi: `index.html`, `src/api/customerApi.js`, `src/utils/describeStatusError.js`, `src/utils/escapeHtml.js`, `src/utils/formatPhone.js`, `src/components/customerEditForm.js`, `scripts/build.mjs` (tự quét `src/**/*.js`), `package.json` (`node --test` tự tìm `test/*.test.js`).
- Mốc: FE hiện 36 test, đều pass (`aiws/work/REQ-003/evidence/test-results/T6-attempt-1.yaml`); sau REQ-004 là 36 cộng số test mới.
- Gợi ý nhóm task, độc lập với nhau và với BE. Sau mỗi task orchestrator chạy toàn bộ `fe_test`:
  - **FE-1** (2 file): `customerTable.js`, `customerTable.test.js`. Test mới của D6 fail cho tới khi D5 có mặt, nên hai file đi cùng nhau. Mã TC của task: TC-105 và mã mới của test trạng thái trùng tên thuộc tính có sẵn.
  - **FE-2** (3 file): `createDoubleClickGuard.js`, `createDoubleClickGuard.test.js`, `main.js`. `main.js` đi cùng nhóm có test vì bản thân nó không có TC nào. Mã TC của task: các mã mới của test guard.
- **Phần không có TC tự động**: việc nối guard vào sự kiện `click` nằm trong `main.js`, `node:test` không có DOM. Kiểm bằng review (thứ tự các dòng ở D4) và chạy tay với BE local, mở tab Network:
  1. Bấm đúp nhanh "Ngừng hoạt động" ở một dòng đang hoạt động: dòng đó thành "Ngừng hoạt động" với nút "Kích hoạt lại" và **giữ nguyên như vậy**; có đúng một `PUT .../status` (body `INACTIVE`) và một `GET /api/customers`.
  2. Bấm đúp nhanh "Kích hoạt lại" ở một dòng ngừng hoạt động: dòng đó thành "Đang hoạt động" và giữ nguyên; đúng một `PUT` (body `ACTIVE`).
  3. Bấm đúp "Kích hoạt lại" ở một khách hàng bị trùng số: `#message` hiện câu báo trùng số và **còn nguyên** sau lần bấm thứ hai; đúng một `PUT`.
  4. Ngừng một khách hàng, chờ hơn nửa giây, bấm "Kích hoạt lại": được xử lý (một `PUT` body `ACTIVE`).
  5. Bấm "Ngừng hoạt động" ở dòng A rồi ngay sau đó ở dòng B: cả hai đổi trạng thái (hai `PUT`).
  6. Tắt BE, bấm nút: `#message` hiện "Không đổi được trạng thái khách hàng."; bật lại BE, chờ hơn nửa giây, bấm lại: được xử lý.
  7. Nút "Sửa" và form sửa hoạt động như trước.
  - Bước 1 và 2 cũng là lần đầu tái hiện F1 bằng chạy tay: nên thử trên bản trước REQ-004 để thấy thao tác bị đảo ngược. [CẦN XÁC NHẬN] cả review của REQ-003 lẫn `01-analysis.md` mới suy ra lỗi này từ đọc code.

## Migration
Không có script migration, vì không có DB và không đổi API.

- **Deploy:** chỉ FE (file tĩnh). BE không có thay đổi lúc chạy (chỉ code test) nên không cần deploy lại, và không có ràng buộc thứ tự FE/BE.
- **Rollback:** đưa lại bản FE trước. Không có dữ liệu nào phải đưa về như cũ; state của guard chỉ nằm trong bộ nhớ của trang.
- **Dữ liệu legacy:** không đọc hay ghi `source-legacy`. `source-legacy` không có code nào đổi cột `status` (`aiws/knowledge/system-map.md` → Legacy → Hành vi, dòng "Đổi `status`"), nên không có hành vi legacy nào về nút này phải giữ.
- Sau khi merge, phase knowledge cập nhật:
  - `aiws/knowledge/system-map.md`: dòng "FE: entry", dòng "FE: tiện ích" (thêm `createDoubleClickGuard.js`), dòng "FE: component bảng" (tra bằng `Object.hasOwn`), luồng 6 (lần bấm lặp trong 500 ms bị bỏ qua trước khi xoá `#message`).
  - `aiws/knowledge/conventions.md`:
    - Frontend → cấu trúc thư mục và State/Sự kiện: `src/utils/` có một factory giữ state; `main.js` giữ state của guard.
    - Test → BE: `CustomerHandlerTest` không dùng `@ValueSource`; provider một cột kiểu `Stream<Long>`.
    - Test → Mã TC: ghi chú TC-105, TC-92, TC-97 bị sửa ở REQ-004 và bảng mã TC của REQ-004.

## Rủi ro
- **R1: Phần nối trong `main.js` không có unit test.** Guard đúng nhưng nối sai (đặt sau dòng xoá `#message`, tạo guard trong listener, dùng sai key) thì AC-1 vẫn hỏng mà `fe_test` vẫn pass. Giảm thiểu: D4 ghi thứ tự thành điểm bắt buộc kèm đoạn mã mẫu; thay đổi chỉ là ba dòng; bảy bước chạy tay ở mục FE change.
- **R2: Mạng chậm, bấm lại vì sốt ruột.** Một lần bấm tới sau 500 ms **và** sau khi bảng đã vẽ lại được coi là thao tác chủ động (AC-2) và sẽ đảo trạng thái. Đây là giới hạn đã biết ở Q1; requirement chỉ nói bấm đúp. Muốn chặn cả ca này thì cửa sổ phải tính từ lúc bảng vẽ lại, và AC-2 phải đổi (xem "Quyết định cần duyệt").
- **R3: Bấm ba lần liên tiếp.** Ba lần bấm ở 0 / 300 / 600 ms: lần hai bị bỏ qua, lần ba được xử lý vì đã cách lần đầu 600 ms, và đảo trạng thái nếu bảng đã vẽ lại. AC-1 và AC-2 cho phép điều này; cửa sổ trượt chặn được nhưng trái chữ của AC-2 (D1).
- **R4: Lần bấm bị bỏ qua không có phản hồi nào.** Không có trạng thái "đang xử lý" (ngoài phạm vi). Một lần bấm chủ động trong vòng 500 ms sau lần trước trên cùng khách hàng bị bỏ qua im lặng; nhân viên bấm lại là được.
- **R5: `event.timeStamp` chưa được chạy thử trên trình duyệt đích.** [CẦN XÁC NHẬN] repo không khai báo trình duyệt hỗ trợ. Nếu một môi trường trả giá trị không tăng thì sau lần bấm đầu, nút của khách hàng đó bị bỏ qua mãi; nếu trả giá trị không phải số thì guard không chặn gì (như hiện nay). Giảm thiểu: bước chạy tay 1, 2 và 4; phương án dự phòng `performance.now()` chỉ đổi một biểu thức (D3).
- **R6: `Object.hasOwn` là ES2022.** Trên trình duyệt không có hàm này, `renderCustomerTable` ném lỗi và `refresh()` hiện "Không tải được danh sách khách hàng." cho mọi danh sách. [CẦN XÁC NHẬN] repo không khai báo trình duyệt hỗ trợ; FE hiện đã cần ES modules và `?.`/`??` (ES2020). Node ≥ 22 của build và test có sẵn hàm này (`source-fe/package.json` → `engines`). Phương án dự phòng: `Object.prototype.hasOwnProperty.call(STATUS_ACTIONS, c.status)`, cùng hành vi, cùng test.
- **R7: Ô "Trạng thái" của trạng thái trùng tên thuộc tính có sẵn vẫn sai** (Q3). Sau REQ-004, dòng có `status = 'constructor'` không còn nút đổi trạng thái nhưng ô "Trạng thái" vẫn hiện chuỗi của hàm `Object` thay vì `constructor`, vì dòng 23 tra `STATUS_LABELS` theo kiểu cũ. Nội dung vẫn qua `escapeHtml`, và API chỉ trả `ACTIVE`/`INACTIVE`. [CẦN XÁC NHẬN] suy ra từ đọc code. Người duyệt có thể gộp phần sửa này vào (xem "Quyết định cần duyệt").
- **R8: Sửa test của REQ trước** (TC-105, TC-92, TC-97). Thay đổi có chủ ý và giới hạn: TC-105 đúng hai điểm (D6); TC-92 và TC-97 chỉ đổi nguồn dữ liệu (D7). Mã và tên hiển thị giữ nguyên.
- **R9: AC-4 không tạo hành vi quan sát mới.** Phần "đúng kiểu của lớp" chỉ kiểm được bằng review diff; phần "không đổi hành vi" kiểm bằng số lần chạy (68 / 311). Phép kiểm "mã TC có mặt trong file test" của orchestrator pass sẵn với TC-92, TC-97, TC-105 nhờ tên test cũ, kể cả khi chưa sửa gì; reviewer phải đọc diff của ba test này.
- **R10: Developer đổi thứ tự hoặc sót dòng dữ liệu của TC-97.** Số lần chạy vẫn là 8 nếu chỉ đổi thứ tự. Giảm thiểu: D7 liệt kê đủ 8 chuỗi theo thứ tự; reviewer so với bảng dữ liệu gốc của TC-97 trong `aiws/work/REQ-003/03-test-spec.md`.
- **R11: State phía client.** `Map` của guard có tối đa một mục cho mỗi khách hàng đã bấm, mất khi tải lại trang; không lưu PII (chỉ `id` và một mốc thời gian). `id` chỉ được dùng làm key của `Map`, không làm tên thuộc tính của object.
- **R12: Hai tab hoặc hai nhân viên.** Guard chỉ biết các lần bấm trên cùng một trang. Hai người cùng đổi trạng thái một khách hàng vẫn là "yêu cầu ghi sau thắng" (`aiws/work/REQ-003/02-design.md` R2), ngoài phạm vi.

## Quyết định cần duyệt
- **Đảo quyết định D11 của REQ-003**: lần bấm lặp vào nút đổi trạng thái nay bị chặn, và `main.js` giữ state phía client lần đầu tiên (một `Map` `id` → thời điểm, trong guard) (D4). Vẫn không vô hiệu hoá nút, không có trạng thái "đang xử lý".
- **Quy tắc bỏ qua** (Q1, Q2; D1):
  - Ngưỡng **500 ms**, bỏ qua khi khoảng cách **nhỏ hơn** 500 ms. [CẦN XÁC NHẬN] repo không có nguồn cho con số này. Ngưỡng lớn hơn (vd. 1000 ms) chặn được người bấm đúp chậm, đổi lại chặn cả lần bấm chủ động trong khoảng đó.
  - Tính riêng cho **từng khách hàng**; bấm nút của khách hàng khác ngay sau đó vẫn được xử lý.
  - Cửa sổ neo vào **lần bấm được xử lý**, lần bấm bị bỏ qua không dời mốc. Hệ quả: bấm ba lần liên tiếp có thể đảo trạng thái (R3). Phương án thay thế là cửa sổ trượt; chọn nó thì AC-2 phải sửa.
  - Bỏ qua bất kể yêu cầu trước đang chờ, đã thành công hay đã thất bại; **không** có khoá "đang chờ". Lần bấm lại sau 500 ms khi yêu cầu chưa về được xử lý (gửi lại cùng trạng thái đích, vô hại).
  - **Không** chặn lần bấm tới sau 500 ms và sau khi bảng đã vẽ lại trên mạng chậm (R2). Muốn chặn thì nói ở bước này: cửa sổ tính từ lúc bảng vẽ lại, cần thêm khoá "đang chờ" có bước nhả trong `main.js`, và AC-2 phải sửa.
  - Lần bấm bị bỏ qua không có phản hồi nào trên màn hình (R4).
- **Nguồn thời gian là `event.timeStamp`** (D3); dự phòng `performance.now()` (R5).
- **File mới, không đổi cấu trúc thư mục**: `source-fe/src/utils/createDoubleClickGuard.js` và `source-fe/test/createDoubleClickGuard.test.js` (D2). Đây là file đầu tiên trong `src/utils/` export một factory trả về hàm **có state**, lệch câu "hàm tiện ích thuần" của convention; lý do ở D2.
- **`Object.hasOwn` (ES2022) trong code chạy trên trình duyệt** (D5, R6). [CẦN XÁC NHẬN] trình duyệt hỗ trợ; phương án dự phòng là `Object.prototype.hasOwnProperty.call`.
- **Ô "Trạng thái" không sửa** (Q3; D5, R7), theo giả định của `01-analysis.md`. Nếu muốn gộp vào thì nói ở bước này; phần thêm là:
  - Dòng 23 của `customerTable.js` tra `STATUS_LABELS` bằng `Object.hasOwn` như dòng 16.
  - Test mới của D6 thêm kỳ vọng ô "Trạng thái" hiện giá trị gốc (vd. `<td>constructor</td>`).
  - Cùng task FE-1, không thêm file.
- **Sửa ba test của REQ-003, giữ nguyên mã và tên hiển thị** (D6, D7, D8):
  - TC-105 (`source-fe/test/customerTable.test.js`): thêm assertion 6 `<td>`; dòng "thiếu field `status`" dùng object không có key đó.
  - TC-92, TC-97 (`CustomerHandlerTest.java`): `@ValueSource` → `@MethodSource`; provider của TC-92 trả `Stream<Long>`, kiểu provider một cột đầu tiên không phải `String` của lớp.
- **Phạm vi của R4** (Q4, Q5; D7): **không** sửa TC-98 (đã cùng kiểu với TC-68 của chính lớp), TC-86 trong `CustomerServiceTest` và TC-83 trong `InMemoryCustomerRepositoryTest`. Nếu muốn theo đúng chữ `Arguments.of(...)` của plan T3 cho TC-98 thì nói ở bước này.
- **Mã TC** (Q6; D8): kỳ vọng mới đánh số tiếp từ TC-108; AC-4 được phủ bằng chính TC-92 và TC-97 (không thể có mã mới vì tên hiển thị phải giữ nguyên) và phần "đúng kiểu của lớp" chỉ kiểm bằng review (R9).
- **Kiểm chứng AC-1, AC-2 ở mức trang là chạy tay** (R1): người review PR chạy bảy bước ở mục FE change. [CẦN XÁC NHẬN] F1 chưa từng được tái hiện bằng chạy tay.
- **Không đổi API, không DB, không migration**; chỉ deploy FE (API, Migration).
