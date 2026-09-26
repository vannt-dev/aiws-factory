---
name: unit-testing
description: Quy tắc viết test spec (ISO/IEC/IEEE 29119-3) và unit test theo chuẩn của từng ngôn ngữ, truy vết được về acceptance criteria qua mã TC.
---

# Unit testing

## Test spec (ISO/IEC/IEEE 29119-3)
Mỗi test case trong 03-test-spec.md có đủ các trường sau:

| Trường | Ý nghĩa |
| --- | --- |
| `### TC-n: tiêu đề` | Định danh duy nhất + tên ngắn |
| `covers` | Truy vết tới AC (bắt buộc; orchestrator kiểm tra) |
| `side` | Side trong policies.yaml (be, fe, mobile...) |
| `level` / `type` | unit, integration; functional, negative, boundary |
| `priority` | high / medium / low |
| `objective` | Test chứng minh điều gì |
| `preconditions` | Trạng thái trước khi chạy |
| `test data` | Dữ liệu vào cụ thể (kể cả giá trị biên) |
| `steps` | Given / When / Then |
| `expected result` | Kết quả quan sát được, đo được |

Kỹ thuật thiết kế test nên dùng: phân vùng tương đương, giá trị biên, bảng quyết định, chuyển trạng thái (ISTQB).

## Unit test trong code
- Cấu trúc **Arrange-Act-Assert** (hoặc Given-When-Then). Một hành vi mỗi test; dữ liệu cụ thể.
- **Tên test theo quy ước của ngôn ngữ/framework**, mô tả hành vi, ví dụ `shouldReturn404WhenUserNotFound`, `test_returns_404_when_user_missing`, `TestGetUser_NotFound`, `GetUser_UnknownId_Returns404`.
- **Gắn mã TC qua metadata chuẩn của framework**, không bóp méo tên hàm. Orchestrator tìm `TC-3` (hoặc `TC_3`, `tc3`) trong file test mà task sửa; thiếu là task fail.

| Framework | Cách gắn mã TC (chuẩn) |
| --- | --- |
| JUnit 5 (Java/Kotlin) | `@Tag("TC-3")` và/hoặc `@DisplayName("TC-3: returns 404 when user not found")` |
| TestNG | `@Test(description = "TC-3: ...")` |
| xUnit (.NET) | `[Fact(DisplayName = "TC-3: ...")]` hoặc `[Trait("TestCase", "TC-3")]` |
| NUnit / MSTest | `[Test, Property("TestCase", "TC-3")]` / `[TestMethod, TestProperty("TestCase", "TC-3")]` |
| Jest / Vitest / Mocha / node:test | `it('TC-3: returns 404 when user not found', ...)` |
| pytest | `@pytest.mark.tc("TC-3")` (khai báo marker trong cấu hình pytest) hoặc docstring `"""TC-3: ..."""` |
| Go testing | subtest `t.Run("TC-3 returns 404", ...)` hoặc comment `// TC-3` ngay trên hàm |
| PHPUnit | `#[TestDox('TC-3: ...')]` hoặc `@testdox TC-3: ...` |
| RSpec | `it 'returns 404 (TC-3)', tc: 'TC-3' do` |
| Rust | comment/doc `/// TC-3: ...` ngay trên `#[test]` |
| Flutter/Dart | `test('TC-3: ...', ...)` hoặc `tags: ['TC-3']` |

- **Vị trí file test** theo cấu trúc hiện có và chuẩn ecosystem (xem skill coding-standards). Không tạo cấu trúc thư mục test mới nếu repo đã có.
- Không phụ thuộc mạng, thời gian thực, thứ tự chạy, DB thật (mock/fake/in-memory theo convention dự án).
- Có cả đường thành công và đường lỗi được AC yêu cầu.
- Dùng framework test ĐANG CÓ trong dự án; không thêm framework mới nếu design chưa duyệt.
- Không sửa test cũ để "cho pass". Test cũ fail nghĩa là có hồi quy: sửa code, hoặc ghi câu hỏi vào questions.md.

## Chạy
Lệnh thật nằm trong aiws/config/policies.yaml -> commands (`<side>_test`). Orchestrator chạy toàn bộ suite của side mà task chạm tới; mọi test phải pass (exit code 0).
