
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (res.status === 401 && !location.pathname.endsWith("/login.html")) {
    const next = location.pathname + location.search;
    location.href = `/login.html?next=${encodeURIComponent(next)}`;
    throw new Error("Cần đăng nhập.");
  }
  if (!res.ok) {
    const raw = await res.text();
    try {
      const obj = JSON.parse(raw);
      throw new Error(obj.error || raw);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(raw || `HTTP ${res.status}`);
      throw e;
    }
  }
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return text; }
}

async function exportXlsx(filename, sheets) {
  const res = await fetch("/api/export/xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, sheets })
  });
  if (res.status === 401) {
    const next = location.pathname + location.search;
    location.href = `/login.html?next=${encodeURIComponent(next)}`;
    throw new Error("Cần đăng nhập.");
  }
  if (!res.ok) {
    const raw = await res.text();
    try {
      const obj = JSON.parse(raw);
      throw new Error(obj.error || raw);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(raw || `HTTP ${res.status}`);
      throw e;
    }
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = String(filename || "bao_cao.xlsx").toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function q(id) { return document.getElementById(id); }

function devicePickerNorm(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function devicePickerLabel(d) {
  if (!d) return "";
  const code = d.device_code || ("TB-" + d.id);
  const dept = d.department_code ? ` (${d.department_code})` : "";
  const extra = [d.model, d.serial].filter(Boolean).join(" - ");
  return `${code} - ${d.name || ""}${dept}${extra ? " - " + extra : ""}`;
}
function bindDevicePicker(searchInputId, hiddenInputId, datalistId, devices, onSelect) {
  const input = q(searchInputId), hidden = q(hiddenInputId), list = q(datalistId);
  if (!input || !hidden || !list) return;
  list.innerHTML = (devices || []).map(d => `<option value="${String(devicePickerLabel(d)).replace(/"/g,"&quot;")}"></option>`).join("");
  const resolve = () => {
    const raw = input.value.trim();
    if (!raw) { hidden.value = ""; if (onSelect) onSelect(null); return null; }
    const n = devicePickerNorm(raw);
    let d = (devices || []).find(x => devicePickerNorm(devicePickerLabel(x)) === n);
    if (!d) {
      const matches = (devices || []).filter(x => devicePickerNorm([x.device_code,x.name,x.model,x.serial,x.department_code].join(" ")).includes(n));
      if (matches.length === 1) d = matches[0];
    }
    if (d) {
      hidden.value = d.id;
      input.value = devicePickerLabel(d);
      if (onSelect) onSelect(d);
      return d;
    }
    hidden.value = "";
    if (onSelect) onSelect(null);
    return null;
  };
  input.onchange = resolve;
  input.onblur = () => { if (input.value.trim()) resolve(); };
  input.oninput = () => { if (!input.value.trim()) { hidden.value=""; if (onSelect) onSelect(null); } };
  input._resolveDevicePicker = resolve;
}
function setDevicePickerSelection(searchInputId, hiddenInputId, devices, deviceId, onSelect) {
  const hidden = q(hiddenInputId), input = q(searchInputId);
  const d = (devices || []).find(x => String(x.id) === String(deviceId)) || null;
  if (hidden) hidden.value = d ? d.id : "";
  if (input) input.value = d ? devicePickerLabel(d) : "";
  if (onSelect) onSelect(d);
  return d;
}
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
function formatDateTimeVNLines(value) {
  if (!value) return "";
  let raw = String(value);
  if (raw.includes("T")) raw = raw.replace("T", " ");
  const [date, time] = raw.split(" ");
  const dateText = formatDateVN(date);
  const timeText = time ? time.slice(0,5) : "";
  return `<div class="dt-cell"><b>${dateText}</b>${timeText ? `<div class="small">${timeText}</div>` : ""}</div>`;
}
function technicalDeviceCell(row = {}) {
  const safe = (v) => String(v ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch] || ch));
  const name = safe(row.device_name || row.name || "");
  const model = safe(row.model || "");
  const code = safe(row.device_code || row.serial || "");
  return `<div class="technical-device-cell"><b>${name || "—"}</b>${model ? `<div class="small">${model}</div>` : ""}${code ? `<div class="small device-code">${code}</div>` : ""}</div>`;
}
function technicalLocationCell(row = {}) {
  const safe = (v) => String(v ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch] || ch));
  const dept = safe(row.department_code || row.department_name || "");
  const location = safe(row.location || "");
  return `<div class="technical-location-cell"><b>${dept || "—"}</b>${location ? `<div class="small">${location}</div>` : ""}</div>`;
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
  const activeClass = key => active===key ? "active" : "";
  return `
    <aside class="sidebar">
      <div class="brand">
        <img src="assets/BVQY4.jpg" alt="Logo Bệnh viện Quân y 4" />
        <div><h1>QUẢN LÝ THIẾT BỊ Y TẾ</h1><p>BVQY4</p></div>
      </div>
      <nav class="menu">
        <a class="${activeClass("dashboard")}" href="/dashboard.html">Tổng quan</a>
        <a class="${activeClass("devices")}" href="/index.html">Thiết bị</a>

        <div class="menu-section-label">CÔNG VIỆC KỸ THUẬT</div>
        <a class="${activeClass("tickets")}" href="/tickets.html">Sự cố</a>
        <a class="${activeClass("maintenance")}" href="/maintenance.html">Sửa chữa</a>
        <a class="${activeClass("inspection")}" href="/inspection.html">Bảo dưỡng</a>
        <a class="${activeClass("inspections")}" href="/inspections.html">KĐ / HC / ATBX</a>

        <div class="menu-section-label">QUẢN LÝ</div>
        <a class="${activeClass("inventory")}" href="/inventory.html">Kiểm kê – Điều chuyển</a>
        <a class="${activeClass("reports")}" href="/reports.html">Báo cáo</a>
        <a class="menu-admin-link ${activeClass("settings")}" href="/settings.html">⚙ Quản trị</a>
      </nav>
      <div class="sidebar-footer">
        <div><b>@2026 Khoa Trang bị. BVQY4</b><span>– Version 5.0.0</span></div>
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
    inventory: "/inventory.html",
    devices: "/index.html",
    dashboard: "/dashboard.html",
    lcm: "/lcm.html"
  };
  if (from === "device-detail" && deviceId) { window.location.href = `/device-detail.html?id=${encodeURIComponent(deviceId)}`; return; }
  if (from && map[from]) { window.location.href = map[from]; return; }
  if (window.history.length > 1) window.history.back();
  else window.location.href = defaultUrl;
}
async function refreshAuthUi() {
  try {
    const res = await fetch("/api/auth/me", { headers: { "Accept": "application/json" } });
    if (res.status === 401) {
      const next = location.pathname + location.search;
      location.href = `/login.html?next=${encodeURIComponent(next)}`;
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    const box = document.querySelector(".user-box");
    if (!data.auth_required) {
      if (box) box.style.display = "none";
      return;
    }
    window.QY4_AUTH_USER = data.user || null;
    if (box && data.user) {
      box.style.display = "flex";
      box.style.alignItems = "center";
      box.style.gap = "10px";
      const safeAuthText = (v) => String(v ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch] || ch));
      box.innerHTML = `<span><b>${safeAuthText(data.user.full_name || data.user.username || "")}</b><br><small>${safeAuthText(data.user.role || "")}</small></span><button type="button" class="icon-btn" id="logoutBtn" title="Đăng xuất">↪</button>`;
      const logout = document.getElementById("logoutBtn");
      if (logout) logout.onclick = async () => {
        await fetch("/api/auth/logout", { method:"POST", headers:{ "Content-Type":"application/json" }, body:"{}" });
        location.href = "/login.html";
      };
    }
    const role = data.user?.role || "";
    document.body.classList.remove("role-admin","role-engineer","role-department");
    if(role==="Quản trị viên") document.body.classList.add("role-admin");
    else if(role==="Kỹ sư TTBYT") document.body.classList.add("role-engineer");
    else if(role==="Người dùng khoa") document.body.classList.add("role-department");
    document.querySelectorAll(".menu a").forEach(a => {
      const href = a.getAttribute("href") || "";
      if (role === "Người dùng khoa" && !["/index.html"].includes(href)) a.remove();
      if (role === "Kỹ sư TTBYT" && href === "/settings.html") a.remove();
    });
  } catch (e) {
    console.warn("Không đọc được trạng thái đăng nhập", e);
  }
}

function setLayout(active, title, subtitle, settingsTab = null) {
  q("menuHost").innerHTML = renderMenu(active);
  refreshAuthUi();
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
async function confirmDeviceDuplicate(payload, excludeId = 0) {
  const params = new URLSearchParams({
    serial: payload.serial || "",
    name: payload.name || "",
    model: payload.model || "",
    exclude_id: String(excludeId || 0)
  });
  const result = await api(`/api/devices/duplicate-check?${params.toString()}`);
  const serialRows = result.serial_matches || [];
  const similarRows = result.similar_matches || [];
  if (!serialRows.length && !similarRows.length) return true;
  const lines = [];
  if (serialRows.length) {
    lines.push("CẢNH BÁO SERIAL ĐÃ TỒN TẠI:");
    serialRows.slice(0,5).forEach(x => lines.push(`- ${x.device_code || ""} - ${x.name || ""} (${x.department_code || ""})`));
  }
  const extraSimilar = similarRows.filter(x => !serialRows.some(y => Number(y.id) === Number(x.id)));
  if (extraSimilar.length) {
    lines.push("", "Thiết bị cùng tên + model đã có:");
    extraSimilar.slice(0,5).forEach(x => lines.push(`- ${x.device_code || ""} - Serial: ${x.serial || "—"} (${x.department_code || ""})`));
  }
  lines.push("", "Nếu đã kiểm tra và đây đúng là thiết bị khác, có thể tiếp tục lưu.");
  const accepted = confirm(lines.join("\n"));
  if (accepted && serialRows.length) payload.allow_duplicate_serial = true;
  return accepted;
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
      <a class="${active==='system'?'active':''}" href="/settings-system.html">Hệ thống</a>
    </div>
  `;
}



function todayISO(){
  const d=new Date(), pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function nowDateTimeLocalValue(){
  const d=new Date(), pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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
const QR_DEFAULT_PUBLIC_BASE = (window.location && window.location.origin) ? window.location.origin : "http://localhost:5000";
function normalizeQrBaseUrl(value) {
  let v = String(value || "").trim().replace(/\/$/, "");
  if (!v) return QR_DEFAULT_PUBLIC_BASE;
  if (!/^https?:\/\//i.test(v)) {
    const hostPart = v.split("/")[0];
    const looksLikeIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(hostPart);
    const looksLocal = /^localhost(?::\d+)?$/i.test(hostPart);
    v = `${looksLikeIpv4 || looksLocal ? "http" : "https"}://${v}`;
  }
  return v.replace(/\/$/, "");
}
function getQrBaseUrl() {
  return normalizeQrBaseUrl(localStorage.getItem(QR_BASE_STORAGE_KEY) || QR_DEFAULT_PUBLIC_BASE);
}
function buildQrCheckUrl(device, baseUrl = getQrBaseUrl()) {
  const base = normalizeQrBaseUrl(baseUrl);
  if (device && typeof device === "object" && device.qr_uid) {
    return `${base}/q/${encodeURIComponent(device.qr_uid)}`;
  }
  const id = typeof device === "object" ? device.id : device;
  return `${base}/inspect.html?id=${encodeURIComponent(id)}`;
}
function qrImageUrl(data, size = 240) {
  return `/api/qr-image?size=${encodeURIComponent(size)}&data=${encodeURIComponent(data)}`;
}
function isLoopbackQrBase(value) {
  try {
    const u = new URL(normalizeQrBaseUrl(value));
    return ["localhost","127.0.0.1","::1"].includes(String(u.hostname || "").toLowerCase());
  } catch {
    return false;
  }
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
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    w.focus();
    w.print();
  };
  const img = w.document.querySelector("img");
  if (!img || img.complete) setTimeout(doPrint, 120);
  else {
    img.addEventListener("load", doPrint, { once:true });
    img.addEventListener("error", doPrint, { once:true });
    setTimeout(doPrint, 1500);
  }
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
  if (isLoopbackQrBase(baseUrl)) {
    alert("Không nên lưu localhost/127.0.0.1 để in QR. Điện thoại khác sẽ không truy cập được. Hãy chọn IP LAN hoặc hostname nội bộ.");
    return;
  }
  localStorage.setItem(QR_BASE_STORAGE_KEY, baseUrl);
  input.value = baseUrl;
  updateQrPreview(device);
  alert("Đã lưu địa chỉ truy cập. Mã định danh QR của thiết bị vẫn giữ nguyên; chỉ cần in lại tem nếu chính địa chỉ máy chủ/tên miền triển khai thay đổi.");
}
async function loadQrOriginSuggestions(device) {
  const input = document.getElementById("qrBaseUrlInput");
  const datalist = document.getElementById("qrBaseUrlOptions");
  const hint = document.getElementById("qrBaseHint");
  const applyBtn = document.getElementById("qrApplyBaseBtn");
  if (!input) return false;
  try {
    const info = await api("/api/system/qr-origins");
    const origins = Array.isArray(info.origins) ? info.origins : [];
    const recommended = String(info.recommended_origin || "").trim();
    const configured = String(info.configured_origin || "").trim();
    const locked = Boolean(info.origin_locked && configured);

    if (datalist) {
      const publicOptions = [...new Set([configured, recommended, QR_DEFAULT_PUBLIC_BASE, ...origins].filter(Boolean))];
      datalist.innerHTML = publicOptions.map(x => `<option value="${qrModalEsc(x)}"></option>`).join("");
    }

    if (locked) {
      const normalized = normalizeQrBaseUrl(configured);
      input.value = normalized;
      input.readOnly = true;
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.title = "Địa chỉ QR đã được khóa bằng QY4_PUBLIC_ORIGIN trên máy chủ.";
      }
      localStorage.setItem(QR_BASE_STORAGE_KEY, normalized);
      updateQrPreview(device);
    } else {
      input.readOnly = false;
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.title = "";
      }
      if (recommended && isLoopbackQrBase(input.value) && !isLoopbackQrBase(recommended)) {
        input.value = normalizeQrBaseUrl(recommended);
        updateQrPreview(device);
      }
    }

    const printSafe = info.origin_print_safe !== false;
    if (hint) {
      const current = normalizeQrBaseUrl(input.value);
      const configInvalid = Boolean(info.configured_origin_raw && info.configured_origin_valid === false);
      hint.innerHTML = configInvalid
        ? `<b style="color:#a83232">QY4_PUBLIC_ORIGIN không hợp lệ.</b> Nút In QR bị khóa cho tới khi sửa cấu hình và khởi động lại server.`
        : (locked && !printSafe
            ? `<b style="color:#a83232">Địa chỉ QR đang khóa nhưng không dùng được cho thiết bị khác:</b> <b>${qrModalEsc(current)}</b>. Hãy sửa QY4_PUBLIC_ORIGIN.`
            : (locked
                ? `Địa chỉ QR đã được <b>khóa ở cấp máy chủ</b>: <b>${qrModalEsc(current)}</b>. Muốn đổi địa chỉ in tem, hãy thay cấu hình QY4_PUBLIC_ORIGIN rồi khởi động lại server.`
                : (isLoopbackQrBase(current)
                    ? `<b style="color:#a83232">Không in QR với localhost.</b> Điện thoại sẽ không truy cập được. Hãy chọn IP LAN/tên miền ổn định trong danh sách.`
                    : `QR được sinh <b>ngay trên server nội bộ</b>, không cần Internet. UID trên QR là cố định; địa chỉ đang chọn: <b>${qrModalEsc(current)}</b>. Trước khi in hàng loạt nên khóa bằng QY4_PUBLIC_ORIGIN.`)));
    }
    return printSafe;
  } catch (e) {
    if (hint) hint.innerHTML = "Không tải được cấu hình địa chỉ QR từ server. Nút In QR tạm khóa để tránh in sai địa chỉ.";
    return false;
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
        <div id="qrBaseHint" class="qr-base-hint">Mỗi thiết bị dùng <b>QR UID cố định</b>, không phụ thuộc Serial, mã thiết bị hay khoa sử dụng. Khi triển khai chính thức nên dùng một tên miền/IP nội bộ cố định để đường dẫn trên tem không thay đổi.</div>
      </div>
      <div class="qr-actions">
        <button class="btn" type="button" onclick="closeQrModal()">Đóng</button>
        <button class="btn btn-primary" type="button" id="qrPrintBtn" onclick="printQrLabel()">In mã QR</button>
      </div>
    </div>
  `;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeQrModal(); });
  document.body.appendChild(backdrop);
  backdrop.querySelector("#qrBaseUrlInput")?.addEventListener("input", () => updateQrPreview(device));
  backdrop.querySelector("#qrApplyBaseBtn")?.addEventListener("click", () => saveQrBaseUrl(device));
  const printBtn = backdrop.querySelector("#qrPrintBtn");
  if (printBtn) printBtn.disabled = true;
  loadQrOriginSuggestions(device).then((printSafe) => {
    if (!printBtn) return;
    printBtn.disabled = printSafe === false;
    printBtn.title = printSafe === false ? "Chưa có địa chỉ QR an toàn để in." : "";
  });
}
