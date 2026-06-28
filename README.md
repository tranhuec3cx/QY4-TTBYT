# QY4 TTBYT App v38 - Hoàn thiện Sự cố / Sửa chữa / Bảo dưỡng

Phần mềm quản lý trang thiết bị y tế cho Khoa Trang bị - Bệnh viện Quân y 4.

## Nội dung đã hoàn thiện trong bản v38

- Sửa `server.js`:
  - Chỉ giữ 1 route `POST /api/repairs`, có validate `device_id`, `try/catch`, ghi lịch sử và trả lỗi rõ ràng.
  - `GET /api/repairs` trả đủ thông tin thiết bị: mã, tên, khoa/phòng, nhóm, vị trí, model, serial.
  - `PUT /api/repairs/:id` cập nhật được cả `device_id` khi sửa phiếu.
  - Bổ sung file đính kèm cho bảo dưỡng bằng `multer`.
  - Bản ghi bảo dưỡng có thể lưu file trực tiếp và đồng thời ghi vào hồ sơ tài liệu thiết bị.

- Thiết kế lại tab **Sự cố**:
  - Bỏ cột “Đã lưu” gây khó hiểu.
  - Cột thao tác gọn hơn: Xem HS, Chuyển sửa chữa, Sửa, Lịch sử, Xóa.
  - Form ghi nhận sự cố rõ ràng hơn, có textarea rộng cho mô tả và ghi chú.
  - Nút “Chuyển sửa chữa” chỉ mở phiếu sửa chữa điền sẵn, không tự tạo bản ghi.

- Thiết kế lại tab **Sửa chữa**:
  - Bảng sửa chữa không lệch cột.
  - Có thống kê nhanh: Tổng phiếu, Mới tiếp nhận, Đang xử lý, Chờ linh kiện, Đã hoàn thành, Tổng chi phí.
  - Modal tạo/cập nhật phiếu sửa chữa rộng, chia 3 khối: Thông tin thiết bị, Thông tin hỏng/sự cố, Thông tin xử lý.
  - Bỏ dòng “Thiết bị” thừa.
  - Mã thiết bị có ô riêng, không lẫn vào tên thiết bị.
  - Nội dung sửa chữa dùng textarea rộng.
  - Có nút Xem HS, Sửa, Lịch sử, Xóa.

- Bổ sung tab **Bảo dưỡng**:
  - Form có trường “File đính kèm”.
  - Cho phép tải các file: PDF, Word, Excel, JPG, PNG.
  - Bảng bảo dưỡng có nút Tải file nếu có đính kèm.

## Cách chạy

```bash
npm install
npm start
```

Sau đó mở:

```text
http://localhost:5000
```

Các trang chính:

```text
http://localhost:5000/tickets.html       # Sự cố
http://localhost:5000/maintenance.html   # Sửa chữa
http://localhost:5000/inspection.html    # Bảo dưỡng
```

## Lưu ý khi nâng cấp từ bản cũ

- Không cần xóa database.
- Server tự bổ sung các cột file cho bảng `maintenances` nếu còn thiếu.
- Nên backup thư mục `db/` trước khi chạy bản mới.
