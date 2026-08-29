# Hồ sơ vòng đời thiết bị - 30/08/2026

Nhánh: `feature/lcm-vong-doi`

## Mục tiêu

Gom các thông tin quan trọng của một thiết bị vào một màn hình phục vụ cán bộ Khoa Trang bị theo dõi và ra quyết định quản lý.

## Nội dung bổ sung

- Khối **Hồ sơ vòng đời thiết bị** nằm ngay trên hồ sơ máy hiện có.
- Hiển thị giai đoạn vòng đời hiện tại: tiếp nhận, khai thác, sửa chữa, thanh lý, ngừng khai thác.
- Hiển thị tuổi thiết bị, availability 12 tháng, số lần sửa chữa 12 tháng, downtime 12 tháng, tổng chi phí sửa chữa.
- Hiển thị mức độ quan trọng lâm sàng và năm dự kiến thay thế.
- Hiển thị điểm rủi ro và mức rủi ro Thấp/Trung bình/Cao.
- Hiển thị chi tiết từng cấu phần tạo nên điểm rủi ro để có thể giải trình.
- Hiển thị khuyến nghị quản lý: tiếp tục khai thác, tăng cường theo dõi/bảo dưỡng, sửa chữa lớn/thay thế, hoàn thiện thanh lý hoặc kết thúc vòng đời.
- Theo dõi mốc bảo dưỡng, kiểm định/hiệu chuẩn và bảo hành; làm nổi bật các mốc quá hạn hoặc còn trong 30 ngày.
- Hiển thị dòng thời gian vòng đời từ tiếp nhận, lắp đặt, nghiệm thu, đào tạo, bàn giao đến điều chuyển, sự cố, sửa chữa, bảo dưỡng, kiểm định và thanh lý.
- Giữ nguyên các tab nghiệp vụ chi tiết hiện có: thông tin chung, phụ kiện, sự cố, sửa chữa, bảo dưỡng, kiểm định, vận hành và hồ sơ/tài liệu.
- Bổ sung trạng thái `Chờ thanh lý` trong form cập nhật thông tin chung.

## File thay đổi

- `public/device-detail.html`
- `public/device-lifecycle.css`
- `public/device-lifecycle.js`

## Nguyên tắc phiên bản

- Không thay đổi nhánh `main`.
- Không xóa các nhánh backup cũ.
- Bản này tiếp tục dùng dữ liệu và thuật toán rủi ro từ phân hệ LCM hiện có để tránh hai cách tính khác nhau.
