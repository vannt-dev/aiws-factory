# Sổ tay AIWS

**Ngôn ngữ:** [English](handbook.md) · Tiếng Việt

Sổ tay này dẫn bạn đi hết một requirement, từ lúc viết ra tới lúc pull request được merge, và cho biết phải làm gì mỗi khi quy trình dừng lại. Nó dành cho người vận hành AIWS trên một dự án: developer hoặc tech lead.

[Hướng dẫn vận hành](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md) là tài liệu tra cứu về cài đặt, cấu hình và các lớp bảo vệ. Sổ tay không lặp lại nội dung đó mà dẫn link tới đúng mục bạn cần.

Ví dụ và số liệu lấy từ sáu requirement thật đã chạy trên workspace demo của repository [aiws-factory](https://github.com/vannt-dev/aiws-factory) (backend Java, frontend JavaScript và hệ thống legacy PHP). Bạn đọc được toàn bộ tài liệu của chúng trên [nhánh `demo`](https://github.com/vannt-dev/aiws-factory/tree/demo/aiws/work).

## Bạn làm gì, AI làm gì

| Bạn | AI, do orchestrator `aiws` điều khiển |
| --- | --- |
| Viết requirement | Phân tích thành acceptance criteria |
| Đọc design và test spec, rồi duyệt hoặc trả lại | Viết design, API contract và test spec |
| | Chia task nhỏ, viết code và unit test theo từng task, review kết quả |
| Review và merge pull request | Cập nhật knowledge sau khi merge |

Mỗi requirement bạn chạy hai lệnh duyệt. AI không chạy được hai lệnh này: chúng từ chối khởi động trong phiên AI.

**Lưu ý về ngôn ngữ.** Prompt của các agent và các template tài liệu trong bộ kit viết bằng tiếng Việt, nên analysis, design, test spec và review cũng ra tiếng Việt, với các heading như `Quyết định cần duyệt`. Orchestrator kiểm tra các heading đó. Muốn làm việc bằng ngôn ngữ khác, hãy dịch `aiws/agents/`, `aiws/templates/` và `aiws/skills/` cùng với `required_headings` trong `aiws/config/contracts/`. Việc này chưa được thử trên demo.

## 1. Trước requirement đầu tiên

Bạn dựng workspace một lần. Chi tiết nằm ở [mục 1 và 2](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md#1-cài-đặt) của hướng dẫn vận hành.

1. Cài CLI: `cd aiws/adapters/cli && npm install && npm link`.
2. Đưa code vào `source-fe/`, `source-be/` và `source-legacy/`.
3. Chạy `aiws detect --write` và kiểm tra các lệnh build, test mà nó ghi vào `aiws/config/policies.yaml`.
4. Điền `aiws/skills/fe-conventions` và `aiws/skills/be-conventions` bằng convention thật của code.
5. Chạy `aiws sync claude`, rồi `aiws discover`, và sửa lại những gì discovery ghi trong `aiws/knowledge/`.

Trước khi đi tiếp, hãy chạy `aiws check build`. Lệnh này chạy mọi lệnh build và test đã cấu hình. Nếu bây giờ nó lỗi thì về sau task nào cũng lỗi vì cùng lý do.

Trên Windows mà chưa `npm link`, hãy gõ `node aiws\adapters\cli\bin\aiws.js` ở mọi chỗ sổ tay ghi `aiws`.

## 2. Viết requirement

Requirement là một file Markdown ngắn do người viết và commit: `requirements/REQ-001-ten-ngan.md`. AI được đọc thư mục này nhưng không bao giờ ghi được vào đó.

Không có mẫu bắt buộc. Một requirement chạy tốt trên demo có ba phần: bối cảnh, những điều phải đúng khi làm xong, và phần ngoài phạm vi. Đây là REQ-003, đã rút gọn ([bản gốc](https://github.com/vannt-dev/aiws-factory/blob/demo/requirements/REQ-003-customer-status.md)):

```markdown
# REQ-003 — Ngừng hoạt động và kích hoạt lại khách hàng

## Bối cảnh

Hệ thống mới hiển thị trạng thái của khách hàng (đang hoạt động / ngừng hoạt động) nhưng chưa có
cách đổi trạng thái. Hệ thống cũ (`source-legacy`) lưu trạng thái trong cột `status` và có quy tắc:
số điện thoại chỉ phải duy nhất giữa các khách hàng **đang hoạt động**.

## Yêu cầu

- Nhân viên chuyển được một khách hàng đang hoạt động sang ngừng hoạt động, và ngược lại.
- Ngừng hoạt động không xoá và không sửa họ tên, email, số điện thoại của khách hàng.
- Không kích hoạt lại được một khách hàng nếu số điện thoại của họ đang được một khách hàng đang
  hoạt động khác dùng. Khi đó phải báo lỗi rõ ràng và trạng thái không đổi.
- Màn hình danh sách có cách để đổi trạng thái của từng khách hàng, và cập nhật lại sau khi đổi.

## Ngoài phạm vi

- Xoá khách hàng.
- Lọc hoặc tìm kiếm danh sách theo trạng thái.
```

Những điều đã giúp ích:

- **Nói điều gì phải đúng, đừng nói cách làm.** Design là việc của architect, và bạn là người duyệt nó.
- **Nêu rõ quy tắc nào phải giống hệ thống cũ.** Analyst đọc `source-legacy/` và trích dẫn những dòng nó dựa vào.
- **Viết phần "ngoài phạm vi".** Phần này giữ cho design không phình ra.
- **Giữ requirement nhỏ.** Sáu requirement của demo mỗi cái cho ra 4 đến 22 acceptance criteria và 3 đến 7 task. Khi thấy requirement quá lớn, analyst ghi điều đó trong phần câu hỏi mở.
- **Trỏ tới tài liệu cũ bằng đường dẫn** khi requirement nối tiếp một requirement khác, ví dụ `aiws/work/REQ-003/05-review.md`.

Khi có điều chưa rõ, analyst không lặng lẽ tự đoán. Nó ghi một câu hỏi mở. Câu hỏi `[blocking]` dừng lần chạy cho tới khi bạn trả lời bằng `aiws answer REQ-001 -m "..."`. Câu hỏi `[non-blocking]` đi kèm giả định analyst đã chọn, và bạn kiểm tra giả định đó ở gate duyệt design.

## 3. Bắt đầu chạy

```bash
aiws new REQ-001          # tạo aiws/work/REQ-001 và nhánh aiws/REQ-001
aiws run REQ-001          # chạy tới điểm kế tiếp cần bạn
```

`aiws run` in một dòng khi một agent bắt đầu và một dòng khi nó kết thúc. Đây là phần đầu của một lần chạy thật:

```
[REQ-003] analysis / analyst (attempt 1/3)
  ok -> design
[REQ-003] design / architect (attempt 1/3)
  ok -> design
[REQ-003] design / test-designer (attempt 1/3)
  ok -> design_approval (waiting_human)
```

Bạn không cần ngồi canh. Trên demo, lần chạy tới gate duyệt design sau khoảng 30 đến 60 phút. Bất cứ lúc nào, `aiws status REQ-001` cũng cho biết phase, các task, chi phí tới lúc đó và lý do của lần dừng gần nhất. `aiws stop REQ-001` yêu cầu lần chạy dừng sau bước hiện tại, và `aiws run REQ-001` chạy tiếp sau đó.

Để thư mục làm việc của bạn không bị chiếm trong lúc requirement chạy, hãy cho nó một worktree riêng: `aiws new REQ-001 --worktree ../ws-REQ-001`, rồi chạy các lệnh còn lại từ thư mục đó.

## 4. Gate duyệt design

Lần chạy dừng với `phase=design_approval status=waiting_human`. Chưa có dòng code nào được viết. Đây là lúc đổi hướng rẻ nhất, nên hãy dành thời gian đọc.

Tài liệu nằm trong `aiws/work/REQ-001/`. Hãy đọc theo thứ tự này:

1. **`02-design.md`, mục cuối "Quyết định cần duyệt".** Architect liệt kê mọi lựa chọn cần bạn cân nhắc, kèm các phương án nó đã loại. Những điều nó không tự kiểm chứng được mang nhãn `[CẦN XÁC NHẬN]`.
2. **`01-analysis.md`.** Kiểm tra từng acceptance criterion (`AC-1`, `AC-2`, ...) có nói đúng ý bạn không, và đọc các giả định ở mục "Câu hỏi mở".
3. **`03-test-spec.md`, mục cuối "Ma trận AC".** Mọi acceptance criterion đều phải có test case. Hãy đọc trọn vài test case: chúng phải nêu dữ liệu và kết quả mong đợi cụ thể.
4. **`api-contract.yaml`**, nếu requirement có đổi API.

Những câu nên tự hỏi khi đọc:

- Design có chỗ nào cố ý khác hệ thống cũ không, và bạn có đồng ý không?
- Architect có chọn phương án đơn giản ở chỗ bạn muốn phương án chặt, hoặc ngược lại không?
- Có điều gì trong phần "ngoài phạm vi" của bạn quay trở lại không?
- Có phần nào chỉ kiểm được bằng tay không? Trên demo, phần nối sự kiện trên trang không có unit test được liệt kê thành các bước chạy tay cho người review pull request.

Sau đó bạn quyết định:

```bash
aiws approve REQ-001 design
# hoặc trả lại kèm lý do; design được viết lại, và bạn duyệt lại
aiws reject REQ-001 design -m "Dùng phương án C cho bấm đúp, và trả 409 khi trùng"
```

Bạn cũng có thể sửa tay các tài liệu trước khi duyệt. Approval ghi lại hash của design, test spec và API contract. Nếu sau đó một trong các file này thay đổi, approval mất hiệu lực và requirement quay về gate này.

Đôi khi design yêu cầu bạn chọn. Ở REQ-005, design nêu ba cách xử lý bấm đúp khi đang lọc và được viết theo cách thứ nhất; duyệt nguyên trạng là chấp nhận lựa chọn mặc định đó, còn trả lại kèm ghi chú thì chọn được cách khác.

**Nếu chi phí đã cao**, hãy nâng ngân sách ngay lúc này, trước khi duyệt. Từ mức 80% ngân sách, `aiws run` nhắc điều này khi dừng ở gate. `aiws resume REQ-001 --budget 55` chạy được ở gate này; sau khi duyệt, requirement chạy tiếp, và ngân sách chỉ nâng được khi nó đã khoá requirement.

## 5. Trong lúc AI implement

Sau khi duyệt, hãy chạy lại `aiws run REQ-001`. Bạn không cần làm gì cho tới pull request.

- Planner chia design thành các task. Mỗi task ghi rõ các file được sửa và các test case phải phủ.
- Với mỗi task, agent developer viết code và unit test. Sau đó orchestrator tự chạy build và toàn bộ test, và chỉ commit khi chúng qua. Một task lỗi được làm tối đa ba lần, từ lần thứ hai có kèm lỗi trong prompt.
- Reviewer đối chiếu toàn bộ thay đổi với design, API contract và test spec, rồi viết `05-review.md`.

Có hai việc có thể xảy ra giữa chừng mà không cần bạn:

- **Review có finding critical.** Quy trình tự quay về planning, thêm một task sửa, rồi review lại. Lần review thứ hai là review tiếp nối, chỉ đọc kỹ phần đã thay đổi. Trên demo việc này xảy ra một lần, khi developer làm đúng phương án mà design đã loại tường minh.
- **Developer có câu hỏi.** Khi design sai hoặc thiếu, developer không tự chế: nó ghi `questions.md` và lần chạy dừng. Trả lời bằng `aiws answer REQ-001 -m "..."` để giữ design, hoặc `aiws redesign REQ-001 -m "..."` để quay lại phase design, khi đó phải duyệt lại.

## 6. Gate pull request

Lần chạy dừng với `phase=pr_approval status=waiting_human`. Từ đây là các bước của bạn.

1. **Push nhánh và mở pull request**, như với mọi thay đổi khác: `git push -u origin aiws/REQ-001`.
2. **Đọc `05-review.md` và `trace.md`.** Review liệt kê finding theo mức độ. Finding minor được để lại cho bạn quyết định. Ma trận truy vết nối từng acceptance criterion với test case, task và commit của nó. Sau đó hãy review chính phần diff.
3. **Muốn sửa gì thì nói trước khi merge:**

   ```bash
   aiws reject REQ-001 pr -m "TC-137 và TC-138: so trực tiếp hai giá trị, không so qua boolean"
   aiws run REQ-001
   ```

   Planner thêm một task sửa, developer làm task đó, rồi một lượt review tiếp nối chạy. Push lại là pull request tự cập nhật. Trên demo, một vòng như vậy cho thay đổi bốn dòng mất 7 phút AI chạy và tốn 3,39 USD.
4. **Merge pull request.** Cách merge nào cũng được; merge commit giữ mỗi task một commit, tốt nhất cho truy vết.
5. **Xác nhận đã merge.** Cập nhật nhánh gốc ở máy trước, rồi chạy `aiws approve REQ-001 pr`. Lệnh này kiểm tra nhánh đã thật sự được merge, ghi approval và chuyển sang nhánh mới `aiws/REQ-001-knowledge`.
6. **Kết thúc.** `aiws run REQ-001` cập nhật `aiws/knowledge/` theo những gì requirement đã đổi. Push `aiws/REQ-001-knowledge` và merge nó qua một pull request nhỏ riêng. Lúc này requirement ở trạng thái `done`.

Ở gate này không nâng trước được ngân sách, vì nhánh của requirement phải giữ nguyên đúng như pull request sẽ merge.

Hãy nhớ review nói được gì và không nói được gì. Reviewer đọc code và tài liệu; nó không bấm thử ứng dụng của bạn. Ở chỗ code không có test tự động, design liệt kê các bước chạy tay, và phải có người chạy chúng.

## 7. Khi lần chạy dừng lại

`aiws status REQ-001` luôn cho biết lý do. Dưới đây là những lần dừng bạn dễ gặp. Bảng đầy đủ nằm ở [mục 3](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md#3-vòng-đời-một-requirement) của hướng dẫn vận hành.

| `aiws status` báo | Nghĩa là | Bạn làm gì |
| --- | --- | --- |
| `design_approval` / `waiting_human` | Design đã sẵn sàng | Mục 4 |
| `pr_approval` / `waiting_human` | Code đã sẵn sàng cho pull request | Mục 6 |
| `analysis` / `waiting_human`, có câu hỏi blocking | Analyst không đi tiếp được nếu thiếu câu trả lời | `aiws answer REQ-001 -m "..."`, rồi `aiws run` |
| `design_change_requested` | Developer hỏi trong `questions.md` | `aiws answer` hoặc `aiws redesign`, rồi `aiws run` |
| `blocked`, "failed 3 attempts" | Một bước lỗi ở mọi lần được phép thử: ba lần, riêng review và knowledge update là hai lần | Đọc lý do và file cuối trong `evidence/runs/`. Sửa nguyên nhân hoặc revert bằng tay, rồi `aiws resume REQ-001` và `aiws run` |
| `blocked`, "budget exceeded" | Chi phí AI đã chạm ngân sách | `aiws resume REQ-001` cấp thêm một lần ngân sách; `--budget 80` đặt giới hạn mới |
| `running`, "paused by the AI usage limit" | Tài khoản AI hết giới hạn sử dụng; `aiws run` thoát với mã 75 | Không cần duyệt gì. Chạy lại `aiws run REQ-001` sau giờ đặt lại ghi trong thông báo |

Một số lỗi xuất hiện trước khi lần chạy bắt đầu:

| Thông báo | Bạn làm gì |
| --- | --- |
| "Working tree has uncommitted changes outside REQ-001's scope" | Commit hoặc stash các file đó. Orchestrator phải phân biệt được thay đổi của nó với thay đổi của bạn |
| "Source lock is held by REQ-002" | Mỗi lúc chỉ một requirement được ghi source. Hãy làm xong và merge requirement kia. Nếu lock bị treo thì chạy `aiws unlock` |
| "The guard hook cannot start" | Chạy `aiws sync claude`; trong worktree thì chạy `npm ci --omit=dev` ở thư mục `aiws/adapters/cli` của nó |
| Lệnh duyệt từ chối chạy | Lệnh được gọi trong phiên AI. Hãy chạy nó trong terminal của chính bạn |

`aiws resume`, cũng như mọi lệnh duyệt, yêu cầu bạn gõ lại mã requirement. Truyền `--yes` để bỏ bước hỏi này trong script.

## 8. Chi phí và thời gian

`aiws status` hiện chi phí của requirement theo từng phase. Con số đó là **mức quy đổi theo bảng giá API** do Claude Code báo. Dùng API key thì đó là tiền thật. Dùng gói Claude thì nó chỉ tính vào giới hạn sử dụng của gói.

Đây là sáu requirement của demo. Chúng là các tính năng nhỏ trên một codebase nhỏ, nên hãy coi đây là bậc độ lớn chứ không phải dự báo.

| Requirement | AC → TC | Task | Thời gian AI | Chi phí (USD) | Model |
| --- | --- | --- | --- | --- | --- |
| REQ-001 số điện thoại khách hàng | 22 → 43 | 5 | 74 phút | 32,15 | Opus cho mọi bước |
| REQ-002 sửa khách hàng | 14 → 38 | 7 | 90 phút | 40,65 | Sonnet cho developer; một vòng sửa |
| REQ-003 đổi trạng thái | 10 → 26 | 6 | 69 phút | 27,22 | thêm Sonnet cho knowledge update |
| REQ-004 làm chắc một nút | 4 → 10 | 3 | 60 phút | 24,92 | thêm Sonnet cho planning |
| REQ-005 lọc theo trạng thái | 5 → 20 | 5 | 86 phút | 31,69 | thêm Fable cho review |
| REQ-006 hoàn thiện bộ lọc | 6 → 15 | 7 | 61 phút | 27,91 | thêm Sonnet cho test designer; một lần yêu cầu sửa |

Từ REQ-004 trở đi, analysis và design chiếm 55% đến 67% chi phí, và analyst cùng architect vẫn chạy Opus. Viết code là phần rẻ: 0,3 đến 1,4 USD cho một task bằng Sonnet.

Mỗi lần đổi model đã cho kết quả gì trên demo:

| Bước | Trước | Sau | Kết quả |
| --- | --- | --- | --- |
| Developer, mỗi task | Opus: 1,7 đến 3,1 USD, 2 đến 9 phút | Sonnet: 0,3 đến 1,4 USD, không quá 4 phút | Mọi task qua ngay lần thử đầu |
| Planning | Opus: 1,9 đến 3,6 USD, 3 đến 7 phút | Sonnet: 0,8 đến 1,2 USD, 2 đến 4 phút | Bốn plan, plan nào cũng được chấp nhận ngay lần đầu |
| Test designer | Opus: 3,6 đến 6,9 USD, 11 đến 22 phút | Sonnet: 2,34 USD, 9 phút | Một lần chạy; được chấp nhận ngay lần đầu |
| Review | Opus: 4,1 đến 5,1 USD, 9 đến 15 phút | Fable: 3,4 đến 4,4 USD, 4 đến 6 phút | Hai lần chạy; chưa có cách biết nó có tìm được nhiều lỗi hơn không |
| Knowledge update | Opus: 4,5 đến 5,1 USD, 10 đến 11 phút | Sonnet: 1,1 đến 2,1 USD, 3 đến 7 phút | Khớp với code ở mỗi lần đối chiếu chọn điểm |

Một điều cần dè chừng, rút ra từ REQ-002: developer chạy model rẻ hơn từng làm đúng phương án mà design đã loại. Review đã bắt được, và vòng sửa tốn khoảng 7,5 USD, gấp khoảng hai lần sáu lần chạy developer trước đó cộng lại (3,55 USD). Từ bản 0.3.0, developer được đưa đúng các lệnh build và test và tự chạy chúng trước khi nộp task, và việc này chưa lặp lại.

Hai công cụ kiểm soát được mô tả ở [mục 8](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md#8-chi-phí) của hướng dẫn vận hành:

- **Ngân sách cho mỗi requirement**: `limits.max_cost_usd_per_req` trong `aiws/config/policies.yaml`. Demo dùng 40.
- **Model cho từng agent hoặc phase** trong `aiws/config/runtime.yaml`. Đây là cấu hình của demo sau sáu requirement:

  ```yaml
  claude:
    models:
      strong-reasoning: opus     # analyst, architect và mọi thứ không liệt kê bên dưới
      strong-coding: opus
      fast: sonnet
    agent_models:
      developer: sonnet
      test-designer: sonnet
    phase_models:
      planning: sonnet
      review: claude-fable-5-1
      knowledge_update: sonnet
  ```

  Sau khi đổi `agent_models`, hãy chạy `aiws sync claude`.

## 9. Câu hỏi thường gặp

**AI có tự duyệt design của nó hoặc tự merge code của nó được không?**
Không. Các lệnh duyệt từ chối chạy trong phiên AI, một hook chặn ý định đó từ trước, và pull request do người merge trên git host của bạn. Xem [mục 4](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md#4-enforcement-4-lớp-lớp-sau-vẫn-chặn-khi-lớp-trước-bị-vượt) của hướng dẫn vận hành.

**Nếu một agent sửa file nó không được đụng tới thì sao?**
Sau mỗi lần AI chạy, orchestrator so các file với write scope của phase. Mọi thay đổi khác bị revert và lần chạy bị tính là lỗi. Trong 79 lần AI chạy của demo, việc này chưa lần nào phải xảy ra.

**Tôi có phải ngồi canh lần chạy không?**
Không. Nó tự dừng ở hai gate và khi cần bạn. `aiws status` cho biết nó đang ở đâu.

**Hai requirement chạy cùng lúc được không?**
Phần analysis và design thì được, mỗi cái trong một worktree riêng. Mỗi lúc chỉ một requirement được ghi source, từ task đầu tiên tới khi pull request của nó được merge.

**Nó có chạy được với ngôn ngữ của tôi không?**
Orchestrator chỉ cần mỗi thư mục source có một lệnh build và một lệnh test trả mã lỗi khi thất bại. Xem [mục 2a](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.vi.md#2a-đa-ngôn-ngữ-và-chuẩn-quốc-tế) của hướng dẫn vận hành.

**Làm sao xem một agent đã được dặn gì?**
`aiws prompt REQ-001 design` in ra prompt mà một phase sẽ nhận. Sau khi chạy, `aiws/work/REQ-001/evidence/runs/` giữ prompt, chi phí và các file đã đổi của từng lần chạy.

**Làm sao biết test thật sự qua?**
Orchestrator tự chạy toàn bộ test sau mỗi task và không tin lời AI. Trong CI, `aiws check build` build và test lại pull request.

**Tôi dùng công cụ AI khác được không?**
Bản 1 chạy trên Claude Code. Agent, skill và quy tắc trong `aiws/` là Markdown và YAML thuần, nên một adapter khác có thể dùng lại; adapter cho các công cụ khác nằm trong kế hoạch.
