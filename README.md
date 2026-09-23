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
- Serial có ý nghĩa bị trùng được **backend chặn mặc định**; chỉ lưu khi người dùng xác nhận rõ đây là thiết bị khác. Các giá trị tạm như `NN`, `N/A`, `UNKNOWN`, `-` không bị coi là Serial thật.
- Serial Number và mã bảo hiểm/mã quản lý là hai trường độc lập; server không tự chuyển hoặc xóa Serial.
- Báo cáo chất lượng dữ liệu: thiếu Serial/Model/hãng/vị trí/năm sử dụng, nhóm Serial trùng và các dòng cần rà soát.
- Lưu trữ hồ sơ thay cho xóa cứng.
- QR UID cố định cho từng thiết bị.
- Mã thiết bị đã lưu trữ không được tái sử dụng; số thứ tự sinh mới tiếp tục tăng.
- Form cho phép lưu hồ sơ thực tế chưa đủ Hãng/Model/Serial/Năm/Vị trí; không yêu cầu bịa dữ liệu. Các thiếu hụt được đưa vào Báo cáo → Chất lượng dữ liệu.

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
- Nguồn báo: QR / Nhập trực tiếp / Không xác định đối với dữ liệu lịch sử.
- Người báo sự cố.
- Thời điểm tiếp nhận.
- Người Khoa Trang bị tiếp nhận.
- Thời điểm hoàn thành.
- Thời gian phản hồi.
- Tổng thời gian xử lý.
- Người thực hiện kỹ thuật.
- Snapshot mã khoa, tên khoa, vị trí và thiết bị tại thời điểm xảy ra sự cố; dữ liệu này không đổi khi thiết bị điều chuyển sau đó.
- Nội dung và kết quả xử lý.
- Trạng thái thiết bị được đồng bộ theo phiếu sửa chữa: đang xử lý/chờ linh kiện → Chờ sửa chữa; không sửa được → Ngừng hoạt động; hoàn thành → Đang hoạt động hoặc **Hoạt động hạn chế** do kỹ sư xác nhận.

### Hồ sơ thiết bị và công việc kỹ thuật

Giao diện hồ sơ thiết bị được tối giản còn **03 tab chính**:

- **Thông tin chung**.
- **Công việc kỹ thuật**: tổng hợp Sự cố, Sửa chữa, Bảo dưỡng, Kiểm định/Hiệu chuẩn/ATBX; có lọc theo khoảng thời gian và loại công việc.
- **Điều chuyển**: xem lịch sử và thực hiện điều chuyển có kiểm soát.

Các màn nghiệp vụ Sự cố, Sửa chữa, Bảo dưỡng và Kiểm định vẫn là nơi nhập/cập nhật hồ sơ chi tiết; trang hồ sơ máy chỉ đóng vai trò tổng hợp để tránh giao diện rối.

### Kiểm kê – Điều chuyển

- Tạo đợt kiểm kê theo khoa/phòng; mỗi khoa chỉ có **01 đợt đang mở** tại một thời điểm.
- Tự lấy danh sách thiết bị đang thuộc khoa tại thời điểm tạo đợt.
- Kết quả: Có / Không thấy / Sai vị trí / Sai khoa; backend kiểm tra logic để tránh kết quả mâu thuẫn.
- Đợt đã hoàn thành bị khóa sửa.
- Kiểm kê **không tự thay đổi** khoa/vị trí thiết bị. Khi phát hiện sai khoa/sai vị trí, người dùng mở hồ sơ thiết bị và thực hiện Điều chuyển riêng có lý do + audit.
- Thiết bị đang nằm trong đợt kiểm kê, còn sự cố hoặc sửa chữa mở thì chưa được lưu trữ.
- Điều chuyển cập nhật khoa/vị trí hiện tại nhưng giữ lịch sử cũ và không làm thay đổi QR.

### Dashboard và cảnh báo

Theo dõi nhanh:

- Tổng thiết bị **đang quản lý**; thiết bị đã lưu trữ không làm sai tổng số/cảnh báo.
- Thiết bị **đang khai thác** = Đang hoạt động + Hoạt động hạn chế.
- Hiển thị riêng số thiết bị **Hoạt động hạn chế**.
- Thiết bị chờ sửa chữa và ngừng hoạt động.
- Sự cố chưa xử lý.
- Kiểm định/hiệu chuẩn sắp đến hạn và quá hạn.
- Phiếu chờ linh kiện.
- Thời gian phản hồi sự cố trung bình.
- Thời gian xử lý sự cố trung bình.
- Số sự cố theo tháng.
- Tỷ lệ sự cố báo qua QR trong tháng.
- Số lượt kiểm tra QR và số thiết bị duy nhất đã quét trong tháng.
- Cảnh báo số sự cố chưa tiếp nhận và tỷ lệ đầy đủ mốc tiếp nhận trong tháng.

### Báo cáo KPI phục vụ đánh giá đề tài

Tab **Báo cáo** có khối **Hiệu quả xử lý sự cố & ứng dụng QR**:

- Chọn khoảng thời gian và khoa/phòng.
- Tổng số sự cố.
- Số và tỷ lệ sự cố báo qua QR.
- Tổng lượt kiểm tra thiết bị bằng QR.
- Số thiết bị duy nhất đã được quét QR.
- Số lượt kiểm tra QR bình thường và số lượt phát hiện vấn đề.
- Theo dõi triển khai QR theo từng ngày: lượt quét, thiết bị duy nhất, vấn đề phát hiện, tổng sự cố và sự cố QR.
- Số sự cố có đủ mốc tiếp nhận và tỷ lệ đầy đủ dữ liệu.
- Thời gian phản hồi trung bình và trung vị.
- Tỷ lệ đáp ứng mục tiêu phản hồi nội bộ.
- Số sự cố đã có kết quả xử lý.
- Thời gian xử lý trung bình và trung vị.
- Tổng hợp nguồn báo và xu hướng theo tháng.
- Xuất Excel gồm tổng hợp KPI, nguồn báo, theo ngày, chi tiết kiểm tra QR và chi tiết từng sự cố.

`response_target_minutes` là **mục tiêu quản trị nội bộ do đơn vị tự đặt**, mặc định 30 phút để thuận tiện chạy thử; không được trình bày như một ngưỡng pháp lý bắt buộc nếu chưa có quy định nội bộ tương ứng.

### Quản trị

- Nhật ký thao tác (audit log).
- Sao lưu SQLite thủ công.
- Sao lưu tự động hằng ngày.
- Giới hạn số bản sao lưu được giữ.
- Xác thực đăng nhập tùy chọn.
- Phân quyền Quản trị viên / Kỹ sư TTBYT / Người dùng khoa.
- Không cho xóa hoặc vô hiệu hóa Quản trị viên cuối cùng khi bật xác thực.
- Reset dữ liệu mẫu chỉ hoạt động khi chủ động bật chế độ demo.
- File trong `/uploads` yêu cầu phiên đăng nhập khi `QY4_AUTH_REQUIRED=1`; trang QR công khai vẫn có thể gửi ảnh/video nhưng không đọc được file đã lưu.
- POST công khai qua QR được giới hạn tần suất theo IP để giảm spam/upload lạm dụng.
- Đăng nhập sai được giới hạn theo **IP + tài khoản**; mặc định 8 lần sai trong 15 phút rồi trả HTTP 429 + Retry-After.
- Chỉ request có **QR UID cố định hợp lệ** mới được ghi nhận nguồn `QR`; gửi bằng `device_id` đơn thuần bị từ chối.
- Request QR hoặc sự cố nhập trực tiếp bị từ chối sẽ dọn file upload tạm, tránh rác ổ đĩa.
- Múi giờ ứng dụng mặc định `Asia/Bangkok` (+07, cùng múi giờ Việt Nam), có thể đổi bằng `QY4_TIME_ZONE`.
- Multer được khóa ở phiên bản 2.4.0 và kiểm thử upload multipart trong CI.

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

## 5.1. Chạy nhanh trên Windows

Repo có script:

```text
start-qy4-production.ps1
```

Mở PowerShell tại thư mục phần mềm và chạy:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-qy4-production.ps1
```

Script tự đặt cấu hình an toàn cho bản chính thức: tắt demo seed, bật xác thực, timezone +07, backup retention và QR rate limit. Mật khẩu Quản trị viên không được ghi sẵn trong file; lần đầu có thể nhập bằng prompt PowerShell. Sau khi server chạy, vào **Cài đặt → Hệ thống → Sẵn sàng triển khai** và xử lý hết mục **Cần xử lý** trước khi dùng dữ liệu thật hoặc in QR hàng loạt.



### Windows PowerShell — lần đầu

```powershell
$env:QY4_DEMO_SEED="0"
$env:QY4_AUTH_REQUIRED="1"
$env:QY4_ADMIN_USERNAME="admin"
$env:QY4_ADMIN_PASSWORD="<MAT_KHAU_QUAN_TRI_BAN_DAU>"
$env:QY4_SESSION_HOURS="12"
$env:QY4_AUTH_LOGIN_LIMIT="8"
$env:QY4_AUTH_LOGIN_WINDOW_MS="900000"
$env:QY4_BACKUP_KEEP="30"
$env:QY4_QR_RATE_LIMIT="20"
$env:QY4_QR_RATE_WINDOW_MS="60000"
$env:QY4_TIME_ZONE="Asia/Bangkok"
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
QY4_AUTH_LOGIN_LIMIT=8 \
QY4_AUTH_LOGIN_WINDOW_MS=900000 \
QY4_BACKUP_KEEP=30 \
QY4_QR_RATE_LIMIT=20 \
QY4_QR_RATE_WINDOW_MS=60000 \
QY4_TIME_ZONE=Asia/Bangkok \
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

Ảnh QR được sinh **ngay trên server QY4-TTBYT** dưới dạng SVG. Phần mềm không cần gọi dịch vụ tạo QR trên Internet và không gửi URL/QR UID thiết bị sang dịch vụ QR bên thứ ba. Khi mở phần mềm bằng `localhost`, hộp QR sẽ ưu tiên gợi ý địa chỉ LAN mà server phát hiện; không nên in tem với `localhost` hoặc `127.0.0.1`.

### Không nên dùng lâu dài

- IP thay đổi theo lần phát hotspot điện thoại.
- URL localhost.
- IP DHCP thay đổi thường xuyên.

### Khi triển khai chính thức

Nên dùng một trong hai:

- IP nội bộ cố định cho máy chủ; hoặc
- tên miền/hostname nội bộ cố định.

`qr_uid` của máy không thay đổi. Nếu chỉ đổi địa chỉ máy chủ thì dữ liệu định danh vẫn giữ nguyên, nhưng tem QR đã in chứa URL cũ sẽ không tự biết địa chỉ server mới. Vì vậy cần chốt địa chỉ truy cập ổn định **trước khi in QR hàng loạt**.

### Giới hạn gửi QR công khai

Mặc định:

- `QY4_QR_RATE_LIMIT=20`: tối đa 20 POST QR/IP trong mỗi cửa sổ.
- `QY4_QR_RATE_WINDOW_MS=60000`: cửa sổ 60 giây.
- Ảnh: tối đa 5 ảnh theo kiểm tra giao diện; backend giới hạn tổng số file multipart.
- Video: tối đa 1 video theo giao diện.
- Backend giới hạn kích thước file, số file, số field, số part và kích thước field multipart.

Nếu vượt giới hạn tần suất, API trả HTTP `429` và `Retry-After`.

**Tính toàn vẹn số liệu QR:** endpoint ghi kiểm tra/sự cố QR bắt buộc có `qr_uid` hợp lệ của thiết bị đang quản lý. Hệ thống không chấp nhận `device_id` thay thế để tránh một bản ghi nhập tay bị tính nhầm thành hoạt động QR.

## 8. Sao lưu dữ liệu

Database chính:

```text
db/qy4_ttbyt.sqlite
```

Bản sao lưu:

```text
backups/qy4_ttbyt_YYYYMMDDHHMMSS_mmm.sqlite
backups/qy4_ttbyt_YYYYMMDDHHMMSS_mmm.files/
```

- Mỗi gói gồm **SQLite + snapshot toàn bộ uploads**.
- SQLite backup được tạo bằng API backup của SQLite và chạy `PRAGMA quick_check` trước khi coi là hợp lệ.
- Snapshot file dùng hard-link khi filesystem hỗ trợ để hạn chế nhân đôi dung lượng; nếu không hỗ trợ sẽ copy file.
- Server kiểm tra và tạo backup tự động trong ngày.
- `QY4_BACKUP_KEEP` quy định số gói gần nhất giữ lại, mặc định 30.
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
- nguồn báo sự cố, người tiếp nhận, snapshot mã khoa tại thời điểm sự cố và các mốc KPI.
- nguồn kiểm tra QR/nhập trực tiếp và snapshot khoa/vị trí tại thời điểm kiểm tra.

Nếu sửa nhầm thiết bị của một sự cố **trước khi chuyển sửa chữa**, hệ thống cập nhật lại snapshot theo thiết bị đúng. Khi sự cố đã liên kết với phiếu sửa chữa, hệ thống không cho đổi thiết bị để tránh lệch hồ sơ.

**Lưu ý dữ liệu cũ:** phần mềm không tự suy đoán để phục hồi Serial từ mã bảo hiểm. Các dòng Serial trống nhưng mã bảo hiểm có dữ liệu chỉ được đưa vào danh sách cần rà soát để tránh sửa sai dữ liệu thật.

Khuyến nghị:

1. Dừng server.
2. Sao lưu toàn bộ thư mục `db/`.
3. Cập nhật source.
4. Chạy lại server.
5. Kiểm tra một số thiết bị cũ và QR trước khi sử dụng chính thức.

### Kiểm soát dữ liệu bổ sung

- Phân cấp chất lượng dùng thang **25 + 25 + 20 + 15 + 15 = 100**; backend chặn điểm âm hoặc vượt trần.
- Mỗi thiết bị chỉ có một bản đánh giá chất lượng hiện hành; cập nhật giữ nguyên ID thay vì `INSERT OR REPLACE`.
- Báo cáo sử dụng chặn thiết bị đã lưu trữ, năm/tháng sai và giá trị âm.
- Các API phụ trả lỗi 400 có nội dung rõ ràng thay vì để payload thiếu gây lỗi SQLite nội bộ.
- Source Git không chứa database runtime, WAL/SHM, uploads, backups hoặc file `.env`.

## 10. Kiểm tra sẵn sàng triển khai

Vào **Cài đặt → Hệ thống → Sẵn sàng triển khai** để xem một checklist tự động trước khi chạy thật hoặc demo Hội đồng. Màn hình kiểm tra:

- database SQLite đang sử dụng có `PRAGMA quick_check = ok` hay không;
- `PRAGMA foreign_keys=ON` và `foreign_key_check` không có bản ghi mồ côi;
- dữ liệu mẫu đã tắt hay chưa;
- xác thực và Quản trị viên có sẵn sàng hay không;
- có gói sao lưu hoàn chỉnh gồm **SQLite + snapshot ảnh/video/tài liệu đính kèm** hay chưa;
- địa chỉ QR nội bộ đề xuất và cảnh báo trước khi in QR hàng loạt;
- múi giờ/ngày giờ ứng dụng;
- quyền ghi thư mục ảnh/video;
- độ đầy đủ Serial, Model, vị trí và năm sử dụng;
- QR UID cố định;
- endpoint QR cũ theo ID/mã thiết bị đã tắt hay chưa;
- nhóm Serial trùng;
- sự cố mới chưa có mốc tiếp nhận.

Các mục **Cần xử lý** nên được giải quyết trước khi chạy dữ liệu thật. Mục **Lưu ý** không nhất thiết chặn chạy thử nhưng cần được ghi nhận.

## 11. Kiểm thử tự động

GitHub Actions hiện kiểm tra:

- Cú pháp toàn bộ JavaScript.
- Khởi động server trên database trống.
- Các API lõi.
- Dashboard, kiểm kê, backup và kiểm tra trùng.
- Tổng trạng thái thiết bị khớp giữa Đang hoạt động / Hoạt động hạn chế / Chờ sửa chữa / Ngừng hoạt động; `Đang khai thác = bình thường + hạn chế`.
- SQLite bật khóa ngoại và không có vi phạm quan hệ dữ liệu.
- Luồng QR → sự cố → tiếp nhận → sửa chữa → hoàn thành.
- QR UID không đổi sau khi sửa Serial/vị trí.
- Nguồn sự cố QR và nhập trực tiếp được phân loại đúng.
- Người tiếp nhận khác người báo sự cố.
- Snapshot khoa/vị trí không đổi sau điều chuyển.
- Màn hình Sự cố hiển thị khoa/vị trí lịch sử, đồng thời vẫn giữ ngữ cảnh hiện tại của thiết bị.
- Sửa nhầm thiết bị trước chuyển sửa chữa cập nhật snapshot; sau khi đã có phiếu sửa chữa thì bị khóa đổi thiết bị.
- KPI lọc theo khoa tại thời điểm xảy ra sự cố.
- Serial còn nguyên sau khi server khởi động lại.
- Sinh SVG QR ngay trên server nội bộ; source không còn tham chiếu dịch vụ QR Internet.
- Khi một mã thiết bị đã lưu trữ, mã kế tiếp không tái sử dụng số cũ.
- API thiết bị chấp nhận bản ghi tối giản có Khoa + Nhóm + Tên, trả lỗi 400 rõ ràng khi thiếu dữ liệu lõi hoặc mã bị trùng.
- Upload ảnh multipart qua QR với Multer 2.4.0.
- Request QR bắt buộc QR UID hợp lệ; `device_id` đơn thuần không được tính là QR.
- Request QR/sự cố nhập trực tiếp bị từ chối không để lại file upload rác.
- Dashboard chỉ đếm kiểm tra có nguồn QR, không cộng kiểm tra nhập trực tiếp.
- Ngày/giờ ứng dụng được kiểm tra theo `Asia/Bangkok`, độc lập timezone máy chạy CI.
- Rate limit QR công khai trả HTTP 429 khi vượt ngưỡng.
- File upload bị chặn khi chưa đăng nhập trong chế độ xác thực.
- Chế độ đăng nhập bắt buộc.
- Đăng nhập sai bị rate-limit và trả Retry-After khi vượt ngưỡng.
- Phân quyền Quản trị viên/Kỹ sư/Người dùng khoa.
- Tài khoản khoa chỉ đọc file đính kèm của thiết bị thuộc chính khoa mình.
- Backup bundle gồm SQLite đã `PRAGMA quick_check` và snapshot toàn bộ thư mục uploads.
- Serial thật trùng bị backend chặn; chỉ ghi khi có xác nhận override rõ ràng.
- Sự cố đã tiếp nhận, Bảo dưỡng có file và Kiểm định có chứng nhận được bảo vệ khỏi xóa cứng.
- Kiểm kê khóa sửa sau hoàn thành, chặn hai đợt đang mở cùng khoa và không tự điều chuyển tài sản.
- Lưu trữ thiết bị bị chặn khi còn sự cố/sửa chữa/kiểm kê mở; báo cáo và mẫu Excel vận hành loại thiết bị đã lưu trữ.
- QR công khai mặc định chỉ chấp nhận UID ngẫu nhiên; endpoint legacy theo ID/mã trả 410.
- Checklist sẵn sàng triển khai hoạt động ở chế độ thử và chế độ xác thực.
- Reset dữ liệu demo có xác thực sau khi đã phát sinh kiểm kê/điều chuyển; session cũ bị thu hồi, Admin đăng nhập lại được, QR UID được sinh lại và foreign key vẫn sạch.
- Đổi mã Khoa/Nhóm an toàn với foreign key và không làm đổi QR UID thiết bị.

## 12. Nội dung chưa nên tuyên bố là đã hoàn thiện

Bản hiện tại tập trung vào **hồ sơ và lịch sử công việc kỹ thuật của thiết bị**, chưa nên mô tả là hệ thống quản lý toàn bộ vòng đời tài sản.

Các nội dung có thể phát triển sau:

- quản lý mua sắm/hợp đồng;
- khấu hao và tài chính tài sản;
- thanh lý điện tử đầy đủ;
- SSO/LDAP nếu bệnh viện có hạ tầng phù hợp;
- PostgreSQL khi số người ghi dữ liệu đồng thời tăng cao;
- thông báo tự động đa kênh;
- phân tích độ tin cậy/dự báo hỏng hóc khi có đủ dữ liệu lịch sử.

## 13. Checklist trước khi đưa vào dùng thật

- [ ] Mở **Cài đặt → Hệ thống → Sẵn sàng triển khai**; xác nhận **Toàn vẹn database SQLite = Đạt** và **Toàn vẹn quan hệ dữ liệu = Đạt**, sau đó xử lý hết mục **Cần xử lý**.
- [ ] Tạo **gói backup** và kiểm tra có cả file `.sqlite` và thư mục `.files` đi kèm.
- [ ] Tắt demo seed: `QY4_DEMO_SEED=0`.
- [ ] Đặt `QY4_TIME_ZONE=Asia/Bangkok` hoặc múi giờ +07 phù hợp.
- [ ] Giữ `QY4_ALLOW_LEGACY_QR` **tắt**. Chỉ bật tạm `QY4_ALLOW_LEGACY_QR=1` nếu thật sự còn tem QR cũ cần chuyển đổi.
- [ ] Bật đăng nhập: `QY4_AUTH_REQUIRED=1`.
- [ ] Đặt mật khẩu quản trị mạnh.
- [ ] Tạo tài khoản Kỹ sư và tài khoản khoa.
- [ ] Chốt IP/hostname máy chủ.
- [ ] Test QR bằng điện thoại trong cùng mạng.
- [ ] Test một luồng sự cố hoàn chỉnh: QR → báo sự cố → tiếp nhận → sửa chữa → hoàn thành.
- [ ] Xác nhận người báo, người tiếp nhận và nguồn báo được ghi đúng.
- [ ] Test điều chuyển và kiểm tra sự cố cũ vẫn giữ khoa/vị trí lịch sử.
- [ ] Mở Báo cáo → Chất lượng dữ liệu và rà các dòng thiếu Serial/Model/vị trí.
- [ ] Mở Báo cáo → KPI sự cố & QR, chọn đúng khoảng thời gian thu thập số liệu.
- [ ] Theo dõi bảng QR theo ngày để phát hiện ngày/khoa chưa phát sinh lượt quét thay vì bổ sung dữ liệu giả.
- [ ] Kiểm tra backup bundle mở được database và có snapshot file đính kèm.
- [ ] Đăng nhập thử bằng tài khoản khoa, xác nhận không xem được thiết bị/file của khoa khác.
- [ ] Chỉ sau đó mới in QR hàng loạt.
