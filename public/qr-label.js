// Tem QR thiết bị - Bệnh viện Quân y 4
// Kích thước mặc định: 70 x 45 mm
(function(){
  window.printQrLabel = function(){
    const el = document.getElementById("qrPrintArea");
    if (!el) return;
    const w = window.open("", "_blank", "width=560,height=520");
    if (!w) {
      alert("Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép cửa sổ bật lên rồi thử lại.");
      return;
    }
    const labelHtml = el.innerHTML;
    w.document.write(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>In tem QR thiết bị</title>
<style>
  @page { size: 70mm 45mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width:70mm; height:45mm; margin:0; padding:0; }
  body {
    font-family: Arial, "Segoe UI", sans-serif;
    color:#000;
    background:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
  }
  .qr-print-area {
    width:68mm;
    height:43mm;
    border:0.35mm solid #111;
    border-radius:1.5mm;
    padding:1.7mm 2.2mm 1.4mm;
    text-align:center;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:flex-start;
    background:#fff;
  }
  .hospital {
    width:100%;
    font-size:9.5pt;
    line-height:1.05;
    font-weight:800;
    text-transform:uppercase;
    letter-spacing:.1pt;
    padding-bottom:0.9mm;
    margin-bottom:0.7mm;
    border-bottom:0.25mm solid #555;
  }
  .name {
    width:100%;
    font-size:8.8pt;
    line-height:1.05;
    font-weight:700;
    margin:0 0 .5mm;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .code {
    width:100%;
    font-family:Consolas, "Courier New", monospace;
    font-size:12.5pt;
    line-height:1.05;
    font-weight:900;
    letter-spacing:.4pt;
    margin:0 0 .6mm;
  }
  img {
    width:21.5mm;
    height:21.5mm;
    object-fit:contain;
    display:block;
    margin:0 auto;
  }
  .hint {
    width:100%;
    font-size:6.8pt;
    line-height:1;
    margin-top:.5mm;
    color:#222;
    white-space:nowrap;
  }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
  <div class="qr-print-area">${labelHtml}</div>
</body>
</html>`);
    w.document.close();
    const doPrint = () => { w.focus(); w.print(); };
    const imgs = Array.from(w.document.images || []);
    if (!imgs.length || imgs.every(img => img.complete)) setTimeout(doPrint, 250);
    else {
      let remaining = imgs.length;
      const done = () => { remaining -= 1; if (remaining <= 0) setTimeout(doPrint, 120); };
      imgs.forEach(img => { img.onload = done; img.onerror = done; });
      setTimeout(doPrint, 1500);
    }
  };
})();
