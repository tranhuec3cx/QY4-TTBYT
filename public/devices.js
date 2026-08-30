
let META = { departments: [], groups: [] };
let DEVICES = [];
let FILTERED = [];

function byId(id) { return DEVICES.find(x => x.id === id); }
function departmentName(code) { return META.departments.find(x => x.code === code)?.name || code; }
function groupName(code) { return META.groups.find(x => x.code === code)?.name || code; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#039;"}[ch] || ch));
}

function qrGroupCode(device) {
  const insurance = String(device?.insurance_code || "").trim().toUpperCase();
  const insurancePrefix = insurance.split(".")[0].replace(/[^A-Z0-9]/g, "");
  if (insurancePrefix) return insurancePrefix;
  return String(device?.group_code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function buildDeviceQrCode(device) {
  const groupCode = qrGroupCode(device);
  const serial = String(device?.serial || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!groupCode || !serial) return "";
  return `${groupCode}.${serial}`;
}

function showDeviceQrModal(device) {
  closeQrModal();
  if (!device) return;
  const qrCodeRaw = buildDeviceQrCode(device);
  if (!qrCodeRaw) {
    alert("Thiết bị chưa có Serial Number hoặc mã nhóm. Vui lòng bổ sung trước khi tạo mã QR.");
    return;
  }
  const initialBase = getQrBaseUrl();
  const url = buildQrCheckUrl(device, initialBase);
  const name = qrModalEsc(device.name || "");
  const code = qrModalEsc(qrCodeRaw);
  const model = qrModalEsc(device.model || "");
  const serial = qrModalEsc(device.serial || "");
  const img = qrImageUrl(url, 280);
  const backdrop = document.createElement("div");
  backdrop.id = "deviceQrBackdrop";
  backdrop.className = "qr-modal-backdrop";
  backdrop.innerHTML = `
    <div class="qr-modal-card" role="dialog" aria-modal="true">
      <div class="qr-modal-head">
        <h3>Mã QR thiết bị - ${code}</h3>
        <button class="qr-close" type="button" onclick="closeQrModal()">×</button>
      </div>
      <div id="qrPrintArea" class="qr-print-area">
        <div class="hospital">BỆNH VIỆN QUÂN Y 4</div>
        <div class="name"><b>${name}</b></div>
        <div class="code">${code}</div>
        <img id="qrCodeImg" src="${img}" alt="QR ${code}" />
        <div class="hint">Quét để xem hồ sơ / báo sự cố thiết bị</div>
      </div>
      <div class="qr-device-meta">
        <b>${name}</b>
        <div>Mã QR: <b>${code}</b></div>
        <div>Serial Number: ${serial || "—"}</div>
        <div>Model: ${model || "—"}</div>
        <a id="qrCheckLink" href="${url}" target="_blank" rel="noopener">Mở hồ sơ thiết bị</a>
        <div id="qrUrlText" class="qr-url-text">${qrModalEsc(url)}</div>
      </div>
      <div class="qr-mobile-config">
        <label for="qrBaseUrlInput">Tên miền công khai dùng cho QR</label>
        <div class="qr-base-row">
          <input id="qrBaseUrlInput" list="qrBaseUrlOptions" value="${qrModalEsc(initialBase)}" placeholder="https://qy4.benhvien.vn" />
          <datalist id="qrBaseUrlOptions"></datalist>
          <button class="btn" type="button" id="qrApplyBaseBtn">Áp dụng</button>
        </div>
        <div id="qrBaseHint" class="qr-base-hint">QR mở đúng hồ sơ máy theo mã nội bộ; mã in trên tem được tạo từ mã nhóm và Serial Number.</div>
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

function applyFilters() {
  const qText = q("searchInput").value.trim().toLowerCase();
  const dep = q("departmentFilter").value;
  const grp = q("groupFilter").value;
  const year = q("yearFilter").value;
  const status = q("statusFilter").value;
  const quality = q("qualityFilter").value;
  const funding = q("fundingFilter") ? q("fundingFilter").value : "ALL";
  FILTERED = DEVICES.filter(d => {
    const qrCode = buildDeviceQrCode(d);
    const okText = !qText || [qrCode, d.device_code, d.insurance_code, d.group_code, d.name, d.manufacturer, d.model, d.serial, departmentName(d.department_code)].join(" ").toLowerCase().includes(qText);
    return okText &&
      (dep === "ALL" || d.department_code === dep) &&
      (grp === "ALL" || d.group_code === grp) &&
      (year === "ALL" || String(d.year_in_use) === String(year)) &&
      (status === "ALL" || d.status === status) &&
      (quality === "ALL" || String(d.quality_level || "") === String(quality)) &&
      (funding === "ALL" || String(d.funding || "") === funding);
  });
  renderRows();
}
function renderStats() {
  if (q("listCount")) q("listCount").textContent = `${FILTERED.length} thiết bị`;
}
function renderRows() {
  if (q("listCount")) q("listCount").textContent = `${FILTERED.length} thiết bị`;
  q("deviceRows").innerHTML = FILTERED.map((d, i) => `
    <tr>
      <td class="col-stt">${i+1}</td>
      <td class="device-code">${d.device_code}</td>
      <td class="device-name-cell"><div class="device-name" title="${escapeHtml(d.name || "")}">${d.name || ""}</div></td>
      <td class="department-cell"><b>${escapeHtml(d.department_code || "")}</b><div class="small">${escapeHtml(d.department_name || departmentName(d.department_code) || "")}</div></td>
      <td>${d.manufacturer || ""}</td>
      <td>${d.model || ""}</td>
      <td>${d.serial || ""}</td>
      <td>${d.year_in_use || ""}</td>
      <td>${d.location || ""}</td>
      <td><span class="tag ${statusTagClass(d.status)}">${d.status || ""}</span></td>
      <td>
        <div class="table-actions device-row-actions">
          <a class="btn btn-sm" href="/device-detail.html?id=${d.id}">Xem hồ sơ</a>
          <button class="btn btn-sm" onclick="showDeviceQrModal(byId(${d.id}))">QR</button>
          <button class="btn btn-sm" onclick="editDevice(${d.id})">Cập nhật</button>
          <button class="btn btn-sm danger-light" onclick="deleteDevice(${d.id})">Xóa</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="11" class="center-empty">Chưa có dữ liệu.</td></tr>`;
}
function editDevice(id) {
  const d = byId(id);
  q("deviceId").value = d.id;
  q("departmentInput").value = d.department_code;
  q("groupInput").value = d.group_code;
  q("nameInput").value = d.name || "";
  q("manufacturerInput").value = d.manufacturer || "";
  q("modelInput").value = d.model || "";
  q("insuranceInput").value = d.insurance_code || "";
  q("serialInput").value = d.serial || "";
  q("countryInput").value = d.country || "";
  q("yearManufacturedInput").value = d.year_manufactured || "";
  q("yearUseInput").value = d.year_in_use || "";
  q("warrantyInput").value = d.warranty_end || "";
  q("statusInput").value = d.status || "Đang hoạt động";
  q("qualityInput").value = String(d.quality_level || 3);
  q("costInput").value = d.cost || 0;
  q("fundingInput").value = d.funding || "";
  q("locationInput").value = d.location || "";
  q("noteInput").value = d.note || "";
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
async function deleteDevice(id) {
  if (!confirm("Xóa thiết bị này?")) return;
  await api(`/api/devices/${id}`, { method: "DELETE" });
  await loadData();
}
function resetForm() {
  q("deviceForm").reset();
  q("deviceId").value = "";
}
async function saveDevice(e) {
  e.preventDefault();
  const payload = {
    department_code: q("departmentInput").value,
    group_code: q("groupInput").value,
    name: q("nameInput").value.trim(),
    manufacturer: q("manufacturerInput").value.trim(),
    model: q("modelInput").value.trim(),
    insurance_code: q("insuranceInput").value.trim(),
    serial: q("serialInput").value.trim(),
    country: q("countryInput").value.trim(),
    year_manufactured: Number(q("yearManufacturedInput").value || 0),
    year_in_use: Number(q("yearUseInput").value || 0),
    warranty_end: q("warrantyInput").value,
    status: q("statusInput").value,
    quality_level: Number(q("qualityInput").value || 3),
    cost: Number(q("costInput").value || 0),
    funding: q("fundingInput").value.trim(),
    location: q("locationInput").value.trim(),
    note: q("noteInput").value.trim()
  };
  const id = q("deviceId").value;
  if (id) await api(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  else await api(`/api/devices`, { method: "POST", body: JSON.stringify(payload) });
  resetForm();
  await loadData();
  alert("Đã lưu thiết bị.");
}
function exportDevices() {
  const rows = [["Mã thiết bị","Tên thiết bị","Nhóm","Khoa/Phòng","Hãng SX","Model","Năm SD","Hạn BH","Tình trạng","Cấp chất lượng","Serial","Nước sản xuất","Năm sản xuất","Nguyên giá","Nguồn kinh phí","Vị trí","Ghi chú"]];
  FILTERED.forEach(d => rows.push([d.device_code,d.name,d.group_name,d.department_name,d.manufacturer,d.model,d.year_in_use,formatDateVN(d.warranty_end),d.status,d.quality_level,d.serial,d.country,d.year_manufactured,d.cost,d.funding,d.location,d.note]));
  exportCsv("danh_sach_thiet_bi.csv", rows);
}
async function loadData() {
  META = await api("/api/meta");
  DEVICES = await api("/api/devices");
  q("departmentFilter").innerHTML = optDepartmentFilter(META.departments, "Tất cả khoa/phòng");
  q("groupFilter").innerHTML = opt(META.groups, "Tất cả nhóm");
  const years = [...new Set(DEVICES.map(d => d.year_in_use))].sort((a,b)=>b-a);
  q("yearFilter").innerHTML = '<option value="ALL">Tất cả năm</option>' + years.map(y => `<option value="${y}">${y}</option>`).join("");
  q("statusFilter").innerHTML = '<option value="ALL">Tất cả trạng thái</option><option>Đang hoạt động</option><option>Chờ sửa chữa</option><option>Ngừng hoạt động</option>';
  q("qualityFilter").innerHTML = '<option value="ALL">Tất cả cấp chất lượng</option><option value="1">Cấp 1</option><option value="2">Cấp 2</option><option value="3">Cấp 3</option><option value="4">Cấp 4</option><option value="5">Cấp 5</option>';
  const fundings = [...new Set(DEVICES.map(d => (d.funding || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b, "vi"));
  if (q("fundingFilter")) q("fundingFilter").innerHTML = '<option value="ALL">Tất cả nguồn kinh phí</option>' + fundings.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  q("departmentInput").innerHTML = opt(META.departments);
  q("groupInput").innerHTML = opt(META.groups);
  FILTERED = DEVICES.slice();
  applyFilters();
}
document.addEventListener("DOMContentLoaded", async () => {
  setLayout("devices","Thiết bị y tế","Danh mục thiết bị theo khoa/phòng, nhóm thiết bị và tình trạng sử dụng");
  applyFieldLabels("deviceForm", {departmentInput:"Khoa sử dụng",groupInput:"Nhóm thiết bị",nameInput:"Tên thiết bị",manufacturerInput:"Hãng sản xuất",modelInput:"Model",insuranceInput:"Mã bảo hiểm",serialInput:"Serial hãng",countryInput:"Nước sản xuất",yearManufacturedInput:"Năm sản xuất",yearUseInput:"Năm sử dụng",warrantyInput:"Hạn bảo hành",statusInput:"Tình trạng",qualityInput:"Cấp chất lượng",costInput:"Nguyên giá",fundingInput:"Nguồn kinh phí",locationInput:"Vị trí đặt máy",noteInput:"Ghi chú"});
  await loadData();
  q("filterBtn").onclick = applyFilters;
  q("resetBtn").onclick = () => {
    q("searchInput").value = "";
    q("departmentFilter").value = "ALL";
    q("groupFilter").value = "ALL";
    q("yearFilter").value = "ALL";
    q("statusFilter").value = "ALL";
    q("qualityFilter").value = "ALL";
    if (q("fundingFilter")) q("fundingFilter").value = "ALL";
    applyFilters();
  };
  ["searchInput","departmentFilter","groupFilter","yearFilter","statusFilter","qualityFilter","fundingFilter"].forEach(id => q(id).addEventListener(id==="searchInput"?"input":"change", applyFilters));
  q("deviceForm").addEventListener("submit", saveDevice);
  q("exportBtn")?.addEventListener("click", exportDevices);
  if (q("exportExcelBtn")) q("exportExcelBtn").onclick = exportDevicesExcel;
});


function exportDevicesExcel() {
  const rows = FILTERED.map(d => ({
    "Mã thiết bị": d.device_code,
    "Khoa/phòng": d.department_name || d.department_code,
    "Nhóm thiết bị": d.group_name || d.group_code,
    "Tên thiết bị": d.name,
    "Hãng sản xuất": d.manufacturer || "",
    "Model": d.model || "",
    "Serial": d.serial || "",
    "Nước sản xuất": d.country || "",
    "Năm sản xuất": d.year_manufactured || "",
    "Năm sử dụng": d.year_in_use || "",
    "Hạn bảo hành": d.warranty_end || "",
    "Tình trạng": d.status || "",
    "Cấp chất lượng": d.quality_level || "",
    "Nguyên giá": d.cost || 0,
    "Nguồn kinh phí": d.funding || "",
    "Vị trí đặt máy": d.location || "",
    "Ghi chú": d.note || ""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BaoCao");
  XLSX.writeFile(wb, `danh_sach_thiet_bi_${reportFileStamp()}.xlsx`);
}




function resolveDepartmentCodeFromExcel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const byCode = META.departments.find(d => d.code === s);
  if (byCode) return byCode.code;
  const prefix = s.split("-")[0].trim();
  const byPrefix = META.departments.find(d => d.code === prefix);
  if (byPrefix) return byPrefix.code;
  const byName = META.departments.find(d => d.name === s);
  return byName ? byName.code : "";
}
function resolveGroupCodeFromExcel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const byCode = META.groups.find(g => g.code === s);
  if (byCode) return byCode.code;
  const byName = META.groups.find(g => g.name === s);
  return byName ? byName.code : "";
}


function reportFileStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}