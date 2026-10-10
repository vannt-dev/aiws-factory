# REQ-006 — Thiết kế

## Tổng quan
REQ-006 xử lý ba điểm trải nghiệm mà design của REQ-005 đã chấp nhận và bốn finding minor trong test của REQ-005. **Không đổi API, không có DB; ở BE chỉ đổi code test.** Thiết kế xử lý đủ AC-1..AC-6 trong `01-analysis.md` và chốt các giả định Q1..Q10. Đây là vòng thiết kế đầu tiên, chưa có feedback reject (`aiws/work/REQ-006/state.yaml`: `feedback: []`).

- **Câu trạng thái rỗng (AC-1).** `renderCustomerTable` nhận thêm tham số tuỳ chọn thứ hai là lựa chọn lọc của lần tải được vẽ và tự chọn câu (D1). `refresh()` trao cho nó đúng giá trị mà lần tải đó đã dùng (D2).
- **Bấm đúp khi đang lọc (AC-2, AC-3).** Hàm thuần mới `chooseStatusClickKey` chọn key cho guard có sẵn: một key chung cho mọi khách hàng khi đang lọc, `id` khách hàng khi xem "Tất cả" (D3). `main.js` đổi đúng một biểu thức ở chỗ hỏi guard (D4). `createDoubleClickGuard.js` và TC-108..TC-113 không đổi.
- **Thông báo sau khi thêm (AC-4).** Hàm thuần mới `describeCreateNotice` quyết định có thông báo hay không từ `status` mà API trả cho khách hàng vừa tạo (D5). Thông báo hiện ở một vùng mới `#notice`, không phải `#message` vốn là vùng lỗi (D6).
- **Test của REQ-005 (AC-5, AC-6).** Sửa đúng bốn chỗ mà bốn finding nêu, trong năm test TC-117, TC-118, TC-120, TC-122, TC-127 (D7, D8, D9). Mã TC, tên hiển thị, dòng dữ liệu và số lần chạy giữ nguyên.
- **"Đang lọc" có một định nghĩa dùng chung cho D1, D3, D5:** giá trị của lựa chọn lọc là truthy (khác `''`, `undefined`, `null`). Đây đúng là phép thử mà `listCustomers` dùng để quyết định có gửi `?status=` hay không (`source-fe/src/api/customerApi.js` dòng 27), nên câu trạng thái rỗng, quy tắc bấm đúp và thông báo luôn khớp với yêu cầu thật sự được gửi.
- **REQ-006 đổi năm điểm đã duyệt.** Chi tiết ở "Quyết định cần duyệt".
  - **Đảo ba:** D10 phương án A của REQ-005 (không chặn bấm đúp khi đang lọc) và hai hệ quả của D9 ở REQ-005 (câu trạng thái rỗng, không có thông báo sau khi thêm).
  - **Thu hẹp một:** D1 của REQ-004 (cửa sổ bấm đúp tính riêng từng khách hàng) chỉ còn đúng khi xem "Tất cả".
  - **Nới một:** điểm bắt buộc "không gán `filterEl.value` vào một biến" của D9 ở REQ-005, cho một biến cục bộ trong `refresh()` (D2). Đây là điểm người duyệt nên xem trước; phương án giữ nguyên chữ của D9 đã sẵn ở D2.

Truy vết AC → thiết kế:

| AC | Phần thiết kế |
| --- | --- |
| AC-1 | D1 (câu nào theo lựa chọn nào), D2 (lựa chọn của đúng lần tải được vẽ) |
| AC-2 | D3 (key chung khi đang lọc), D4 (hỏi guard trước khi xoá thông báo) |
| AC-3 | D3 (key theo `id` khi xem "Tất cả"; cửa sổ vẫn neo vào lần bấm được xử lý), D4 |
| AC-4 | D5 (điều kiện và câu), D6 (nơi hiện, lúc hiện, lúc mất) |
| AC-5 | D7 (F1), D8 (F2, F3) |
| AC-6 | D9 (F4) |
| Q3 (đổi lựa chọn giữa hai lần bấm) | D4 |
| Q10 (truy vết TC) | D10 |

## Quyết định chính
- D1: **`renderCustomerTable(customers, statusFilter = '')`**: tham số tuỳ chọn thứ hai là giá trị của lựa chọn lọc; component chọn câu trạng thái rỗng (AC-1; Q1).
  - Hình dạng (`source-fe/src/components/customerTable.js`; chỉ đổi JSDoc, chữ ký và dòng 13, thêm hai hằng cạnh `NO_PHONE`):
    ```js
    const NO_PHONE = '—';
    const EMPTY_MESSAGE = 'Chưa có khách hàng.';
    const NO_MATCH_MESSAGE = 'Không có khách hàng nào khớp lựa chọn lọc.';

    /** Renders the customer list as an HTML table string; an empty list becomes a sentence that depends on whether a status filter is selected. */
    export function renderCustomerTable(customers, statusFilter = '') {
      if (!customers.length) return `<p>${statusFilter ? NO_MATCH_MESSAGE : EMPTY_MESSAGE}</p>`;
      // ... phần dựng bảng (dòng 14–28) không đổi
    }
    ```
  - Kết quả theo đầu vào:
    | `customers` | `statusFilter` | Kết quả |
    | --- | --- | --- |
    | `[]` | không truyền, `''`, `undefined`, `null` | đúng bằng `<p>Chưa có khách hàng.</p>` (như hiện nay) |
    | `[]` | `'ACTIVE'`, `'INACTIVE'` | đúng bằng `<p>Không có khách hàng nào khớp lựa chọn lọc.</p>` |
    | `[]` | chuỗi không rỗng khác (vd. `'DELETED'`) | câu "không khớp", vì `listCustomers` cũng gửi `?status=` cho mọi giá trị truthy |
    | không rỗng | bất kỳ | bảng như hiện nay, **giống từng ký tự** với `renderCustomerTable(customers)`; không có câu nào trong hai câu trên |
  - **Bắt buộc:**
    - Giá trị mặc định giữ câu cũ: lời gọi một tham số `renderCustomerTable([])` vẫn trả đúng `<p>Chưa có khách hàng.</p>`. Test không mã TC `renderCustomerTable shows an empty state` (`source-fe/test/customerTable.test.js` dòng 25–27) **không sửa** và phải pass.
    - `statusFilter` chỉ được dùng để chọn câu; **không** chèn nó vào HTML (hai câu là hằng, không có dữ liệu động nên không cần `escapeHtml`).
    - Câu "không khớp" dùng cho mọi lựa chọn đang lọc, kể cả khi kho hoàn toàn rỗng: FE không biết kho có khách hàng hay không (Q1).
    - Dòng 14–28 (dựng bảng) không đổi một ký tự; TC-36..TC-41, TC-74, TC-75, TC-103..TC-105, TC-114 không sửa.
    - Tên hai hằng và lời JSDoc là gợi ý; tên tham số, vị trí tham số, giá trị mặc định và hai câu là cố định.
  - Không quy định, test spec không đặt kỳ vọng: `statusFilter` không phải chuỗi (số, object); `main.js` luôn truyền `filterEl.value`.
  - Lý do:
    - Quyết định "lựa chọn nào thì câu nào" nằm trong đơn vị có unit test, theo mẫu "nhãn tiếng Việt và quyết định hiển thị đặt trong component" (`STATUS_LABELS`, `NO_PHONE`; `aiws/knowledge/conventions.md` → State và render).
    - Tham số thứ hai có giá trị mặc định là cách `renderCustomerEditForm(customer, fieldErrors = {})` đang làm; public API chỉ mở rộng, mọi lời gọi cũ giữ nguyên nghĩa.
    - Component nhận **giá trị lựa chọn**, không nhận cờ boolean: `main.js` (không có unit test) không phải tự quyết định "giá trị nào là đang lọc".
  - Đã cân nhắc:
    - Cờ boolean (`renderCustomerTable(customers, filtered)` hoặc `{ filtered }`): loại, phép so `filterEl.value !== ''` phải nằm ở `main.js`.
    - Component riêng cho trạng thái rỗng (`renderEmptyState(statusFilter)`): loại, `main.js` phải tự rẽ nhánh theo `customers.length`, và thêm file cho một câu.
    - `main.js` tự ghi câu vào `#customers`: loại, không kiểm được bằng unit test.
    - Câu nêu tên lựa chọn ("Không có khách hàng đang hoạt động."): ngoài phạm vi (`01-analysis.md` → Ngoài phạm vi).

- D2: **`refresh()` đọc lựa chọn lọc một lần, ngay trước khi gọi `loadCustomers()`, và trao giá trị đó cho `renderCustomerTable`** (AC-1: "câu chọn theo L của lần tải được vẽ").
  - Hình dạng (`source-fe/src/main.js` dòng 16–23; thêm một dòng, đổi một dòng):
    ```js
    async function refresh() {
      const statusFilter = filterEl.value;
      try {
        const { current, customers } = await loadCustomers();
        if (current) listEl.innerHTML = renderCustomerTable(customers, statusFilter);
      } catch {
        listEl.textContent = 'Không tải được danh sách khách hàng.';
      }
    }
    ```
  - Vì sao giá trị này đúng là giá trị lần tải đã dùng: loader gọi `getStatus()` đồng bộ ngay khi `loadCustomers()` được gọi, trước `await` đầu tiên (`source-fe/src/utils/createCustomerListLoader.js` dòng 7; TC-129 kiểm đúng điều này). Giữa dòng đọc và lời gọi `loadCustomers()` không có `await`, nên hai lần đọc `filterEl.value` nằm trong cùng một lượt chạy đồng bộ và cho cùng một giá trị.
  - **Bắt buộc:**
    - Dòng `const statusFilter = filterEl.value;` nằm **trong** `refresh()`, trước `await loadCustomers()`, không có `await` nào ở giữa. Không đưa biến này lên mức module.
    - `getStatus` của loader vẫn là `() => filterEl.value`; `createCustomerListLoader.js` và TC-128..TC-134 không đổi.
    - `if (current)`, nhánh `catch` và câu lỗi giữ nguyên; `refresh()` vẫn không đổi giá trị điều khiển, không xoá `#message` hay `#notice`.
  - Quan hệ với `aiws/work/REQ-005/02-design.md` D9: D9 cấm "gán `filterEl.value` vào một biến ở mức module hay ở đầu một handler". Lệnh cấm đó bảo vệ **yêu cầu** khỏi mang giá trị cũ, và phần đó giữ nguyên (`getStatus` không đổi). Biến cục bộ ở đây sống trong đúng một lần `refresh()` và chỉ dùng để câu trạng thái rỗng khớp với yêu cầu của chính lần đó. Đây là một điểm nới có chủ ý; xem "Quyết định cần duyệt".
  - Lý do: AC-1 phát biểu câu theo lựa chọn của **lần tải**, không theo thứ điều khiển đang hiện lúc vẽ. Hai giá trị chỉ khác nhau khi giá trị của `<select>` đổi mà không phát `change` (`aiws/work/REQ-005/02-design.md` R9, [CẦN XÁC NHẬN] theo trình duyệt); khi đó cách này vẫn nói đúng về danh sách đang được vẽ.
  - Đã cân nhắc:
    - Loader trả thêm lựa chọn (`{ current: true, customers, status }`): loại. TC-130..TC-134 so `assert.deepEqual` với đúng `{ current: true, customers }` / `{ current: false }` (`source-fe/test/createCustomerListLoader.test.js` dòng 97, 131, 171, 173, 227, 233, 246, 251), nên thêm một key là phải sửa năm test của REQ-005; REQ-005 D8 cũng ghi hình dạng kết quả là cố định.
    - Đọc lúc vẽ (`renderCustomerTable(customers, filterEl.value)`, không có biến): ít hơn một dòng và không chạm lệnh cấm của D9, nhưng trong ca R9 câu sẽ theo điều khiển chứ không theo danh sách. Không chọn; là phương án thay thế nếu người duyệt muốn giữ nguyên chữ của D9.
    - Giữ bản sao lựa chọn ở mức module: loại, hai nguồn sự thật (REQ-005 D8).

- D3: **Khi đang lọc, mọi nút đổi trạng thái dùng chung một key của guard; khi xem "Tất cả", key vẫn là `id` khách hàng.** Quy tắc nằm trong đơn vị mới `source-fe/src/utils/chooseStatusClickKey.js` (AC-2, AC-3; Q2). Đây là phương án C của `aiws/work/REQ-005/02-design.md` D10.
  - Hình dạng:
    ```js
    const ANY_CUSTOMER = Symbol('any customer');

    /** Chooses the double-click guard key of a status button: one key shared by all customers while a status filter is selected, the customer id otherwise. */
    export function chooseStatusClickKey(statusFilter, customerId) {
      return statusFilter ? ANY_CUSTOMER : customerId;
    }
    ```
  - Guard không đổi (`source-fe/src/utils/createDoubleClickGuard.js`): cửa sổ 500 ms theo từng key, neo vào lần bấm được xử lý. Đổi key là đổi phạm vi của cửa sổ:
    | Lựa chọn lúc bấm | Key | Lần bấm bị bỏ qua khi |
    | --- | --- | --- |
    | "Tất cả" (`''`) | `customerId`, đúng giá trị REQ-004 đang truyền | có lần bấm được xử lý vào nút của **chính khách hàng đó** dưới 500 ms trước (như REQ-004) |
    | "Đang hoạt động", "Ngừng hoạt động" (mọi giá trị truthy) | một key chung | có lần bấm được xử lý vào nút đổi trạng thái của **bất kỳ** khách hàng nào (khi đang lọc) dưới 500 ms trước |
  - Vì sao một quy tắc thoả mọi biến thể của AC-2: khi đang lọc, quyết định chỉ phụ thuộc thời điểm; nó không nhìn `id`, phần tử nút, trạng thái đích, hay yêu cầu trước đang chờ, đã thành công hay đã thất bại. Lần bấm thứ hai của cú bấm đúp vì thế bị bỏ qua dù nó rơi vào nút của A (bảng chưa vẽ lại, hoặc yêu cầu thất bại) hay nút của B (dòng của A đã rời bảng), ở cả hai lựa chọn lọc.
  - **Bắt buộc:**
    - Key chung **không phải chuỗi** (một `Symbol` ở mức module của file). `button.dataset.statusId` luôn là chuỗi và có thể là chuỗi bất kỳ (TC-104 dùng `7"><b>x</b>`; `id` thiếu cho `data-status-id=""`), nên chỉ một giá trị khác kiểu mới chắc chắn không trùng `id` nào. Guard giữ state trong `Map` nên nhận key kiểu nào cũng được.
    - Cùng **một** key cho mọi khách hàng và cho cả hai lựa chọn lọc.
    - Khi `statusFilter` falsy, trả **chính** `customerId` nhận vào, không đổi kiểu, không thêm tiền tố: dưới "Tất cả" guard nhận đúng key như trước REQ-006.
    - Hàm thuần: không import, không state, không DOM, không đồng hồ. Thứ tự tham số `(statusFilter, customerId)`, tên file và tên export là cố định; tên hằng, mô tả của `Symbol` và lời JSDoc là gợi ý.
  - Hành vi để test-designer viết TC. Hàm một mình:
    | Lời gọi | Kết quả |
    | --- | --- |
    | `chooseStatusClickKey('', '7')`, `(undefined, '7')`, `(null, '7')` | `'7'` |
    | `('', k)` với `k` = `''`, `'constructor'`, `'__proto__'`, `'7"><b>x</b>'` | chính `k` |
    | `('ACTIVE', '1')`, `('ACTIVE', '2')`, `('INACTIVE', '2')`, `('INACTIVE', '')` | cùng một giá trị (so bằng `===`), không phải chuỗi, khác mọi `customerId` đã truyền |
  - Hành vi **ghép với guard thật** (`createDoubleClickGuard()` thật, không giả). Chỉ ghép thế này mới chứng minh được "một cú bấm đúp cho đúng một lần bấm được xử lý", vì AC-2 và AC-3 nói về quyết định xử lý hay bỏ qua chứ không nói về key. Mỗi dòng là một kịch bản trên một guard mới; mỗi lần bấm là `accept(chooseStatusClickKey(statusFilter, customerId), at)`:
    | Kịch bản: các lần bấm `(statusFilter, customerId, at)` theo thứ tự | Kết quả từng lần | AC |
    | --- | --- | --- |
    | `('ACTIVE', '1', 1000)` | `true` | AC-3, lần bấm đầu tiên |
    | `('ACTIVE', '1', 1000)`, `('ACTIVE', '2', 1000 + d)` với `d` = 0, 1, 499 | `true`, `false` | AC-2, dòng của A đã rời bảng, lần bấm rơi vào B (ca của R2) |
    | `('ACTIVE', '1', 1000)`, `('ACTIVE', '1', 1300)` | `true`, `false` | AC-2, lần bấm rơi vào chính A (bảng chưa vẽ lại, hoặc yêu cầu thất bại) |
    | `('INACTIVE', '2', 1000)`, `('INACTIVE', '4', 1499)` | `true`, `false` | AC-2, lựa chọn "Ngừng hoạt động" |
    | `('ACTIVE', '1', 1000)`, `('ACTIVE', '3', 1500)` | `true`, `true` | AC-3, hết khoảng bấm đúp (đúng 500 ms) |
    | `('ACTIVE', '1', 1000)`, `('ACTIVE', '3', 1300)`, `('ACTIVE', '3', 1500)` | `true`, `false`, `true` | AC-3, lần bị bỏ qua không dời mốc |
    | `('', '1', 1000)`, `('', '2', 1001)`, `('', '1', 1002)` | `true`, `true`, `false` | AC-3, "Tất cả": khách hàng khác vẫn được xử lý; cùng khách hàng vẫn bị bỏ qua (REQ-004) |
    | `('ACTIVE', '1', 1000)`, `('', '1', 1300)` | `true`, `true` | D4 (Q3), ngoài tiền đề của AC |
    | `('', '1', 1000)`, `('ACTIVE', '2', 1300)` | `true`, `true` | D4 (Q3), ngoài tiền đề của AC |
    | `('ACTIVE', '1', 1000)`, `('INACTIVE', '2', 1300)` | `true`, `false` | D4 (Q3), ngoài tiền đề của AC |
  - Lý do:
    - Guard và sáu test của nó giữ nguyên; phần thêm là một hàm thuần một dòng, cùng dạng với `describeStatusError`.
    - "Đang lọc hay không" và "key nào" nằm trong đơn vị có unit test; `main.js` chỉ trao giá trị của điều khiển và `id` của nút.
    - Khi xem "Tất cả" dòng không rời bảng nên không có rủi ro này; giữ nguyên REQ-004 ở đó là đúng chữ "khi đang lọc" của R2.
  - Đã cân nhắc:
    - Key chung mọi lúc (phương án B của REQ-005 D10; cách khác của Q2): loại, đảo D1 của REQ-004 ở nơi không có rủi ro.
    - Sửa `createDoubleClickGuard` (thêm tham số chế độ, hoặc thêm một mốc chung): loại, chạm đơn vị và sáu test đã duyệt trong khi đổi key là đủ.
    - Factory bọc guard (`createStatusClickGuard()` nhận `(statusFilter, customerId, at)`): cả quyết định nằm trong một đơn vị, nhưng là factory thứ ba chỉ để ghép hai thứ, và là file `src/utils/` đầu tiên import một file `src/utils/` khác. Không chọn; test ghép ở bảng trên kiểm cùng điều đó.
    - Key chung là chuỗi cố định (`''`, `'*'`): loại, có thể trùng một `data-status-id`.
    - Thêm tiền tố cho cả hai loại key (`'customer:7'`, `'any'`): không trùng được, nhưng đổi key dưới "Tất cả" so với REQ-004. Không chọn.
    - `event.detail`, vô hiệu hoá nút, khoá "đang chờ", chặn ở BE: đã loại ở `aiws/work/REQ-004/02-design.md` D1, D4, hoặc nằm ngoài phạm vi.

- D4: `source-fe/src/main.js`, listener của nút đổi trạng thái (dòng 81–92): **key của guard là `chooseStatusClickKey(filterEl.value, button.dataset.statusId)`**. Lựa chọn lọc được đọc lúc bấm (Q3).
  - Hình dạng (dòng xoá thông báo là `clearMessages()` của D6; trước khi D6 có mặt nó vẫn là `messageEl.textContent = ''`):
    ```js
    import { chooseStatusClickKey } from './utils/chooseStatusClickKey.js';
    // ...
    listEl.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-status-id]');
      if (!button) return;
      if (!acceptStatusClick(chooseStatusClickKey(filterEl.value, button.dataset.statusId), event.timeStamp)) return;
      clearMessages();
      try {
        await updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus);
        await refresh();
      } catch (error) {
        messageEl.textContent = describeStatusError(error);
      }
    });
    ```
  - **Bắt buộc:**
    - `filterEl.value` được đọc **trong listener, ở từng lần bấm**; không dùng lại giá trị của lần bấm trước hay của `refresh()`.
    - Dòng hỏi guard vẫn đứng **trước** dòng xoá thông báo (`aiws/work/REQ-004/02-design.md` D4): lần bấm bị bỏ qua không đổi gì trên màn hình, kể cả câu lỗi trong `#message` và thông báo trong `#notice`.
    - `updateCustomerStatus` vẫn nhận `button.dataset.statusId` và `button.dataset.targetStatus`; key của guard không đi vào yêu cầu.
    - Vẫn **một** guard `acceptStatusClick` tạo một lần ở mức module (dòng 13); không tạo guard thứ hai, không gọi guard ở `catch`/`finally`.
  - **Q3, lựa chọn lọc đổi giữa hai lần bấm:** "đang lọc" xét theo giá trị của điều khiển lúc từng lần bấm, và hai chế độ giữ mốc riêng (key chung và key theo `id` là hai mục khác nhau của `Map`).
    | Lần bấm được xử lý | Lần bấm kế tiếp, dưới 500 ms sau | Kết quả |
    | --- | --- | --- |
    | đang lọc, khách hàng A | xem "Tất cả", bất kỳ khách hàng nào (kể cả A) | **được xử lý** |
    | xem "Tất cả", khách hàng A | đang lọc, bất kỳ khách hàng nào | **được xử lý** |
    | "Đang hoạt động", khách hàng A | "Ngừng hoạt động", bất kỳ khách hàng nào | bị bỏ qua (cùng key chung) |
    - Chấp nhận hai dòng đầu vì một cú bấm đúp không tạo ra được chúng: giữa hai lần bấm phải có một thao tác đổi lựa chọn trên `<select>`. AC-2 và AC-3 chỉ phát biểu cho lựa chọn không đổi giữa hai lần bấm (`01-analysis.md` Q3). Xem R3.
    - Đã cân nhắc: mỗi lần bấm được xử lý ghi mốc cho cả hai key. Loại: guard chỉ có một thao tác "hỏi và ghi"; muốn "ghi không hỏi" thì phải sửa guard và test của nó.
  - Lý do: thay đổi nhỏ nhất ở file không có unit test (một import, một biểu thức); thứ tự các dòng của REQ-004 giữ nguyên.

- D5: Đơn vị mới **`source-fe/src/utils/describeCreateNotice.js`** quyết định thông báo sau khi thêm: câu "Đã thêm khách hàng." **khi và chỉ khi đang lọc và `status` của khách hàng vừa tạo khác giá trị lọc**; ngược lại là chuỗi rỗng (AC-4; Q4, Q5).
  - Hình dạng:
    ```js
    const CREATED_MESSAGE = 'Đã thêm khách hàng.';

    /** Chooses the notice shown after a customer was created: the "added" sentence when the selected status filter hides the new customer, an empty string otherwise. */
    export function describeCreateNotice(created, statusFilter) {
      return statusFilter && created?.status !== statusFilter ? CREATED_MESSAGE : '';
    }
    ```
  - Kết quả theo đầu vào (`created` là body mà `createCustomer` trả về):
    | `statusFilter` | `created` | Kết quả | Ghi chú |
    | --- | --- | --- | --- |
    | `''`, `undefined`, `null` | bất kỳ, kể cả `null` | `''` | "Tất cả": mọi khách hàng đều khớp |
    | `'INACTIVE'` | `{ ..., status: 'ACTIVE' }` | `'Đã thêm khách hàng.'` | ca duy nhất API hiện tạo ra (`CustomerService.create` luôn tạo `ACTIVE`, `source-be/src/main/java/com/example/crm/service/CustomerService.java` dòng 48) |
    | `'ACTIVE'` | `{ ..., status: 'ACTIVE' }` | `''` | khách hàng mới có trong bảng |
    | `'ACTIVE'` | `{ ..., status: 'INACTIVE' }` | `'Đã thêm khách hàng.'` | xét theo `status` API trả, không mặc định khách hàng mới là `ACTIVE` (Q4) |
    | `'INACTIVE'` | `{ ..., status: 'INACTIVE' }` | `''` | như trên |
    | `'ACTIVE'`, `'INACTIVE'` | `null`, `undefined`, object không có `status` | `'Đã thêm khách hàng.'` | không đọc được `status` thì coi là không khớp |
  - **Bắt buộc:**
    - Dùng `created?.status`. `request()` trả `null` khi body của một response 2xx không phải JSON (`source-fe/src/api/customerApi.js` dòng 20–22). Nếu hàm ném `TypeError` thì lỗi rơi vào `catch` của handler: khách hàng **đã lưu** nhưng màn hình báo "Không lưu được khách hàng." và danh sách không tải lại.
    - So khớp chính xác (`!==`), không trim, không đổi hoa thường; không có danh sách trạng thái viết cứng trong hàm.
    - Trả chuỗi text thuần (gán bằng `textContent`); "không có thông báo" là `''`, không phải `null`, để `main.js` gán thẳng kết quả mà không rẽ nhánh.
    - Hàm thuần: không import, không state, không DOM. Thứ tự tham số `(created, statusFilter)`, tên file, tên export và câu là cố định; tên hằng và lời JSDoc là gợi ý.
  - Vì sao không đọc được `status` thì vẫn hiện (khi đang lọc): API đã báo thành công mà FE không chứng minh được khách hàng mới có trong bảng đang lọc. Hiện thừa một câu đúng thì vô hại; thiếu câu thì chính là lỗi R3 mô tả.
  - Lý do:
    - Cùng dạng và cùng chỗ với `describeStatusError` (hàm thuần chọn một câu tiếng Việt, `src/utils/`, có unit test): "lỗi nào thì hiện câu nào nằm trong hàm thuần, `main.js` chỉ nối" (`aiws/knowledge/conventions.md` → Xử lý lỗi).
    - Điều kiện "không khớp" dùng cùng định nghĩa "khớp" của REQ-005: `status` bằng đúng giá trị lọc.
  - Đã cân nhắc:
    - Hiện sau **mọi** lần thêm thành công (cách khác của Q4): đơn giản hơn, nhưng rộng hơn R3 và làm thao tác thêm khác thao tác sửa, đổi trạng thái. Không chọn; xem "Quyết định cần duyệt".
    - Hàm trả boolean, câu đặt ở `main.js`: loại, câu nằm ở file không có unit test.
    - Viết thẳng điều kiện trong `main.js`: loại, AC-4 không có quyết định nào kiểm được bằng unit test.
    - Câu nói thêm lý do ("... không hiện trong danh sách đang lọc"): không chọn, R3 chỉ đòi "cho biết đã thêm thành công" (Q5).
    - Tự chuyển lựa chọn về "Tất cả" sau khi thêm: ngoài phạm vi (`01-analysis.md` → Ngoài phạm vi).

- D6: Thông báo đã thêm hiện ở **một vùng mới `<p id="notice" class="notice" role="status">`** trong `source-fe/index.html`, ngay sau `#message`. Nó mất ở thao tác kế tiếp của nhân viên, cùng lúc với `#message` (AC-4; Q5, Q6).
  - `index.html` (thêm một phần tử sau dòng 26, thêm một luật CSS sau dòng 14):
    ```html
    <p id="message" class="error" role="alert"></p>
    <p id="notice" class="notice" role="status"></p>
    ```
    ```css
    .notice { color: #166534; }
    ```
  - `main.js`, phần chung (cạnh `messageEl`, và một hàm cục bộ cạnh `refresh()`):
    ```js
    import { describeCreateNotice } from './utils/describeCreateNotice.js';
    // ...
    const noticeEl = document.getElementById('notice');
    // ...
    function clearMessages() {
      messageEl.textContent = '';
      noticeEl.textContent = '';
    }
    ```
  - `main.js`, submit của `#create-form` (dòng 25–39; đổi dòng 27, 30, thêm một dòng sau `form.reset()`):
    ```js
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessages();
      const data = Object.fromEntries(new FormData(form));
      try {
        const created = await createCustomer({ name: data.name, email: data.email, phone: data.phone });
        form.reset();
        noticeEl.textContent = describeCreateNotice(created, filterEl.value);
        await refresh();
      } catch (error) {
        // ... không đổi
      }
    });
    ```
  - **Sáu chỗ đang xoá `#message` đổi thành `clearMessages()`**, không thêm, không bớt chỗ nào:
    | Dòng hiện tại | Handler | Ghi chú |
    | --- | --- | --- |
    | 27 | submit `#create-form` | |
    | 44 | bấm "Sửa" | |
    | 56 | submit form sửa | |
    | 78 | bấm "Huỷ" | |
    | 85 | bấm nút đổi trạng thái | **sau** dòng hỏi guard: lần bấm bị bỏ qua không xoá gì (D4) |
    | 95 | đổi lựa chọn lọc | |
  - **Bắt buộc:**
    - Dòng gán `noticeEl.textContent` đứng sau `form.reset()` và **trước** `await refresh()`; giữa lần đọc `filterEl.value` của nó và lời gọi `refresh()` không có `await`. Thông báo và lần tải lại vì thế xét cùng một lựa chọn L.
    - Không gán `#notice` trong `catch`: thêm thất bại thì không có thông báo thành công; nhánh `catch` giữ nguyên từng ký tự.
    - `refresh()` không đụng `#notice`. Lần tải lại thất bại ngay sau khi thêm thì thông báo vẫn còn, cạnh câu "Không tải được danh sách khách hàng." trong `#customers` (Q6).
    - Mọi câu lỗi vẫn ghi vào `#message` như hiện nay; `#notice` chỉ nhận kết quả của `describeCreateNotice`. Gán bằng `textContent`.
    - `#notice` là phần tử tĩnh trong `index.html`, nằm ngoài `#create-form`, `#edit-customer` và `#customers`; `#message` (dòng 26) không đổi.
    - `id="notice"` và `role="status"` là cố định. Tên class, màu, và tên hàm `clearMessages` là gợi ý.
  - Vì sao gán trước `await refresh()` chứ không phải sau: `refresh()` tự bắt lỗi nên cả hai thứ tự đều thoả Q6. Gán trước thì mọi thao tác của nhân viên trong lúc danh sách đang tải lại (vd. đổi lựa chọn sang "Tất cả") xoá được thông báo như bình thường; gán sau thì thông báo được ghi **sau** thao tác đó và hiện lại bên trên một danh sách đã có khách hàng mới.
  - Lý do:
    - `#message` là `class="error" role="alert"` (`index.html` dòng 26; `.error` tô đỏ ở dòng 14): đặt câu thành công vào đó thì nó hiện như lỗi và bị trình đọc màn hình đọc như cảnh báo. `role="status"` là vùng thông báo không ngắt lời (WAI-ARIA), đúng loại tin "đã xong".
    - Phần tử tĩnh có `id`, `main.js` gán `textContent`: đúng cách `#message` đang làm.
    - "Mỗi handler của người dùng xoá `#message` trước khi chạy" (`aiws/knowledge/conventions.md` → Xử lý lỗi) được giữ và mở rộng cho `#notice` qua một hàm, để không handler nào xoá vùng này mà quên vùng kia.
  - Đã cân nhắc:
    - Dùng lại `#message`, đổi `class` và `role` theo loại tin: loại, mọi chỗ ghi lỗi phải nhớ đặt lại, và đổi `role` của một vùng live đang có trong trang thì kết quả tuỳ trình đọc màn hình [CẦN XÁC NHẬN].
    - Đặt câu trong `#customers`: loại, `refresh()` ghi đè vùng này (và Q6 đòi thông báo còn khi tải lại thất bại).
    - Thêm sáu dòng `noticeEl.textContent = ''` thay cho một hàm: cùng hành vi, dễ sót hơn. Không chọn.
    - Tự ẩn sau vài giây, hoặc `alert()`: loại, thêm timer hoặc chặn thao tác; "mất ở thao tác kế tiếp" là giả định của Q5.
    - Không thêm luật CSS (chữ màu mặc định): dùng được; chọn thêm một màu để câu thành công không lẫn với nội dung trang. Xem "Quyết định cần duyệt".

- D7: **F1** — helper `insertByStatuses` trong `source-be/src/test/java/com/example/crm/service/CustomerServiceTest.java` (dòng 817–824) dựng kho từ **n khách hàng đầu của bảng bốn khách hàng chuẩn** (AC-5; Q7).
  - Hình dạng (gợi ý):
    ```java
    // Name, email and phone of the four standard customers of the REQ-005 test spec, in id order.
    private static final String[][] STANDARD_CUSTOMERS = {
      {"Nguyen Van An", "an@example.com", null},
      {"Tran Thi Binh", "binh@example.com", "0912345678"},
      {"Le Van Cuong", "cuong@example.com", "0987654321"},
      {"Pham Thi Dung", "dung@example.com", null}
    };

    private List<Customer> insertByStatuses(List<CustomerStatus> statuses) {
      List<Customer> inserted = new ArrayList<>();
      for (CustomerStatus status : statuses) {
        String[] customer = STANDARD_CUSTOMERS[inserted.size()];
        inserted.add(repository.insert(customer[0], customer[1], customer[2], status));
      }
      return inserted;
    }
    ```
  - **Bắt buộc:**
    - Khách hàng thứ i mang tên, email, số điện thoại của dòng i trong bảng `aiws/work/REQ-005/03-test-spec.md` → Dữ liệu chung (dòng 110–115) và `status` thứ i của tham số; đúng định nghĩa "kho theo danh sách trạng thái" ở dòng 118 của file đó.
    - Chữ ký và kiểu trả về của `insertByStatuses` giữ nguyên. Thân hai test (dòng 771–781, 790–802), hai provider (dòng 783–788, 804–815), `@DisplayName`, tên method: **không đổi một ký tự**. List mong đợi của hai test được dựng từ các `Customer` do `insert` trả về, nên không assertion nào phải sửa.
    - Dòng 821 là chỗ duy nhất của file có `"Customer "` và `"customer" + n`; sau khi sửa, file không còn hai chuỗi đó. Đây là phần (a) của AC-5 cho F1, kiểm bằng review diff.
    - **TC-119 không sửa** (dòng 826–842): nó đã tự dựng K4 đúng dữ liệu chuẩn ở dòng 831–834.
    - Cách giữ bảng dữ liệu (hằng `String[][]` như trên, hay cách khác), tên hằng, vị trí hằng và lời comment là gợi ý. Không thêm dependency; `List.of` không nhận `null` nên bảng không viết được bằng `List.of(...)`.
  - Hệ quả mong đợi, kiểm bằng review: trên kho K4, kết quả của TC-118 có một bản ghi có số (`id` 3 `0987654321` khi lọc `ACTIVE`, `id` 2 `0912345678` khi lọc `INACTIVE`) và được so cả bản ghi qua `assertEquals(expected, result)` đang có.
  - Dữ liệu mới vẫn dựng được: `repository.insert` không kiểm tra gì (`aiws/knowledge/db-schema.md`), nên dòng `[ACTIVE, ACTIVE]` có khách hàng 2 mang số ở trạng thái `ACTIVE`, dòng `[INACTIVE, INACTIVE]` có khách hàng 1 `INACTIVE`, đều hợp lệ ở tầng này.
  - Lý do: đúng đề xuất của F1; sửa helper là sửa dữ liệu của cả TC-117 và TC-118 mà không chạm thân test.
  - Đã cân nhắc: cho TC-119 gọi chung helper (nửa sau của đề xuất F1, Q7). Không chọn: TC-119 không nằm trong năm test của AC-5, dữ liệu của nó đã đúng, và sửa nó là thêm một mã TC phải định nghĩa lại mà không assertion nào chặt hơn. Hệ quả: bốn dòng dữ liệu chuẩn có mặt ở hai chỗ trong file. Xem "Quyết định cần duyệt".

- D8: **F2 và F3** — thêm assertion trực tiếp vào TC-120 và TC-122 trong `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java` (AC-5; Q8).
  - F2, TC-120 (vòng lặp dòng 738–745): thêm ngay sau dòng 741, trên **chính** `body.get(i)`:
    ```java
    assertEquals(5, body.get(i).size());
    assertTrue(body.get(i).has("phone"));
    if (id == 1 || id == 4) {
      assertTrue(body.get(i).get("phone").isNull());
    }
    ```
  - F3, TC-122: thêm vào **cả hai** nhánh `if (id == changedId)` (dòng 815–816 với `activeBody`, dòng 825–826 với `inactiveBody`), sau assertion `status` đang có:
    ```java
    for (String field : List.of("name", "email", "phone")) {
      assertEquals(all.get((int) id - 1).get(field), activeBody.get(i).get(field));
    }
    ```
    (nhánh thứ hai dùng `inactiveBody`).
  - **Bắt buộc:**
    - F2 khẳng định trên response đang kiểm, không qua bản chụp `all`. Dùng `JsonNode.size()`, `has(...)`, `isNull()`; **không** dùng `asText()` (với JSON `null` nó cho chuỗi `"null"`, không phân biệt được với field thiếu hay chuỗi thật).
    - F3 so **`JsonNode` với `JsonNode`** cho từng field, không qua `asText()`: `phone` của khách hàng 1 là JSON `null` và phải bằng đúng nút `null` trong `all`.
    - Mọi assertion đang có giữ nguyên, kể cả dòng 741 và hai dòng kiểm `status`; chỉ **thêm** dòng. Hai provider (dòng 748–765: 15 dòng; dòng 833–837: 2 dòng), `@DisplayName`, tên method, chữ ký, và helper `insertStandardFour` (dòng 716–722) không đổi.
    - Không thêm import: `assertTrue`, `assertEquals`, `List`, `JsonNode` đã có (dòng 3–5, 10, 18).
    - Vị trí chính xác của dòng mới trong vòng lặp, và việc viết ba phép so của F3 bằng vòng `for` hay ba dòng riêng, là gợi ý.
  - Phạm vi của F2 (Q8): **không** thêm kỳ vọng "`phone` của `id` 2 và 3 là `"0912345678"` và `"0987654321"`" viết thành giá trị cụ thể; finding không nêu và R4 nói "đúng theo bốn finding". Xem "Quyết định cần duyệt".
  - Mỗi dòng dữ liệu của TC-122 chạy đúng một trong hai nhánh: dòng `1 → INACTIVE` chạy nhánh `inactiveBody` (`phone` là JSON `null`); dòng `2 → ACTIVE` chạy nhánh `activeBody` (`phone` là `"0912345678"`).
  - Lý do: đúng đề xuất của F2 và F3; `JsonNode` và ba hàm của nó đã dùng ở chính file này (dòng 128–129, 201–202).
  - Đã cân nhắc: với F3, dựng phần tử mong đợi bằng cách chép phần tử trong `all` rồi đổi `status`, và so cả phần tử. Chặt hơn (bắt cả field thừa) nhưng vượt đề xuất của finding và cần `ObjectNode`. Không chọn.

- D9: **F4** — trong `source-fe/test/customerApi.test.js`, biến `notFound500` đổi tên thành **`internalError500`** ở đúng ba chỗ: dòng khai báo 276 và hai dòng dùng 291, 292 (AC-6; Q9).
  - **Bắt buộc:** chỉ đổi định danh. Nội dung object Problem, ba dòng dữ liệu và thứ tự của chúng, tên hiển thị của TC-127, mọi assertion, và mọi test khác của file giữ nguyên. Sau khi sửa, chuỗi `notFound500` không còn ở đâu trong file.
  - Lý do: biến chứa Problem `500 Internal Server Error`; tên là tên đầu trong hai tên finding đề xuất.
  - Đã cân nhắc: `serverErrorProblem` (tên thứ hai của finding): cũng đúng; không chọn vì `internalError500` giữ con số 500 mà hai dòng dữ liệu đang dùng.

- D10: **Mã TC và truy vết** (Q10). Kỳ vọng mới mang mã mới, đánh số tiếp từ **TC-135** (`aiws/knowledge/conventions.md` → Test → Mã TC). Năm test bị sửa giữ nguyên mã và tên hiển thị, và được **định nghĩa lại** trong test spec của REQ-006. Số cụ thể do test-designer cấp.
  | AC | Đơn vị mang TC | File test | Mã |
  | --- | --- | --- | --- |
  | AC-1 | `renderCustomerTable` (bảng của D1) | `source-fe/test/customerTable.test.js` (thêm test) | Mới, từ TC-135 |
  | AC-2, AC-3 | `chooseStatusClickKey` một mình và ghép với `createDoubleClickGuard` thật (hai bảng của D3) | `source-fe/test/chooseStatusClickKey.test.js` (mới) | Mới |
  | AC-4 | `describeCreateNotice` (bảng của D5) | `source-fe/test/describeCreateNotice.test.js` (mới) | Mới |
  | AC-5 | TC-117, TC-118 (sửa qua helper, D7); TC-120, TC-122 (sửa, D8) | `CustomerServiceTest.java`, `CustomerHandlerTest.java` | Giữ mã |
  | AC-6 | TC-127 (sửa, D9) | `source-fe/test/customerApi.test.js` | Giữ mã |
  - AC-5 và AC-6 **không thể** có mã mới: mã TC nằm trong tên hiển thị, mà phần (b) của hai AC đòi tên hiển thị giữ nguyên. Cách làm theo tiền lệ TC-92, TC-97, TC-105 của REQ-004 (`aiws/work/REQ-004/03-test-spec.md` dòng 14–20): test spec ghi lại năm mã này với `covers` trỏ tới AC của REQ-006, để rule `every_ac_has_tc` thoả và plan gán được chúng cho task.
  - Ba kịch bản Q3 ở bảng ghép của D3 nằm ngoài tiền đề của AC-2 và AC-3. Đề xuất cho test-designer: vẫn ghi chúng dưới AC-2 kèm ghi chú "D4/Q3, ngoài tiền đề của AC", để hành vi đã chọn có test giữ.
  - Test ghép dùng guard thật, không giả: theo cách BE test service bằng `InMemoryCustomerRepository` thật; `source-fe/test/describeStatusError.test.js` (dòng 4) cũng đã import một module production thứ hai.
  - Kiểu test theo từng file (`aiws/knowledge/conventions.md` → Test): FE dùng một mảng dữ liệu lặp `for...of` trong một `test(...)`, không `describe`; thời điểm bấm là số truyền vào, không timer.
  - Test có sẵn dùng làm ảnh chụp "không đổi gì", phải pass nguyên vẹn: `renderCustomerTable shows an empty state` và mọi TC khác của `customerTable.test.js`; TC-108..TC-113; TC-128..TC-134; TC-119, TC-121, TC-123, TC-124; TC-125, TC-126.

## API
**Không đổi.** Không endpoint nào mới hay đổi path, method, tham số, schema, mã trạng thái, format lỗi. `aiws/work/REQ-006/api-contract.yaml` vì thế có `paths: {}`.

- FE dùng thêm một thông tin đã có trong contract: field `status` của `Customer` trong response 201 của `POST /api/customers` (`aiws/work/REQ-001/api-contract.yaml`, `operationId: createCustomer`). `createCustomer` đã trả body này (`source-fe/src/api/customerApi.js` dòng 30–32); `main.js` dòng 30 hiện bỏ nó đi (D5, D6).
- Thay đổi duy nhất nhìn thấy được ở phía mạng: khi đang lọc, một cú bấm đúp gửi **một** `PUT /api/customers/{id}/status` (và một `GET /api/customers?status=...` sau đó) thay vì hai `PUT` cho hai khách hàng. Lần bấm bị bỏ qua không gửi yêu cầu nào.
- Thao tác thêm vẫn gửi đúng một `POST` rồi một `GET` theo lựa chọn đang chọn, như REQ-005.

## DB change
Không có. Hệ thống mới không có DB (`aiws/knowledge/db-schema.md`); kho in-memory, interface `CustomerRepository` và record `Customer` không đổi.

## BE change
Thư mục gốc: `source-be/`. **Chỉ code test; không file nào dưới `source-be/src/main/` đổi.**

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/test/java/com/example/crm/service/CustomerServiceTest.java` | Sửa | Helper `insertByStatuses` dựng kho từ bảng bốn khách hàng chuẩn (D7). Thân TC-117, TC-118 và hai provider không đổi; TC-119 không đổi |
| `src/test/java/com/example/crm/api/CustomerHandlerTest.java` | Sửa | TC-120: thêm kiểm "đúng năm field, có `phone`, `phone` là JSON `null` ở `id` 1 và 4" trên response đang kiểm. TC-122: hai nhánh `id == changedId` so thêm `name`, `email`, `phone` với `all` (D8) |

- Không đổi: `InMemoryCustomerRepositoryTest.java`, `PhoneNumbersTest.java`, `source-be/pom.xml`.
- Phần (b) của AC-5 kiểm bằng `be_test`. Số lần chạy phải **đúng bằng** mốc hiện nay (`aiws/work/REQ-005/evidence/test-results/T3-attempt-1.yaml`): `CustomerServiceTest` 173 (TC-117: 3, TC-118: 5), `CustomerHandlerTest` 107 (TC-120: 15, TC-122: 2), `InMemoryCustomerRepositoryTest` 49, `PhoneNumbersTest` 70, tổng 399, đều pass.
- Phần (a) của AC-5 kiểm bằng review diff (R6).
- Gợi ý nhóm task, độc lập với nhau và với FE. Sau mỗi task orchestrator chạy toàn bộ `be_test`:
  - **BE-1** (1 file): `CustomerServiceTest.java`. Mã TC của task: TC-117, TC-118.
  - **BE-2** (1 file): `CustomerHandlerTest.java`. Mã TC của task: TC-120, TC-122.

## FE change
Thư mục gốc: `source-fe/`. Không thêm dependency hay thư mục.

| File | Loại | Thay đổi |
| --- | --- | --- |
| `src/components/customerTable.js` | Sửa | `renderCustomerTable(customers, statusFilter = '')`; hai hằng câu; JSDoc (D1). Phần dựng bảng không đổi |
| `test/customerTable.test.js` | Sửa | Thêm test cho câu trạng thái rỗng theo bảng của D1. **Test cũ không sửa** |
| `src/utils/chooseStatusClickKey.js` | Mới | `export function chooseStatusClickKey(statusFilter, customerId)` theo D3; JSDoc một dòng; không import |
| `test/chooseStatusClickKey.test.js` | Mới | Test hàm một mình và ghép với `createDoubleClickGuard` thật, theo hai bảng của D3 |
| `src/utils/describeCreateNotice.js` | Mới | `export function describeCreateNotice(created, statusFilter)` theo D5; JSDoc một dòng; không import |
| `test/describeCreateNotice.test.js` | Mới | Test theo bảng của D5 |
| `src/main.js` | Sửa | Xem bảng dưới (D2, D4, D6) |
| `index.html` | Sửa | Thêm `<p id="notice" class="notice" role="status"></p>` ngay sau `#message`; thêm luật CSS `.notice` (D6). Không đổi gì khác |
| `test/customerApi.test.js` | Sửa | Đổi tên `notFound500` thành `internalError500` ở ba chỗ của TC-127 (D9) |

Thay đổi trong `src/main.js`, theo dòng của file hiện tại:

| Dòng hiện tại | Thay đổi | Quyết định |
| --- | --- | --- |
| 1–6 (import) | Thêm import `chooseStatusClickKey` và `describeCreateNotice` | D4, D6 |
| 8–14 (hằng mức module) | Thêm `noticeEl = document.getElementById('notice')` | D6 |
| 16–23 (`refresh`) | Thêm `const statusFilter = filterEl.value;` trước `try`; trao `statusFilter` cho `renderCustomerTable` | D2 |
| cạnh `refresh` | Thêm hàm `clearMessages()` | D6 |
| 27, 44, 56, 78, 85, 95 | `messageEl.textContent = ''` thành `clearMessages()` | D6 |
| 30–32 (submit thêm) | Giữ kết quả `createCustomer` trong `created`; gán `noticeEl.textContent` sau `form.reset()`, trước `await refresh()` | D6 |
| 84 (hỏi guard) | Key là `chooseStatusClickKey(filterEl.value, button.dataset.statusId)` | D4 |

- Không đổi: `src/utils/createDoubleClickGuard.js`, `src/utils/createCustomerListLoader.js`, `src/utils/describeStatusError.js`, `src/utils/escapeHtml.js`, `src/utils/formatPhone.js`, `src/api/customerApi.js`, `src/components/customerEditForm.js`, `scripts/build.mjs` (tự quét `src/**/*.js` và chép `index.html`), `package.json`, và mọi file test khác (`createDoubleClickGuard.test.js`, `createCustomerListLoader.test.js`, `describeStatusError.test.js`, `customerEditForm.test.js`, `formatPhone.test.js`).
- Mốc: FE hiện 53 test, đều pass (`aiws/work/REQ-005/evidence/test-results/T5-attempt-1.yaml`); sau REQ-006 là 53 cộng số test mới. TC-127 vẫn là một test.
- Gợi ý nhóm task. Sau mỗi task orchestrator chạy toàn bộ `fe_test`, nên mọi trạng thái trung gian phải build và pass:
  - **FE-1** (1 file, độc lập): `test/customerApi.test.js`. Mã TC: TC-127.
  - **FE-2** (3 file): `customerTable.js`, `customerTable.test.js`, `main.js` (chỉ `refresh()`, D2). Mã TC: các TC của AC-1.
  - **FE-3** (3 file, sau FE-2): `chooseStatusClickKey.js`, `chooseStatusClickKey.test.js`, `main.js` (import và dòng 84, D4; dòng 85 chưa đổi). Mã TC: các TC của AC-2, AC-3.
  - **FE-4** (4 file, sau FE-3): `describeCreateNotice.js`, `describeCreateNotice.test.js`, `main.js` (D6), `index.html`. Mã TC: các TC của AC-4. `main.js` và `index.html` phải đổi cùng nhau (`main.js` tìm `#notice`).
  - FE-2, FE-3, FE-4 cùng sửa `main.js` nên phải **nối tiếp**, không song song. `validatePlan` không cấm một file nằm trong `allowed_files` của nhiều task (`aiws/adapters/cli/src/validate.js`). `main.js` không có TC nào nên mỗi lần đi cùng nhóm có test của phần nó nối.
  - Phương án khác cho planner: gộp FE-2..FE-4 thành một task 8 file (dưới giới hạn `max_files_per_task: 10` của `aiws/config/policies.yaml`). Ít commit hơn, nhưng một commit mang cả ba AC.
- **Phần không có TC tự động**: `index.html` và phần nối trong `main.js` (`node:test` không có DOM). Kiểm bằng review (các điểm bắt buộc của D2, D4, D6) và chạy tay với BE local, mở tab Network:
  1. **Trên bản trước REQ-006** (tái hiện R2, [CẦN XÁC NHẬN] chưa từng được tái hiện): chọn "Đang hoạt động" với ít nhất ba dòng, bấm đúp nhanh "Ngừng hoạt động" ở dòng đầu; ghi lại số `PUT .../status` và số khách hàng đổi trạng thái.
  2. Trên bản REQ-006, cùng thao tác: đúng **một** `PUT`, cho khách hàng của dòng được bấm; dòng kế tiếp vẫn "Đang hoạt động" và còn trong bảng.
  3. Chọn "Ngừng hoạt động", bấm đúp nhanh "Kích hoạt lại" ở dòng đầu: đúng một `PUT`.
  4. Chọn "Ngừng hoạt động", bấm đúp "Kích hoạt lại" ở một khách hàng bị trùng số: đúng một `PUT`; câu báo trùng số trong `#message` còn nguyên sau lần bấm thứ hai.
  5. Đang lọc, đổi trạng thái dòng A, chờ hơn nửa giây, đổi trạng thái dòng B: hai `PUT`, cả hai rời bảng.
  6. Chọn "Tất cả": bấm "Ngừng hoạt động" ở dòng A rồi ngay sau đó ở dòng B: hai `PUT` (REQ-004 giữ nguyên). Bấm đúp ở một dòng: một `PUT`.
  7. Chọn một lựa chọn không ai khớp: vùng danh sách hiện "Không có khách hàng nào khớp lựa chọn lọc.", không có bảng. Chọn lại "Tất cả": bảng hiện lại.
  8. Chọn "Đang hoạt động" rồi ngừng hoạt động lần lượt mọi dòng (mỗi lần cách nhau hơn nửa giây): sau dòng cuối, vùng danh sách hiện câu "không khớp".
  9. Chọn "Ngừng hoạt động", thêm một khách hàng: form trắng lại; hiện "Đã thêm khách hàng." không phải màu đỏ; bảng không có khách hàng mới; điều khiển vẫn là "Ngừng hoạt động".
  10. Ngay sau bước 9, làm một thao tác bất kỳ (đổi lựa chọn, bấm "Sửa", bấm một nút đổi trạng thái): thông báo mất. Chọn "Tất cả": khách hàng mới có trong bảng.
  11. Chọn "Tất cả", rồi "Đang hoạt động", mỗi lần thêm một khách hàng: không có thông báo; dòng mới có trong bảng.
  12. Chọn "Ngừng hoạt động", thêm với email đã dùng: `#message` hiện câu lỗi màu đỏ; không có thông báo đã thêm; danh sách không tải lại.
  13. Chọn "Ngừng hoạt động", chặn `GET /api/customers?status=INACTIVE` bằng công cụ của trình duyệt ([CẦN XÁC NHẬN] tuỳ trình duyệt), rồi thêm một khách hàng: thông báo đã thêm vẫn hiện; vùng danh sách hiện "Không tải được danh sách khách hàng.".
  14. Nút "Sửa", form sửa, nút "Huỷ" hoạt động như trước; mọi câu lỗi vẫn hiện màu đỏ ở `#message`.
  - Ca "xem Tất cả khi hệ thống chưa có khách hàng nào" không chạy tay được: `App.main` seed hai khách hàng và chưa có thao tác xoá (`aiws/knowledge/db-schema.md`). Ca này chỉ có unit test của D1.

## Migration
Không có script migration, vì không có DB và không đổi API.

- **Deploy:** chỉ FE (file tĩnh). BE không có thay đổi lúc chạy (chỉ code test) nên không cần deploy lại, và không có ràng buộc thứ tự FE/BE.
- **`index.html` và `src/` phải được đưa lên cùng nhau.** `main.js` mới trên `index.html` cũ không tìm thấy `#notice`, và `clearMessages()` ném lỗi ở mọi handler. [CẦN XÁC NHẬN] cách phục vụ và cache file tĩnh: repo không có dev server hay cấu hình server (`aiws/knowledge/system-map.md` → Phụ thuộc ngoài).
- **Rollback:** đưa lại bản FE trước (cả `index.html` lẫn `src/`). Không có dữ liệu nào phải đưa về như cũ: state của guard chỉ nằm trong bộ nhớ của trang, và REQ-006 không đổi dữ liệu nào ở BE.
- **Dữ liệu legacy:** không đọc hay ghi `source-legacy`. Legacy không có màn hình lọc (`source-legacy/customer_list.php`) và sau khi lưu thì chuyển hướng về danh sách, không có thông báo (`source-legacy/customer_save.php` dòng 50), nên không có hành vi legacy nào về ba điểm này phải giữ.
- Sau khi merge, phase knowledge cập nhật:
  - `aiws/knowledge/system-map.md`: dòng "FE: trang chính" (`#notice`), "FE: entry" (`clearMessages`, key của guard, thông báo sau khi thêm), "FE: component bảng" (tham số `statusFilter`, hai câu), "FE: tiện ích" (hai file mới); luồng 1 (câu trạng thái rỗng), luồng 2 (thông báo sau khi thêm), luồng 6 (bấm đúp khi đang lọc).
  - `aiws/knowledge/conventions.md`: State và render (lựa chọn lọc được đọc thêm ở `refresh()` và ở listener đổi trạng thái); Xử lý lỗi (lần đầu có thông báo thành công; mỗi handler xoá cả `#message` lẫn `#notice`); bảng mã TC của REQ-006, năm mã bị sửa và định nghĩa lại, câu "đánh số tiếp từ TC-135" đã cũ.
  - `aiws/knowledge/glossary.md`: thuật ngữ "Lựa chọn lọc" (định nghĩa "đang lọc", hành vi bấm đúp khi đang lọc).
  - `aiws/knowledge/api-inventory.md`, `aiws/knowledge/db-schema.md`: không đổi.

## Rủi ro
- **R1: `index.html` và phần nối trong `main.js` không có unit test.** Ba hàm thuần đúng nhưng nối sai thì AC-1..AC-4 hỏng mà `fe_test` vẫn pass: đọc lựa chọn sau `await` (D2), xoá thông báo trước khi hỏi guard (D4), gán thông báo trong `catch` hoặc sau `refresh()` (D6), sót một trong sáu chỗ `clearMessages()`. Giảm thiểu: D2, D4, D6 ghi thành điểm bắt buộc kèm đoạn mã mẫu và bảng sáu dòng; mười bốn bước chạy tay ở mục FE change.
- **R2: Khi đang lọc, lần bấm chủ động vào khách hàng khác trong vòng 500 ms bị bỏ qua im lặng** (hệ quả của AC-2, Q2). Nhân viên đổi trạng thái nhiều khách hàng liên tiếp thật nhanh sẽ thấy một lần bấm "không ăn"; bấm lại là được. Không có trạng thái "đang xử lý" (ngoài phạm vi). Dưới "Tất cả" không có hạn chế này.
- **R3: Đổi lựa chọn lọc giữa hai lần bấm** (Q3, D4). Hai chế độ giữ mốc riêng, nên một lần bấm ngay sau khi đổi giữa "Tất cả" và một lựa chọn lọc không bị chặn bởi lần bấm trước. Ca có hậu quả: đang lọc, ngừng A, chuyển "Tất cả", bấm nút của A trong vòng 500 ms kể từ lần bấm đầu thì A được kích hoạt lại. Cần ba thao tác trong nửa giây, một cú bấm đúp không tạo ra được. Chấp nhận.
- **R4: Bấm ba lần liên tiếp, hoặc bấm lại vì sốt ruột khi mạng chậm, khi đang lọc.** Giới hạn đã biết của REQ-004 (`aiws/work/REQ-004/02-design.md` R2, R3) **nặng hơn khi đang lọc**: lần bấm tới từ 500 ms trở đi được xử lý, và nếu bảng đã vẽ lại thì nó rơi vào khách hàng kế tiếp chứ không phải khách hàng vừa đổi. REQ-006 chỉ xử lý cú bấm đúp (`01-analysis.md` → Ngoài phạm vi). Thao tác đảo lại được bằng "Kích hoạt lại", trừ khi số điện thoại đã bị khách hàng khác lấy (BR-09).
- **R5: Ca R2 của requirement chưa được tái hiện.** [CẦN XÁC NHẬN] requirement mô tả nó là hiện trạng, nhưng repo không có ghi nhận chạy tay nào (`01-analysis.md` Q2). Bước chạy tay 1 và 2 dùng để tái hiện trước và sau khi sửa. Nếu trên trình duyệt đích lần bấm thứ hai không bao giờ rơi vào dòng kế tiếp thì D3 vẫn vô hại: nó chỉ thêm hạn chế ở R2.
- **R6: Phần (a) của AC-5 và AC-6 không chứng minh được bằng chạy test.** Assertion chặt hơn vẫn pass trên code đúng. Phép kiểm "mã TC có mặt trong file test mà task đã sửa" của orchestrator pass sẵn với TC-117, TC-118, TC-120, TC-122, TC-127 nhờ tên test cũ, kể cả khi chưa sửa gì. **Reviewer phải đọc diff của năm test này**; phần (b) kiểm bằng số lần chạy 173 / 107 / 399 và 53 test FE cũ.
- **R7: Developer đổi nhầm dữ liệu hoặc thân test khi sửa helper của F1.** Số lần chạy vẫn đúng nếu chỉ sai tên hay số điện thoại. Giảm thiểu: D7 ghi đủ bốn dòng dữ liệu; reviewer so với bảng "Dữ liệu chung" của `aiws/work/REQ-005/03-test-spec.md` và xác nhận diff của file chỉ chạm helper.
- **R8: F3 so với `all` nên vẫn là phép so tương đối.** Nếu serializer bỏ một field ở cả hai response thì `get(field)` cho `null` ở cả hai phía và phép so vẫn pass. Việc "field luôn có mặt" do F2 (TC-120) và TC-27, TC-31, TC-62 giữ; F3 chỉ đòi "bằng đúng phần tử cùng `id` trong `all`".
- **R9: Thông báo đã thêm ở lại cho tới thao tác kế tiếp.** Không tự ẩn. Nếu nhân viên không làm gì thì câu vẫn hiện; nó vẫn đúng. Thao tác kế tiếp nào cũng xoá nó, kể cả thao tác không liên quan (bấm "Sửa").
- **R10: `role="status"` chưa được thử với trình đọc màn hình.** [CẦN XÁC NHẬN] repo không khai báo trình duyệt hay công nghệ hỗ trợ đích. Vùng này có sẵn trong trang từ lúc tải (phần tử tĩnh), là điều kiện để vùng live hoạt động. Với người dùng nhìn màn hình thì không phụ thuộc điểm này.
- **R11: `index.html` và `main.js` lệch phiên bản** (Migration). `main.js` mới trên `index.html` cũ làm mọi handler ném lỗi tại `clearMessages()`. Cùng loại rủi ro với `#status-filter` của REQ-005. Giảm thiểu: deploy và rollback hai file cùng nhau.
- **R12: Nới lệnh cấm của REQ-005 D9** (D2). Một developer sau này có thể đọc `statusFilter` của `refresh()` như tiền lệ để giữ bản sao lựa chọn ở mức module. Giảm thiểu: D2 ghi rõ biến chỉ sống trong một lần `refresh()` và `getStatus` không đổi; phase knowledge ghi lại.
- **R13: State và bảo mật.** `Map` của guard thêm đúng một mục (key chung), mất khi tải lại trang; không lưu PII. Hai câu mới là hằng, giá trị lựa chọn lọc và `status` của khách hàng vừa tạo không bao giờ được chèn vào HTML hay vào câu thông báo; `#notice` gán bằng `textContent`. Không đọc hay ghi bí mật.
- **R14: `Symbol` trong code chạy trên trình duyệt.** Là ES2015, cũ hơn ES modules, `?.`/`??` và `Object.hasOwn` mà FE đã cần (`aiws/work/REQ-004/02-design.md` R6); Node ≥ 22 của build và test có sẵn. Không thêm yêu cầu trình duyệt mới.

## Quyết định cần duyệt
- **Ba quyết định đã duyệt bị đảo, một bị thu hẹp, một bị nới:**
  - `aiws/work/REQ-005/02-design.md` D10, phương án A "không chặn bấm đúp khi đang lọc": nay chặn, theo phương án C (D3, D4).
  - `aiws/work/REQ-005/02-design.md` D9, hệ quả "vẫn là câu Chưa có khách hàng." (Q6 ở đó): nay có câu riêng khi đang lọc (D1).
  - `aiws/work/REQ-005/02-design.md` D9, hệ quả "không thêm thông báo sau khi thêm" (Q5 ở đó): nay có thông báo khi khách hàng mới không khớp lựa chọn lọc (D5, D6).
  - `aiws/work/REQ-004/02-design.md` D1 (cửa sổ tính riêng cho từng khách hàng) và biến thể cuối của AC-2 ở REQ-004: **thu hẹp** còn khi xem "Tất cả"; khi đang lọc, cửa sổ chung cho mọi khách hàng (D3).
  - `aiws/work/REQ-005/02-design.md` D9, điểm bắt buộc "không gán `filterEl.value` vào một biến": **nới** cho một biến cục bộ trong `refresh()`, chỉ để chọn câu trạng thái rỗng (D2, R12). Phương án giữ nguyên chữ của D9 là đọc `filterEl.value` lúc vẽ; nếu muốn cách đó thì nói ở bước này.
- **Quy tắc bấm đúp khi đang lọc** (Q2, Q3; D3, D4):
  - Khi đang lọc, **mọi** lần bấm vào nút đổi trạng thái, của bất kỳ khách hàng nào, tới dưới 500 ms sau một lần bấm được xử lý đều bị bỏ qua, không có phản hồi nào (R2). Khi xem "Tất cả" giữ nguyên REQ-004.
  - Cách khác: áp cùng quy tắc cả khi xem "Tất cả". Một quy tắc cho mọi lúc, nhưng đảo REQ-004 ở nơi không có rủi ro. Nếu muốn thì nói ở bước này; khi đó AC-3 đổi và `chooseStatusClickKey` không còn cần.
  - Đổi lựa chọn giữa hai lần bấm (Q3): hai chế độ giữ mốc riêng; hai lựa chọn lọc dùng chung một mốc (R3).
  - **Không** chặn bấm ba lần liên tiếp và bấm lại khi mạng chậm; khi đang lọc hai ca này có thể đổi trạng thái khách hàng kế tiếp (R4).
  - [CẦN XÁC NHẬN] ca R2 của requirement chưa được tái hiện bằng chạy tay (R5).
- **Câu trạng thái rỗng** (Q1; D1): "Không có khách hàng nào khớp lựa chọn lọc." cho cả hai lựa chọn lọc, kể cả khi kho hoàn toàn rỗng mà đang lọc. "Chưa có khách hàng." chỉ còn khi xem "Tất cả".
- **Thông báo sau khi thêm** (Q4, Q5, Q6; D5, D6):
  - Hiện **chỉ khi** đang lọc và khách hàng mới không khớp lựa chọn lọc, xét theo `status` mà API trả (không mặc định là `ACTIVE`). Không đọc được `status` thì coi là không khớp. Cách khác: hiện sau mọi lần thêm thành công; nếu muốn thì nói ở bước này (biến thể thứ hai của AC-4 và bảng của D5 đổi).
  - Câu "Đã thêm khách hàng.", không nói lý do khách hàng không hiện trong bảng.
  - Vẫn hiện khi lần tải lại danh sách ngay sau đó thất bại (Q6).
  - Mất ở thao tác kế tiếp của nhân viên (sáu handler), không tự ẩn (R9).
- **Giao diện** (D6). [CẦN XÁC NHẬN] legacy không có màn hình tương ứng để theo, nên các điểm dưới đây là đề xuất:
  - Vùng mới `<p id="notice" role="status">` ngay dưới vùng lỗi `#message`, trên form sửa.
  - Chữ màu xanh lá đậm (`#166534`), một luật CSS mới `.notice`. Phương án khác: không thêm luật, dùng màu chữ mặc định.
  - [CẦN XÁC NHẬN] `role="status"` chưa được thử với trình đọc màn hình (R10).
- **Public API và file mới, không đổi cấu trúc thư mục** (D1, D3, D5, D6):
  - `renderCustomerTable` nhận thêm tham số tuỳ chọn thứ hai `statusFilter = ''`; mọi lời gọi cũ giữ nguyên nghĩa và kết quả.
  - File mới: `source-fe/src/utils/chooseStatusClickKey.js`, `source-fe/src/utils/describeCreateNotice.js` và hai file test tương ứng. Cả hai là hàm thuần, cùng dạng với `describeStatusError.js`.
  - Key chung của guard là một `Symbol`, lần đầu guard nhận key không phải chuỗi (D3, R14).
  - `index.html` thêm một phần tử và một luật CSS; `main.js` thêm hàm cục bộ `clearMessages()`.
- **Sửa năm test của REQ-005, giữ nguyên mã, tên hiển thị, dòng dữ liệu và số lần chạy** (D7, D8, D9):
  - TC-117, TC-118 (`CustomerServiceTest.java`): chỉ helper `insertByStatuses` đổi dữ liệu.
  - TC-120, TC-122 (`CustomerHandlerTest.java`): chỉ thêm assertion.
  - TC-127 (`customerApi.test.js`): chỉ đổi tên biến thành `internalError500` (Q9).
  - **TC-119 không sửa** (Q7): nó không dùng chung helper, nên bốn dòng dữ liệu chuẩn có mặt ở hai chỗ trong `CustomerServiceTest.java`. Nếu muốn TC-119 gọi chung helper (trọn đề xuất của F1) thì nói ở bước này: thêm một test bị sửa và một mã phải định nghĩa lại, 32 lần chạy giữ nguyên.
  - **F2 không thêm kỳ vọng số điện thoại cụ thể của `id` 2 và 3** (Q8). Nếu muốn khẳng định trọn gạch đầu dòng đó của test spec REQ-005 thì nói ở bước này: thêm hai phép so trong cùng vòng lặp.
- **Mã TC** (Q10; D10): kỳ vọng mới đánh số tiếp từ TC-135; năm mã TC-117, TC-118, TC-120, TC-122, TC-127 được định nghĩa lại trong test spec của REQ-006. Phần "đã chặt hơn" của AC-5 và AC-6 chỉ kiểm được bằng review diff (R6).
- **Kiểm chứng AC-1..AC-4 ở mức trang là chạy tay** (R1): người review PR chạy mười bốn bước ở mục FE change; ca "Tất cả với kho rỗng" chỉ có unit test.
- **Không đổi API, không DB, không migration**; chỉ deploy FE, `index.html` và `src/` cùng nhau (API, Migration, R11).
