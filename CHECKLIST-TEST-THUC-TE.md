# CHECKLIST TEST THỰC TẾ — QY4-TTBYT 5.0.0

Mục tiêu: xác nhận bản Release Candidate chạy được với **database thật + máy tính + điện thoại cùng LAN** trước khi merge vào `main`.

> Không tạo dữ liệu giả để “đủ KPI”. Chỉ ghi nhận thao tác thực tế.

## 1. Chuẩn bị

- [ ] Đóng bản QY4-TTBYT cũ nếu đang chạy.
- [ ] Sao lưu đầy đủ `db/` và `uploads/` hiện tại sang nơi an toàn.
- [ ] Tạo **bản sao dữ liệu thật để test**; không chạy các thao tác thử trên bộ dữ liệu đang dùng vận hành.
- [ ] Nếu có thể, cấu hình `QY4_BACKUP_MIRROR_DIR` sang ổ/thư mục thứ hai.
- [ ] Double-click `start-qy4-production.cmd`.
- [ ] Launcher chạy **preflight dữ liệu** và kết thúc với `KET QUA: DAT PREFLIGHT`; nếu có dòng `[CHAN]`, dừng test và xử lý trước, không bỏ qua.
- [ ] Nếu preflight báo schema legacy R15 ở mức **Lưu ý**, tiếp tục khởi động; RC phải tự migration mà không mất lịch sử điều chuyển/đánh giá.
- [ ] Đăng nhập bằng tài khoản Quản trị viên.
- [ ] Vào **Cài đặt → Hệ thống → Sẵn sàng triển khai**.
- [ ] Không còn mục **Cần xử lý** liên quan database, xác thực, QR UID, backup hoặc **nhất quán phiếu sửa chữa/trạng thái thiết bị**.
- [ ] Ghi lại IP LAN server được in trong cửa sổ chạy, ví dụ `http://192.168.x.x:5000`.

## 2. Kiểm tra dữ liệu thiết bị — 5–10 máy đại diện

Chọn **05–10 máy từ ít nhất 03 khoa**, ưu tiên đủ các tình huống: có/thiếu Serial, có hồ sơ kỹ thuật cũ, có nghĩa vụ bảo dưỡng hoặc kiểm định/hiệu chuẩn, và ít nhất 01 máy sẽ dùng để test QR.

Mỗi máy kiểm:

- [ ] Mã thiết bị.
- [ ] Tên thiết bị.
- [ ] Model.
- [ ] Serial Number.
- [ ] Khoa sử dụng.
- [ ] Vị trí.
- [ ] Tình trạng hiện tại.
- [ ] QR UID tồn tại.

Nếu thiếu Model/Serial/Năm/Vị trí: để đúng là thiếu và bổ sung sau; **không bịa dữ liệu**.

## 3. Test QR bằng điện thoại

Trên máy tính:

- [ ] Mở 01 thiết bị → QR.
- [ ] Địa chỉ QR là IP LAN/hostname, **không phải localhost/127.0.0.1**.
- [ ] QR hiển thị được khi Internet ngoài bị tắt/mất.

Trên điện thoại cùng Wi-Fi/hotspot:

- [ ] Quét QR.
- [ ] Đúng tên máy/khoa/vị trí.
- [ ] Không lộ nguyên giá, nguồn kinh phí hoặc hồ sơ kỹ thuật nội bộ.
- [ ] Gửi 01 lượt **Kiểm tra bình thường**.
- [ ] Dashboard tăng đúng **1 lượt QR**, không tăng từ kiểm tra nhập trực tiếp.

## 4. Test Sự cố → Sửa chữa

Thực hiện trên **bản sao dữ liệu thật** hoặc một thiết bị test được phép. Không tạo sự cố giả vào bộ dữ liệu vận hành thật của máy đang hoạt động bình thường.

- [ ] Báo sự cố bằng QR hoặc ghi nhận sự cố thật.
- [ ] Nguồn báo hiển thị đúng QR/Nhập trực tiếp.
- [ ] Người báo đúng người thực tế.
- [ ] Kỹ sư bấm **Tiếp nhận**.
- [ ] Người tiếp nhận là tài khoản kỹ sư đang đăng nhập.
- [ ] Bấm **Chuyển sửa chữa**.
- [ ] Phiếu sửa chữa liên kết đúng sự cố.
- [ ] Khi phiếu sửa chữa đang mở, tình trạng thiết bị là **Chờ sửa chữa**.
- [ ] Không thể tạo thêm phiếu sửa chữa đang mở thứ hai cho cùng thiết bị.
- [ ] Cập nhật nội dung xử lý.
- [ ] Hoàn thành phiếu.
- [ ] Mở lại phiếu đã hoàn thành và thử đổi trạng thái về **Đang xử lý**; hệ thống phải từ chối, nhưng vẫn cho hiệu chỉnh nội dung/chi phí/ghi chú khi cần.
- [ ] Tình trạng máy sau sửa đúng: Đang hoạt động / Hoạt động hạn chế.
- [ ] Nếu “Không sửa được”, thiết bị chuyển Ngừng hoạt động.
- [ ] Hồ sơ thiết bị → Công việc kỹ thuật thấy đầy đủ chuỗi trên.

## 5. Test file đính kèm

### Bảo dưỡng
- [ ] Tạo/cập nhật 01 phiếu bảo dưỡng thật.
- [ ] Có người thực hiện, loại, nội dung, kết quả.
- [ ] Đính kèm 01 PDF/ảnh nếu có.
- [ ] Mở lại file được khi đã đăng nhập.

### Kiểm định/Hiệu chuẩn
- [ ] Tạo/cập nhật 01 hồ sơ thật.
- [ ] Có đơn vị thực hiện.
- [ ] Đính kèm chứng nhận nếu có.
- [ ] Nếu chưa có số chứng nhận/hạn tiếp theo: để trống và xử lý theo hồ sơ thật, không tự đặt số/ngày.

## 6. Test điều chuyển và lịch sử

Chỉ thực hiện nếu có trường hợp điều chuyển thật hoặc trên một thiết bị test được phép.

- [ ] Ghi nhận khoa/vị trí ban đầu.
- [ ] Điều chuyển bằng chức năng **Điều chuyển**, không sửa trực tiếp trong Thông tin chung.
- [ ] Khoa/vị trí hiện tại thay đổi.
- [ ] QR UID không đổi.
- [ ] Sự cố/Bảo dưỡng/Kiểm định cũ vẫn hiển thị khoa/vị trí tại thời điểm phát sinh.
- [ ] Trên thiết bị test, thử nhập thời điểm điều chuyển **sớm hơn hồ sơ kỹ thuật gần nhất**; hệ thống phải từ chối và không thay đổi khoa/vị trí hiện tại.

## 7. Test kiểm kê

Chọn một khoa có danh mục nhỏ để test nhanh.

- [ ] Tạo 01 đợt kiểm kê.
- [ ] Danh sách sinh đúng theo thiết bị thuộc khoa tại thời điểm tạo.
- [ ] Ghi kết quả Có/Không thấy/Sai vị trí/Sai khoa.
- [ ] Không thể hoàn thành nếu còn “Chưa kiểm kê”.
- [ ] Sau khi hoàn thành, đợt kiểm kê chuyển sang chế độ chỉ xem.
- [ ] Sai khoa/Sai vị trí chỉ thay đổi tài sản sau khi bấm Điều chuyển và xác nhận.

## 8. Test Báo cáo/KPI

- [ ] Báo cáo → Hiệu quả xử lý sự cố & ứng dụng QR.
- [ ] Chọn đúng khoảng thời gian test.
- [ ] Tổng lượt QR khớp thao tác vừa thực hiện.
- [ ] Số thiết bị duy nhất đã quét hợp lý.
- [ ] Sự cố QR/Nhập trực tiếp phân loại đúng.
- [ ] Mốc tiếp nhận và thời gian phản hồi có dữ liệu khi đã tiếp nhận.
- [ ] Xuất Excel mở được.

## 9. Test backup

- [ ] Cài đặt → Hệ thống → **Sao lưu ngay**.
- [ ] Có file `.sqlite`.
- [ ] Có thư mục `.files/` cùng tên.
- [ ] Nếu đã cấu hình mirror: có bản sao `.sqlite` và `.files/` ở ổ/thư mục thứ hai.
- [ ] **Sẵn sàng triển khai → Bản sao lưu thứ cấp ngoài máy chủ** không báo lỗi `quick_check`; nếu mirror cùng ổ thì chỉ chấp nhận mức **Lưu ý**, không coi là dự phòng hỏng ổ.
- [ ] “Sẵn sàng triển khai” báo backup cục bộ đạt và không còn mục backup ở mức **Cần xử lý**.

## 10. Kết thúc phiên test

- [ ] Chụp lại màn Dashboard.
- [ ] Ghi lại lỗi thực tế theo mẫu: **Màn hình → thao tác → kết quả mong đợi → kết quả thực tế**.
- [ ] Dừng server bằng **Ctrl+C**.
- [ ] Chờ dòng: **“Đã checkpoint WAL và đóng SQLite. Có thể tắt máy an toàn.”**
- [ ] Không merge PR vào `main` nếu còn lỗi làm mất dữ liệu, sai QR, sai trạng thái hoặc sai lịch sử.

## Tiêu chí chốt bản

Có thể chuyển PR khỏi Draft khi đồng thời đạt:

1. Không còn lỗi mức **mất/sai dữ liệu**.
2. QR điện thoại hoạt động ổn trong LAN thực tế.
3. Một luồng Sự cố → Sửa chữa → Hoàn thành chạy trọn vẹn.
4. Kiểm kê và Điều chuyển giữ đúng lịch sử.
5. File chứng nhận/biên bản mở được sau khi lưu.
6. Backup bundle tạo thành công.
7. Dashboard/KPI phản ánh đúng thao tác test.
8. CI GitHub vẫn xanh, bao gồm **Preflight legacy R15 fixture** và migration điều chuyển schema cũ.
9. **Sẵn sàng triển khai → Nhất quán phiếu sửa chữa và trạng thái thiết bị** ở mức **Đạt**.
10. Backup mới nhất và backup mirror (nếu cấu hình) đều vượt qua **SQLite quick_check**; mirror đặt cùng ổ chỉ được xem là bản sao tiện dụng, không phải dự phòng hỏng ổ.
