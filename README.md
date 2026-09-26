# aiws-factory

Workspace vận hành theo **AIWS — AI Software Factory**: requirement → phân tích → design + test spec → người duyệt → code theo task + unit test → review → người merge PR. V1 chạy trên Claude Code.

```
requirements/     requirement đầu vào (người viết)
source-fe/        FE đích (repo mới)
source-be/        BE đích (repo mới)
source-legacy/    hệ thống cũ, read-only
aiws/             rules, agents, skills, templates, knowledge, work, orchestrator CLI
AGENTS.md         quy tắc chung cho mọi AI
CLAUDE.md, .claude/   sinh bởi `aiws sync claude`, không sửa tay
```

Bắt đầu:

```bash
cd aiws/adapters/cli && npm install && npm link && cd ../../..
aiws detect --write      # nhận diện stack của từng source-* (ngôn ngữ nào cũng được)
aiws sync claude
aiws discover
aiws new REQ-001 && aiws run REQ-001
```

Hướng dẫn đầy đủ: [aiws/README.md](aiws/README.md) · Đặc tả: [aiws/docs/spec-v1.md](aiws/docs/spec-v1.md)
