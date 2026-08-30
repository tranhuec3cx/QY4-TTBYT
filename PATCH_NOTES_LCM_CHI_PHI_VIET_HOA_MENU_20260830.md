# Hoàn thiện LCM: menu chung, Việt hóa và chi phí vòng đời

Ngày cập nhật: 30/08/2026
Nhánh: `feature/lcm-vong-doi`

## Phạm vi

Phần QR được tạm dừng tại mốc trước. Gói thay đổi này tập trung vào các nội dung khác của hệ thống quản lý vòng đời.

## 1. Vòng đời thiết bị trên menu chung

- Thêm **Vòng đời thiết bị** vào menu dùng chung.
- Vị trí: sau **Kiểm định**, trước **Báo cáo**.
- Có thể truy cập phân hệ vòng đời từ mọi trang sử dụng menu chung.

## 2. Việt hóa thuật ngữ giao diện

- Availability → **Tỷ lệ sẵn sàng**.
- Downtime → **Thời gian ngừng máy**.
- Timeline → **Dòng thời gian**.
- Nút LCM trong hồ sơ thiết bị → **Vòng đời**.
- Các mô tả và thông báo chính trong phân hệ vòng đời được chuyển sang tiếng Việt dễ hiểu.

## 3. Chi phí vòng đời

Bổ sung khối **Chi phí vòng đời** trong tab **Đánh giá – Kế hoạch**.

Các chỉ số hiện có:

- Tổng nguyên giá.
- Chi phí sửa chữa lũy kế.
- Tỷ lệ chi phí sửa chữa / nguyên giá.
- Giá trị còn lại ước tính phục vụ quản lý kỹ thuật.
- Chi phí kỹ thuật vòng đời = Nguyên giá + Chi phí sửa chữa đã ghi nhận.
- Gợi ý quản lý theo tuổi máy, tuổi đời kế hoạch và tỷ lệ chi phí sửa chữa.

Có bộ lọc theo khoa/phòng và tìm theo mã, tên, model, serial.

## Nguyên tắc tài chính

- Không coi giá trị còn lại ước tính là giá trị còn lại trên sổ kế toán.
- Không tự áp tuổi khấu hao theo quy định kế toán.
- Tuổi đời kế hoạch chỉ dùng cho đánh giá quản lý kỹ thuật.
- Hiện bảng `maintenances` chưa có trường chi phí nên **Chi phí kỹ thuật vòng đời hiện tại chỉ gồm nguyên giá + chi phí sửa chữa**; chưa được gọi là tổng chi phí sở hữu đầy đủ.
- Các số liệu này không thay thế dự toán, thẩm định giá, khấu hao hay quyết định tài chính của cơ quan có thẩm quyền.

## Kỹ thuật

- Không thay đổi cấu trúc cơ sở dữ liệu trong gói này.
- Phần chi phí vòng đời dùng dữ liệu đã có từ `/api/lcm/devices`.
- Không thay đổi nhánh `main`.

## File chính thay đổi

- `public/api.js`
- `public/lcm.html`
- `public/lcm.js`
- `public/lcm-simple.js`
- `public/device-detail.html`
- `public/lcm-finance.js` (mới)
- `public/lcm-finance.css` (mới)
