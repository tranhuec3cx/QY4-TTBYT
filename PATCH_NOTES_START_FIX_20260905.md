# Sửa launcher Windows - 05/09/2026

- Sửa `START-QY4-TTBYT.cmd` để khởi động đúng cổng 5000 và 5050 trên Windows.
- Thay cú pháp `cd` lồng dấu ngoặc kép trong `cmd /k` bằng tùy chọn `start /D`.
- Hai cửa sổ con kế thừa `PUBLIC_INCIDENT_BASE_URL` và `PUBLIC_INCIDENT_HOST` từ launcher.
- Giữ nguyên nguyên tắc: chỉ tunnel cổng 5050 qua ngrok, không tunnel cổng quản trị 5000.
- Launcher vẫn chờ 5050 và 5000 sẵn sàng trước khi mở trình duyệt.
