# QY4-TTBYT — Quản lý trang thiết bị y tế BVQY4

Phần mềm quản lý trang thiết bị y tế phục vụ Khoa Trang bị, Bệnh viện Quân y 4.

**Phiên bản giao diện:** 5.0.0  
**Nền tảng:** Node.js + Express + SQLite  
**Mục tiêu giai đoạn hiện tại:** quản lý tập trung thiết bị và công việc kỹ thuật, QR báo sự cố, sửa chữa, bảo dưỡng, kiểm định/hiệu chuẩn, kiểm kê–điều chuyển, cảnh báo và báo cáo.

## 1. Nguyên tắc định danh QR

Mỗi thiết bị có một `qr_uid` duy nhất:

- Sinh một lần khi thiết bị được tạo hoặc tự bổ sung khi nâng cấp dữ liệu cũ.
- Không phụ thuộc `id` số của SQLite.
- Không phụ thuộc Serial Number.
- Không phụ thuộc mã thiết bị, khoa sử dụng hay vị trí.
- Điều chuyển hoặc sửa thông tin thiết bị không làm thay đổi QR.
- Thiết bị được lưu trữ/ngừng sử dụng không tái sử dụng `qr_uid` cho thiết bị khác.

Đường dẫn QR chuẩn:

```text
/q/<qr_uid>
```

Nguyên tắc quản lý: **Một thiết bị – một QR cố định – một lịch sử xuyên suốt.**

## 2. Chức năng lõi đã triển khai

### Thiết bị

- Danh mục thiết bị theo khoa/phòng.
- Tìm theo mã, tên, model, Serial.
- Cảnh báo Serial trùng và thiết bị nghi trùng.
- Lưu trữ hồ sơ thay cho xóa cứng.
- QR UID cố định cho từng thiết bị.

### Sự cố → Sửa chữa

Luồng chuẩn:

```text
Quét QR
→ Báo sự cố
→ Khoa Trang bị tiếp nhận
→ Chuyển sửa chữa
→ Xử lý
→ Hoàn thành
→ Lưu lịch sử kỹ thuật
```

Hệ thống lưu:

- Thời điểm báo sự cố.
- Thời điểm tiếp nhận.
- Thời điểm hoàn thành.
- Thời gian phản hồi.
- Tổng thời gian xử lý.
- Người báo/người xử lý.
- Nội dung và kết quả xử lý.

### Công việc kỹ thuật

Hồ sơ thiết bị tổng hợp:

- Sự cố.
- Sửa chữa.
- Bảo dưỡng.
- Kiểm định/hiệu chuẩn/ATBX.
- Lịch sử điều chuyển.

Có lọc theo khoảng thời gian và loại công việc.

### Kiểm kê – Điều chuyển

- Tạo đợt kiểm kê theo khoa/phòng.
- Tự lấy danh sách thiết bị đang thuộc khoa.
- Kết quả: Có / Không thấy / Sai vị trí / Sai khoa.
- Điều chuyển cập nhật khoa/vị trí hiện tại nhưng giữ lịch sử cũ.
- Điều chuyển không làm thay đổi QR.

### Dashboard và cảnh báo

Theo dõi nhanh:

- Tổng thiết bị.
- Thiết bị đang hoạt động.
- Thiết bị đang sửa chữa.
- Sự cố chưa xử lý.
- Kiểm định/hiệu chuẩn sắp đến hạn và quá hạn.
- Phiếu chờ linh kiện.
- Thời gian phản hồi sự cố trung bình.
- Thời gian xử lý sự cố trung bình.
- Số sự cố theo tháng.

### Quản trị

- Nhật ký thao tác (audit log).
- Sao lưu SQLite thủ công.
- Sao lưu tự động hằng ngày.
- Giới hạn số bản sao lưu được giữ.
- Xác thực đăng nhập tùy chọn.
- Phân quyền Quản trị viên / Kỹ sư TTBYT / Người dùng khoa.
- Không cho xóa hoặc vô hiệu hóa Quản trị viên cuối cùng khi bật xác thực.
- Reset dữ liệu mẫu chỉ hoạt động khi chủ động bật chế độ demo.

## 3. Cài đặt

Yêu cầu Node.js phù hợp với các dependency của dự án.

```bash
npm ci
```

Nếu máy chưa có lockfile phù hợp có thể dùng:

```bash
npm install
```

## 4. Chạy thử nội bộ — chưa bật đăng nhập

Windows PowerShell:

```powershell
$env:QY4_DEMO_SEED="0"
npm start
```

Linux/macOS:

```bash
QY4_DEMO_SEED=0 npm start
```

Mở:

```text
http://localhost:5000
```

Ở chế độ này xác thực đang tắt để thuận tiện test. **Không sử dụng cấu hình này khi triển khai cho nhiều khoa/phòng.**

## 5. Chạy chính thức có đăng nhập

### Windows PowerShell — lần đầu

```powershell
$env:QY4_DEMO_SEED="0"
$env:QY4_AUTH_REQUIRED="1"
$env:QY4_ADMIN_USERNAME="admin"
$env:QY4_ADMIN_PASSWORD="<MAT_KHAU_QUAN_TRI_BAN_DAU>"
$env:QY4_SESSION_HOURS="12"
$env:QY4_BACKUP_KEEP="30"
npm start
```

Sau khi đăng nhập, tạo/cập nhật các tài khoản tại **Cài đặt → Người dùng**.

Không ghi mật khẩu thật vào source code, README hoặc commit GitHub.

### Linux/macOS

```bash
QY4_DEMO_SEED=0 \
QY4_AUTH_REQUIRED=1 \
QY4_ADMIN_USERNAME=admin \
QY4_ADMIN_PASSWORD='<MAT_KHAU_QUAN_TRI_BAN_DAU>' \
QY4_SESSION_HOURS=12 \
QY4_BACKUP_KEEP=30 \
npm start
```

## 6. Phân quyền

### Quản trị viên

- Quản lý người dùng.
- Danh mục dùng chung.
- Hệ thống, audit log và backup.
- Toàn bộ nghiệp vụ kỹ thuật.

### Kỹ sư TTBYT

- Thiết bị.
- Sự cố.
- Sửa chữa.
- Bảo dưỡng.
- Kiểm định/hiệu chuẩn.
- Kiểm kê/điều chuyển.
- Báo cáo.

Không được quản trị tài khoản/hệ thống.

### Người dùng khoa

- Chỉ xem thiết bị thuộc khoa được gán.
- Báo sự cố qua QR công khai.
- Không được sửa hồ sơ kỹ thuật hoặc truy cập chức năng quản trị.

## 7. QR trên điện thoại

Khi chạy trên máy tính trong cùng mạng LAN, server sẽ in địa chỉ LAN trong terminal.

Ví dụ:

```text
http://192.168.1.20:5000
```

QR cần trỏ về **địa chỉ máy chủ ổn định**.

### Không nên dùng lâu dài

- IP thay đổi theo lần phát hotspot điện thoại.
- URL localhost.
- IP DHCP thay đổi thường xuyên.

### Khi triển khai chính thức

Nên dùng một trong hai:

- IP nội bộ cố định cho máy chủ; hoặc
- tên miền/hostname nội bộ cố định.

`qr_uid` của máy không thay đổi. Nếu chỉ đổi địa chỉ máy chủ thì dữ liệu định danh vẫn giữ nguyên, nhưng tem QR đã in chứa URL cũ sẽ không tự biết địa chỉ server mới. Vì vậy cần chốt địa chỉ truy cập ổn định **trước khi in QR hàng loạt**.

## 8. Sao lưu dữ liệu

Database chính:

```text
db/qy4_ttbyt.sqlite
```

Bản sao lưu:

```text
backups/qy4_ttbyt_YYYYMMDDHHMMSS.sqlite
```

- Server kiểm tra và tạo backup tự động trong ngày.
- `QY4_BACKUP_KEEP` quy định số bản gần nhất giữ lại, mặc định 30.
- Có thể tạo backup thủ công tại **Cài đặt → Hệ thống**.

**Trước mỗi lần cập nhật phiên bản trên máy đang có dữ liệu thật, phải sao lưu database.**

## 9. Nâng cấp từ database cũ

Không cần xóa database.

Server tự bổ sung các trường/bảng còn thiếu, gồm:

- `qr_uid`.
- trạng thái lưu trữ hồ sơ.
- mốc tiếp nhận/hoàn thành sự cố.
- lịch sử điều chuyển.
- kiểm kê.
- audit log.
- auth session.
- hash/salt mật khẩu người dùng.

Khuyến nghị:

1. Dừng server.
2. Sao lưu toàn bộ thư mục `db/`.
3. Cập nhật source.
4. Chạy lại server.
5. Kiểm tra một số thiết bị cũ và QR trước khi sử dụng chính thức.

## 10. Kiểm thử tự động

GitHub Actions hiện kiểm tra:

- Cú pháp toàn bộ JavaScript.
- Khởi động server trên database trống.
- Các API lõi.
- Dashboard, kiểm kê, backup và kiểm tra trùng.
- Luồng QR → sự cố → tiếp nhận → sửa chữa → hoàn thành.
- QR UID không đổi sau khi sửa Serial/vị trí.
- Chế độ đăng nhập bắt buộc.
- Phân quyền Quản trị viên/Kỹ sư/Người dùng khoa.
- Backup khi bật xác thực.

## 11. Nội dung chưa nên tuyên bố là đã hoàn thiện

Bản hiện tại tập trung vào **hồ sơ và lịch sử công việc kỹ thuật của thiết bị**, chưa nên mô tả là hệ thống quản lý toàn bộ vòng đời tài sản.

Các nội dung có thể phát triển sau:

- quản lý mua sắm/hợp đồng;
- khấu hao và tài chính tài sản;
- thanh lý điện tử đầy đủ;
- SSO/LDAP nếu bệnh viện có hạ tầng phù hợp;
- PostgreSQL khi số người ghi dữ liệu đồng thời tăng cao;
- thông báo tự động đa kênh;
- phân tích độ tin cậy/dự báo hỏng hóc khi có đủ dữ liệu lịch sử.

## 12. Checklist trước khi đưa vào dùng thật

- [ ] Backup database hiện tại.
- [ ] Tắt demo seed: `QY4_DEMO_SEED=0`.
- [ ] Bật đăng nhập: `QY4_AUTH_REQUIRED=1`.
- [ ] Đặt mật khẩu quản trị mạnh.
- [ ] Tạo tài khoản Kỹ sư và tài khoản khoa.
- [ ] Chốt IP/hostname máy chủ.
- [ ] Test QR bằng điện thoại trong cùng mạng.
- [ ] Test một luồng sự cố hoàn chỉnh.
- [ ] Test điều chuyển và kiểm kê.
- [ ] Kiểm tra backup được tạo.
- [ ] Chỉ sau đó mới in QR hàng loạt.
