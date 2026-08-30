# PATCH NOTES - QR BÁO SỰ CỐ CÔNG KHAI - 30/08/2026

## Mục tiêu

Chỉ cho phép người dùng Internet quét QR và gửi báo sự cố thiết bị. Không public ứng dụng quản trị QY4-TTBYT.

## Kiến trúc

- Cổng `5000`: ứng dụng quản trị đầy đủ, tiếp tục dùng trong LAN.
- Cổng `5050`: gateway công khai riêng, mặc định bind `127.0.0.1`.
- ngrok/Cloudflare Tunnel chỉ được trỏ vào `127.0.0.1:5050`.
- Không mở/tunnel cổng quản trị 5000 ra Internet.

## File mới

- `public-incident-security.js`: token HMAC cho QR.
- `public-incident-admin-routes.js`: API nội bộ tạo link và QR.
- `public-incident-gateway.js`: gateway chỉ tiếp nhận báo sự cố.
- `public-incident/incident.html`: giao diện báo sự cố trên điện thoại.
- `public-incident/incident.css`.
- `public-incident/incident.js`.
- `public/incident-qr.html`: công cụ nội bộ tạo/in tem.
- `public/incident-qr.css`.
- `public/incident-qr.js`.
- `deployment/windows/run-public-incident.ps1`.
- `deployment/windows/setup-public-incident.ps1`.
- `DEPLOY_PUBLIC_INCIDENT_ONLY.md`.

## File cập nhật

- `bootstrap.js`: đăng ký API tạo QR công khai ở ứng dụng nội bộ.
- `package.json`: thêm lệnh `start:public-incident` và thư viện `qrcode`.
- `.gitignore`: không đưa khóa ký QR lên GitHub.
- `public/settings.html`: thêm lối vào công cụ QR báo sự cố.
- `scripts/backup.js`: sao lưu khóa ký QR cùng database và uploads.

## An toàn

- QR dùng token HMAC, không dùng ID tuần tự đơn thuần.
- Public gateway chỉ trả tên thiết bị, Serial, Khoa/Phòng, vị trí và form gửi sự cố.
- Không có route danh sách thiết bị, hồ sơ vòng đời, sửa chữa, bảo dưỡng, kiểm định, chi phí, báo cáo hoặc quản trị trên cổng 5050.
- Tối đa 03 ảnh, 5MB/ảnh; chỉ JPG/PNG/WEBP.
- Có rate limit theo IP và thiết bị, honeypot đơn giản, CSP và các header bảo vệ cơ bản.
- Sự cố công khai được tạo với trạng thái `Mới ghi nhận` để đi vào quy trình xử lý nội bộ hiện có.
- Khóa ký tự sinh tại `config/public-qr-secret.txt`; xóa/đổi khóa sẽ làm QR đã in mất hiệu lực.
- Backup tự động hiện sao lưu cả khóa ký này.

## Kiểm tra đã thực hiện

Đã kiểm tra cú pháp bằng `node --check` cho:

- `public-incident-security.js`
- `public-incident-admin-routes.js`
- `public-incident-gateway.js`
- `public-incident/incident.js`
- `public/incident-qr.js`

Các file trên không có lỗi cú pháp JavaScript trong lần kiểm tra này.

## Chưa kiểm tra trên máy triển khai thật

- Chưa chạy gateway với database thật của PC C10.
- Chưa cài/chạy ngrok trên PC vật lý.
- Chưa kiểm thử gửi form thực tế từ 4G/5G.
- Chưa kiểm thử đồng thời nhiều người dùng.
- `package.json` đã thêm `qrcode`; `package-lock.json` cần được npm đồng bộ khi chạy `npm install` trên môi trường có Internet trước khi chốt bản phát hành/CI dùng `npm ci`.

## Lưu ý QR cũ

Trang/luồng QR cũ trong ứng dụng vẫn còn để không phá các phần đã có. QR công khai mới phải được tạo từ:

`Cài đặt -> QR báo sự cố thiết bị`

Khi public bằng ngrok, chỉ domain/tunnel mới trên cổng 5050 được dùng cho tem báo sự cố.
