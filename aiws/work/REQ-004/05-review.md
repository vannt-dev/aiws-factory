# REQ-004 — Review

## Tóm tắt
**Sẵn sàng tạo PR.** Không có finding nào ở cả ba mức. Phần còn lại cho người review PR là bảy bước chạy tay (xem "Giới hạn" bên dưới).

- Phạm vi đã đọc: toàn bộ 6 file nguồn đổi so với `58fefb3` (1 file test BE, 5 file FE) cùng diff của chúng, đối chiếu với `02-design.md` (D1..D8), `03-test-spec.md` (TC-92, TC-97, TC-105, TC-108..TC-114), `04-plan.yaml` (T1..T3), `api-contract.yaml` và `trace.md`.
- Design được duyệt nguyên trạng (`approvals/design-01.yaml`: `decision: approved`, không kèm ghi chú chọn phương án thay thế). Các lựa chọn ở mục "Quyết định cần duyệt" (ngưỡng 500 ms, cửa sổ neo vào lần bấm được xử lý, `event.timeStamp`, `Object.hasOwn`, không sửa ô "Trạng thái", không sửa TC-98) vì thế là thiết kế đã duyệt; các rủi ro R2..R7 là rủi ro đã chấp nhận, không phải finding.
- Code hiện thực đúng từng quyết định D1..D8. `createDoubleClickGuard.js` và ba dòng mới của `main.js` trùng nguyên văn mã mẫu của D2 và D4; dòng 16 của `customerTable.js` trùng nguyên văn D5.
- Cả 10 TC đều có trong code, đúng file theo bảng phân bổ của test spec, đủ dòng dữ liệu và đúng thứ tự; tên hiển thị trùng từng ký tự với bảng đó. Mã TC gắn qua `test('TC-n: ...')` (FE) và `@DisplayName("TC-n: ...")` (BE).
- Số test khớp test spec: FE 36 → 37 sau T2 (+TC-114) → 43 sau T3 (+TC-108..TC-113); BE 311 lần chạy, `CustomerHandlerTest` 68, đều pass.
- **Ba test của REQ-003 bị sửa (R9, R10): đã đọc diff của từng test**, không dựa vào phép kiểm "mã TC có mặt".
  - TC-105: đúng hai thay đổi của D6, năm assertion cũ còn nguyên.
  - TC-92, TC-97: chỉ đổi nguồn dữ liệu. 8 body của TC-97 đã so từng chuỗi với các dòng `@ValueSource` bị xoá và với `aiws/work/REQ-003/03-test-spec.md` dòng 431–438: đủ 8, đúng thứ tự.
- Test spec còn ba nhận định đánh dấu [CẦN XÁC NHẬN] vì chưa chạy kiểm chứng (hai nhận định đầu giao developer xác nhận). Báo cáo của developer không nhắc tới cái nào (`evidence/runs/run-0006.json`, `run-0007.json`). Lần review này kiểm lại bằng đọc code (không chạy), cả ba đều đúng:
  - **TC-114 fail trên code trước D5.** Dòng 16 cũ `STATUS_ACTIONS[c.status]` trả hàm `Object` (với `'constructor'`), một hàm kế thừa (với `'toString'`, `'valueOf'`, `'hasOwnProperty'`) hoặc `Object.prototype` (với `'__proto__'`). Cả năm đều truthy nên nút vẫn được dựng, và `assert.doesNotMatch(html, /data-status-id/)` fail ở mọi dòng dữ liệu. Test vì thế chứng minh được AC-3.
  - **TC-105 sau khi sửa pass cả trước lẫn sau D5.** Năm dòng dữ liệu của nó không trùng tên thuộc tính kế thừa nào; với object không có key `status`, cả hai cách tra đều không cho nút.
  - **Dòng `'__proto__'` của TC-112 bắt được state lưu bằng object thường.** Phép gán một số vào `obj['__proto__']` không tạo thuộc tính riêng, lần đọc sau trả `Object.prototype`, `at - last` là `NaN` nên lần gọi thứ hai trả `true` thay vì `false`. Bốn key còn lại vẫn pass với object thường, đúng như test spec ghi.
- Cấu trúc dự án không bị phá.
  - Hai file mới đặt đúng chỗ: `source-fe/src/utils/createDoubleClickGuard.js`, `source-fe/test/createDoubleClickGuard.test.js`.
  - Không đổi tên, di chuyển, xoá hay reformat: diff chỉ có đúng các dòng cần đổi (`main.js` +3, `customerTable.js` 1 dòng, `CustomerHandlerTest.java` 31 dòng); `git diff --check` sạch.
  - Không file nào dưới `source-be/src/main/` đổi. Không thêm dependency hay thư mục. Public API cũ giữ nguyên.
- Style: JS dùng nháy đơn, chấm phẩy, thụt 2 dấu cách, tên file trùng tên export và bắt đầu bằng động từ, hằng `UPPER_SNAKE_CASE`, JSDoc một dòng cho hàm export mới. Hai provider Java là `private static`, thụt lề và xuống dòng như các provider liền kề (`deactivateBodies`, `malformedStatusPaths`).
- Bảo mật (OWASP): không có đầu vào hay điểm ghi HTML mới.
  - `Object.hasOwn` đóng đường tra thuộc tính kế thừa bằng dữ liệu từ API (F2).
  - State của guard là `Map`, nên `id` lấy từ dữ liệu không bao giờ thành tên thuộc tính của object.
  - State chỉ gồm `id` và một mốc thời gian, không có PII, không log, mất khi tải lại trang (R11).
- Truy vết đủ: `trace.md` có AC-1..AC-4 → TC → task → commit, không có problem. Ba commit hiện thực mang đủ trailer `REQ-ID`, `Task`, `Tests`, `AIWS-Run` và type đúng Conventional Commits (`c8e76a1` test, `75cedc3` fix, `5ca2000` fix). `files_changed` của `run-0005..0007` nằm trọn trong `allowed_files`, không có `scope_violations_reverted`.

Giới hạn của lần review này:
- **Không chạy lại test.** Kết quả lấy từ evidence của orchestrator.
  - BE: 311 pass sau T1 (`evidence/test-results/T1-attempt-1.yaml`); không file BE nào đổi sau T1.
  - FE: 43 pass sau T3 (`evidence/test-results/T3-attempt-1.yaml`).
  - Evidence T1 ghi `testCompile: Nothing to compile`, vì developer đã tự build trước đó trong cùng run (`run-0005.json`). Đã kiểm rằng lần chạy đó dùng đúng code mới: `source-be/target/test-classes/.../CustomerHandlerTest.class` chứa `reactivatedCustomerIds` và `invalidTargetStatusBodies`, không còn `ValueSource`; báo cáo Surefire (`target/surefire-reports/TEST-com.example.crm.api.CustomerHandlerTest.xml`, 68 test, 2.111 s như trong evidence) có `reactivateReturns200AndRestoresCustomer(long)[1]..[2]` và `invalidTargetStatusReturns400(String)[1]..[8]`. `target/` là sản phẩm build tại máy chạy, không nằm trong repo.
- **Phần nối guard vào sự kiện `click` (`source-fe/src/main.js:80`) không có test tự động** (R1). Nó chỉ được kiểm bằng đọc diff theo các điểm bắt buộc của D4 (bảng dưới). **Người review PR cần chạy tay bảy bước** ở mục "Không có TC tự động" của `03-test-spec.md`. Developer cũng ghi rõ chưa chạy bước nào (`run-0007.json`).
- F1 (bấm đúp đảo ngược thao tác) vẫn chưa từng được tái hiện bằng chạy tay. [CẦN XÁC NHẬN] nên thử bước 1 và 2 trên bản trước REQ-004 để thấy lỗi, rồi trên bản này để thấy lỗi hết.
- `event.timeStamp` (R5) và `Object.hasOwn` (R6) chưa được chạy trên trình duyệt nào. [CẦN XÁC NHẬN] repo không khai báo trình duyệt hỗ trợ; bước chạy tay 1, 2 và 4 là chỗ kiểm.

## Findings
Không có.

## Đối chiếu design
Mọi quyết định D1..D8 đã được hiện thực đúng.

| Quyết định | Kết quả | Dẫn chứng |
| --- | --- | --- |
| D1: cửa sổ cố định 500 ms, theo từng khách hàng, neo vào lần bấm được xử lý; 499 ms bỏ qua, đúng 500 ms xử lý; quyết định chỉ phụ thuộc `(id, at)` | Đúng | `createDoubleClickGuard.js:1` (hằng 500), `:8` (so `<`, không phải `<=`), `:9` (chỉ lần được xử lý mới dời mốc). Biên: TC-108 (0, 1, 499, 499.9), TC-109 (500, 501, 100000). Không trượt: TC-110 dòng 1. Lần được xử lý dời mốc: TC-110 dòng 2. Theo từng key: TC-111 |
| D2: đơn vị mới `src/utils/createDoubleClickGuard.js`, export đúng một hàm, trả `(key, at) => boolean`; state là `Map`; so `last` với `undefined`; chỉ ghi khi trả `true`; factory; không import, không đọc đồng hồ, không đụng DOM | Đúng | `createDoubleClickGuard.js:4-11`: `new Map()` trong closure (`:5`), `last !== undefined` (`:8`), `set` đứng sau nhánh `return false` (`:9`). File không có `import`, `Date`, `performance`, `document`. Chín kịch bản trong bảng hành vi của D2 đều có dòng dữ liệu tương ứng trong TC-108..TC-113; mốc `0` là TC-108 dòng 5; hai guard không chung state là TC-113 |
| D3: thời điểm bấm là `event.timeStamp`, do `main.js` truyền vào | Đúng | `main.js:80`. Diff không thêm `Date.now()` hay `performance.now()`. Chưa chạy trên trình duyệt (R5, xem "Giới hạn") |
| D4: một guard tạo ở mức module; hỏi guard ngay sau khi nhận ra nút và **trước** khi xoá `#message`; key là `button.dataset.statusId`; không gọi guard ở `catch`/`finally`; không khoá "đang chờ", không `disabled`; phần còn lại của file không đổi | Đúng | Import ở `main.js:5`; `const acceptStatusClick = createDoubleClickGuard()` ở `:11`, cạnh `listEl`, `messageEl`, ngoài listener và ngoài `refresh()`. Dòng `:80` đứng trước `messageEl.textContent = ''` (`:81`). `catch` (`:85-87`) chỉ gọi `describeStatusError`; không có `finally`. Diff của file là đúng 3 dòng thêm, 0 dòng xoá, nên `refresh()`, listener nút "Sửa", hai listener trên `#edit-customer` và submit của `#create-form` không đổi. Lần bấm bị bỏ qua cũng không đi qua dòng xoá `#message` của listener nút "Sửa", vì listener đó thoát ở `:39` khi nút không có `data-edit-id` |
| D5: tra `STATUS_ACTIONS` bằng `Object.hasOwn`, chỉ dòng 16 đổi; dòng 23 (`STATUS_LABELS`) không đổi | Đúng | `customerTable.js:16` trùng nguyên văn design; diff của file là 1 dòng. Hằng (`:5-8`), biểu thức dựng nút (`:17-19`) và dòng `:23` không đổi, nên HTML của dòng `ACTIVE`/`INACTIVE` giữ nguyên: TC-36, TC-74, TC-103, TC-104 không bị sửa và pass. R7 (ô "Trạng thái" của trạng thái trùng tên thuộc tính có sẵn) còn nguyên như design đã duyệt; giá trị vẫn qua `escapeHtml` |
| D6: sửa TC-105 đúng hai điểm; thêm test mới liền sau TC-105 cho năm trạng thái trùng tên thuộc tính có sẵn | Đúng | TC-105 (`customerTable.test.js:214-233`): giữ mã, tên, vị trí (sau TC-104) và kiểu "một mảng, lặp `for...of`". Bảng dữ liệu nay là năm khách hàng theo đúng thứ tự cũ, dòng thứ năm không có key `status` (`:220`). Năm assertion cũ còn nguyên (`:226-230`), thêm đếm 6 `<td>` (`:231`). TC-114 (`:235-251`): đặt liền sau TC-105, đủ năm `status`, đủ sáu kỳ vọng của test spec. Nó dùng `/>undefined<\/button>/` chứ không dùng `/undefined/` trần, và không assertion nào nhìn ô "Trạng thái". `git diff` hiển thị thân cũ của TC-105 dưới tên TC-114; đó chỉ là cách git ghép hunk, đã đối chiếu trên file cuối |
| D7: TC-92 và TC-97 sang `@MethodSource`; provider `private static` ngay sau test; xoá import `ValueSource`; không gì khác đổi | Đúng | `CustomerHandlerTest.java`. TC-92 `:474-476`: thứ tự annotation `@ParameterizedTest(name = "[{index}]")`, `@MethodSource`, `@DisplayName`; provider `reactivatedCustomerIds` `:496-498` trả `Stream<Long>` với `Stream.of(1L, 2L)`. TC-97 `:621-623`; provider `invalidTargetStatusBodies` `:637-647` trả `Stream<String>` với 8 chuỗi đúng thứ tự. `@DisplayName`, tên method, chữ ký và thân của hai test không có dòng nào trong diff. File không còn chữ `ValueSource`; phần import của `params.provider` chỉ còn `Arguments` và `MethodSource` (`:25-26`), nên mọi test tham số hoá của lớp dùng cùng một kiểu. Hai tên provider không trùng 13 provider có sẵn. TC-98, `CustomerServiceTest`, `InMemoryCustomerRepositoryTest` và `source-be/src/main/` không có trong diff. Số lần chạy: 68 / 311, TC-92 2 lần, TC-97 8 lần |
| D8: test bị sửa giữ mã và tên hiển thị; kỳ vọng mới mang mã từ TC-108 | Đúng | TC-92, TC-97, TC-105 giữ nguyên tên hiển thị. TC-108..TC-113 nằm trong `test/createDoubleClickGuard.test.js`, TC-114 trong `test/customerTable.test.js`. Trailer `Tests` của ba commit khớp trường `tests` của T1..T3 trong `04-plan.yaml` |

Đối chiếu test spec (phần Chiến lược):
- File test của guard không dùng `setTimeout`, `Date.now()`, `performance.now()`, mock timer hay fake nào; thời điểm là số truyền vào. Mỗi dòng dữ liệu tạo một guard mới trong vòng lặp (`createDoubleClickGuard.test.js:15`, `:31`, `:45`, `:64`, `:74`).
- Kết quả được so chặt. TC-108, TC-109, TC-112, TC-113 dùng `assert.equal(..., true)` / `assert.equal(..., false)`. TC-110 và TC-111 gom kết quả từng lời gọi vào một mảng rồi so bằng `assert.deepEqual` (`:47`, `:66`); với `node:assert/strict` đó là so sánh chặt từng phần tử và đúng thứ tự, nên một giá trị truthy như `1` không qua được. Đạt yêu cầu "so chặt, không phải truthy/falsy" của test spec.
- Cấu trúc Arrange-Act-Assert tách bằng dòng trống; không có comment AAA, như TC-104, TC-105 và TC-107 đang có (`aiws/knowledge/conventions.md` → Test → FE ghi comment AAA không đồng đều).

Các ràng buộc khác của design:
- Không đổi: `index.html`, `src/api/customerApi.js`, `src/utils/describeStatusError.js`, `src/utils/escapeHtml.js`, `src/utils/formatPhone.js`, `src/components/customerEditForm.js`, `scripts/build.mjs`, `package.json`. Không file nào trong số này có trong diff.
- Không DB, không migration, không dependency hay thư mục mới: đúng.
- Rủi ro đã duyệt và vẫn còn sau REQ này, để người review PR biết khi chạy tay: bấm ba lần liên tiếp có thể đảo trạng thái (R3); bấm lại sau 500 ms trên mạng chậm được coi là thao tác chủ động (R2); lần bấm bị bỏ qua không có phản hồi nào trên màn hình (R4).
- Việc của phase knowledge sau khi merge (design → Migration), không phải finding. Ba chỗ trong `aiws/knowledge/conventions.md` sẽ lệch với code:
  - dòng 13: `src/utils/` là "hàm tiện ích thuần" (nay có một factory trả về hàm có state);
  - dòng 27–29 (State và render): chưa nhắc state của guard mà `main.js` giữ từ REQ này;
  - dòng 40: mọi handler của người dùng, kể cả bấm nút đổi trạng thái, xoá `#message` trước khi chạy (nay lần bấm bị bỏ qua thì không xoá).

## Đối chiếu api-contract
`api-contract.yaml` có `paths: {}`: REQ-004 không thêm và không đổi endpoint nào. Code khớp với điều đó.

| Mục | Kết quả | Dẫn chứng |
| --- | --- | --- |
| BE không đổi path, method, schema, mã trạng thái hay format lỗi | Đúng | File BE duy nhất trong diff là `source-be/src/test/java/com/example/crm/api/CustomerHandlerTest.java`; `git diff 58fefb3 HEAD -- source-be/src/main` rỗng |
| Hành vi BE được kiểm không đổi | Đúng | TC-92 và TC-97 giữ nguyên thân test và dữ liệu; 311 lần chạy đều pass, bằng mốc của REQ-003 |
| FE vẫn gọi `PUT /api/customers/{id}/status` với body `{"status": ...}` theo contract của REQ-003 | Đúng | `source-fe/src/api/customerApi.js:44-46` không có trong diff. `main.js:83` vẫn gọi `updateCustomerStatus(button.dataset.statusId, button.dataset.targetStatus)`, dòng này không đổi |
| Giá trị `status` FE gửi đi thuộc enum `CustomerStatus` | Đúng, chặt hơn trước | `data-target-status` chỉ được sinh từ thuộc tính riêng của `STATUS_ACTIONS` (`customerTable.js:16-18`). Trước D5, `status` trùng tên thuộc tính kế thừa cho một nút gửi `status` rỗng (BE trả 400 `errors.status`) |
| FE không gọi thêm endpoint nào; xử lý lỗi không đổi | Đúng | Diff của `main.js` không thêm lời gọi API nào; `catch` vẫn dùng `describeStatusError` (`main.js:85-87`); TC-102, TC-106, TC-107 không sửa và pass |
| Thay đổi duy nhất phía mạng: một cú bấm đúp gửi một `PUT` và một `GET /api/customers` thay vì hai | Đúng theo đọc code | `main.js:80` thoát trước khi gọi API. Chưa quan sát trên tab Network: bước chạy tay 1, 2, 3 |

Các endpoint cũ (`GET`/`POST /api/customers`, `GET`/`PUT /api/customers/{id}`) không đổi và không nằm trong contract của REQ-004.
