# AIWS — AI Software Factory

[![CI](https://github.com/vannt-dev/aiws-factory/actions/workflows/ci.yml/badge.svg)](https://github.com/vannt-dev/aiws-factory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933.svg)](aiws/adapters/cli/package.json)
[![Website](https://img.shields.io/badge/website-vannt--dev.github.io-4f46e5.svg)](https://vannt-dev.github.io/aiws-factory/)

**Ngôn ngữ:** [English](README.md) · Tiếng Việt

AIWS biến một requirement thành code đã test trong một hệ thống có sẵn trải trên nhiều repository, và người
duyệt design trước khi có dòng code nào được viết. Mỗi repository đích (FE, BE hoặc side nào khác bạn thêm)
nằm trong một thư mục `source-*` riêng, là thư mục thường hoặc git submodule; với submodule, mỗi task được
commit trong repository mà nó sửa và, khi bật pull request, mỗi repository có thay đổi có một draft pull
request riêng. Hệ thống cũ có thể đặt cạnh trong `source-legacy/`, chỉ đọc. `aiws discover` dựng knowledge
base từ code đó trước, và phần phân tích của mỗi requirement dựa vào đó. Lượt duyệt design được ghi gắn với
các file design: nếu chúng đổi sau đó, lượt chạy dừng lại cho tới khi design được duyệt lại.

Mỗi requirement đi qua các phase có kiểm soát và có human gate:
phân tích → design + test spec → AI review design → **người duyệt** → code từng task kèm unit test → review → **người merge PR** → cập nhật knowledge.
Orchestrator tất định giữ trạng thái; AI chỉ được làm trong phạm vi ghi của phase hiện tại.
V1 chạy trên Claude Code và không phụ thuộc ngôn ngữ của FE, BE hay legacy.

**Landing page:** https://vannt-dev.github.io/aiws-factory/

## Cấu trúc workspace

```
requirements/         requirement đầu vào (người viết)
source-fe/            repo FE đích (ngôn ngữ nào cũng được)
source-be/            repo BE đích (ngôn ngữ nào cũng được)
source-legacy/        hệ thống cũ, chỉ đọc
aiws/                 rule, agent, skill, template, knowledge, work, CLI điều phối
AGENTS.md             quy tắc chung cho mọi AI
CLAUDE.md, .claude/   sinh bởi `aiws sync claude`, không sửa tay
.codex/, .opencode/, .agents/   sinh bởi `aiws sync codex|opencode|antigravity`, khi bạn dùng các công cụ đó
```

## Bắt đầu nhanh

Yêu cầu: Node.js ≥ 22, Git, Claude Code đã đăng nhập. Chạy được trên **Windows, macOS và Linux** (CI chạy cả ba);
lệnh build/test có thể khai báo riêng theo OS (`{windows: ..., posix: ...}` trong `policies.yaml`).

```bash
npm install -g aiws-factory   # lệnh `aiws` kèm bộ kit của bản phát hành; hoặc từ bản clone repo này:
                              #   cd aiws/adapters/cli && npm install && npm link && cd ../../..
aiws init my-project && cd my-project && git init   # workspace mới (trong bản clone thì bỏ qua: repo đã là workspace)
aiws detect --write      # nhận diện stack của từng thư mục source-*
aiws sync claude         # sinh CLAUDE.md và .claude/
aiws sync opencode       # hoặc codex, antigravity: cùng agent, skill và guard cho công cụ đó
aiws discover            # lập aiws/knowledge/
aiws new REQ-001 && aiws run REQ-001   # viết requirements/REQ-001-*.md trước, hoặc: aiws new REQ-001 --from-issue 12
```

## Tài liệu

- [Sổ tay](aiws/docs/handbook.vi.md) ([English](aiws/docs/handbook.md)): một requirement theo từng bước, đọc gì ở mỗi gate, làm gì khi lần chạy dừng, chi phí và thời gian của sáu requirement thật.
- [Hướng dẫn vận hành](aiws/README.vi.md) ([English](aiws/README.md)): vòng đời, gate, cơ chế bảo vệ, cấu hình, CI.
- [Đặc tả V1](aiws/docs/spec-v1.md): thiết kế gốc.
- [AGENTS.md](AGENTS.md): quy tắc mọi AI agent phải tuân theo.
- [CHANGELOG.md](CHANGELOG.md): lịch sử phát hành.

## Đóng góp

Hoan nghênh đóng góp bằng tiếng Anh hoặc tiếng Việt. Xem [CONTRIBUTING](.github/CONTRIBUTING.md),
[Code of Conduct](.github/CODE_OF_CONDUCT.md) và [chính sách bảo mật](.github/SECURITY.md).

## Giấy phép

[MIT](LICENSE) © 2026 Van Nguyen
