# QY4-TTBYT - Van hanh tren may ca nhan

Bo cong cu nay danh cho giai doan hoan thien va chay thu tren may ca nhan, truoc khi dua sang may co dinh tai Khoa Trang bi.

## 1. Khoi dong

Double-click `START-QY4-TTBYT.cmd`.

File nay khoi dong:
- Quan tri noi bo: `http://localhost:5000`
- Gateway bao su co: `http://127.0.0.1:5050`
- ngrok cho rieng cong 5050

Cong 5000 khong duoc tunnel ra Internet.

## 2. Kiem tra nhanh

Double-click `CHECK-QY4-TTBYT.cmd`.

Kiem tra:
- Database co ton tai
- Cong 5000/5050 co LISTENING
- API health cua quan tri va gateway
- ngrok co dang chay
- Ban backup gan nhat

## 3. Tat an toan

Double-click `STOP-QY4-TTBYT.cmd`.

Truoc khi tat, he thong se chay backup bang `scripts/backup.js`. Neu backup that bai, script dung va khong tat 5000/5050 de tranh bo qua sao luu.

Sau backup thanh cong, script chi dung tien trinh Node.js dang nghe cong 5000/5050 va tien trinh ngrok. Neu cong do do chuong trinh khac chiem, script canh bao va khong tu dong tat chuong trinh khac.

## 4. Sao luu

Co the backup thu cong bat cu luc nao:

```cmd
npm run backup
```

Backup gom:
- `qy4_ttbyt.sqlite` theo ban sao nhat quan cua SQLite
- thu muc `uploads` neu co
- khoa ky QR cong khai `config/public-qr-secret.txt` neu co
- `backup-info.json`

Mac dinh giu 30 ngay.

## 5. Quy tac an toan

- Khong xoa file SQLite bang tay khi phan mem dang chay.
- Khong dua cong 5000 qua ngrok/Internet.
- Khong dua authtoken ngrok len GitHub, anh chup man hinh, hoac file chia se.
- Truoc cap nhat Git, nen chay `npm run backup`.
- Ban tren may ca nhan dung de hoan thien va thu nghiem; khi dua sang mang benh vien can cau hinh IP/firewall rieng.
