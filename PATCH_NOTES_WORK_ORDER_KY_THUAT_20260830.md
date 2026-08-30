# Work Order kỹ thuật theo mô hình HTM/CMMS

Ngày cập nhật: 30/08/2026  
Nhánh phát triển: `feature/lcm-vong-doi`

## Mục tiêu

Chuẩn hóa luồng **Sự cố → Phiếu công việc kỹ thuật (Work Order) → Phân công → Xử lý/Chờ linh kiện → Hoàn thành → Bàn giao**, nhưng tiếp tục sử dụng dữ liệu sửa chữa hiện có để không tạo hai hệ thống song song.

## Nội dung bổ sung

- Mỗi phiếu sửa chữa có **Mã Work Order** dạng `WO-YYYYMMDD-XXXX`.
- Bổ sung mức ưu tiên: Bình thường, Thấp, Trung bình, Cao, Khẩn cấp.
- Bổ sung người báo/người ghi nhận và nguồn phát sinh: sự cố hoặc tạo trực tiếp.
- Bổ sung người phụ trách, thời gian phân công, thời gian bắt đầu và hạn hoàn thành dự kiến.
- Bổ sung lý do chờ/vướng mắc, phục vụ trạng thái Chờ linh kiện.
- Bổ sung thông tin bàn giao: thời gian bàn giao, người bàn giao, người/khoa nhận.
- Giữ lịch sử các mốc Work Order trong `activity_history` cùng lịch sử sửa chữa.
- Bảng Sửa chữa được trình bày lại theo Work Order: mã WO, thiết bị, khoa/vị trí, sự cố, người phụ trách, ưu tiên, trạng thái, hạn xử lý, hình thức, chi phí, kết quả.
- Dashboard nhỏ của tab Sửa chữa đổi thành: Tổng Work Order, Chưa phân công, Đang xử lý, Chờ linh kiện, Đã hoàn thành, Quá hạn.
- Phiếu quá hạn được làm nổi bật.
- Có thao tác nhanh Phân công, Bắt đầu/Tiếp tục, Cập nhật, Bàn giao và Lịch sử.
- Xuất Excel Sửa chữa được mở rộng thành báo cáo Work Order có cả thông tin phân công, ưu tiên, hạn xử lý và bàn giao.
- Tab Sự cố đổi nút `Chuyển sửa chữa` thành **Tạo Work Order** và `Mở phiếu sửa chữa` thành **Mở Work Order**.

## Nguyên tắc dữ liệu

- Không tạo bảng sửa chữa mới; các trường Work Order được bổ sung vào bảng `repairs` hiện có.
- Các API sửa chữa cũ vẫn được giữ để bảo đảm tương thích.
- Work Order là lớp tổ chức công việc, không thay thế hồ sơ Sự cố hay hồ sơ thiết bị.
- Không xóa lịch sử xử lý khỏi luồng Work Order trên giao diện mới.

## File bổ sung/thay đổi

- `work-order-routes.js`
- `bootstrap.js`
- `public/work-orders-ui.js`
- `public/work-orders.css`
- `public/maintenance.html`
- `public/tickets-work-order.js`
- `public/tickets.html`

## Kiểm tra

- Đã kiểm tra cú pháp Node/JavaScript cho `work-order-routes.js`, `work-orders-ui.js` và `tickets-work-order.js` bằng `node --check` trước khi ghi lên nhánh.
- Chưa xác nhận end-to-end trên database đang chạy tại máy chủ bệnh viện; cần chạy thử trên bản sao dữ liệu trước khi đưa vào `main`.

## Phiên bản

- Không thay đổi nhánh `main`.
- Tiếp tục phát triển trên `feature/lcm-vong-doi`.
