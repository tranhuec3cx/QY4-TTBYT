# Sửa cách tính khả năng hoạt động LCM

- Không coi thời điểm cập nhật/đóng phiếu hành chính là thời điểm kết thúc ngừng máy nếu mốc đó trùng với `updated_at` và cách xa thời gian tiếp nhận.
- Với thiết bị hiện đang hoạt động, phiếu sửa chữa cũ còn mở không tiếp tục cộng downtime đến hiện tại.
- Chỉ cộng khoảng ngừng máy khi có mốc kết thúc đủ tin cậy; trường hợp thiếu mốc được loại khỏi phép tính thay vì làm tụt sai tỷ lệ hoạt động.
- Giữ nguyên dữ liệu gốc, không sửa/xóa lịch sử sửa chữa.
