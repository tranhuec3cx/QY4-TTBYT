
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return text; }
}
function q(id) { return document.getElementById(id); }
function formatDateVN(dateStr) {
  if (!dateStr) return "";
  if (dateStr.includes(" ")) dateStr = dateStr.split(" ")[0];
  const [y,m,d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
function formatDateTimeVN(value) {
  if (!value) return "";
  if (value.includes("T")) value = value.replace("T", " ");
  const [date, time] = value.split(" ");
  return `${formatDateVN(date)} ${time ? time.slice(0,5) : ""}`.trim();
}
function formatCurrency(v) {
  return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + " đ";
}
function statusTagClass(status) {
  if (status === "Đang hoạt động" || status === "Hoạt động" || status === "Đạt") return "green";
  if (status === "Hoạt động hạn chế" || status === "Đạt có lưu ý" || status === "Theo dõi" || status === "Trung bình") return "yellow";
  if (status === "Chờ sửa chữa" || status === "Cần theo dõi thêm" || status === "Đang xử lý" || status === "Chờ linh kiện" || status === "Cao") return "orange";
  if (status === "Không sửa được" || status === "Ngừng hoạt động") return "red";
  return "red";
}
function renderMenu(active) {
  const items = [
    {key:"dashboard", href:"/dashboard.html", label:"Tổng quan"},
    {key:"devices", href:"/index.html", label:"Thiết bị y tế"},
    {key:"tickets", href:"/tickets.html", label:"Sự cố"},
    {key:"maintenance", href:"/maintenance.html", label:"Sửa chữa"},
    {key:"inspection", href:"/inspection.html", label:"Bảo dưỡng"},
    {key:"inspections", href:"/inspections.html", label:"Kiểm định"},
    {key:"reports", href:"/reports.html", label:"Báo cáo"},
    {key:"settings", href:"/settings.html", label:"Cài đặt"}
  ];
  const links = items.map(i => `<a class="${active===i.key?'active':''}" href="${i.href}">${i.label}</a>`).join("");
  return `
    <aside class="sidebar">
      <div class="brand">
        <img src="assets/BVQY4.jpg" alt="Logo Bệnh viện Quân y 4" />
        <div><h1>QUẢN LÝ TTBYT</h1><p>Bệnh viện Quân y 4</p></div>
      </div>
      <nav class="menu">${links}</nav>
      <div class="sidebar-footer">
        <div class="avatar">QT</div>
        <div><b>Quản trị viên</b><span>Khoa Trang bị</span></div>
      </div>
    </aside>
  `;
}
function smartBackDefault() {
  return "/index.html";
}
function goBackSmart(defaultUrl = smartBackDefault()) {
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const deviceId = params.get("device_id") || params.get("id");
  const map = {
    tickets: "/tickets.html",
    maintenance: "/maintenance.html",
    reports: "/reports.html",
    inspections: "/inspections.html",
    inspection: "/inspection.html",
    devices: "/index.html",
    dashboard: "/dashboard.html"
  };
  if (from === "device-detail" && deviceId) { window.location.href = `/device-detail.html?id=${encodeURIComponent(deviceId)}`; return; }
  if (from && map[from]) { window.location.href = map[from]; return; }
  if (window.history.length > 1) window.history.back();
  else window.location.href = defaultUrl;
}
function setLayout(active, title, subtitle, settingsTab = null) {
  q("menuHost").innerHTML = renderMenu(active);
  q("pageTitle").textContent = title;
  q("pageSubtitle").textContent = subtitle;
  const titleEl = q("pageTitle");
  if (titleEl && !document.getElementById("smartBackBtn")) {
    const parent = titleEl.parentElement;
    parent.classList.add("title-with-back");
    const btn = document.createElement("button");
    btn.id = "smartBackBtn";
    btn.type = "button";
    btn.className = "back-only-btn";
    btn.textContent = "←";
    btn.title = "Trở về";
    btn.onclick = () => goBackSmart();
    parent.insertBefore(btn, titleEl);
  }
  if (q("settingsTabsHost")) q("settingsTabsHost").innerHTML = settingsTab ? renderSettingsTabs(settingsTab) : "";
}
function exportCsv(filename, rows) {
  const csv = "\ufeff" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function opt(list, allLabel = null, selected = "ALL") {
  const rows = allLabel ? [{code:"ALL", name:allLabel}, ...list] : list;
  return rows.map(x => `<option value="${x.code}" ${String(x.code)===String(selected)?'selected':''}>${x.name}</option>`).join("");
}

function optDepartmentFilter(list, allLabel = null, selected = "ALL") {
  const rows = allLabel ? [{code:"ALL", name:allLabel}, ...list] : list;
  return rows.map(x => {
    const label = x.code === "ALL" ? x.name : `${x.code} - ${x.name}`;
    return `<option value="${x.code}" ${String(x.code)===String(selected)?'selected':''}>${label}</option>`;
  }).join("");
}


function renderSettingsTabs(active) {
  return `
    <div class="settings-tabs">
      <a class="${active==='categories'?'active':''}" href="/settings.html">Danh mục dùng chung</a>
      <a class="${active==='device_code'?'active':''}" href="/settings-code.html">Cấu hình mã thiết bị</a>
      <a class="${active==='reminders'?'active':''}" href="/settings-reminders.html">Nhắc hạn</a>
      <a class="${active==='reports'?'active':''}" href="/settings-reports.html">Báo cáo / tích hợp</a>
    </div>
  `;
}



function todayISO(){ return new Date().toISOString().slice(0,10); }
function firstDayOfYearISO(){ const d=new Date(); return `${d.getFullYear()}-01-01`; }
function inDateRange(dateStr, from, to){
  if(!dateStr) return true;
  const d=String(dateStr).slice(0,10);
  return (!from || d>=from) && (!to || d<=to);
}
function setDefaultDateRange(fromId="fromDate", toId="toDate"){
  if(q(fromId) && !q(fromId).value) q(fromId).value = firstDayOfYearISO();
  if(q(toId) && !q(toId).value) q(toId).value = todayISO();
}
function applyFieldLabels(formId, labels){
  const form=q(formId); if(!form) return;
  Object.entries(labels).forEach(([id,label])=>{
    const el=q(id); if(!el || el.closest('.field')) return;
    const wrap=document.createElement('label');
    wrap.className='field';
    if(el.classList.contains('span-2')) {wrap.classList.add('span-2'); el.classList.remove('span-2');}
    if(el.classList.contains('span-3')) {wrap.classList.add('span-3'); el.classList.remove('span-3');}
    const span=document.createElement('span'); span.className='field-label'; span.textContent=label;
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(span); wrap.appendChild(el);
  });
}

function parseExcelDate(value) {
  if (!value) return "";
  if (typeof value === "number" && window.XLSX && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return "";
    return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(value).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd,mm,yy] = s.split("/");
    return `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  return s;
}
function parseDateTimeExcel(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (s.includes("T")) return s.replace("T"," ");
  return s;
}
function firstSheetRows(workbook) {
  const name = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
}


async function showScopePicker(title = "Chọn phạm vi", description = "Chọn khoa/phòng và nhóm thiết bị để tạo file.", options = {}) {
  const meta = await api("/api/meta");
  const departments = meta.departments || [];
  const groups = meta.groups || [];
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "scope-modal-backdrop";
    backdrop.innerHTML = `
      <div class="scope-modal">
        <h3>${title}</h3>
        <p>${description}</p>
        <div class="form-grid">
          <div>
            <label>Khoa/phòng</label>
            <select id="scopeDepartment"></select>
          </div>
          <div>
            <label>Nhóm thiết bị</label>
            <select id="scopeGroup"></select>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn" id="scopeCancelBtn">Hủy</button>
          <button class="btn btn-primary" id="scopeConfirmBtn">Xác nhận</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const depSelect = backdrop.querySelector("#scopeDepartment");
    const grpSelect = backdrop.querySelector("#scopeGroup");
    depSelect.innerHTML = opt(departments, "Tất cả khoa/phòng", "ALL");
    grpSelect.innerHTML = opt(groups, "Tất cả nhóm thiết bị", "ALL");

    if (options.department_code) depSelect.value = options.department_code;
    if (options.group_code) grpSelect.value = options.group_code;

    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector("#scopeCancelBtn").onclick = () => close(null);
    backdrop.onclick = (e) => { if (e.target === backdrop) close(null); };
    backdrop.querySelector("#scopeConfirmBtn").onclick = () => {
      close({
        department_code: depSelect.value || "ALL",
        group_code: grpSelect.value || "ALL"
      });
    };
  });
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
  return s.replace(" ", "T").slice(0,16);
}
function fromDateTimeLocalValue(value) {
  if (!value) return "";
  const v = String(value).replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? v + ":00" : v;
}

function qrModalEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch] || ch));
}
const QR_BASE_STORAGE_KEY = "qy4PublicQrBaseUrl";
const QR_DEFAULT_PUBLIC_BASE = "https://qy4.benhvien.vn";
function normalizeQrBaseUrl(value) {
  let v = String(value || "").trim().replace(/\/$/, "");
  if (!v) return QR_DEFAULT_PUBLIC_BASE;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v.replace(/\/$/, "");
}
function getQrBaseUrl() {
  return normalizeQrBaseUrl(localStorage.getItem(QR_BASE_STORAGE_KEY) || QR_DEFAULT_PUBLIC_BASE);
}
function buildQrCheckUrl(device, baseUrl = getQrBaseUrl()) {
  const id = typeof device === "object" ? device.id : device;
  return `${normalizeQrBaseUrl(baseUrl)}/inspect.html?id=${encodeURIComponent(id)}`;
}
function qrImageUrl(data, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(data)}`;
}
function printQrLabel() {
  const el = document.getElementById("qrPrintArea");
  if (!el) return;
  const w = window.open("", "_blank", "width=420,height=620");
  w.document.write(`<!doctype html><html><head><title>In mã QR</title><style>
    @page{size:70mm 50mm;margin:4mm} body{font-family:Arial,sans-serif;margin:0;color:#102a43}
    .label{width:62mm;min-height:42mm;border:1px solid #222;padding:4mm;text-align:center}
    .hospital{font-weight:700;font-size:12px;margin-bottom:2mm}.code{font-weight:700;font-size:13px;margin-top:2mm}.name{font-size:11px;margin-top:1mm}.hint{font-size:9px;margin-top:1mm;color:#444}
    img{width:23mm;height:23mm;object-fit:contain}
  </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}
function closeQrModal() {
  const old = document.getElementById("deviceQrBackdrop");
  if (old) old.remove();
}
function updateQrPreview(device) {
  const backdrop = document.getElementById("deviceQrBackdrop");
  if (!backdrop) return;
  const baseInput = backdrop.querySelector("#qrBaseUrlInput");
  const baseUrl = normalizeQrBaseUrl(baseInput?.value || getQrBaseUrl());
  const url = buildQrCheckUrl(device, baseUrl);
  const img = backdrop.querySelector("#qrCodeImg");
  const link = backdrop.querySelector("#qrCheckLink");
  const urlText = backdrop.querySelector("#qrUrlText");
  if (img) img.src = qrImageUrl(url, 280);
  if (link) link.href = url;
  if (urlText) urlText.textContent = url;
}
function saveQrBaseUrl(device) {
  const input = document.getElementById("qrBaseUrlInput");
  if (!input) return;
  const baseUrl = normalizeQrBaseUrl(input.value);
  localStorage.setItem(QR_BASE_STORAGE_KEY, baseUrl);
  input.value = baseUrl;
  updateQrPreview(device);
  alert("Đã lưu địa chỉ QR cho điện thoại. Hãy in/quét lại mã QR mới.");
}
async function loadQrOriginSuggestions(device) {
  const input = document.getElementById("qrBaseUrlInput");
  const datalist = document.getElementById("qrBaseUrlOptions");
  const hint = document.getElementById("qrBaseHint");
  if (!input) return;
  try {
    const info = await api("/api/system/qr-origins");
    const origins = Array.isArray(info.origins) ? info.origins : [];
    if (datalist) datalist.innerHTML = origins.map(x => `<option value="${qrModalEsc(x)}"></option>`).join("");
    if (datalist) {
      const publicOptions = [QR_DEFAULT_PUBLIC_BASE, ...origins];
      datalist.innerHTML = publicOptions.map(x => `<option value="${qrModalEsc(x)}"></option>`).join("");
    }
    if (hint) {
      hint.innerHTML = `Dùng <b>tên miền công khai HTTPS</b> để điện thoại 4G/5G mở được QR. Demo nội bộ có thể dùng IP LAN, nhưng bản VCAS nên dùng domain cố định.`;
    }
  } catch (e) {
    if (hint) hint.innerHTML = "Nhập tên miền công khai, ví dụ https://qy4.benhvien.vn";
  }
}
function showDeviceQrModal(device) {
  closeQrModal();
  const initialBase = getQrBaseUrl();
  const url = buildQrCheckUrl(device, initialBase);
  const name = qrModalEsc(device.name || "");
  const code = qrModalEsc(device.device_code || "");
  const model = qrModalEsc(device.model || "");
  const serial = qrModalEsc(device.serial || "");
  const img = qrImageUrl(url, 280);
  const isLocalhost = false;
  const backdrop = document.createElement("div");
  backdrop.id = "deviceQrBackdrop";
  backdrop.className = "qr-modal-backdrop";
  backdrop.innerHTML = `
    <div class="qr-modal-card" role="dialog" aria-modal="true">
      <div class="qr-modal-head">
        <h3>Mã QR thiết bị</h3>
        <button class="qr-close" type="button" onclick="closeQrModal()">×</button>
      </div>
      <div id="qrPrintArea" class="qr-print-area">
        <div class="hospital">BỆNH VIỆN QUÂN Y 4</div>
        <img id="qrCodeImg" src="${img}" alt="QR ${code}" />
        <div class="code">${code}</div>
        <div class="name">${name}</div>
        <div class="hint">Quét để kiểm tra / báo sự cố thiết bị</div>
      </div>
      <div class="qr-device-meta">
        <b>${name}</b>
        <div>Model: ${model || "—"}</div>
        <div>Serial: ${serial || "—"}</div>
        <a id="qrCheckLink" href="${url}" target="_blank" rel="noopener">Mở trang kiểm tra công khai</a>
        <div id="qrUrlText" class="qr-url-text">${qrModalEsc(url)}</div>
      </div>
      <div class="qr-mobile-config">
        <label for="qrBaseUrlInput">Tên miền công khai dùng cho QR</label>
        <div class="qr-base-row">
          <input id="qrBaseUrlInput" list="qrBaseUrlOptions" value="${qrModalEsc(initialBase)}" placeholder="https://qy4.benhvien.vn" />
          <datalist id="qrBaseUrlOptions"></datalist>
          <button class="btn" type="button" id="qrApplyBaseBtn">Áp dụng</button>
        </div>
        <div id="qrBaseHint" class="qr-base-hint">QR kiểu VCAS dùng link công khai HTTPS. Khi triển khai thật, đổi thành tên miền bệnh viện, ví dụ <b>https://qy4.benhvien.vn</b>. Điện thoại chỉ cần Internet là mở được.</div>
      </div>
      <div class="qr-actions">
        <button class="btn" type="button" onclick="closeQrModal()">Đóng</button>
        <button class="btn btn-primary" type="button" onclick="printQrLabel()">In mã QR</button>
      </div>
    </div>
  `;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeQrModal(); });
  document.body.appendChild(backdrop);
  backdrop.querySelector("#qrBaseUrlInput")?.addEventListener("input", () => updateQrPreview(device));
  backdrop.querySelector("#qrApplyBaseBtn")?.addEventListener("click", () => saveQrBaseUrl(device));
  loadQrOriginSuggestions(device);
}
