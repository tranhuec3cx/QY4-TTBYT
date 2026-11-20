# QY4-TTBYT – Hoàn thiện giao diện điều hành 21/11/2026

## Phạm vi
Bản hoàn thiện giao diện trên nhánh `feat/ui-final-20261121`, phát triển từ `feat/demo-lifecycle-workflows-20261005`.

## Nội dung đã hoàn thiện
- Làm nhẹ toàn bộ bảng màu: nền trắng/xanh rất nhạt, giảm độ bão hòa và độ tương phản không cần thiết.
- Nút thao tác chuyển sang tông xanh lam/xám pastel; màu cảnh báo chỉ dùng nhẹ cho trạng thái cần chú ý.
- Thu gọn nhận diện đầu trang: “BỆNH VIỆN QUÂN Y 4 / QUẢN LÝ THIẾT BỊ Y TẾ”.
- Chuẩn hóa menu theo luồng nghiệp vụ: Tiếp nhận → Danh mục → Sự cố → Sửa chữa → Bảo dưỡng → KĐ/HC/ATBX → Kiểm kê → Điều chuyển → Thanh lý → Báo cáo.
- Tổng quan chỉ giữ 05 KPI cần thiết:
  1. Tổng hồ sơ thiết bị.
  2. Đang hoạt động.
  3. Cần xử lý kỹ thuật.
  4. Sự cố chờ tiếp nhận.
  5. KĐ/HC quá hạn.
- “Cần xử lý kỹ thuật” đếm theo thiết bị duy nhất, không cộng trùng khi một thiết bị đồng thời có sự cố và sửa chữa; loại thiết bị đã lưu trữ.
- “Công việc cần xử lý” trở thành khối chính; mỗi thiết bị chỉ hiển thị một việc ưu tiên cao nhất.
- Bộ lọc thời gian có nút “Lọc” rõ ràng, tránh tự tải lại liên tục khi thay đổi từng trường.
- Giữ responsive cho màn hình nhỏ.

## An toàn dữ liệu
- Không thay đổi schema SQLite.
- Không xóa hoặc di chuyển dữ liệu thiết bị.
- Không thay đổi QR UID.
- Không thay đổi các bảng nghiệp vụ.
- Nhánh `main` không bị ghi đè.

## Tệp thay đổi
- `server.js`
- `public/api.js`
- `public/dashboard.html`
- `public/dashboard.js`
- `public/styles.css`

## Kiểm tra
- JavaScript syntax: OK cho `server.js`, `public/api.js`, `public/dashboard.js`.
- Dashboard HTML: không có ID trùng.
- Nhánh hoàn thiện đi trước nhánh nền, không bị behind.
