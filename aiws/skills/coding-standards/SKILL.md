---
name: coding-standards
description: Chuẩn quốc tế thông dụng mà mọi code, test, API, commit do AIWS sinh ra phải tuân theo, cho mọi ngôn ngữ; và quy tắc không phá vỡ cấu trúc dự án hiện có.
---

# Coding standards

## Thứ tự ưu tiên
1. **Convention đã có trong dự án** (skill fe-/be-conventions, aiws/knowledge/conventions.md, cấu hình linter/formatter trong repo: `.editorconfig`, ESLint/Prettier, Checkstyle/Spotless, `.NET analyzers`, `ruff`/`black`, `gofmt`, `php-cs-fixer`, `rubocop`, `rustfmt`...).
2. **Style guide chính thống của ngôn ngữ** (bảng dưới) khi dự án chưa quy định.
3. Không tự đặt quy ước riêng. Muốn đổi quy ước thì phải có quyết định trong design và được duyệt.

| Ngôn ngữ | Chuẩn tham chiếu |
| --- | --- |
| Java | Google Java Style Guide / Oracle Code Conventions; Effective Java |
| Kotlin | Kotlin Coding Conventions (JetBrains) |
| C# / .NET | Microsoft .NET naming & coding conventions; .NET analyzers (CAxxxx) |
| JavaScript / TypeScript | ESLint recommended + Prettier; TypeScript strict; Airbnb/Standard nếu dự án dùng |
| Python | PEP 8, PEP 257 (docstring), PEP 484 (type hints) |
| Go | Effective Go, `gofmt`/`go vet`, Go Code Review Comments |
| PHP | PSR-1, PSR-4 (autoload), PSR-12 (style) |
| Ruby | Ruby Style Guide (RuboCop) |
| Rust | Rust API Guidelines, `rustfmt`, `clippy` |
| Dart / Flutter | Effective Dart, `dart format`, `flutter_lints` |
| SQL | Tên bảng/cột nhất quán với schema hiện có; migration có version, không sửa migration đã chạy |

## Không phá vỡ cấu trúc
- Không đổi tên, di chuyển hay xoá thư mục, file, module, package, namespace, public API, route, bảng DB nếu không nằm trong design đã duyệt.
- File mới đặt đúng chỗ theo cấu trúc hiện có và chuẩn ecosystem: `src/main/java` ↔ `src/test/java` (Maven/Gradle), project `*.Tests` (.NET), `tests/` hoặc `test_*.py` (pytest), `*_test.go` cạnh file (Go), `__tests__`/`*.test.ts`/`*.spec.ts` theo cách repo đang làm (JS/TS), `spec/` (RSpec), `tests/` (PHPUnit).
- Không reformat hàng loạt file ngoài phạm vi thay đổi; diff chỉ chứa thay đổi cần thiết.
- Tương thích ngược: thay đổi phá tương thích (API, schema, format dữ liệu) phải nằm trong "Quyết định cần duyệt".

## Chuẩn chung
- **API**: OpenAPI 3.x; REST dùng đúng method và status (RFC 9110). Format lỗi theo convention dự án; nếu chưa có thì dùng **RFC 9457 Problem Details** (`application/problem+json`).
- **Thời gian**: ISO 8601 / RFC 3339, lưu UTC. **Tiền tệ** ISO 4217, **ngôn ngữ** BCP 47, **quốc gia** ISO 3166.
- **Encoding**: UTF-8. Line ending theo `.gitattributes`/`.editorconfig` của repo.
- **Bảo mật**: theo OWASP Top 10 / OWASP ASVS: validate input, không log bí mật hay PII, query có tham số, không hard-code credential.
- **Commit**: Conventional Commits (`feat(scope): ...`, `fix(scope): ...`) kèm git trailer (`REQ-ID`, `Task`, `Tests`); orchestrator sinh tự động.
- **Phiên bản**: Semantic Versioning khi đổi version package/API.
- **Tài liệu trong code**: dùng định dạng chuẩn của ngôn ngữ (Javadoc/KDoc, XML doc, JSDoc/TSDoc, docstring PEP 257, GoDoc, PHPDoc, rustdoc) cho public API mới.

## Test (xem thêm skill unit-testing)
- Test spec theo **ISO/IEC/IEEE 29119-3**; unit test theo cấu trúc **Arrange-Act-Assert** (hoặc Given-When-Then).
- Tên test theo quy ước của framework/ngôn ngữ. Mã TC gắn qua metadata chuẩn (display name, tag, trait, marker), không bóp méo tên.
