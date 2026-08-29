# LCM – Hoàn thiện quản lý vòng đời thiết bị y tế

Ngày cập nhật: 29/08/2026
Nhánh: `feature/lcm-vong-doi`

## Nội dung hoàn thiện

1. **Tiếp nhận – nghiệm thu – bàn giao**
   - Theo dõi các mốc giao hàng, lắp đặt, nghiệm thu, đào tạo và bàn giao.
   - Theo dõi tình trạng CO/CQ và đào tạo.
   - Tự tính tỷ lệ hoàn thiện hồ sơ tiếp nhận.

2. **Điều chuyển**
   - Lưu khoa/vị trí trước và sau điều chuyển.
   - Tự cập nhật khoa/vị trí hiện tại của thiết bị.
   - Không cho xóa lịch sử điều chuyển.
   - Chặn phiếu điều chuyển khi khoa và vị trí không thay đổi.

3. **Thanh lý**
   - Bổ sung trạng thái thiết bị `Chờ thanh lý`.
   - Khi lập hồ sơ thanh lý, thiết bị chuyển sang `Chờ thanh lý`.
   - Khi hoàn tất thanh lý, thiết bị chuyển `Ngừng hoạt động`.
   - Khi hủy hồ sơ thanh lý, khôi phục trạng thái trước đó.
   - Hồ sơ đã thanh lý không được xóa.

4. **Hiệu quả khai thác và rủi ro**
   - Tính tuổi thiết bị, số lần sửa chữa 12 tháng, downtime và availability.
   - Tính tổng chi phí sửa chữa và tỷ lệ chi phí sửa chữa/nguyên giá.
   - Tích hợp kết quả đánh giá chất lượng thiết bị.
   - Chấm điểm rủi ro theo tuổi, sửa chữa, trạng thái, bảo dưỡng, kiểm định, mức độ quan trọng, chất lượng và chi phí sửa chữa.
   - Hiển thị chi tiết từng thành phần tạo nên điểm rủi ro để có thể giải trình.
   - Sinh khuyến nghị quản lý theo mức rủi ro.

5. **Cảnh báo LCM**
   - Rủi ro cao.
   - Bảo dưỡng quá hạn/sắp đến hạn 30 ngày.
   - Kiểm định quá hạn/sắp đến hạn 30 ngày.
   - Bảo hành đã hết/sắp hết 30 ngày.
   - Hồ sơ tiếp nhận chưa hoàn tất.
   - Hồ sơ thanh lý đang xử lý.

6. **Dashboard chính**
   - Bổ sung các KPI LCM.
   - Hiển thị danh sách thiết bị cần ưu tiên xử lý.
   - Liên kết trực tiếp sang hồ sơ thiết bị và phân hệ LCM.

7. **Dòng thời gian vòng đời**
   - Tách các mốc: giao nhận, lắp đặt, nghiệm thu, đào tạo, bàn giao.
   - Giữ các sự kiện điều chuyển, sự cố, sửa chữa, bảo dưỡng, kiểm định và thanh lý trong cùng timeline.

## Nguyên tắc an toàn phiên bản

- Không thay đổi nhánh `main`.
- Các nhánh backup cũ vẫn giữ nguyên.
- Mọi thay đổi trong đợt này chỉ thực hiện trên `feature/lcm-vong-doi`.
