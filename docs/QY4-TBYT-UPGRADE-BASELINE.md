# QY4-TBYT — rà soát nền tảng trước nâng cấp (22/11/2026)

## Phạm vi
Nhánh này không làm thay đổi `main`, database sản xuất, dữ liệu 397 thiết bị hoặc route đang dùng. Đã bổ sung:
- `scripts/audit-baseline.js`: kiểm kê database ở chế độ **read-only**, kiểm tra bảng, số lượng, dấu vân tay ID, khóa ngoại, tình trạng `qr_uid`.
- `public/equipment-center.html?id=<ID>`: trang Trung tâm thiết bị đọc thông tin công khai qua API hiện có; chỉ liên kết đến các phân hệ cũ, chưa tự tạo giao dịch.

## Kết quả kiểm tra mã nguồn trên main
- Express 4, better-sqlite3, dữ liệu mặc định ở `db/qy4_ttbyt.sqlite`.
- Có `devices`, `documents`, `repairs`, `incidents`, `daily_checks`, `activity_history` và nhiều bảng liên quan; **không tạo lại**.
- `devices` trong schema kiểm tra **chưa khai báo `qr_uid`**; QR hiện tra cứu qua `/api/qr/device/:id` và `/api/qr/device-code/:code`. Không được khẳng định một QR cố định đã được đảm bảo ở tầng dữ liệu.
- `app.use('/uploads', express.static(...))` phục vụ tài liệu bằng đường dẫn công khai. Cần đánh giá và thay bằng tuyến tải file có kiểm tra phân quyền trước khi bổ sung hồ sơ nhạy cảm.
- Có `POST /api/reset-seed` xóa dữ liệu và gọi seed; cần vô hiệu hóa trên môi trường sản xuất và thêm xác thực/ủy quyền cho thao tác quản trị.
- Chưa thấy middleware xác thực bao phủ các endpoint nghiệp vụ trong phần mã được rà soát; phải xác minh/hoàn thiện quyền ở backend trước khi đưa dữ liệu nội bộ lên Internet.
- Bảng `documents` đã có thông tin tệp, không tạo bảng hồ sơ trùng; nên bổ sung bảng phiên bản sau khi xác định yêu cầu.
- Quy trình sửa chữa đã có `incident_id`, `processing_status`, `received_at`, `completed_at`; tận dụng hệ thống hiện hữu.

## Quy trình bắt buộc trước migration
1. Xác minh **đúng database đang vận hành** và đối chiếu số thiết bị, không coi 397 là số lượng luôn đúng tại mọi thời điểm.
2. Sao lưu nhất quán database SQLite bằng Backup API hoặc quy trình SQLite phù hợp, bao gồm dữ liệu WAL chưa checkpoint; sao lưu cả `uploads/`.
3. Khôi phục vào môi trường thử nghiệm và chạy `QY4_DB_PATH=<đường-dẫn> node scripts/audit-baseline.js`.
4. Chốt cơ chế xác thực, phân quyền khoa và truy cập tài liệu trước khi xây mới các API ghi.
5. Thiết kế migration cộng thêm cột `qr_uid` (UNIQUE sau khi backfill, không ràng buộc từ ID/Serial/khoa), giữ tương thích QR cũ bằng mapping định danh ổn định. **Chưa thực thi migration này trên nhánh.**
6. Thiết kế lần lượt: phiên bản hồ sơ; sự kiện sửa chữa; audit bất biến ở tầng API; mẫu bảng kiểm có version; xuất PDF và QR theo UID.
7. Kiểm thử hồi quy mọi phân hệ, QR cũ, phân quyền và phục hồi dữ liệu trước hợp nhất PR.

## Cách chạy kiểm tra
```bash
npm install
QY4_DB_PATH=/duong/dan/toi/ban-sao.sqlite node scripts/audit-baseline.js
```
PowerShell:
```powershell
$env:QY4_DB_PATH="C:\\backup\\qy4_ttbyt.sqlite"
node scripts/audit-baseline.js
```

Trang thử giao diện (chỉ xem, không có thao tác ghi): `http://localhost:5000/equipment-center.html?id=1`.

**Giới hạn xác minh:** Chưa có quyền truy cập database sản xuất để chạy kiểm tra số lượng hoặc kiểm thử end-to-end. Không suy diễn rằng cấu trúc mã nguồn trên GitHub trùng hoàn toàn bản chạy tại bệnh viện.
