# {req} — Test specification (ISO/IEC/IEEE 29119-3)

## Chiến lược
<!-- Phạm vi test, mức test (unit BE/FE...), kỹ thuật thiết kế (phân vùng tương đương, giá trị biên, bảng quyết định),
     framework đang dùng của từng side, mock/fake gì, dữ liệu test. -->

## Test cases
<!-- Mỗi test case là heading "### TC-n: tiêu đề", đánh số liên tục, đủ các trường bên dưới.
"covers" BẮT BUỘC (truy vết tới AC). "side" là tên side trong policies.yaml (be, fe, mobile...).
Trong code, mã TC gắn qua metadata chuẩn của framework (DisplayName/Tag/Trait/marker/test name) - xem skill unit-testing. -->

### TC-1: ...
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: ...
- preconditions: ...
- test data: ...
- steps: Given ... / When ... / Then ...
- expected result: ...

### TC-2: ...
- covers: AC-2
- side: be
- level: unit
- type: negative
- priority: high
- objective: ...
- preconditions: ...
- test data: ...
- steps: Given ... / When ... / Then ...
- expected result: ...

## Ma trận AC
| AC | Test cases |
| --- | --- |
| AC-1 | TC-1 |
| AC-2 | TC-2 |
