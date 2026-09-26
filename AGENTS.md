# AGENTS.md — hướng dẫn chung cho mọi AI (Claude Code, Codex, Gemini)

Workspace này vận hành theo **AIWS (AI Software Factory)**: requirement -> analysis -> design + test spec -> người duyệt -> implementation theo task -> unit test -> review -> người duyệt PR -> cập nhật knowledge. Đặc tả đầy đủ: `aiws/docs/spec-v1.md`. Hướng dẫn vận hành: `aiws/README.md`.

## Cấu trúc
| Đường dẫn | Là gì | Ai ghi |
| --- | --- | --- |
| `requirements/` | Requirement đầu vào (`REQ-001-*.md`) | Người |
| `source-fe/`, `source-be/` | Code đích (repo mới, có thể là git submodule) | AI, chỉ trong task được duyệt |
| `source-legacy/` | Hệ thống cũ | **Read-only vĩnh viễn** |
| `aiws/config/` | workflow, policies, runtime, contracts | Người |
| `aiws/agents/`, `aiws/skills/`, `aiws/templates/` | Vai trò, kiến thức, mẫu output | Người |
| `aiws/knowledge/` | Bản đồ hệ thống (discovery sinh) | AI, người review |
| `aiws/work/REQ-xxx/` | Output từng phase, state, approval, evidence | AI (output) / orchestrator (state) / người (approval) |
| `aiws/adapters/cli/` | Orchestrator `aiws` (Node) | Người |
| `CLAUDE.md`, `.claude/` | Sinh bởi `aiws sync claude` | Không sửa tay |
| `README*.md`, `CHANGELOG.md`, `LICENSE`, `.github/`, `.editorconfig`, `.gitattributes`, `.gitignore` | Tài liệu, CI, cấu hình repo | Người |

## Quy tắc bắt buộc cho mọi AI
1. **Không sửa** `source-legacy/`, `requirements/`, `aiws/config/`, `aiws/agents/`, `aiws/skills/`, `aiws/templates/`, `aiws/adapters/`, `aiws/work/*/state.yaml`, `aiws/work/*/approvals/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.github/`, `README*.md`, `CHANGELOG.md`, `LICENSE` khi đang làm việc cho một REQ.
2. **Không tự chuyển phase, không tự approve.** Chỉ orchestrator (`aiws`) đổi state; chỉ người chạy `aiws approve/reject/answer/redesign/resume`.
3. **Chỉ ghi trong phạm vi phase/task hiện tại** (`aiws/config/policies.yaml` -> `phase_write_scope`). Ghi ngoài phạm vi bị hook chặn hoặc bị diff-scope revert và đánh fail.
4. **Không đổi thiết kế khi đang code.** Thiết kế sai/thiếu -> ghi câu hỏi vào `aiws/work/<REQ>/questions.md` và dừng.
5. **Không đọc bí mật**: `.env*`, `*.pem`, `*.key`, `secrets/`.
6. **Không chạy** `git push/commit/reset/checkout/switch/rebase/merge/stash/clean`, `curl`, `wget`, `rm -rf`. Orchestrator commit kèm trailer `REQ-ID`, `Task`, `Tests`, `AIWS-Run`.
7. Mọi khẳng định về hệ thống phải dẫn chiếu file thật; không chắc -> ghi `[CẦN XÁC NHẬN]`.
8. Tên test chứa mã test case (`TC-3`, `TC_3`, `tc3` tuỳ ngôn ngữ) để truy vết AC -> TC -> task -> commit.
9. **Chuẩn quốc tế, không phá cấu trúc** (`aiws/skills/coding-standards`): code theo convention của dự án rồi tới style guide chuẩn của ngôn ngữ; test spec theo ISO/IEC/IEEE 29119-3, unit test theo Arrange-Act-Assert; API theo OpenAPI 3, lỗi theo RFC 9457 nếu dự án chưa có format; thời gian theo ISO 8601; commit theo Conventional Commits. Không đổi tên, di chuyển, xoá hay reformat file, thư mục, public API ngoài design đã duyệt.
10. Workspace không giả định ngôn ngữ: mỗi `source-*` có thể là một stack khác. Luôn dùng đúng ngôn ngữ, framework, lệnh build/test đang có của thư mục đó (`aiws/knowledge/conventions.md`, `aiws/config/policies.yaml -> commands`).

## Làm việc tương tác (không qua `aiws run`)
Có thể gọi subagent trực tiếp, ví dụ: "dùng agent analyst cho REQ-001". Hook `aiws guard` vẫn đọc nhánh `aiws/REQ-xxx` + `state.yaml` để chặn ghi sai phase.
