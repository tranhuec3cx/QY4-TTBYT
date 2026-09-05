# PATCH NOTES - THIẾT BỊ Y TẾ - 05/09/2026

- Chuẩn hóa thuật ngữ hiển thị thành **Số Serial**.
- Bỏ hộp `Người dùng: Quản trị viên` trên trang Thiết bị.
- Bổ sung trạng thái **Chờ thanh lý** vào bộ lọc thiết bị.
- Escape dữ liệu hiển thị trong bảng để tránh làm vỡ giao diện khi tên/model/vị trí có ký tự đặc biệt.
- Cảnh báo rõ khi dùng chức năng Xóa: chỉ nên xóa bản ghi nhập nhầm; thiết bị ngừng sử dụng nên chuyển trạng thái để giữ lịch sử vòng đời.
- Không thay đổi schema database và không sửa dữ liệu hiện có.
