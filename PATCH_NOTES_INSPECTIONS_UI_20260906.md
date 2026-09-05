# PATCH NOTES - KIỂM ĐỊNH / HIỆU CHUẨN / ATBX - 06/09/2026

## Phạm vi
- Chuẩn hóa giao diện `public/inspections.html` theo bố cục Bộ lọc -> KPI -> Danh sách -> Popup.
- Bổ sung stylesheet riêng `public/inspections-ui.css`.
- Cập nhật `public/inspections.js` để hỗ trợ popup, KPI hạn hồ sơ và tìm thiết bị.

## Thay đổi chính
- Bỏ ô hiển thị `Người dùng: Quản trị viên` khỏi trang.
- Nút `+ Thêm hồ sơ` mở popup thêm/cập nhật.
- Chọn thiết bị bằng ô gõ tìm theo: Mã thiết bị + Tên thiết bị + Model.
- Giữ tự nhập thời gian thực hiện.
- KPI theo bộ lọc: Tổng hồ sơ, Còn hạn, Sắp hạn <= 30 ngày, Quá hạn, Không đạt, Chưa nhập hạn tiếp theo.
- Bổ sung bộ lọc Kết quả.
- Bảng ưu tiên cột Hạn tiếp theo, có badge tình trạng hạn.
- Xuất Excel bổ sung tình trạng hạn.

## An toàn dữ liệu
- Không thay đổi schema database.
- Không thay đổi endpoint API hiện có.
- Không xóa dữ liệu cũ.

## Kiểm thử
- Chưa chạy kiểm thử trực tiếp trên máy Windows triển khai. Cần cập nhật branch và kiểm tra giao diện/luồng trên trình duyệt thực tế.
