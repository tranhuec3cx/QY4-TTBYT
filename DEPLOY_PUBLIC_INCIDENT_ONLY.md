# TRIỂN KHAI QR BÁO SỰ CỐ CÔNG KHAI - QY4-TTBYT

## 1. Mục tiêu

Cho phép điện thoại dùng 4G/5G hoặc Wi-Fi bất kỳ quét QR trên thiết bị và gửi báo sự cố về QY4-TTBYT, nhưng **không công khai phần mềm quản trị**.

## 2. Kiến trúc bắt buộc

```text
Internet / điện thoại
        |
        v
  HTTPS tunnel (ngrok/Cloudflare)
        |
        v
127.0.0.1:5050  PUBLIC INCIDENT GATEWAY
        |
        +-- Chỉ trang /s/<token>
        +-- Chỉ API thông tin tối thiểu của 01 thiết bị
        +-- Chỉ API gửi báo sự cố
        |
        v
 db/qy4_ttbyt.sqlite

Mạng nội bộ bệnh viện
        |
        v
      :5000
 QY4-TTBYT quản trị đầy đủ
```

**Không được tunnel/public cổng 5000.**

Gateway 5050 mặc định chỉ lắng nghe `127.0.0.1`, vì vậy không cần mở Windows Firewall cho cổng này. Agent tunnel chạy trên cùng PC sẽ kết nối vào localhost.

## 3. Nội dung được hiển thị qua QR

Chỉ hiển thị:

- Tên thiết bị.
- Số Serial.
- Khoa/Phòng.
- Vị trí.
- Form báo sự cố: người báo, số điện thoại, mức độ, mô tả, tối đa 03 ảnh.

Không hiển thị danh sách thiết bị, lịch sử sửa chữa, bảo dưỡng, kiểm định, hồ sơ vòng đời, chi phí, báo cáo hoặc chức năng quản trị.

Sự cố gửi thành công được ghi vào bảng `incidents` với trạng thái `Mới ghi nhận` và tiếp tục xử lý trong quy trình nội bộ hiện có.

## 4. Bảo vệ đường dẫn QR

QR không dùng `?id=123` làm định danh công khai.

Mỗi URL dùng token ký HMAC theo thiết bị. Khóa ký được lấy từ biến môi trường `PUBLIC_QR_SECRET` hoặc tự tạo ở:

```text
config/public-qr-secret.txt
```

File khóa này đã được `.gitignore` và không được đưa lên GitHub.

Nếu xóa/đổi khóa, toàn bộ QR đã in trước đó sẽ không còn hợp lệ. Vì vậy phải sao lưu file khóa cùng dữ liệu triển khai.

## 5. Chạy thử tại PC

Từ thư mục dự án:

```powershell
npm install --omit=dev
npm start
```

Mở PowerShell thứ hai:

```powershell
npm run start:public-incident
```

Kiểm tra gateway:

```text
http://127.0.0.1:5050/health
```

Kết quả mong đợi:

```json
{"ok":true,"service":"QY4 public incident gateway"}
```

## 6. Tạo tunnel Internet

Ví dụ với ngrok, tunnel **chỉ** tới gateway:

```powershell
ngrok http 5050
```

Không chạy:

```powershell
ngrok http 5000
```

Sau khi ngrok cấp HTTPS URL, ví dụ:

```text
https://<ten-mien-duoc-cap>.ngrok-free.app
```

cấu hình URL đó cho QY4-TTBYT. Trước khi in tem QR dùng lâu dài, xác nhận URL được gán cho tài khoản và không thay đổi sau khi agent khởi động lại.

## 7. Cài gateway tự chạy cùng Windows

Mở PowerShell bằng **Run as administrator** tại thư mục dự án, chạy:

```powershell
.\deployment\windows\setup-public-incident.ps1 -PublicBaseUrl "https://<ten-mien-duoc-cap>.ngrok-free.app"
```

Script sẽ:

- kiểm tra database thật đã tồn tại;
- chạy `npm install --omit=dev`;
- lưu `PUBLIC_INCIDENT_BASE_URL`, `PUBLIC_INCIDENT_PORT=5050`, `PUBLIC_INCIDENT_HOST=127.0.0.1` ở cấp máy;
- đăng ký Scheduled Task `QY4-TTBYT Public Incident Gateway` chạy khi Windows khởi động;
- không mở firewall cho 5050;
- khởi động lại tác vụ QY4-TTBYT nội bộ nếu tác vụ đó đã tồn tại để nhận URL mới.

Agent ngrok/Cloudflare Tunnel phải được cấu hình tự chạy riêng nếu muốn URL hoạt động ngay sau khi bật máy.

## 8. Tạo và in QR trong phần mềm

Trong phần mềm nội bộ:

```text
Cài đặt -> QR báo sự cố thiết bị
```

Chọn thiết bị -> kiểm tra Tên thiết bị/Số Serial/Khoa/Vị trí -> mở thử trang báo sự cố -> in tem 70 x 45 mm.

Mã QR được tạo tại máy chủ nội bộ từ URL đã ký; không dùng ID tuần tự làm liên kết công khai.

## 9. Kiểm thử trước khi dán QR hàng loạt

Thử ít nhất 01 thiết bị:

1. Máy quản trị mở được QY4-TTBYT tại cổng 5000.
2. `http://127.0.0.1:5050/health` trả về `ok: true`.
3. Điện thoại tắt Wi-Fi, dùng 4G/5G quét QR.
4. Trang chỉ hiện thông tin tối thiểu và form báo sự cố.
5. Gửi một sự cố thử.
6. Vào phân hệ Sự cố trong mạng nội bộ, xác nhận xuất hiện bản ghi `Mới ghi nhận` đúng thiết bị.
7. Kiểm tra ảnh đính kèm nếu có.
8. Thử sửa token trên URL; hệ thống phải báo liên kết không hợp lệ.
9. Thử truy cập các đường dẫn quản trị qua domain công khai; gateway phải trả 404.

Chỉ sau khi kiểm thử đạt mới in tem hàng loạt.

## 10. Giới hạn cần nhớ

- Nếu PC chạy QY4-TTBYT tắt thì QR công khai cũng không gửi được sự cố, dù domain/tunnel vẫn tồn tại.
- Gateway hiện dùng chung SQLite với ứng dụng nội bộ; phù hợp giai đoạn triển khai trong Khoa Trang bị với lưu lượng thấp.
- Khi triển khai toàn viện/24x7, nên chuyển ứng dụng lên hạ tầng CNTT quản lý và đánh giá lại cơ sở dữ liệu, xác thực, giám sát, sao lưu và chính sách an toàn thông tin.
- Không đưa dữ liệu người bệnh vào nội dung báo sự cố hoặc ảnh tải lên.
