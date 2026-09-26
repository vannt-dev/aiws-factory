# AIWS — AI Software Factory

[![CI](https://github.com/vannt-dev/aiws-factory/actions/workflows/ci.yml/badge.svg)](https://github.com/vannt-dev/aiws-factory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933.svg)](aiws/adapters/cli/package.json)
[![Website](https://img.shields.io/badge/website-vannt--dev.github.io-4f46e5.svg)](https://vannt-dev.github.io/aiws-factory/)

**Ngôn ngữ:** [English](README.md) · Tiếng Việt

AIWS biến một requirement thành code đã test qua các phase có kiểm soát và có human gate:
phân tích → design + test spec → **người duyệt** → code từng task kèm unit test → review → **người merge PR** → cập nhật knowledge.
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
```

## Bắt đầu nhanh

Yêu cầu: Node.js ≥ 22, Git, Claude Code đã đăng nhập. Chạy được trên **Windows, macOS và Linux** (CI chạy cả ba);
lệnh build/test có thể khai báo riêng theo OS (`{windows: ..., posix: ...}` trong `policies.yaml`).

```bash
cd aiws/adapters/cli && npm install && npm link && cd ../../..
aiws detect --write      # nhận diện stack của từng thư mục source-*
aiws sync claude         # sinh CLAUDE.md và .claude/
aiws discover            # lập aiws/knowledge/
aiws new REQ-001 && aiws run REQ-001
```

## Tài liệu

- [Hướng dẫn vận hành](aiws/README.vi.md) ([English](aiws/README.md)): vòng đời, gate, cơ chế bảo vệ, cấu hình, CI.
- [Đặc tả V1](aiws/docs/spec-v1.md): thiết kế gốc.
- [AGENTS.md](AGENTS.md): quy tắc mọi AI agent phải tuân theo.
- [CHANGELOG.md](CHANGELOG.md): lịch sử phát hành.

## Đóng góp

Hoan nghênh đóng góp bằng tiếng Anh hoặc tiếng Việt. Xem [CONTRIBUTING](.github/CONTRIBUTING.md),
[Code of Conduct](.github/CODE_OF_CONDUCT.md) và [chính sách bảo mật](.github/SECURITY.md).

## Giấy phép

[MIT](LICENSE) © 2026 Van Nguyen
