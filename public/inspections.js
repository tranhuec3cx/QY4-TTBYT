let ROWS = [];
let DEVICES = [];
let FILTERED = [];
let CURRENT_INSPECTION_FILE_PATH = "";

function esc(value){ return String(value ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function norm(value){ return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function meta(id){ return DEVICES.find(d => Number(d.id) === Number(id)) || null; }
function deviceLabel(d){ return d ? `${d.device_code || `TB-${d.id}`} - ${d.name || ""}` : ""; }
function devicePickerLabel(d){ return d ? [d.device_code || `TB-${d.id}`, d.name || "", d.model || ""].filter(Boolean).join(" - ") : ""; }
function deviceSearchText(d){ return norm([d?.device_code, d?.name, d?.model].filter(Boolean).join(" ")); }

function fillInfo(){
  const m = meta(q("deviceId").value);
  q("dept").value = m ? (m.department_name || m.department_code || "") : "";
  q("location").value = m ? (m.location || "") : "";
}

function hideDeviceSuggestions(){
  const box = q("inspectionDeviceSuggestions");
  if(box) box.hidden = true;
}

function deviceMatches(raw){
  const text = norm(raw);
  if(!text) return DEVICES.slice(0, 20);
  return DEVICES.filter(d => deviceSearchText(d).includes(text)).slice(0, 30);
}

function renderDeviceSuggestions(raw = ""){
  const box = q("inspectionDeviceSuggestions");
  if(!box) return;
  const matches = deviceMatches(raw);
  if(!matches.length){
    box.innerHTML = `<div class="inspection-device-empty">Không tìm thấy thiết bị theo mã, tên hoặc model.</div>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = matches.map(d => `
    <button type="button" class="inspection-device-suggestion" data-device-id="${Number(d.id)}">
      <strong>${esc(d.device_code || `TB-${d.id}`)} - ${esc(d.name || "")}</strong>
      ${d.model ? `<span class="model">${esc(d.model)}</span>` : ""}
    </button>`).join("");
  box.hidden = false;
}

function selectInspectionDevice(id){
  const d = meta(id);
  if(!d) return false;
  q("deviceId").value = String(d.id);
  q("inspectionDeviceSearch").value = devicePickerLabel(d);
  fillInfo();
  hideDeviceSuggestions();
  return true;
}

function clearSelectedDeviceKeepText(){
  q("deviceId").value = "";
  fillInfo();
}

function ensureSelectedDevice(){
  if(q("deviceId").value) return true;
  const raw = q("inspectionDeviceSearch").value.trim();
  if(!raw){
    alert("Vui lòng chọn thiết bị.");
    q("inspectionDeviceSearch").focus();
    return false;
  }
  const matches = deviceMatches(raw);
  if(matches.length === 1) return selectInspectionDevice(matches[0].id);
  alert(matches.length > 1 ? "Có nhiều thiết bị phù hợp. Vui lòng chọn đúng thiết bị trong danh sách gợi ý." : "Không tìm thấy thiết bị phù hợp. Vui lòng tìm theo mã thiết bị, tên thiết bị hoặc model.");
  q("inspectionDeviceSearch").focus();
  renderDeviceSuggestions(raw);
  return false;
}

function attachedFilePath(r){
  const f = String(r.file_note || "").trim();
  return f.startsWith("/uploads/") ? f : "";
}
function fileNameFromPath(path){ return String(path || "").split("/").pop() || "Tệp đính kèm"; }
function fileCell(r){
  const path = attachedFilePath(r);
  if(!path) return "";
  return `<a class="btn btn-secondary btn-sm" href="${esc(path)}" target="_blank" rel="noopener">Tải file</a><div class="small file-name-line">${esc(fileNameFromPath(path))}</div>`;
}

function daysTo(dateStr){
  if(!dateStr) return null;
  const t = new Date(dateStr + "T00:00:00").getTime();
  if(!Number.isFinite(t)) return null;
  const n = new Date();
  n.setHours(0,0,0,0);
  return Math.ceil((t - n.getTime()) / 86400000);
}

function dueState(dateStr){
  const d = daysTo(dateStr);
  if(d === null) return "missing";
  if(d < 0) return "overdue";
  if(d <= 30) return "soon";
  return "valid";
}

function dueTag(dateStr){
  const state = dueState(dateStr);
  if(state === "missing") return `<span class="due-badge due-missing">Chưa nhập hạn</span>`;
  if(state === "overdue") return `<span class="due-badge due-overdue">Quá hạn</span>`;
  if(state === "soon") return `<span class="due-badge due-soon">Sắp hạn</span>`;
  return `<span class="due-badge due-valid">Còn hạn</span>`;
}

function renderStats(data){
  q("stInspectionTotal").textContent = data.length;
  q("stInspectionValid").textContent = data.filter(r => dueState(r.next_date) === "valid").length;
  q("stInspectionSoon").textContent = data.filter(r => dueState(r.next_date) === "soon").length;
  q("stInspectionOverdue").textContent = data.filter(r => dueState(r.next_date) === "overdue").length;
  q("stInspectionFail").textContent = data.filter(r => r.result === "Không đạt").length;
  q("stInspectionMissing").textContent = data.filter(r => dueState(r.next_date) === "missing").length;
}

function render(data){
  q("countLabel").textContent = `${data.length} bản ghi`;
  renderStats(data);
  if(!data.length){
    q("rows").innerHTML = `<tr><td colspan="11" class="center-empty">Chưa có hồ sơ kiểm định - hiệu chuẩn phù hợp.</td></tr>`;
    return;
  }
  q("rows").innerHTML = data.map(r => `
    <tr>
      <td>${r.next_date ? formatDateVN(r.next_date) : "—"}<br>${dueTag(r.next_date)}</td>
      <td>${formatDateTimeVN(r.inspection_date)}</td>
      <td class="device-code">${esc(r.device_code || "")}</td>
      <td class="device-name">${esc(r.device_name || "")}</td>
      <td><b>${esc(r.department_name || r.department_code || "")}</b><div class="small">${esc(r.location || "")}</div></td>
      <td>${esc(r.type || "")}</td>
      <td>${esc(r.organization || "")}</td>
      <td>${esc(r.certificate_no || "")}</td>
      <td><span class="tag ${statusTagClass(r.result)}">${esc(r.result || "")}</span></td>
      <td>${fileCell(r)}</td>
      <td><div class="table-actions"><button class="btn" onclick="editRow(${Number(r.id)})">Cập nhật</button><button class="btn btn-secondary" onclick="openDeviceProfile(${Number(r.device_id)})">Mở HS</button><button class="btn btn-danger" onclick="delRow(${Number(r.id)})">Xóa</button></div></td>
    </tr>`).join("");
}

function dueSortValue(r){
  const d = daysTo(r.next_date);
  return d === null ? 999999 : d;
}

function applyFilter(){
  const text = norm(q("searchInput").value);
  const dev = q("deviceFilter").value;
  const typ = q("typeFilter").value;
  const org = q("orgFilter").value;
  const result = q("resultFilter").value;
  const from = q("fromDate").value;
  const to = q("toDate").value;
  FILTERED = ROWS.filter(r =>
    inDateRange(r.inspection_date, from, to) &&
    (!text || norm([r.device_code, r.device_name, r.certificate_no, r.organization].join(" ")).includes(text)) &&
    (dev === "ALL" || String(r.device_id) === dev) &&
    (typ === "ALL" || r.type === typ) &&
    (org === "ALL" || (r.organization || "") === org) &&
    (result === "ALL" || (r.result || "") === result)
  ).sort((a,b) => dueSortValue(a) - dueSortValue(b) || String(b.inspection_date || "").localeCompare(String(a.inspection_date || "")) || Number(b.id) - Number(a.id));
  render(FILTERED);
}

function clearFilters(){
  q("searchInput").value = "";
  q("deviceFilter").value = "ALL";
  q("typeFilter").value = "ALL";
  q("orgFilter").value = "ALL";
  q("resultFilter").value = "ALL";
  setDefaultDateRange();
  applyFilter();
}

function resetForm(){
  q("form").reset();
  q("recordId").value = "";
  q("deviceId").value = "";
  q("inspectionDeviceSearch").value = "";
  CURRENT_INSPECTION_FILE_PATH = "";
  if(q("fileUpload")) q("fileUpload").value = "";
  q("inspectionFileHint").textContent = "Chọn tệp chứng nhận hoặc hồ sơ liên quan nếu có.";
  q("inspectionFormTitle").textContent = "Thêm hồ sơ kiểm định - hiệu chuẩn - ATBX";
  q("saveInspectionBtn").textContent = "Lưu hồ sơ";
  hideDeviceSuggestions();
  fillInfo();
}

function openNewInspection(){
  resetForm();
  q("inspectionDialog").showModal();
  setTimeout(() => q("inspectionDeviceSearch").focus(), 0);
}

function closeInspectionDialog(reset = true){
  if(q("inspectionDialog").open) q("inspectionDialog").close();
  if(reset) resetForm();
}

function editRow(id){
  const r = ROWS.find(x => Number(x.id) === Number(id));
  if(!r) return;
  resetForm();
  q("recordId").value = r.id;
  selectInspectionDevice(r.device_id);
  q("type").value = r.type || "Kiểm định";
  q("inspectionDate").value = toDateTimeLocalValue(r.inspection_date || "");
  q("organization").value = r.organization || "";
  q("certificateNo").value = r.certificate_no || "";
  q("result").value = r.result || "Đạt";
  q("nextDate").value = r.next_date || "";
  CURRENT_INSPECTION_FILE_PATH = attachedFilePath(r);
  q("fileNote").value = CURRENT_INSPECTION_FILE_PATH ? fileNameFromPath(r.file_note) : (r.file_note || "");
  q("note").value = r.note || "";
  q("inspectionFileHint").textContent = CURRENT_INSPECTION_FILE_PATH ? `File hiện tại: ${fileNameFromPath(CURRENT_INSPECTION_FILE_PATH)}. Chọn tệp mới nếu muốn thay thế.` : "Chọn tệp nếu muốn đính kèm.";
  q("inspectionFormTitle").textContent = "Cập nhật hồ sơ kiểm định - hiệu chuẩn - ATBX";
  q("saveInspectionBtn").textContent = "Cập nhật hồ sơ";
  q("inspectionDialog").showModal();
}

async function delRow(id){
  if(!confirm("Xóa hồ sơ kiểm định/hiệu chuẩn này?")) return;
  await api(`/api/inspections/${id}`, {method:"DELETE"});
  await load();
}

async function saveInspection(e){
  e.preventDefault();
  if(!ensureSelectedDevice()) return;
  if(!q("inspectionDate").value) return alert("Vui lòng nhập thời gian thực hiện.");

  let uploadedPath = "";
  const fileInput = q("fileUpload");
  if(fileInput && fileInput.files && fileInput.files[0]){
    const fd = new FormData();
    fd.append("device_id", q("deviceId").value);
    fd.append("name", q("certificateNo").value || `Hồ sơ ${q("type").value}`);
    fd.append("type", q("type").value);
    fd.append("doc_date", q("inspectionDate").value);
    fd.append("updated_by", "Hệ thống");
    fd.append("note", q("note").value || "");
    fd.append("file", fileInput.files[0]);
    const res = await fetch("/api/documents", {method:"POST", body:fd});
    if(!res.ok) return alert(await res.text());
    const doc = await res.json();
    uploadedPath = doc.file_path || "";
  }

  const p = {
    device_id: Number(q("deviceId").value),
    inspection_date: fromDateTimeLocalValue(q("inspectionDate").value),
    type: q("type").value,
    organization: q("organization").value.trim(),
    certificate_no: q("certificateNo").value.trim(),
    result: q("result").value,
    next_date: q("nextDate").value,
    file_note: uploadedPath || CURRENT_INSPECTION_FILE_PATH || q("fileNote").value.trim(),
    note: q("note").value.trim()
  };
  const id = q("recordId").value;
  if(id) await api(`/api/inspections/${id}`, {method:"PUT", body:JSON.stringify(p)});
  else await api("/api/inspections", {method:"POST", body:JSON.stringify(p)});
  closeInspectionDialog(true);
  await load();
}

function exportExcel(){
  const rows = FILTERED.map((r,i) => ({
    "STT": i + 1,
    "Mã thiết bị": r.device_code || "",
    "Tên thiết bị": r.device_name || "",
    "Khoa": r.department_name || r.department_code || "",
    "Vị trí": r.location || "",
    "Loại": r.type || "",
    "Ngày thực hiện": formatDateTimeVN(r.inspection_date),
    "Đơn vị": r.organization || "",
    "Số chứng nhận": r.certificate_no || "",
    "Kết quả": r.result || "",
    "Hạn tiếp theo": formatDateVN(r.next_date),
    "Tình trạng hạn": dueState(r.next_date) === "overdue" ? "Quá hạn" : dueState(r.next_date) === "soon" ? "Sắp hạn" : dueState(r.next_date) === "valid" ? "Còn hạn" : "Chưa nhập hạn",
    "Ghi chú": r.note || ""
  }));
  if(!rows.length) return alert("Không có dữ liệu để xuất Excel.");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KiemDinh");
  XLSX.writeFile(wb, `kiem_dinh_hieu_chuan_${reportFileStamp()}.xlsx`);
}

async function load(){
  DEVICES = await api("/api/devices");
  ROWS = await api("/api/inspections");
  q("deviceFilter").innerHTML = `<option value="ALL">Tất cả thiết bị</option>` + DEVICES.map(d => `<option value="${Number(d.id)}">${esc(deviceLabel(d))}</option>`).join("");
  q("deviceId").innerHTML = `<option value=""></option>` + DEVICES.map(d => `<option value="${Number(d.id)}">${esc(deviceLabel(d))}</option>`).join("");
  const orgs = [...new Set(ROWS.map(r => r.organization).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b),"vi"));
  q("orgFilter").innerHTML = `<option value="ALL">Tất cả đơn vị</option>` + orgs.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  fillInfo();
  applyFilter();
}

function reportFileStamp(){
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function openDeviceProfile(deviceId){
  if(deviceId) window.open(`/device-detail.html?id=${deviceId}`, "_blank");
}

document.addEventListener("DOMContentLoaded", async () => {
  setLayout("inspections", "Kiểm định - Hiệu chuẩn - ATBX", "Theo dõi kiểm định, hiệu chuẩn, kiểm xạ và an toàn bức xạ");
  setDefaultDateRange();
  await load();
  resetForm();

  const editId = new URLSearchParams(window.location.search).get("edit_id");
  if(editId) editRow(Number(editId));

  q("newInspectionBtn").onclick = openNewInspection;
  q("closeInspectionDialogBtn").onclick = () => closeInspectionDialog(true);
  q("cancelInspectionBtn").onclick = () => closeInspectionDialog(true);
  q("resetBtn").onclick = resetForm;
  q("filterBtn").onclick = applyFilter;
  q("clearFilterBtn").onclick = clearFilters;
  q("exportBtn").onclick = exportExcel;
  q("form").addEventListener("submit", saveInspection);

  ["searchInput","fromDate","toDate","deviceFilter","typeFilter","orgFilter","resultFilter"].forEach(id => {
    const el = q(id);
    el.addEventListener("input", applyFilter);
    el.addEventListener("change", applyFilter);
  });

  q("inspectionDeviceSearch").addEventListener("focus", e => renderDeviceSuggestions(e.target.value));
  q("inspectionDeviceSearch").addEventListener("input", e => {
    clearSelectedDeviceKeepText();
    renderDeviceSuggestions(e.target.value);
  });
  q("inspectionDeviceSearch").addEventListener("keydown", e => {
    if(e.key === "Enter"){
      const matches = deviceMatches(e.currentTarget.value);
      if(matches.length === 1){ e.preventDefault(); selectInspectionDevice(matches[0].id); }
    }
    if(e.key === "Escape") hideDeviceSuggestions();
  });
  q("inspectionDeviceSuggestions").addEventListener("click", e => {
    const btn = e.target.closest("[data-device-id]");
    if(btn) selectInspectionDevice(Number(btn.dataset.deviceId));
  });
  document.addEventListener("click", e => {
    if(!e.target.closest(".inspection-device-picker")) hideDeviceSuggestions();
  });

  q("fileUpload").addEventListener("change", () => {
    q("inspectionFileHint").textContent = q("fileUpload").files[0] ? `Đã chọn: ${q("fileUpload").files[0].name}` : "Chọn tệp chứng nhận hoặc hồ sơ liên quan nếu có.";
  });
});
