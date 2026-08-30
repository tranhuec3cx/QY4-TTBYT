# Tem QR thiết bị 70 x 45 mm

Ngày cập nhật: 30/08/2026
Nhánh: `feature/lcm-vong-doi`

## Mẫu tem

Kích thước in mặc định: **70 x 45 mm**.

Nội dung trên tem được rút gọn còn:

- BỆNH VIỆN QUÂN Y 4
- Tên thiết bị
- Mã QR hiển thị dạng `Mã nhóm.Serial Number`, ví dụ `XQ.246489`
- Mã QR
- Dòng hướng dẫn: `Quét để xem hồ sơ / báo sự cố thiết bị`

Không đưa Khoa sử dụng, Model hoặc các thông tin dễ thay đổi lên tem để tránh phải in lại khi thiết bị điều chuyển hoặc cập nhật hồ sơ.

## Nguyên tắc kỹ thuật

- QR vẫn mở hồ sơ theo `device_id` nội bộ.
- Mã in trên tem vẫn theo quy tắc mã nhóm + Serial Number.
- Hộp thoại in có định dạng riêng cho máy in tem 70 x 45 mm.
- Chờ ảnh QR tải xong trước khi gọi lệnh in để hạn chế tem trắng QR.
- Có cảnh báo nếu trình duyệt chặn cửa sổ in.

## File

- `public/qr-label.js`: bộ in tem QR dùng tại danh sách thiết bị.
- `public/index.html`: nạp bộ in tem chuẩn.
- `public/device-lifecycle.js`: đồng bộ bộ in tem trong hồ sơ chi tiết thiết bị.

Không thay đổi nhánh `main`.
