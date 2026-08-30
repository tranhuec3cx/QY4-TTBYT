# Mã QR thiết bị theo mã nhóm + Serial Number

Ngày cập nhật: 30/08/2026
Nhánh phát triển: `feature/lcm-vong-doi`

## Quy tắc

- Mã QR hiển thị trên tem: **Mã nhóm + "." + Serial Number**.
- Ví dụ: `XQ.246489`, `SA.228541`, `SH.CN560087`.
- Mã nhóm ưu tiên lấy từ phần đầu của **Mã bảo hiểm**; nếu chưa có thì dùng `group_code` của thiết bị.
- Serial Number được giữ làm thành phần nhận diện chính, chỉ loại bỏ khoảng trắng khi tạo mã QR.
- Nếu thiếu Serial Number hoặc mã nhóm, phần mềm không tự sinh mã giả và sẽ yêu cầu bổ sung dữ liệu.

## Hoạt động của QR

- Nội dung QR vẫn mở hồ sơ thiết bị bằng `device_id` nội bộ để liên kết không thay đổi khi thiết bị đổi khoa, vị trí hoặc cập nhật thông tin quản lý.
- Tem QR hiển thị: Bệnh viện Quân y 4 → Tên thiết bị → Mã QR dạng `XQ.246489` → QR → hướng dẫn quét.
- Ô tìm kiếm danh sách thiết bị nhận trực tiếp mã QR dạng `XQ.246489`, ngoài các trường đã có như tên thiết bị, serial, mã bảo hiểm, model.

## File thay đổi

- `public/devices.js`
- `public/index.html`

Không thay đổi nhánh `main`.