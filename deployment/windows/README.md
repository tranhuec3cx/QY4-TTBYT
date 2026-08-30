# Triển khai QY4-TTBYT nội bộ trên 01 PC C10

Mô hình: **01 máy tính Khoa Trang bị làm máy chủ nội bộ**, các máy khác truy cập bằng trình duyệt qua LAN/Wi-Fi bệnh viện.

## 1. Điều kiện

- Windows 10/11 64-bit.
- RAM khuyến nghị từ 8 GB.
- Máy được bật trong thời gian sử dụng hệ thống; nên có UPS.
- Cài Node.js LTS.
- Tài khoản cài đặt có quyền Administrator.
- Máy C10 kết nối LAN bệnh viện.
- Có database triển khai tại `db/qy4_ttbyt.sqlite`.

> Bộ cài mặc định **không cho chạy nếu thiếu database** để tránh vô tình sinh dữ liệu demo. Chỉ dùng tham số `-AllowDemoSeed` cho máy thử nghiệm.

## 2. Chuẩn bị dữ liệu

Trong thư mục ứng dụng cần có:

```text
QY4-TTBYT/
  bootstrap.js
  server.js
  package.json
  db/
    qy4_ttbyt.sqlite
  uploads/              (nếu đã có file đính kèm)
  deployment/windows/
```

Nếu chuyển từ máy demo/đang sử dụng sang PC C10, chép **cả database và thư mục uploads**.

## 3. Cài đặt

Mở **Windows PowerShell → Run as administrator**.

Chuyển vào thư mục ứng dụng, ví dụ:

```powershell
cd C:\QY4-TTBYT
```

Chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\setup.ps1 -Port 5000 -BackupTime "17:00"
```

Bộ cài sẽ:

- cài/cập nhật thư viện Node.js;
- tạo Scheduled Task **QY4-TTBYT Server** chạy khi Windows khởi động;
- tạo Scheduled Task **QY4-TTBYT Backup** chạy hằng ngày;
- mở TCP 5000 chỉ cho mạng **Domain/Private**;
- tạo thư mục `logs/` và `backups/`;
- khởi động phần mềm ngay sau khi cài.

## 4. Kiểm tra

Trên PC C10:

```text
http://127.0.0.1:5000/api/system/health
```

Hoặc chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\check-status.ps1
```

Nếu hệ thống hoạt động, các máy khác trong cùng mạng truy cập:

```text
http://<IP-MAY-C10>:5000
```

Ví dụ:

```text
http://192.168.1.50:5000
```

## 5. IP LAN cố định

Không nên tự đặt IP nếu chưa biết cấu hình mạng bệnh viện. Đề nghị bộ phận CNTT:

- đặt IP tĩnh phù hợp VLAN; hoặc
- tạo DHCP reservation cho MAC của máy C10.

Mục tiêu là địa chỉ của máy chủ không thay đổi sau khi khởi động lại.

## 6. Sao lưu

Backup tự động mặc định lúc **17:00 mỗi ngày**.

Thư mục mặc định:

```text
QY4-TTBYT\backups\QY4-TTBYT_YYYYMMDD_HHMMSS\
```

Mỗi bản gồm:

- `qy4_ttbyt.sqlite` được sao lưu bằng API backup của `better-sqlite3`;
- thư mục `uploads/` nếu có;
- `backup-info.json`.

Mặc định giữ **30 ngày**. Có thể chạy thủ công:

```powershell
npm run backup
```

Có thể đặt biến môi trường `QY4_BACKUP_DIR` để chuyển backup sang ổ đĩa khác/NAS được phép sử dụng.

## 7. Khôi phục dữ liệu

1. Dừng task `QY4-TTBYT Server` trong Task Scheduler.
2. Sao lưu riêng database hiện tại trước khi thay thế.
3. Chép `qy4_ttbyt.sqlite` từ bản backup về `db/`.
4. Khôi phục `uploads/` tương ứng nếu cần.
5. Khởi động lại task `QY4-TTBYT Server`.
6. Kiểm tra `/api/system/health` và mở vài hồ sơ thiết bị.

## 8. Gỡ chế độ tự chạy

Mở PowerShell Administrator và chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\remove-tasks.ps1 -Port 5000
```

Lệnh này chỉ gỡ Scheduled Task và firewall rule, **không xóa database, uploads hoặc backup**.

## 9. Nguyên tắc bảo mật giai đoạn 1

- Chỉ dùng trong LAN/Wi-Fi nội bộ được bệnh viện cho phép.
- Không port-forward TCP 5000 ra Internet.
- Không đặt máy chủ trên Wi-Fi công cộng/Guest.
- Không dùng dịch vụ tunnel công khai cho dữ liệu vận hành thật.
- Khi mở rộng toàn viện cần phối hợp CNTT để bổ sung tài khoản/phân quyền, HTTPS nội bộ, nhật ký truy cập, chính sách sao lưu và phương án chuyển SQLite sang PostgreSQL khi số người dùng đồng thời tăng.
