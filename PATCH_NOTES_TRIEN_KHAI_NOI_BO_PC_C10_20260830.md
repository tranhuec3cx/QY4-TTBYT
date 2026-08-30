# Mốc triển khai nội bộ trên 01 PC C10

Ngày: 30/08/2026
Nhánh: `feature/lcm-vong-doi`

## Mục tiêu

Cho phép triển khai QY4-TTBYT trong mạng LAN bệnh viện khi chưa có máy chủ chuyên dụng. Một PC cố định tại Khoa Trang bị đóng vai trò máy chủ nội bộ.

## Nội dung đã bổ sung

- Endpoint kiểm tra dịch vụ: `/api/system/health`.
- Script backup an toàn cho SQLite WAL bằng `better-sqlite3.backup()`.
- Backup kèm thư mục `uploads` và file thông tin bản sao lưu.
- Giữ mặc định 30 ngày; hỗ trợ `QY4_BACKUP_DIR` và `QY4_BACKUP_RETENTION_DAYS`.
- Windows Task Scheduler tự chạy ứng dụng khi bật máy.
- Windows Task Scheduler backup hằng ngày, mặc định 17:00.
- Firewall chỉ mở TCP 5000 cho profile Domain/Private, không mở Public.
- Script kiểm tra trạng thái dịch vụ.
- Script gỡ Scheduled Task/firewall mà không xóa dữ liệu.
- Tài liệu cài đặt tại `deployment/windows/README.md`.
- `npm run backup` để sao lưu thủ công.

## An toàn dữ liệu

`setup.ps1` mặc định dừng cài đặt nếu không tìm thấy `db/qy4_ttbyt.sqlite`. Mục đích là tránh máy triển khai thật tự sinh dữ liệu demo. Tham số `-AllowDemoSeed` chỉ dành cho máy thử nghiệm.

## Lưu ý mạng

`server.js` đang dùng `app.listen(PORT)` không chỉ định loopback, do đó Node/Express có thể nhận kết nối trên giao diện mạng của máy. Địa chỉ LAN được in ra khi khởi động. Cần bộ phận CNTT cấp IP tĩnh hoặc DHCP reservation cho PC C10.

## File chính

- `deployment-routes.js`
- `scripts/backup.js`
- `deployment/windows/run-server.ps1`
- `deployment/windows/setup.ps1`
- `deployment/windows/check-status.ps1`
- `deployment/windows/remove-tasks.ps1`
- `deployment/windows/README.md`
- `bootstrap.js`
- `package.json`
- `.gitignore`

Không thay đổi nhánh `main`.
