---
name: be-conventions
description: Convention THẬT của source-be (Java 21, Maven wrapper, JDK HttpServer, Jackson, JUnit 5) - layering, validation, lỗi RFC 9457, đặt tên, test. Dùng khi thiết kế, code hoặc review BE.
---

# BE conventions (source-be)

## Stack
- Java 21 (`maven.compiler.release=21`), Maven qua wrapper: `source-be/mvnw` (macOS/Linux), `source-be/mvnw.cmd` (Windows).
- HTTP: `com.sun.net.httpserver.HttpServer` của JDK, không dùng framework. JSON: Jackson (`jackson-databind`).
- Test: JUnit Jupiter (BOM `junit-bom`), surefire. Lệnh: `aiws/config/policies.yaml` -> `commands.be_build`, `be_test`.

## Cấu trúc (package `com.example.crm`)
| Package | Trách nhiệm | Ví dụ |
| --- | --- | --- |
| `domain` | Model bất biến (`record`) và enum | `domain/Customer.java`, `domain/CustomerStatus.java` |
| `repository` | Interface lưu trữ + bản in-memory | `repository/CustomerRepository.java`, `repository/InMemoryCustomerRepository.java` |
| `service` | Toàn bộ quy tắc nghiệp vụ và validation | `service/CustomerService.java` |
| `api` | HTTP handler, request record, `Problem` | `api/CustomerHandler.java`, `api/CreateCustomerRequest.java`, `api/Problem.java` |
| `error` | Exception nghiệp vụ | `error/ValidationException.java`, `error/NotFoundException.java` |
| (gốc) | Khởi động server, seed dữ liệu | `App.java` |

Luồng: `CustomerHandler` -> `CustomerService` -> `CustomerRepository`. Handler không chứa quy tắc nghiệp vụ.

## Validation và lỗi
- Service gom lỗi theo field vào `LinkedHashMap<String,String>` rồi ném `ValidationException(errors)` một lần (xem `CustomerService.create`). Chuỗi đầu vào được `trim()` trước khi kiểm tra.
- Thông điệp lỗi field: tiếng Anh, chữ thường, dạng "must ..."/"is ..." (vd. `must not be blank`, `is already used by another customer`).
- Handler map exception sang HTTP: `ValidationException` -> 400 kèm `errors`, `NotFoundException` -> 404, JSON hỏng -> 400, còn lại -> 500. Body lỗi là `Problem` theo **RFC 9457**, `Content-Type: application/problem+json`.

## API
- Prefix `/api/customers`; JSON camelCase theo tên field của record; tạo mới trả 201 kèm object vừa tạo.
- Route thêm vào `CustomerHandler.route` theo kiểu hiện có (so sánh path + method, regex cho `{id}`).

## Đặt tên
- Lớp PascalCase, method/field camelCase, hằng `UPPER_SNAKE_CASE` (`NAME_MAX_LENGTH`). Một public type mỗi file.
- Javadoc một dòng cho mỗi public type.

## Test
- `src/test/java`, cùng package với lớp được test; tên lớp `<Lớp>Test`.
- Arrange-Act-Assert; mỗi test một hành vi; `@DisplayName` mô tả hành vi. Mã TC gắn vào `@DisplayName("TC-n: ...")`.
- Service test dùng `InMemoryCustomerRepository` thật (không mock). HTTP test khởi động `App.start(0, service)` trên port ngẫu nhiên và gọi bằng `java.net.http.HttpClient` (xem `api/CustomerHandlerTest.java`).
