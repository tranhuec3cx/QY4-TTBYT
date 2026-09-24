
let META = { departments: [], groups: [] };
let DEVICE = null;
let DEVICE_ID = null;
let TECH_HISTORY = [];

function esc(value) { return String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function infoItem(label, value) {
  return `<div class="info-item"><div class="info-label">${label}</div><div class="info-value">${value || "—"}</div></div>`;
}
function renderRows(id, rows, fn, colspan) {
  q(id).innerHTML = rows.length ? rows.map((row, idx) => fn(row, idx)).join("") : `<tr><td colspan="${colspan}" class="center-empty">Chưa có dữ liệu.</td></tr>`;
}
function showForm(wrapId, show) { q(wrapId).style.display = show ? "block" : "none"; }
function setGeneralInspectionRequirements(values){
  const selected=new Set(Array.isArray(values)?values:[]);
  document.querySelectorAll('input[name="generalInspectionRequiredType"]').forEach(x=>{x.checked=selected.has(x.value);});
}
function generalInspectionRequirements(){
  return Array.from(document.querySelectorAll('input[name="generalInspectionRequiredType"]:checked')).map(x=>x.value);
}
function fillGeneralForm() {
  q("generalDepartment").innerHTML = META.departments.map(x=>`<option value="${esc(x.code)}">${esc(x.name)}</option>`).join("");
  q("generalGroup").innerHTML = META.groups.map(x=>`<option value="${esc(x.code)}">${esc(x.name)}</option>`).join("");
  q("generalDepartment").value = DEVICE.department_code;
  q("generalGroup").value = DEVICE.group_code;
  q("generalDeviceCode").value = DEVICE.device_code || "";
  q("generalInsuranceCode").value = DEVICE.insurance_code || "";
  q("generalName").value = DEVICE.name || "";
  q("generalManufacturer").value = DEVICE.manufacturer || "";
  q("generalModel").value = DEVICE.model || "";
  q("generalSerial").value = DEVICE.serial || "";
  q("generalCountry").value = DEVICE.country || "";
  q("generalYearManufactured").value = DEVICE.year_manufactured || "";
  q("generalYearInUse").value = DEVICE.year_in_use || "";
  q("generalWarranty").value = DEVICE.warranty_end || "";
  q("generalStatus").value = DEVICE.status || "Đang hoạt động";
  q("generalQuality").value = String(DEVICE.quality_level || 3);
  setGeneralInspectionRequirements(DEVICE.inspection_required_types || []);
  q("generalCost").value = DEVICE.cost || 0;
  q("generalFunding").value = DEVICE.funding || "";
  q("generalLocation").value = DEVICE.location || "";
  q("generalNote").value = DEVICE.note || "";
}
function renderGeneralInfo() {
  if (DEVICE.limited_view) {
    q("infoGeneral").innerHTML = `
      <div class="info-section"><h3>Định danh thiết bị</h3>${infoItem("Mã thiết bị", esc(DEVICE.device_code))}${infoItem("Tên thiết bị", esc(DEVICE.name))}${infoItem("Serial Number", esc(DEVICE.serial))}</div>
      <div class="info-section"><h3>Thông tin kỹ thuật</h3>${infoItem("Nhóm thiết bị", esc(DEVICE.group_name))}${infoItem("Hãng sản xuất", esc(DEVICE.manufacturer))}${infoItem("Model", esc(DEVICE.model))}${infoItem("Nước sản xuất", esc(DEVICE.country))}${infoItem("Năm sản xuất", esc(DEVICE.year_manufactured))}</div>
      <div class="info-section"><h3>Quản lý sử dụng</h3>${infoItem("Khoa/Phòng", esc(DEVICE.department_name))}${infoItem("Vị trí đặt máy", esc(DEVICE.location))}${infoItem("Năm sử dụng", esc(DEVICE.year_in_use))}${infoItem("Hạn bảo hành", esc(formatDateVN(DEVICE.warranty_end)))}${infoItem("Tình trạng", esc(DEVICE.status))}</div>
    `;
    return;
  }
  q("infoGeneral").innerHTML = `
    <div class="info-section"><h3>Định danh thiết bị</h3>${infoItem("Mã thiết bị", esc(DEVICE.device_code))}${infoItem("Mã bảo hiểm", esc(DEVICE.insurance_code))}${infoItem("Tên thiết bị", esc(DEVICE.name))}${infoItem("Serial hãng", esc(DEVICE.serial))}</div>
    <div class="info-section"><h3>Thông tin kỹ thuật</h3>${infoItem("Nhóm thiết bị", esc(DEVICE.group_name))}${infoItem("Hãng sản xuất", esc(DEVICE.manufacturer))}${infoItem("Model", esc(DEVICE.model))}${infoItem("Nước sản xuất", esc(DEVICE.country))}${infoItem("Năm sản xuất", esc(DEVICE.year_manufactured))}</div>
    <div class="info-section"><h3>Quản lý sử dụng</h3>${infoItem("Khoa/Phòng", esc(DEVICE.department_name))}${infoItem("Vị trí đặt máy", esc(DEVICE.location))}${infoItem("Năm sử dụng", esc(DEVICE.year_in_use))}${infoItem("Hạn bảo hành", esc(formatDateVN(DEVICE.warranty_end)))}${infoItem("Theo dõi KĐ/HC/ATBX", esc((DEVICE.inspection_required_types || []).join("; ") || "Không khai báo"))}</div>
    <div class="info-section"><h3>Tài chính / tình trạng</h3>${infoItem("Nguyên giá", esc(formatCurrency(DEVICE.cost)))}${infoItem("Nguồn kinh phí", esc(DEVICE.funding))}${infoItem("Tình trạng", esc(DEVICE.status))}${infoItem("Cấp chất lượng", DEVICE.quality_level ? `Cấp ${Number(DEVICE.quality_level)}` : "—")}${infoItem("Ghi chú", esc(DEVICE.note || "—"))}</div>
  `;
}
function renderTransfers() {
  const rows = DEVICE.transfers || [];
  renderRows("transferRows", rows, x => `<tr>
    <td>${formatDateTimeVN(x.transfer_datetime)}</td>
    <td><b>${esc(x.from_department_code||"—")}</b><div class="small">${esc(x.from_location||"")}</div></td>
    <td><b>${esc(x.to_department_code||"—")}</b><div class="small">${esc(x.to_location||"")}</div></td>
    <td class="wrap-text">${esc(x.reason||"")}</td>
    <td>${esc(x.actor||"")}</td>
    <td class="wrap-text">${esc(x.note||"")}</td>
  </tr>`, 6);
}
function technicalRecordHref(x) {
  const id=Number(x?.record_id || 0);
  if(!id) return "";
  const base="from=device-detail&device_id="+encodeURIComponent(DEVICE_ID);
  if(x.type==="Sự cố") return "/tickets.html?"+base+"&edit_id="+id;
  if(x.type==="Sửa chữa") return "/maintenance.html?"+base+"&repair_id="+id;
  if(x.type==="Bảo dưỡng") return "/inspection.html?"+base+"&edit_id="+id;
  return "/inspections.html?"+base+"&edit_id="+id;
}
function renderTechnicalHistory() {
  renderRows("technicalRows", TECH_HISTORY || [], x => {
    const href=technicalRecordHref(x);
    return `<tr>
      <td>${formatDateTimeVNLines(x.date)}</td>
      <td><b>${esc(x.type||"")}</b></td>
      <td><b>${esc(x.department_code||"—")}</b>${x.location ? `<div class="small">${esc(x.location)}</div>` : ""}</td>
      <td class="wrap-text">${esc(x.content||"")}</td>
      <td><span class="tag ${statusTagClass(x.status)}">${esc(x.status||"—")}</span></td>
      <td>${esc(x.person||"")}</td>
      <td>${href ? `<a class="btn btn-secondary btn-sm" href="${href}">Mở phiếu</a>` : "—"}</td>
    </tr>`;
  }, 7);
}
async function loadTechnicalHistory() {
  if (!q("technicalRows")) return;
  const from = q("techFromDate")?.value || "";
  const to = q("techToDate")?.value || "";
  const type = q("techType")?.value || "ALL";
  TECH_HISTORY = await api(`/api/devices/${DEVICE_ID}/technical-history?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&type=${encodeURIComponent(type)}`);
  renderTechnicalHistory();
}
function resetTransferForm() {
  q("transferForm").reset();
  q("transferDate").value = nowDateTimeLocalValue();
  q("transferDepartment").value = DEVICE.department_code || "";
  q("transferLocation").value = DEVICE.location || "";
  if(q("transferActor")) q("transferActor").value = window.QY4_AUTH_USER?.full_name || "";
  showForm("transferFormWrap", false);
}
async function saveTransfer(e) {
  e.preventDefault();
  if (DEVICE?.limited_view) return alert("Tài khoản khoa không được điều chuyển thiết bị.");
  const payload = {
    transfer_datetime: fromDateTimeLocalValue(q("transferDate").value),
    to_department_code: q("transferDepartment").value,
    to_location: q("transferLocation").value.trim(),
    actor: q("transferActor").value.trim(),
    reason: q("transferReason").value.trim(),
    note: q("transferNote").value.trim()
  };
  if (!payload.to_department_code) return alert("Vui lòng chọn khoa/phòng nhận.");
  if (!payload.reason) return alert("Vui lòng nhập lý do điều chuyển.");
  try{
    await api(`/api/devices/${DEVICE_ID}/transfer`, {method:"POST", body:JSON.stringify(payload)});
    showForm("transferFormWrap", false);
    await loadDevice();
  }catch(err){
    alert(err.message || "Không điều chuyển được thiết bị.");
  }
}

function renderAll() {
  q("detailName").textContent = DEVICE.name;
  q("detailMeta").innerHTML = `<b>Mã:</b> ${esc(DEVICE.device_code)} &nbsp; | &nbsp; <b>Khoa:</b> ${esc(DEVICE.department_name)} &nbsp; | &nbsp; <b>Nhóm:</b> ${esc(DEVICE.group_name)} &nbsp; | &nbsp; <b>Model:</b> ${esc(DEVICE.model || "—")}`;
  q("detailStatus").innerHTML = `<span class="tag ${statusTagClass(DEVICE.status)}">${esc(DEVICE.status||"—")}</span>`;
  if (DEVICE.limited_view) {
    document.querySelectorAll("[data-technical-history],[data-technical-write]").forEach(el => el.style.display="none");
    if(q("deviceCurrentState")) q("deviceCurrentState").innerHTML = `
      <div><span>Tình trạng</span><b><span class="tag ${statusTagClass(DEVICE.status)}">${esc(DEVICE.status||"—")}</span></b></div>
      <div><span>Vị trí</span><b>${esc(DEVICE.location || "—")}</b></div>
      <div><span>Hạn bảo hành</span><b>${esc(formatDateVN(DEVICE.warranty_end) || "—")}</b></div>`;
    renderGeneralInfo();
    return;
  }
  if (q("detailQrBtn")) q("detailQrBtn").onclick = () => showDeviceQrModal(DEVICE);
  const latestMaint = (DEVICE.maintenances || []).slice().sort((a,b)=>String(b.maintenance_date||"").localeCompare(String(a.maintenance_date||"")))[0];
  const latestInspection = (DEVICE.inspections || []).slice().sort((a,b)=>String(b.inspection_date||"").localeCompare(String(a.inspection_date||"")))[0];
  const openIncidents = (DEVICE.incidents || []).filter(x => ["Mới ghi nhận","Đã tiếp nhận"].includes(String(x.status||""))).length;
  const openRepairs = (DEVICE.repairs || []).filter(x => ["Đang xử lý","Chờ linh kiện","Mới tiếp nhận","Đang sửa chữa"].includes(String(x.processing_status||""))).length;
  if(q("deviceCurrentState")) q("deviceCurrentState").innerHTML = `
    <div><span>Tình trạng</span><b><span class="tag ${statusTagClass(DEVICE.status)}">${esc(DEVICE.status||"—")}</span></b></div>
    <div><span>Bảo dưỡng gần nhất</span><b>${latestMaint ? formatDateTimeVN(latestMaint.maintenance_date) : "—"}</b></div>
    <div><span>Kiểm định gần nhất</span><b>${latestInspection ? formatDateTimeVN(latestInspection.inspection_date) : "—"}</b></div>
    <div><span>Sự cố đang mở</span><b>${openIncidents}</b></div>
    <div><span>Phiếu sửa chữa</span><b>${openRepairs}</b></div>`;
  renderGeneralInfo();
  if (q("transferDepartment")) {
    q("transferDepartment").innerHTML = META.departments.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} - ${esc(x.name)}</option>`).join("");
    q("transferDepartment").value = DEVICE.department_code || "";
  }
  renderTransfers();
}
async function loadDevice() {
  DEVICE = await api(`/api/devices/${DEVICE_ID}`);
  if (!DEVICE.limited_view) META = await api("/api/meta");
  else META = {departments:[],groups:[]};
  renderAll();
  if (!DEVICE.limited_view) await loadTechnicalHistory();
  else TECH_HISTORY = [];
}
async function saveGeneral() {
  if (DEVICE?.limited_view) return alert("Tài khoản khoa chỉ được xem thông tin thiết bị.");
  const payload = {
    department_code: DEVICE.department_code,
    group_code: q("generalGroup").value,
    device_code: q("generalDeviceCode").value,
    insurance_code: q("generalInsuranceCode").value.trim(),
    name: q("generalName").value.trim(),
    manufacturer: q("generalManufacturer").value.trim(),
    model: q("generalModel").value.trim(),
    serial: q("generalSerial").value.trim(),
    country: q("generalCountry").value.trim(),
    year_manufactured: Number(q("generalYearManufactured").value || 0),
    year_in_use: Number(q("generalYearInUse").value || 0),
    warranty_end: q("generalWarranty").value,
    status: q("generalStatus").value,
    quality_level: Number(q("generalQuality").value || 3),
    inspection_required_types: generalInspectionRequirements(),
    cost: Number(q("generalCost").value || 0),
    funding: q("generalFunding").value.trim(),
    location: DEVICE.location || "",
    note: q("generalNote").value.trim()
  };
  if (!(await confirmDeviceDuplicate(payload, Number(DEVICE_ID || 0)))) return;
  await api(`/api/devices/${DEVICE_ID}`, { method: "PUT", body: JSON.stringify(payload) });
  toggleGeneral(false);
  await loadDevice();
}
function toggleGeneral(editing) {
  if (DEVICE?.limited_view) return;
  q("infoGeneral").style.display = editing ? "none" : "grid";
  q("generalForm").style.display = editing ? "block" : "none";
  q("editGeneralBtn").style.display = editing ? "none" : "inline-block";
  q("saveGeneralBtn").style.display = editing ? "inline-block" : "none";
  q("cancelGeneralBtn").style.display = editing ? "inline-block" : "none";
  if (editing) fillGeneralForm();
}
document.addEventListener("DOMContentLoaded", async () => {
  DEVICE_ID = new URL(window.location.href).searchParams.get("id");
  setLayout("devices","Thiết bị y tế","Thông tin thiết bị, công việc kỹ thuật và lịch sử điều chuyển");
  applyFieldLabels("generalForm", {
    generalDepartment:"Khoa sử dụng", generalGroup:"Nhóm thiết bị", generalName:"Tên thiết bị",
    generalDeviceCode:"Mã thiết bị", generalInsuranceCode:"Mã bảo hiểm", generalManufacturer:"Hãng sản xuất", generalModel:"Model", generalSerial:"Serial hãng",
    generalCountry:"Nước sản xuất", generalYearManufactured:"Năm sản xuất", generalYearInUse:"Năm sử dụng",
    generalWarranty:"Hạn bảo hành", generalStatus:"Tình trạng", generalQuality:"Cấp chất lượng hồ sơ (1–5)",
    generalCost:"Nguyên giá", generalFunding:"Nguồn kinh phí", generalLocation:"Vị trí đặt máy", generalNote:"Ghi chú / Nội dung"
  });
  if (q("techFromDate")) q("techFromDate").value = firstDayOfYearISO();
  if (q("techToDate")) q("techToDate").value = todayISO();
  await loadDevice();

  document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    q(btn.dataset.tab).classList.add("active");
  }));
  q("editGeneralBtn").onclick = () => toggleGeneral(true);
  q("saveGeneralBtn").onclick = saveGeneral;
  q("cancelGeneralBtn").onclick = () => toggleGeneral(false);


  if (q("techFilterBtn")) q("techFilterBtn").onclick = loadTechnicalHistory;
  if (q("techResetBtn")) q("techResetBtn").onclick = async () => {
    q("techFromDate").value = firstDayOfYearISO(); q("techToDate").value = todayISO(); q("techType").value = "ALL"; await loadTechnicalHistory();
  };
  if (q("toggleTransferBtn")) q("toggleTransferBtn").onclick = () => {
    resetTransferForm(); showForm("transferFormWrap", true); q("transferDate").value = nowDateTimeLocalValue();
  };
  if (q("cancelTransferBtn")) q("cancelTransferBtn").onclick = resetTransferForm;
  if (q("transferForm")) q("transferForm").addEventListener("submit", saveTransfer);
});
