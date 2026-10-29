# AIWS — AI Software Factory (V1, Claude Code first)

**Ngôn ngữ:** [English](README.md) · Tiếng Việt

AIWS biến một requirement thành code đã test qua các phase có kiểm soát và có human gate:

```
discover (1 lần) ─► analysis ─► design + test spec ─► design review ─► [NGƯỜI duyệt design] ─► planning
   ─► implementation (từng task: developer → build → unit test → commit) ─► review ─► [NGƯỜI merge PR] ─► knowledge update ─► done
```

- **Core** (`aiws/config`, `agents`, `skills`, `templates`) nói *làm gì*: Markdown/YAML, trung lập với AI.
- **Orchestrator** (`aiws` CLI trong `aiws/adapters/cli`) nói *khi nào được làm*: giữ `state.yaml`, chạy phase, kiểm contract, diff-scope, commit.
- **Adapter** nói *làm bằng AI nào*: V1 là `claude` (Claude Code headless). `scripted` là adapter tất định để test/demo, không tốn token.

Mới dùng AIWS? [Sổ tay](docs/handbook.vi.md) dẫn bạn đi hết một requirement, từ lúc viết ra tới lúc pull request được merge; tài liệu này là phần tra cứu. Đặc tả gốc: [docs/spec-v1.md](docs/spec-v1.md). Quy tắc cho AI: [../AGENTS.md](../AGENTS.md).

---

## 1. Cài đặt

Yêu cầu: Node ≥ 22, Git, Claude Code (`claude`) đã đăng nhập.

Từ npm, cho workspace mới: gói `aiws-factory` mang lệnh `aiws` và bộ kit của bản phát hành đó.

```bash
npm install -g aiws-factory
aiws init my-project          # config, agents, skills, templates, docs và AGENTS.md của bản này
cd my-project && git init
```

Từ bản clone repo này (chính repo là một workspace):

```bash
cd aiws/adapters/cli
npm install          # bắt buộc: hook guard chạy từ thư mục này
npm link             # tuỳ chọn: có lệnh `aiws` toàn cục
```

Không muốn `npm link` thì gọi `node aiws/adapters/cli/bin/aiws.js <lệnh>` từ gốc workspace. Workspace tạo bằng `aiws init` không có CLI riêng: hook guard gọi lệnh `aiws` trên PATH.

## 2. Bắt đầu với dự án thật

1. **Đưa code vào workspace** (ngôn ngữ nào cũng được, xem mục 2a)
   - `source-fe/`, `source-be/`: repo mới (FE/BE đích), là thư mục thường trong repo workspace hoặc git submodule
     (bỏ placeholder trước: `git rm -q source-be/.gitkeep && git submodule add <url> source-be`).
     Với submodule, `aiws new` tạo thêm nhánh `aiws/REQ-xxx` bên trong nó; mỗi task commit trong submodule trước,
     rồi commit con trỏ submodule ở workspace, cùng trailer. Khi đặt `pull_request`, draft pull request mở ở repo của
     submodule trước: merge PR đó trước, bằng merge commit (không squash), rồi tới PR của workspace;
     `aiws approve REQ pr` kiểm tra cả hai. Chưa hỗ trợ: `--worktree` và submodule có submodule con (`aiws new` từ chối
     cả hai), và submodule thêm vào sau `aiws new`. `source-legacy/` cũng có thể là submodule.
     Có thể thêm side khác, ví dụ `source-mobile/` hay `source-worker/`.
   - `source-legacy/`: hệ thống cũ, chỉ đọc.
2. **Khai báo lệnh build/test**: chạy `aiws detect` để xem đề xuất, rồi `aiws detect --write` để ghi vào `aiws/config/policies.yaml` (`sides`, `source_paths`, `commands`). Kiểm tra lại. Lệnh chạy tại gốc workspace; có thể viết riêng cho từng OS: `{windows: ..., posix: ...}`.
3. **Chốt convention**: mở Claude Code tại gốc, trên `main`, và yêu cầu: *"Đọc source-fe/, điền aiws/skills/fe-conventions/SKILL.md bằng convention THẬT, mỗi ý kèm file ví dụ, chỗ không chắc đánh dấu [CẦN XÁC NHẬN]"*. Làm tương tự với `be-conventions`. Người đọc lại và sửa.
4. **Sinh cấu hình Claude**: `aiws sync claude`. Lệnh này sinh `CLAUDE.md`, `.claude/agents`, `.claude/skills` và `.claude/settings.json` (deny rules + hook guard). Chạy lại mỗi khi sửa `aiws/`.

   **Công cụ khác.** Cùng bộ agent và skill đó có thể sinh cho ba công cụ nữa, để làm việc tương tác bên cạnh Claude Code hoặc thay cho nó. Mỗi công cụ tự đọc `AGENTS.md`.

   | Lệnh | Sinh ra | Guard |
   | --- | --- | --- |
   | `aiws sync codex` | `.codex/agents/<id>.toml`, một khối có đánh dấu trong `.codex/config.toml` (phần còn lại của file được giữ nguyên), skill trong `.agents/skills/` | không có: Codex không có hook mà guard này dùng được, nên sandbox của nó (read-only với agent không có công cụ ghi) và `aiws check diff-scope` là thứ kiểm tra một lần chạy |
   | `aiws sync opencode` | `.opencode/agents/<id>.md` với `permission` theo công cụ của agent, skill trong `.agents/skills/`, `.opencode/plugins/aiws-guard.js` | plugin hỏi `aiws guard` trước khi đọc hay ghi file và trước khi chạy lệnh |
   | `aiws sync antigravity` | `.agents/agents/<id>/agent.md`, skill trong `.agents/skills/`, mục riêng của nó trong `.agents/hooks.json` (các mục khác được giữ) | hook chạy `aiws guard --from antigravity` |

   Guard áp cùng một bộ luật dù công cụ nào gọi nó: phạm vi ghi của phase, đường dẫn được bảo vệ, bí mật, và các lệnh chỉ người mới được chạy. Chính các thư mục này cũng được bảo vệ: agent đang làm cho một requirement không được ghi vào `.claude/`, `.codex/`, `.opencode/` hay `.agents/`. Chỉ những file do sync sinh ra mới bị thay hoặc xoá, nên agent và hook của riêng bạn trong các thư mục đó vẫn còn. `aiws run` vẫn chỉ điều khiển `claude` hoặc `codex`; OpenCode và Antigravity dành cho phiên tương tác.
5. **Discovery**: `aiws discover`, sau đó review `aiws/knowledge/*` và sửa chỗ sai. Commit. Về sau, khi code đã đổi, `aiws discover --since` chỉ cập nhật knowledge cho các file nguồn đổi kể từ lần commit knowledge gần nhất (không chạy AI nếu không có gì đổi). Kết quả được commit vào nhánh đang đứng. Nếu nhánh đó được bảo vệ, hãy chạy `aiws discover --branch`: knowledge sẽ nằm trên nhánh mới `aiws/discover-YYYYMMDD` (hoặc `--branch=TÊN`), bạn push và merge qua pull request trước lần `aiws new` đầu tiên.
6. **Viết requirement**: `requirements/REQ-001-<tên>.md`, rồi commit.

## 2a. Đa ngôn ngữ và chuẩn quốc tế

AIWS **không phụ thuộc ngôn ngữ** của FE, BE hay legacy. Orchestrator chỉ cần 3 thứ:

1. **Lệnh build/test** của từng side trong `policies.yaml`, trả exit code khác 0 khi lỗi. `aiws detect` nhận ra Java (Maven/Gradle), .NET, Node (npm/pnpm/yarn), Python, Go, PHP, Ruby, Rust và Dart/Flutter. Stack khác thì khai báo tay.
2. **Thư mục của từng side** (`sides`). Có bao nhiêu side cũng được; check `{side}_build` và quyền Bash headless được suy ra từ đó (dự án .NET được phép `dotnet test`, dự án Go được phép `go`...).
3. **Mã TC trong test**: orchestrator nhận `TC-3`, `TC_3`, `tc3`, `test_tc_3` (display name, tag, trait, marker, comment), đúng với cách từng framework gắn metadata.

Discovery nhận danh sách stack tự nhận diện (kể cả thống kê đuôi file của legacy như `.cbl`, `.frm`) và mô tả mỗi thư mục theo đúng công nghệ của nó (skill `legacy-analysis`).

Mọi output của AI phải theo **chuẩn quốc tế thông dụng** và **không phá vỡ cấu trúc** (skill `coding-standards`, được nạp cho architect, test-designer, developer và reviewer):

| Hạng mục | Chuẩn |
| --- | --- |
| Acceptance criteria | Given/When/Then (Gherkin); chất lượng yêu cầu theo ISO/IEC/IEEE 29148 |
| Test spec | ISO/IEC/IEEE 29119-3 (ID, objective, priority, traceability, preconditions, test data, steps, expected result); kỹ thuật thiết kế test ISTQB |
| Unit test | Arrange-Act-Assert; tên theo quy ước framework; mã TC qua metadata chuẩn (`@DisplayName`/`@Tag`, `[Trait]`, `pytest.mark`, `t.Run`...) |
| Code | Convention của dự án, sau đó tới style guide chính thống của ngôn ngữ (Google Java Style, .NET conventions, PEP 8, Effective Go, PSR-12, Effective Dart...) |
| API | OpenAPI 3.x, HTTP semantics RFC 9110; lỗi RFC 9457 nếu dự án chưa có format; thời gian ISO 8601/RFC 3339 |
| Bảo mật | OWASP Top 10 / ASVS |
| Commit | Conventional Commits (`feat(REQ-001): be - … (T1)`, `fix(REQ-001): …`, `chore(REQ-001): …`) + git trailer |
| Cấu trúc | Không đổi tên, di chuyển, xoá hay reformat file, thư mục, public API ngoài design đã duyệt; test đặt đúng vị trí chuẩn của ecosystem. Reviewer coi vi phạm là finding `major`/`critical`. |

## 3. Vòng đời một requirement

```bash
aiws new REQ-001                 # tạo aiws/work/REQ-001 + nhánh aiws/REQ-001
aiws run REQ-001                 # analysis → design → test spec → design review, dừng ở gate duyệt design
#   đọc 02-design-review.md, 01-analysis.md, 02-design.md, 03-test-spec.md, api-contract.yaml
aiws approve REQ-001 design      # hoặc: aiws reject REQ-001 design -m "đổi X vì Y"
aiws run REQ-001                 # planning → từng task → review, dừng ở gate PR
git push -u origin aiws/REQ-001  # NGƯỜI push, mở PR, review, merge
aiws approve REQ-001 pr          # sau khi merge: sang nhánh aiws/REQ-001-knowledge
aiws run REQ-001                 # cập nhật aiws/knowledge → done; push nhánh knowledge, mở PR nhỏ
aiws trace REQ-001               # ma trận AC → TC → task → commit → test
```

**Requirement từ một GitHub issue.** `aiws new REQ-001 --from-issue 12` viết `requirements/REQ-001-<tiêu-đề>.md` từ issue #12 của repo chứa workspace, rồi tạo requirement như trên. Tiêu đề issue thành heading, tiếp theo là link về issue, các label và nội dung issue; file được commit vào nhánh đang đứng, như requirement người viết tay, và `state.yaml` ghi lại URL của issue. Dùng `owner/repo#12` hoặc URL của issue để đọc issue của repo khác. Issue được đọc qua GitHub CLI (`gh issue view`, đã `gh auth login`; `runtime.yaml -> pull_request.gh` chỉ tới đường dẫn khác), và không có gì được ghi ngược lên issue. Chỉ người được chạy: trong phiên AI lệnh từ chối trước khi đọc issue, vì chỉ người viết `requirements/` (`aiws new` không kèm cờ thì AI vẫn chạy được). Không có gh, chưa đăng nhập, hay issue không tồn tại thì `aiws new` báo rõ và không tạo gì. Đọc lại file trước khi `aiws run`: analysis bắt đầu từ nó.

Khi orchestrator dừng lại, `aiws status REQ-001` cho biết lý do và lệnh cần chạy:

| Tình huống | Trạng thái | Người làm gì |
| --- | --- | --- |
| Analysis có câu hỏi `[blocking]` | `analysis / waiting_human` | `aiws answer REQ-001 -m "..."` rồi `aiws run` |
| Design sẵn sàng | `design_approval / waiting_human` | `aiws approve … design` hoặc `aiws reject … design -m` |
| Developer ghi `questions.md` | `design_change_requested` | `aiws answer … -m` (giữ design) hoặc `aiws redesign … -m` (quay lại design, phải duyệt lại) |
| Task fail 3 lần | `implementation / blocked` | sửa tay hoặc revert, rồi `aiws resume REQ-001`, rồi `aiws run` |
| REQ sẽ không làm tiếp (kẹt, hoặc không cần nữa) | mọi trạng thái trừ `done` | `aiws abandon REQ-001 -m LÝ_DO`: ghi lại kèm lý do và commit, nhả source lock; nhánh và `aiws/work/REQ-001` được giữ, không lệnh nào chạy tiếp REQ đó |
| Review có `[critical]` | tự quay lại `planning` | không cần làm gì: planner thêm task sửa. Lần review sau đó là review tiếp nối: kiểm lại các finding cũ và chỉ đọc kỹ phần đã thay đổi từ lần trước |
| Design review có `[critical]` | tự quay lại `design` | không cần làm gì: architect và test designer sửa, reviewer kiểm lại. Sau 3 vòng (`max_rounds`) vẫn còn finding chặn thì lần chạy dừng ở gate duyệt design, liệt kê các finding đó, và bạn quyết |
| Sửa design sau khi đã duyệt | tự quay về `design_approval` | duyệt lại |
| AI hết giới hạn sử dụng | giữ nguyên phase, vẫn `running` | không cần duyệt gì: chạy lại `aiws run REQ-001` khi giới hạn được đặt lại, hoặc `aiws run REQ-001 --wait` để tự chạy lại mỗi 15 phút |

Lệnh của người (`approve`, `reject`, `answer`, `redesign`, `resume`, `abandon`, `unlock`) **từ chối chạy trong phiên AI** và đòi gõ lại mã REQ để xác nhận. Trong script CI thì truyền `--yes`.

**Quyết định bằng menu.** Khi `aiws run` dừng ở một gate trong terminal của bạn, nó hiện những gì đang chờ và một menu: duyệt, từ chối (gõ điều cần đổi), trả lời câu hỏi, mở report, hoặc để sau. Chọn bằng phím mũi tên hoặc số rồi Enter; chọn là xác nhận, nên không phải gõ lại mã REQ. `aiws gate REQ-001` mở lại menu đó sau, còn `aiws run --no-menu` thì bỏ qua menu. Ở gate design, menu cho xem chi phí đến lúc đó, các finding còn mở của design review và mục "Quyết định cần duyệt" của design; ở gate PR là các task đã xong, finding còn mở của review và pull request, và khi đã có pull request thì menu còn cho yêu cầu sửa bằng chính các comment review của nó (`--from-pr`, bên dưới). Menu cần terminal và từ chối chạy trong phiên AI, như các lệnh.

**Merge PR:** cách merge nào cũng được. `aiws approve REQ-001 pr` chấp nhận khi nhánh REQ là tổ tiên của nhánh gốc (merge commit hoặc fast-forward), hoặc khi mọi file REQ đã sửa có cùng nội dung trên nhánh gốc (squash hoặc rebase). Nhớ cập nhật nhánh gốc ở máy trước. Sau squash hoặc rebase, mã commit ghi trong `state.yaml` không còn trên nhánh gốc, nên `aiws trace` tìm commit của task theo trailer `Task:`. Merge commit giữ mỗi task một commit, vì vậy là lựa chọn tốt nhất cho truy vết.

**Yêu cầu sửa trên pull request:** review trên host như thường lệ, rồi `aiws reject REQ-001 pr --from-pr` gửi các comment review của bạn cho planner thay cho một message gõ tay: nội dung các review, phần thảo luận, và comment inline dạng `file:dòng` kèm các trả lời (thread đã resolve và bot bị bỏ qua). Lệnh đọc draft pull request đã ghi lại ở gate, và pull request của các submodule, qua GitHub CLI (`gh`, đã đăng nhập); `--from-pr=<url>` chỉ định pull request bạn tự mở, còn `-m` thêm một ghi chú ở đầu. Khi không đọc được gì (chưa có pull request, thiếu `gh` hoặc chưa đăng nhập, chưa có comment) lệnh báo rõ và không ghi gì. Review đang pending chỉ người viết thấy: hãy submit trước. Với host khác, `runtime.yaml → pull_request.feedback_command` là lệnh in ra các comment (`{url}`, `{number}`, `{req}`, `{branch}` được điền).

**Tạm dừng:** `aiws stop REQ-001`, chạy từ terminal hay worktree nào cũng được, yêu cầu `aiws run` đang chạy dừng lại sau bước hiện tại; sau đó `aiws run REQ-001` chạy tiếp, không cần lệnh duyệt nào. Nếu tiến trình bị tắt ngang (Ctrl+C, đóng terminal), task đang làm vẫn ở trạng thái `running` trong `state.yaml`: lần `aiws run` kế tiếp giữ các file viết dở của task đó và dặn agent developer xem lại chúng trước. File chưa commit nằm ngoài task vẫn bị từ chối.

**Hết giới hạn sử dụng AI:** khi AI trả lời rằng tài khoản đã hết giới hạn sử dụng (ví dụ giới hạn phiên của gói Claude), lần chạy tạm dừng chứ không bị tính là lỗi. Không lượt thử nào bị tính và không có gì bị khoá; `aiws run` thoát với mã 75 và `aiws status` hiện thông báo của AI, trong đó có giờ đặt lại giới hạn. Chạy lại `aiws run REQ-001` khi giới hạn được đặt lại: bước đó chạy lại từ đầu, phần output viết dở được giữ và agent được dặn xem lại nó trước. `aiws discover` cũng tạm dừng theo cách này.

**Chạy song song:** tại một thời điểm chỉ một REQ được ghi source, từ lúc vào implementation tới khi PR merge (source lock). Các REQ khác vẫn làm analysis/design được, mỗi REQ trong worktree riêng:

```bash
aiws new REQ-002 --worktree ../ws-REQ-002
cd ../ws-REQ-002 && aiws run REQ-002
```

Worktree cũng là cách đơn giản nhất để một trợ lý AI điều phối requirement: thư mục chính vẫn ở nhánh của nó, còn requirement chạy ở thư mục bên cạnh.

**Hook bảo vệ phải chạy được trước khi agent nào khởi động.** Hook bị lỗi thì không chặn được gì, nên `aiws run` và `aiws discover` kiểm tra hook trước và từ chối chạy nếu không đạt: phải có `.claude/settings.json` (`aiws sync claude`), và lệnh hook phải chạy được. Với workspace mang sẵn CLI (`aiws/adapters/cli`, như repo này), hook chạy từ thư mục đó và cần `node_modules` của nó; mỗi worktree có một bản riêng, và `aiws new --worktree` tự cài. Với dự án tạo bằng `aiws init`, hook là `aiws guard` và `aiws` phải có trên PATH. Muốn dùng lệnh khác thì đặt `claude.guard_command` trong `runtime.yaml`.

## 4. Enforcement: 4 lớp, lớp sau vẫn chặn khi lớp trước bị vượt

| Lớp | Hiện thực |
| --- | --- |
| 1. Orchestrator | Phase bị khoá thì agent không được gọi. Approval gắn hash của 02/03/api-contract; file bị sửa thì approval mất hiệu lực. Có giới hạn retry, vượt thì `blocked`. |
| 2. Tool permission | Headless: `claude -p --permission-mode dontAsk --allowedTools …` theo contract. Reviewer không có Bash. Developer chỉ được chạy lệnh build/test; prompt của nó liệt kê các lệnh này đúng dạng mà shell của nó chấp nhận. |
| 3. Hook | `aiws guard` (PreToolUse cho Edit/Write/Read/Bash/PowerShell) đọc `AIWS_*` env hoặc nhánh `aiws/REQ-*` + `state.yaml` và chặn ghi ngoài scope. Bash lồng như `bash -c`, `node …/aiws.js approve`, `git -C . push` cũng bị phân tích. Văn bản chỉ nhắc tới một lệnh bị cấm (mẫu tìm kiếm, commit message, here-document cho `git commit`) thì không bị chặn; mọi cách có thể thực thi văn bản đó (shell, `eval`, pipe vào trình thông dịch, `$(...)`, biến, alias) vẫn bị chặn. |
| 4. Git + diff-scope | Sau MỌI lần chạy AI, orchestrator so trạng thái git trước và sau: file ngoài scope bị revert và lần chạy bị đánh fail, bất kể được ghi bằng cách nào. Commit có trailer. `aiws check …` dùng cho CI. |

Diff-scope là đảm bảo thật; hook chỉ giúp chặn sớm. Diff-scope **không thấy file bị `.gitignore`**, vì vậy đừng để build output làm nơi chứa logic.

## 5. Cấu hình

| File | Nội dung |
| --- | --- |
| `config/workflow.yaml` | Phase, thứ tự, gate, retry, route khi fail/critical. `language: vi|en` chọn ngôn ngữ của mọi tài liệu agent viết; `git_language: vi|en` (mặc định giống `language`) chọn ngôn ngữ của title task, thứ trở thành tiêu đề commit, để repo tiếng Anh có commit tiếng Anh trong khi tài liệu vẫn tiếng Việt. `workflow.<tên>.yaml` là một profile mà requirement có thể chạy theo (`aiws new --profile <tên>`); `small` chỉ có một bước design, test spec do architect viết luôn. `runs: 2` ở bước `unit_test` chạy mỗi suite hai lần: suite qua một lần, lỗi một lần thì task fail với lỗi "flaky", để test phụ thuộc thời gian hay thứ tự không qua nhờ may mắn (mỗi lần chạy có giới hạn 30 phút riêng). Không có lệnh "skip phase": muốn bỏ thì sửa file này qua review. |
| `config/policies.yaml` | `protected_paths`, `maintainer_editable`, `read_deny`, `phase_write_scope`, `commands`, `bash_denylist`, `limits`, `approvals.require_signed`. `commands` gồm `<side>_build`, `<side>_test` và `<side>_lint` tuỳ chọn (lint/format như CI của dự án; `aiws detect` đề xuất cho script npm `lint`/`format:check`, ruff và cargo fmt), chạy sau mỗi task và developer được phép chạy. `api_contract_be` tuỳ chọn đối chiếu `api-contract.yaml` của requirement với route trong code BE ở phase review: `aiws detect` đề xuất `npx --yes openapi-drift@0 check --spec aiws/work/{req}/api-contract.yaml --source <thư mục> --framework <nestjs|express|fastify|spring> --fail-on code --format json` khi nhận ra một trong các framework đó (npx tải [openapi-drift](https://www.npmjs.com/package/openapi-drift) lúc check chạy, nên cần Node 22.18 và mạng; AIWS không cài gì). Mỗi operation của contract không có route nào phục vụ thành một finding critical; route mà contract không liệt kê, và route nằm dưới một prefix contract không ghi, thì không. Không khai báo lệnh này thì không có gì thay đổi. Trên Windows với `core.autocrlf=true`, Prettier check báo lỗi mọi file được checkout với CRLF: đặt `git config core.autocrlf false` trong workspace (hoặc thêm `* text=auto eol=lf` vào `.gitattributes` của dự án). |
| `config/runtime.yaml` | Adapter theo phase, map `model_hint` sang model (`opus`/`sonnet`), timeout, `guard_command`, `wait` (nhịp chạy lại của `--wait`), `notify` (lệnh hoặc webhook báo khi run dừng: tới gate, bị chặn, 80% ngân sách, tạm dừng vì hạn mức), `pull_request` (tới gate PR thì push nhánh và chạy lệnh mở pull request nháp, ví dụ `gh pr create --draft`; tắt khi không khai báo, lỗi thì gate giữ nguyên; `gh` là GitHub CLI mà `aiws reject --from-pr` gọi, mặc định `gh`, còn `feedback_command` thay nó cho host khác). |
| `config/contracts/*.yaml` | Mỗi phase: agent, skills, tools, reads, outputs (heading bắt buộc, template), rules, checks, `max_attempts`. |
| `agents/*.md` | Vai trò: frontmatter `id`, `description`, `tools`, `skills`, `model_hint` và thân là prompt. `{req}` và `{task}` được thay tự động. |
| `skills/*/SKILL.md` | Kiến thức dùng chung, được chép sang `.claude/skills` và nhúng vào prompt headless. |
| `templates/` | Mẫu output, heading và định dạng ID mà validator kiểm tra. `templates/en/` là bộ tiếng Anh, dùng khi `language: en`. |

Rule validator có sẵn: `ac_numbered`, `no_blocking_questions`, `every_ac_has_tc`, `plan_valid`, `review_no_open_critical`, cùng `format: openapi|yaml` cho output. `plan_valid` cũng từ chối mục `allowed_files` chứa `..`, ghi tên thư mục mà không có glob, hoặc bị git bỏ qua (file ở đó không vào được commit của task).

## 6. Làm việc tương tác

Hai chế độ dùng chung một bộ bảo vệ:

- **Tự động:** `aiws run`.
- **Tương tác:** mở `claude` trên nhánh `aiws/REQ-001` và yêu cầu *"dùng agent architect cho REQ-001"*. Hook suy ra phase từ `state.yaml` và chặn ghi sai phase. Phiên như vậy cũng được chạy `aiws run`, `aiws stop` và ghi ghi chú của riêng nó ra ngoài workspace; lệnh git và các lệnh gate vẫn bị chặn. Agent do `aiws run` khởi động thì không được nới bất kỳ điều nào trong số này.

Trên `main`, không ở REQ nào, bạn được dùng Claude để bảo trì chính `aiws/` (agents, skills, config). Claude cũng có thể điều phối quy trình bằng `aiws new` (không kèm `--from-issue`), `aiws run` hay `aiws status`; mỗi lần chạy vẫn dừng ở các gate của người. Riêng `source-legacy/`, `requirements/`, `state.yaml` và `approvals/` luôn bị khoá. AI không bao giờ được chạy các lệnh gate `approve`, `reject`, `answer`, `redesign`, `resume`, `abandon`, `unlock`, và khi đang ở trong một phase thì cũng không được tự khởi động `aiws run` lồng nhau.

Xem prompt một agent sẽ nhận: `aiws prompt REQ-001 design`.

## 7. Evidence, truy vết, CI

- `aiws/work/REQ/evidence/runs/run-NNNN.json` + `.prompt.md` ghi: adapter, lệnh, tool được phép, hash prompt, thời gian, số turn, chi phí quy đổi, file đã đổi, vi phạm đã revert, lỗi validate.
- `evidence/test-results/<task>-attempt-N.yaml` ghi: lệnh test, exit code, log rút gọn, TC của task.
- `aiws report REQ-001` gom tất cả những thứ trên vào một trang HTML (`aiws/work/REQ-001/report.html`, hoặc `--out FILE`): trạng thái, sơ đồ pipeline (mỗi phase một ô: xong, đang chạy, chờ bạn hay dừng, kèm số lần chạy, thời gian, chi phí, số vòng review và ai quyết ở gate), pull request, trace, task, approval, các lần AI chạy kèm chi phí, kết quả test, lịch sử và các tài liệu.
- Commit của task có các trailer `REQ-ID`, `Task`, `Tests`, `AIWS-Run`. Lệnh `git log --grep "REQ-ID: REQ-001"` liệt kê mọi thay đổi của một REQ.
- CI chạy `aiws check commit-trailer --req REQ-001`, `aiws check approvals --req REQ-001` (bật `require_signed` để bắt buộc approval ký GPG/SSH qua `aiws approve --sign`), `aiws trace REQ-001` và `aiws check build`. Lệnh cuối chạy lại mọi lệnh `<side>_lint`, `<side>_build` và `<side>_test` trong `policies.yaml`, để code sắp merge được build và test lại bên ngoài lần chạy của AI.

## 8. Chi phí

`aiws status REQ-001` hiển thị số lần AI chạy, tổng thời gian và chi phí cộng dồn của requirement, chia theo phase, cùng sơ đồ pipeline như trong report ở dạng chữ (`[x]` xong, `[>]` đang chạy, `[?]` chờ bạn, `[!]` dừng, `[ ]` chưa chạy). `cost_usd` trong evidence là **giá quy đổi theo bảng giá API** mà Claude Code báo. Nếu Claude Code đăng nhập bằng gói Claude (Pro/Max) thì con số này chỉ trừ vào hạn mức của gói. Nếu dùng API key hoặc Console thì đó là tiền thật. Bạn gõ `/status` trong Claude Code để biết mình đang dùng loại nào.

`aiws stats` hiện cùng các số đó cho mọi requirement trong `aiws/work/`, kèm tổng và chi phí từng phase tính trên tất cả (tổng và trung vị mỗi requirement). Với Claude Code, lệnh này còn cho số token của từng phase: số lượt, input mới, phần ghi vào và đọc từ prompt cache, và output. Mỗi lượt đọc lại toàn bộ hội thoại đến lúc đó, nên phase có nhiều lượt trên một context lớn là nơi tốn tiền nhất; `aiws status` cho tổng trong một dòng. `aiws estimate` lấy các requirement đã xong làm mức tham khảo cho requirement kế tiếp: trung vị và khoảng của chi phí, thời gian, và trung vị theo phase. Đó là những gì các requirement đã xong tốn, không phải dự báo; requirement có nhiều acceptance criteria hay task hơn sẽ tốn hơn.

Các lần chạy thật để tham khảo. Với Sonnet, một REQ nhỏ có 2 task hết khoảng 1,3 USD quy đổi cho 8 lần chạy. Trên workspace demo, sáu REQ có 3 đến 7 task, mỗi REQ hết 25 đến 41 USD quy đổi và 60 đến 90 phút AI chạy, cộng 2,4 USD cho discovery. Chạy lại bằng 0.7.0 với model mặc định, REQ-004 hết 4,31 USD và 13 phút tới gate pull request thay vì 23,78 USD; [sổ tay](docs/handbook.vi.md#8-chi-phí-và-thời-gian) liệt kê từng REQ kèm model đã dùng. `npm test` dùng adapter `scripted` nên không tốn token.

Có ba cách kiểm soát chi phí:

- **Chạy gọn** (bật sẵn). Mỗi lần `claude -p` chỉ nạp các tool mà phase được dùng, settings của project (có hook guard) và không nạp MCP server nào. Nếu không, plugin, skill, MCP server và hook trong Claude Code của chính bạn đi kèm mọi lượt: trên máy thử, phần cố định của mỗi lượt giảm từ khoảng 30k xuống 9k token, và một lần chạy ngắn cùng tác vụ rẻ hơn 68%. Đặt `claude.lean: false` trong `runtime.yaml` nếu lần chạy cần thứ gì trong settings của user, như `apiKeyHelper` hay `env`. Codex và các công cụ khác không bị ảnh hưởng.
  `claude.settings` truyền thêm settings của Claude Code cho mọi lần chạy. Với log build/test dài, `bashOutputMaxChars: 8000` chỉ giữ 8.000 ký tự output của một lệnh trong hội thoại thay vì 30.000, phần còn lại lưu ra file cho agent đọc khi cần; một lần chạy in 24.000 ký tự giảm từ 41k xuống 19k token. Mặc định tắt vì phần cuối log, nơi có lỗi test, khi đó cần thêm một lần đọc.
  Muốn cho agent dùng một MCP server, ví dụ code graph trên repo lớn, khai báo trong `claude.mcp` của `runtime.yaml`: các server, từng tool theo tên đầy đủ (`mcp__<server>__<tool>`; tool không liệt kê bị từ chối, nên tool ghi của server không lọt vào) và các phase nếu cần. Để thư mục dữ liệu của server (`.code-review-graph/`) trong `.gitignore`, nếu không bước kiểm tra diff-scope sẽ tính là ghi. Mặc định tắt: ngày 18/10, code graph không làm cùng một phân tích tác động rẻ hơn trên repo 90 và 300 file (bốn lần chạy mỗi bên bằng Sonnet, cùng kết quả); repo lớn hơn nhiều có thể khác.

- **Chọn model theo agent.** Mặc định developer, test designer, planner và design reviewer chạy Sonnet, bước cập nhật knowledge cũng vậy; analyst, architect và reviewer giữ Opus. Trên demo, các bước chạy Sonnet đó rẻ hơn 2 đến 4 lần và đều đạt ngay lần đầu (sổ tay, mục 8). `runtime.yaml → claude.models` ánh xạ từng `model_hint` sang model, còn `claude.agent_models` ghi đè cho riêng một agent, ví dụ `developer: sonnet` trong khi design và review vẫn dùng Opus. Sửa xong thì chạy `aiws sync claude`. `claude.phase_models` đặt model cho riêng một phase khi chạy `aiws run` và được ưu tiên hơn cả hai, nên một agent có thể chạy rẻ hơn ở đúng một phase: `knowledge_update: sonnet` đổi bước cập nhật knowledge nhưng không đổi `aiws discover`, dù cả hai cùng dùng agent discovery.
- **Ngân sách cho mỗi REQ.** `policies.yaml → limits.max_cost_usd_per_req` chặn REQ trước bước kế tiếp khi chi phí AI chạm ngân sách. Chỉ người mới cho chạy tiếp được: `aiws resume REQ-001` cấp thêm một lần ngân sách tính từ mức đã tiêu, còn `aiws resume REQ-001 --budget 80` đặt giới hạn mới. Lần chạy không báo chi phí thì không bị tính. Mặc định không giới hạn. Ngân sách được kiểm tra trước mỗi bước, không kiểm tra giữa chừng, nên bước đang chạy có thể kết thúc vượt mức. Để không bị dừng giữa lúc implementation, hãy nâng trước: `aiws resume REQ-001 --budget 80` cũng chạy được khi REQ đang chờ ở một cổng duyệt trước pull request, và từ mức 80% ngân sách thì `aiws run` nhắc điều này khi dừng ở cổng. Ở cổng PR, nhánh phải giữ nguyên đúng như pull request sẽ merge, nên tại đó chỉ nâng được sau khi REQ bị khoá.

## 9. Khác biệt so với Spec V1 (có chủ đích)

| Spec | Hiện thực | Lý do |
| --- | --- | --- |
| CLI Python | CLI Node (JS ESM, 2 dependency) | Máy dev không có Python. Hook khởi động nhanh, và interface adapter vẫn là `sync` / `runAgent`. |
| Developer tự commit | Orchestrator commit khi build + test pass | AI không cần quyền git, trailer luôn đúng, và commit không chứa code fail. |
| Phase `unit_test` do agent tester | Bước builtin: orchestrator chạy toàn bộ suite của side bị chạm, và kiểm mọi TC của task có xuất hiện trong test | Không tin lời AI về kết quả test. Agent `tester` vẫn có cho chế độ tương tác. |
| `aiws/work/.source-lock` | `<git-common-dir>/aiws-source-lock.yaml`, không commit | Dùng chung cho mọi worktree, không gây conflict git. |
| Nhả lock sau knowledge_update | Nhả khi PR merge (`approve pr`) | Knowledge update không ghi source, nên không cần giữ lock lâu thêm. |
| Critical ở review / PR yêu cầu sửa → implementation | → planning (planner thêm task sửa, giữ task đã xong) | Task sửa cần `allowed_files` rõ ràng. |
| Song song analysis/design | Qua `aiws new --worktree` | Một thư mục làm việc chỉ checkout được một nhánh. |
| `permissions.deny` cho mọi `protected_paths` | Deny tĩnh chỉ cho path không ai sửa qua Claude; `maintainer_editable` do hook xử lý theo ngữ cảnh | Để người bảo trì vẫn sửa được `aiws/` bằng Claude trên `main`. |
| Hook matcher Edit/Write, Bash | Thêm Read và PowerShell | Claude Code trên Windows có tool PowerShell. |
| — | Hash approval chuẩn hoá CRLF → LF | Tránh approval mất hiệu lực vì `core.autocrlf`. |
| — | Thêm lệnh `answer`, `redesign`, `unlock`, `prompt`, `trace`, `check …`, `detect` | Cần để vận hành các gate trong state machine và hỗ trợ đa ngôn ngữ. |
| Lệnh build/test ví dụ npm/Maven | `commands` trống, `aiws detect` đề xuất theo stack; side tuỳ ý | Không phụ thuộc ngôn ngữ. |

## 10. Phát triển CLI

```bash
cd aiws/adapters/cli
npm ci
npm run check                    # ESLint + kiểm Prettier + toàn bộ test
npm test                         # mọi test: e2e, guard, diff-scope, retry, gate, lock, init/sync, đa ngôn ngữ (vài phút)
AIWS_KEEP_TMP=1 npm test         # giữ lại workspace tạm để soi

### Đóng gói cho npm

`npm pack` trong `aiws/adapters/cli` gom bộ kit (`aiws/config`, `agents`, `skills`, `templates`, `docs` và `AGENTS.md`) vào `kit/` của gói (`tool/bundle-kit.mjs`, chạy ở `prepack`; `postpack` xoá đi), nên `aiws init` từ gói đã cài tạo được trọn workspace. `aiws init` ghi phiên bản vào `aiws/config/kit-version`; `aiws run` / `aiws status` cảnh báo khi CLI và kit của workspace khác phiên bản. Workflow `Publish to npm` (`.github/workflows/publish.yml`) publish ở mỗi tag `v*` qua npm trusted publishing (npmjs.com tin repo này và file workflow đó; không có token trong repo), kèm provenance; tag phải bằng phiên bản trong package.json. Chạy tay thì là dry run. Vậy một bản phát hành là: nâng phiên bản, cập nhật changelog, commit, tag `vX.Y.Z`, đẩy tag.
```

CI (GitHub Actions) là pipeline nhiều bước; bước sau chỉ chạy khi bước trước đạt:

0. **Detect changes**: kiểm tra CLI, bộ kit `aiws/` hoặc `AGENTS.md` có thay đổi không.
1. **Lint và định dạng**: ESLint và Prettier, chạy một lần.
2. **Test trên Linux** với Node 22, phiên bản tối thiểu được hỗ trợ.
3. **Test trên Windows và macOS** với Node 22, kèm Linux với Node 24.
4. **CI result**: trạng thái duy nhất mà branch protection của `main` bắt buộc.

Sửa tài liệu thuần thì bỏ qua tầng 1–3, nhưng tầng 4 vẫn báo thành công nên PR không bị kẹt. Branch protection của `main` bắt buộc `4. CI result` và `AIWS gates`, đồng thời chặn force-push và chặn xoá nhánh. Workflow riêng **AIWS gates** kiểm lại trailer commit, approval và ma trận truy vết cho PR từ nhánh `aiws/REQ-*`, rồi chạy build và test của chính dự án bằng `aiws check build`. Workflow chỉ cài Java khi có dự án Maven hoặc Gradle trong `source-*`; với stack khác, bạn thêm bước cài toolchain tương ứng. Cách đóng góp: [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).

Dự án mẫu dùng cho test nằm ở `test/fixtures/sample`. Các agent giả lập nằm ở `test/fixtures/scripted` (mỗi agent là một script Node ghi output như một AI "ngoan").

## 11. Việc còn mở

- [ ] Đưa code thật vào `source-fe/`, `source-be/`, `source-legacy/`; chạy `aiws detect --write` để điền `commands` trong `policies.yaml` (hiện đang trống).
- [ ] Chốt `fe-conventions` / `be-conventions` (đang là khung `[CẦN XÁC NHẬN]`).
- [x] Công cụ kiểm API contract (Spec §13), phần không cần công cụ riêng theo stack: contract được lint ngay khi viết, và phase review chạy check builtin `api_contract` để đối chiếu với tài liệu OpenAPI mà BE giữ trong mã nguồn (`aiws check api-contract --req R` làm điều tương tự). Với BE NestJS, Express, Fastify và Spring, contract còn được đối chiếu với route trong code mà không cần tài liệu nào: `aiws detect` đề xuất `commands.api_contract_be` chạy [openapi-drift](https://www.npmjs.com/package/openapi-drift), báo cáo JSON của nó thành một finding review cho mỗi operation code chưa phục vụ (mục 5). Stack khác vẫn cắm công cụ riêng vào `api_contract_be` / `api_contract_fe`.
- [ ] Chạy thử DB migration (Spec §13, lựa chọn A/B).
- [x] Adapter Codex và review chéo model (`runtime.yaml → phases.review.adapter: codex`), cho các phase không cần shell. `aiws sync antigravity` đã phủ công cụ của Google (Antigravity thay cho Gemini CLI), nên không còn dự định adapter Gemini. Còn mở: chạy phase implementation bằng Codex (cần cách giới hạn shell của nó vào đúng lệnh của dự án).
