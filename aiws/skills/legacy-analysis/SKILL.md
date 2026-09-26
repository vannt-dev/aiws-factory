---
name: legacy-analysis
description: Cách khảo sát một codebase bất kỳ ngôn ngữ (kể cả hệ thống legacy) để viết bản đồ hệ thống, API inventory, DB schema, glossary và conventions có dẫn chứng. Dùng cho discovery và knowledge update.
---

# Legacy analysis (mọi ngôn ngữ)

AIWS không giả định stack. Mỗi thư mục `source-*` có thể là một ngôn ngữ khác nhau; prompt có mục "Detected stacks" làm gợi ý. Luôn xác minh bằng file thật.

## Trình tự khảo sát
1. **Điểm vào và build**: tìm file build/manifest, ghi công nghệ và phiên bản.
2. **Cấu trúc**: liệt kê thư mục cấp 1-2 của mỗi source-*, gán trách nhiệm cho từng thư mục.
3. **API**: tìm nơi khai báo route/endpoint (bảng dưới). Mỗi endpoint ghi method, path, handler file:hàm.
4. **DB**: entity/model, migration, SQL thô, stored procedure. Mỗi bảng ghi cột chính, khoá, quan hệ.
5. **FE/client gọi API**: HTTP client, SDK sinh từ OpenAPI; nối về endpoint BE.
6. **Thuật ngữ**: tên entity, enum, label UI; đưa vào glossary.
7. **Convention**: lấy 2-3 file tiêu biểu mỗi lớp (controller, service, repo, component, test) và mô tả pattern THẬT.

## Tra nhanh theo stack
| Stack | Build/manifest | Route/API | DB/migration | Test |
| --- | --- | --- | --- | --- |
| Java/Kotlin (Spring) | pom.xml, build.gradle | `@RestController`, `@GetMapping` | JPA `@Entity`, Flyway `V*__*.sql`, Liquibase | JUnit, `src/test` |
| C# (.NET) | *.sln, *.csproj | `[ApiController]`, `[HttpGet]`, `app.MapGet` | EF Core `DbContext`, `Migrations/` | xUnit/NUnit/MSTest |
| Node/TS | package.json | Express `router.get`, NestJS `@Get`, Next `app/api` | Prisma, TypeORM, Sequelize, knex | Jest, Vitest, node:test |
| Python | pyproject, requirements.txt | FastAPI `@app.get`, Django `urls.py`, Flask `@route` | SQLAlchemy/Alembic, Django `migrations/` | pytest, unittest |
| Go | go.mod | `http.HandleFunc`, gin/echo/chi | GORM, sqlc, `migrations/*.sql` | `*_test.go` |
| PHP | composer.json | Laravel `routes/*.php`, Symfony `#[Route]` | Eloquent, Doctrine migrations | PHPUnit |
| Ruby | Gemfile | Rails `config/routes.rb` | ActiveRecord `db/migrate` | RSpec, Minitest |
| FE SPA | package.json | — (gọi API: axios/fetch/SDK) | — | Jest/Vitest/Cypress |
| Mobile (Flutter, Kotlin, Swift) | pubspec.yaml, build.gradle, *.xcodeproj | — | local DB (sqflite, Room, CoreData) | flutter test, JUnit, XCTest |
| Legacy (COBOL, VB6, ASP classic, PL/SQL…) | không có | file màn hình/chương trình, form | DDL, stored procedure | thường không có |

## Nguyên tắc
- Mỗi khẳng định kèm đường dẫn file. Không có dẫn chứng thì ghi `[CẦN XÁC NHẬN]`.
- Legacy là read-only: mô tả hành vi, dữ liệu, điểm tích hợp; ghi phần nào đang được hệ thống mới thay thế.
- Không sao chép bí mật (connection string, token) vào knowledge.
- Ngắn gọn: bảng hơn văn xuôi. Knowledge là bản đồ, không phải bản sao code.
- Trong `conventions.md`, ghi lệnh build/test thật của từng side để người đối chiếu với `policies.yaml -> commands`.

## Incremental update
Chỉ sửa mục bị ảnh hưởng bởi các file đã đổi (endpoint mới cập nhật api-inventory, bảng mới cập nhật db-schema, pattern mới cập nhật conventions). Giữ nguyên phần khác.
