# REQ-003 — Ngừng hoạt động và kích hoạt lại khách hàng

**Người yêu cầu:** Bộ phận CSKH · **Ưu tiên:** Trung bình

## Bối cảnh

Hệ thống mới hiển thị trạng thái của khách hàng (đang hoạt động / ngừng hoạt động) nhưng chưa có
cách đổi trạng thái. Hệ thống cũ (`source-legacy`) lưu trạng thái trong cột `status` và có quy tắc:
số điện thoại chỉ phải duy nhất giữa các khách hàng **đang hoạt động**.

## Yêu cầu

- Nhân viên chuyển được một khách hàng đang hoạt động sang ngừng hoạt động, và ngược lại.
- Ngừng hoạt động không xoá và không sửa họ tên, email, số điện thoại của khách hàng.
- Không kích hoạt lại được một khách hàng nếu số điện thoại của họ đang được một khách hàng đang
  hoạt động khác dùng. Khi đó phải báo lỗi rõ ràng và trạng thái không đổi.
- Chuyển sang đúng trạng thái đang có thì không báo lỗi và không đổi gì.
- Màn hình danh sách có cách để đổi trạng thái của từng khách hàng, và cập nhật lại sau khi đổi.

## Ngoài phạm vi

- Xoá khách hàng.
- Lọc hoặc tìm kiếm danh sách theo trạng thái.
- Ghi lại lịch sử ai đổi trạng thái và lúc nào.
