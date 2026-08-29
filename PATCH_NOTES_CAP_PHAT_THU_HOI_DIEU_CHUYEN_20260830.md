# Cấp phát – Thu hồi – Điều chuyển thiết bị

Ngày cập nhật: 30/08/2026
Nhánh phát triển: `feature/lcm-vong-doi`

## Nội dung bổ sung

- Đổi mục **Điều chuyển** thành **Cấp phát – Thu hồi – Điều chuyển**.
- Dùng chung một **Phiếu biến động thiết bị** với 3 loại nghiệp vụ:
  - Cấp phát: C10 – Khoa Trang bị → khoa sử dụng.
  - Thu hồi: khoa sử dụng → C10 – Khoa Trang bị.
  - Điều chuyển: khoa sử dụng A → khoa sử dụng B.
- Phiếu lưu: ngày thực hiện, thiết bị, khoa đi/khoa đến, vị trí cũ/vị trí mới, lý do, số văn bản/quyết định, tình trạng thiết bị khi bàn giao, người giao, người nhận, người phê duyệt và ghi chú.
- Khi Thu hồi, hệ thống tự chuyển khoa quản lý hiện tại của thiết bị về `C10`; vị trí mặc định `Khoa Trang bị / Kho` nếu không nhập.
- Khi Cấp phát hoặc Điều chuyển, hệ thống tự cập nhật khoa và vị trí hiện tại của thiết bị.
- Không cho xóa lịch sử biến động; nếu sai phải lập phiếu biến động ngược để bảo toàn audit trail.
- Các bản ghi điều chuyển cũ tự được coi là `Điều chuyển`, không mất dữ liệu.
- KPI `Điều chuyển năm nay` đổi thành `Biến động năm nay`.
- Timeline hồ sơ thiết bị hiển thị đúng tên sự kiện: `Cấp phát`, `Thu hồi`, `Điều chuyển`.

## File bổ sung/thay đổi

- `lcm-movements-routes.js`
- `bootstrap.js`
- `public/lcm.html`
- `public/lcm-movements.js`
- `public/lcm-movements.css`
- `public/device-lifecycle.js`

## Nguyên tắc phiên bản

- Không thay đổi nhánh `main`.
- Giữ nguyên các nhánh backup trước.
- Toàn bộ thay đổi nằm trên `feature/lcm-vong-doi`.
