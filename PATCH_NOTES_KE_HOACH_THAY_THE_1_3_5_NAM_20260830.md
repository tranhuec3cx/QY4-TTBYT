# Kế hoạch thay thế thiết bị 1 – 3 – 5 năm

Ngày cập nhật: 30/08/2026
Nhánh phát triển: `feature/lcm-vong-doi`

## Nội dung bổ sung

- Bổ sung mục **Kế hoạch thay thế** trong phân hệ LCM.
- Tự xếp thiết bị theo 4 nhóm: **trong 1 năm, trong 3 năm, trong 5 năm, sau 5 năm/theo dõi**.
- Tạo **Điểm kế hoạch thay thế** riêng, không dùng thay cho Điểm rủi ro.
- Điểm kế hoạch dựa trên: tuổi thiết bị so với tuổi đời kế hoạch, trạng thái hiện tại, số lần sửa chữa 12 tháng, chi phí sửa chữa/nguyên giá, mức độ quan trọng lâm sàng, chất lượng và availability.
- Mỗi thiết bị hiển thị rõ **căn cứ gợi ý** để người dùng có thể giải trình.
- Nếu đã cấu hình **năm dự kiến thay thế** trong hồ sơ LCM, hệ thống ưu tiên dùng năm đã cấu hình thay cho năm gợi ý tự động.
- Cho phép lọc theo **khoa/phòng, thời hạn 1–3–5 năm, mức ưu tiên, mã/tên/model/serial**.
- Cho phép mở trực tiếp hồ sơ thiết bị và cấu hình lại tuổi đời/năm dự kiến thay thế.
- Bổ sung **Xuất Excel kế hoạch thay thế**, có sheet danh sách chi tiết và sheet tổng hợp.
- File Excel xuất theo đúng bộ lọc đang chọn.
- Tổng nguyên giá trong từng nhóm chỉ được ghi là **nguyên giá tham chiếu**, không được coi là dự toán mua sắm thay thế.

## Phân loại ưu tiên

- **Khẩn**: Điểm kế hoạch ≥ 80.
- **Cao**: 65–79.
- **Trung bình**: 50–64.
- **Theo dõi**: < 50.

Các ngưỡng trên phục vụ hỗ trợ sàng lọc và lập kế hoạch; quyết định đầu tư/thay thế vẫn phải qua khảo sát, thẩm định và phê duyệt theo quy định.

## File bổ sung/thay đổi

- `lcm-replacement-routes.js`
- `public/lcm-replacement.js`
- `public/lcm-replacement.css`
- `public/lcm-movements.js`
- `bootstrap.js`

## Nguyên tắc phiên bản

- Không thay đổi nhánh `main`.
- Giữ nguyên các nhánh backup trước.
- Toàn bộ thay đổi nằm trên `feature/lcm-vong-doi`.
