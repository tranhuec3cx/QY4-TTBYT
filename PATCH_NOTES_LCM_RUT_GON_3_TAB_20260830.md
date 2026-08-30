# Rút gọn LCM còn 3 tab chính

Ngày cập nhật: 30/08/2026
Nhánh phát triển: `feature/lcm-vong-doi`

## Giao diện mới

LCM chỉ còn 3 tab chính:

1. **Hồ sơ vòng đời**
   - Chọn thiết bị và xem nhanh giai đoạn vòng đời, tuổi máy, rủi ro, availability, số lần sửa chữa và khuyến nghị quản lý.
   - Mở trực tiếp hồ sơ thiết bị để xem toàn bộ timeline vòng đời.
   - Phần tiếp nhận – nghiệm thu – bàn giao được giữ lại nhưng chuyển thành khối thu gọn, không còn là tab riêng.

2. **Biến động**
   - Một phiếu dùng chung cho Cấp phát – Thu hồi – Điều chuyển.
   - Giữ nguyên lịch sử biến động và audit trail.

3. **Đánh giá – Kế hoạch**
   - Gộp Hiệu quả – Rủi ro, Kế hoạch thay thế 1–3–5 năm và Kết thúc vòng đời – Thanh lý.
   - Các phần chi tiết dùng khối thu gọn thay vì thêm tab con.

## Nguyên tắc

- Không xóa dữ liệu hoặc API đã có.
- Không thay đổi thuật toán rủi ro và kế hoạch thay thế.
- Chỉ rút gọn lớp giao diện để người dùng dễ hiểu và dễ thao tác.
- Các phân hệ Sự cố, Sửa chữa, Bảo dưỡng, Kiểm định vẫn là nơi nhập dữ liệu nghiệp vụ; LCM chủ yếu tổng hợp và hỗ trợ quyết định.
- Liên kết LCM trên menu được đưa xuống sau Kiểm định khi hiển thị trên trang LCM.
- Không thay đổi nhánh `main`.

## File thay đổi

- `public/lcm.html`
- `public/lcm-simple.css`
- `public/lcm-simple.js`
