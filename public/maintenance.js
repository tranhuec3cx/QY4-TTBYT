let REPAIR_ROWS = [];
let FILTERED_REPAIRS = [];
let DEVICES = [];
let META = { departments: [], groups: [] };

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
}
function normalizeRepairStatus(status) {
  const raw = String(status || "").trim();
  if (["Đang xử lý", "Đang kiểm tra", "Đang xử lý", "Đang xử lý"].includes(raw)) return "Đang xử lý";
  if (raw === "Chờ linh kiện") return "Chờ linh kiện";
  if (["Đã sửa xong", "Bàn giao sử dụng", "Đã hoàn thành", "Hoàn thành"].includes(raw)) return "Đã hoàn thành";
  if (["Không sửa được", "Hủy"].includes(raw)) return "Không sửa được";
  return "Đang xử lý";
}
function getDevice(id) {
  return DEVICES.find(d => Number(d.id) === Number(id)) || null;
}
function deviceLabel(d) {
  return devicePickerLabel(d);
}
function syncRepairDeviceStatus(){
  const status=normalizeRepairStatus(q("repairStatus")?.value || "Đang xử lý");
  const select=q("statusAfter");
  if(!select) return;
  if(status==="Đã hoàn thành"){
    select.disabled=false;
    if(!["Đang hoạt động","Hoạt động hạn chế"].includes(select.value)) select.value="Đang hoạt động";
  }else if(status==="Không sửa được"){
    select.value="Ngừng hoạt động";
    select.disabled=true;
  }else{
    select.value="Chờ sửa chữa";
    select.disabled=true;
  }
}

function repairStatusClass(status) {
  const st = normalizeRepairStatus(status);
  if (st === "Đã hoàn thành") return "green";
  if (st === "Đang xử lý" || st === "Chờ linh kiện") return "orange";
  if (st === "Không sửa được") return "red";
  return "gray";
}
function setSelectedDevice(device) {
  q("selectedDeviceId").value = device ? device.id : "";
  q("repairDeviceName").value = device ? (device.name || "") : "";
  q("repairDeviceCode").value = device ? (device.device_code || "") : "";
  q("repairDept").value = device ? (device.department_code || device.department_name || "") : "";
  q("repairLocation").value = device ? (device.location || "") : "";
  q("repairModel").value = device ? (device.model || "") : "";
  q("repairSerial").value = device ? (device.serial || "") : "";
}
function clearSelectedDevice() {
  q("repairDeviceSearch").value = "";
  setSelectedDevice(null);
}
function resetRepairForm() {
  q("repairForm").reset();
  q("repairId").value = "";
  q("sourceIncidentId").value = "";
  q("repairDeviceSearch").readOnly = false;
  clearSelectedDevice();
  q("repairDialogTitle").textContent = "Tạo phiếu sửa chữa";
  q("repairDialogSubtitle").textContent = "Nhập hoặc chỉnh sửa thông tin phiếu sửa chữa thiết bị y tế";
  q("sourceBadge").style.display = "none";
  q("prefillNotice").style.display = "none";
  q("saveRepairBtn").textContent = "Lưu phiếu";
  q("cost").value = 0;
  q("repairDate").value = nowDateTimeLocalValue();
  q("person").value = window.QY4_AUTH_USER?.full_name || "";
  q("reporter").value = window.QY4_AUTH_USER?.full_name || "";
  q("priority").value = "Bình thường";
  if (q("actionTime")) q("actionTime").value = nowDateTimeLocalValue();
  if (q("saveHistory")) q("saveHistory").checked = true;
}
function openRepairDialog(mode = "create") {
  if (mode === "create") resetRepairForm();
  q("repairDialog").showModal();
}
function closeRepairDialog() {
  q("repairDialog").close();
}
function renderStats(rows) {
  const count = rows.length;
  const stat = (name) => rows.filter(r => normalizeRepairStatus(r.processing_status) === name).length;
  const cost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const cards = [
    ["Tổng phiếu", count],
    ["Đang xử lý", stat("Đang xử lý")],
    ["Chờ linh kiện", stat("Chờ linh kiện")],
    ["Đã hoàn thành", stat("Đã hoàn thành")],
    ["Không sửa được", stat("Không sửa được")],
    ["Tổng chi phí", formatCurrency(cost)]
  ];
  q("repairStats").innerHTML = cards.map(([label, value]) => `<div class="stat-card repair-stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
function renderRows(rows) {
  q("countLabel").textContent = `${rows.length} bản ghi`;
  if (!rows.length) {
    q("rows").innerHTML = `<tr><td colspan="12" class="center-empty">Chưa có phiếu sửa chữa phù hợp.</td></tr>`;
    return;
  }
  q("rows").innerHTML = rows.map((r, i) => `
    <tr id="repair-row-${Number(r.id)}">
      <td>${i + 1}</td>
      <td>${formatDateTimeVNLines(r.received_at || r.repair_date)}</td>
      <td>${technicalDeviceCell(r)}</td>
      <td>${technicalLocationCell(r)}</td>
      <td class="wrap-text">${esc(r.issue || "")}</td>
      <td class="wrap-text">${esc(r.work || "")}</td>
      <td>${esc(r.person || "")}</td>
      <td><span class="tag ${repairStatusClass(r.processing_status)}">${esc(normalizeRepairStatus(r.processing_status))}</span></td>
      <td>${esc(r.method || "")}</td>
      <td>${formatCurrency(r.cost)}</td>
      <td>${esc(r.result || "")}<div class="small">${esc(r.status_after || "")}</div></td>
      <td>
        <div class="table-actions compact-actions">
          <button class="btn btn-secondary" onclick="openDeviceProfile(${Number(r.device_id)})">Xem HS</button>
          <button class="btn" onclick="editRepair(${Number(r.id)})">Cập nhật</button>
          <button class="btn" onclick="showRepairHistory(${Number(r.id)})">Lịch sử</button>
          ${!r.incident_id && normalizeRepairStatus(r.processing_status)==="Đang xử lý" ? `<button class="btn btn-danger" onclick="deleteRepair(${Number(r.id)})">Xóa</button>` : ""}
        </div>
      </td>
    </tr>`).join("");
}
function openDeviceProfile(id) {
  if (id) window.location.href = `/device-detail.html?id=${id}&from=maintenance`;
}
function applyFilter() {
  const text = norm(q("searchInput").value);
  const from = q("fromDate").value;
  const to = q("toDate").value;
  const dep = q("departmentFilter").value;
  const group = q("groupFilter").value;
  const device = q("deviceFilter").value;
  const status = q("repairStatusFilter").value;
  const method = q("methodFilter").value;
  const rows = REPAIR_ROWS.filter(r =>
    inDateRange(r.received_at || r.repair_date, from, to) &&
    (dep === "ALL" || r.department_code === dep) &&
    (group === "ALL" || r.group_code === group) &&
    (device === "ALL" || String(r.device_id) === device) &&
    (status === "ALL" || normalizeRepairStatus(r.processing_status) === status) &&
    (method === "ALL" || (r.method || "") === method) &&
    (!text || norm([r.device_code, r.device_name, r.model, r.serial, r.issue, r.work, r.person, r.processing_status].join(" ")).includes(text))
  ).sort((a,b) => String(b.received_at || b.repair_date || "").localeCompare(String(a.received_at || a.repair_date || "")) || Number(b.id) - Number(a.id));
  FILTERED_REPAIRS = rows;
  renderStats(rows);
  renderRows(rows);
}
function clearFilters() {
  q("searchInput").value = "";
  q("departmentFilter").value = "ALL";
  q("groupFilter").value = "ALL";
  q("deviceFilter").value = "ALL";
  q("repairStatusFilter").value = "ALL";
  q("methodFilter").value = "ALL";
  setDefaultDateRange();
  applyFilter();
}
function editRepair(id) {
  const r = REPAIR_ROWS.find(x => Number(x.id) === Number(id));
  if (!r) return;
  resetRepairForm();
  q("repairDialogTitle").textContent = "Cập nhật phiếu sửa chữa";
  q("repairDialogSubtitle").textContent = "Chỉnh sửa thông tin phiếu sửa chữa đã lưu";
  q("saveRepairBtn").textContent = "Cập nhật phiếu";
  q("repairId").value = r.id;
  q("sourceIncidentId").value = r.source_incident_id || r.incident_id || "";
  if (r.source_incident_id || r.incident_id) {
    q("sourceBadge").textContent = `Nguồn: Sự cố #${r.source_incident_id || r.incident_id}`;
    q("sourceBadge").style.display = "inline-flex";
  }
  const d = getDevice(r.device_id) || r;
  q("repairDeviceSearch").value = deviceLabel(d);
  setSelectedDevice(d);
  q("repairDeviceSearch").readOnly = true;
  q("repairDate").value = toDateTimeLocalValue(r.received_at || r.repair_date || "");
  if (q("actionTime")) q("actionTime").value = nowDateTimeLocalValue();
  if (q("saveHistory")) q("saveHistory").checked = true;
  q("issue").value = r.issue || "";
  q("work").value = r.work || "";
  q("person").value = r.person || "";
  q("priority").value = r.priority || "Bình thường";
  q("reporter").value = r.reporter || "";
  q("note").value = r.note || "";
  q("method").value = r.method || "Nội bộ";
  q("cost").value = r.cost || 0;
  q("result").value = r.result || "";
  q("statusAfter").value = r.status_after || "Đang hoạt động";
  q("repairStatus").value = normalizeRepairStatus(r.processing_status);
  syncRepairDeviceStatus();
  if (normalizeRepairStatus(r.processing_status)==="Đã hoàn thành" && ["Đang hoạt động","Hoạt động hạn chế"].includes(r.status_after)) q("statusAfter").value=r.status_after;
  openRepairDialog("edit");
}
async function deleteRepair(id) {
  const r=REPAIR_ROWS.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  if (!confirm(`Xóa phiếu sửa chữa #${id}? Thiết bị sẽ được khôi phục trạng thái trước khi tạo phiếu: ${r.status_before || "chưa xác định"}.`)) return;
  try{
    await api(`/api/repairs/${id}`, { method: "DELETE" });
    await loadData();
  }catch(e){
    alert(e.message || "Không xóa được phiếu sửa chữa.");
  }
}
function repairHistoryTypeLabel(r) {
  const t = r.entry_type || r.action_type || "Cập nhật";
  if (t.includes("Tự động") || r.action_type === "Tạo từ sự cố") return "🤖 Tự động";
  if (t.includes("Hoàn thành") || r.action_type === "Hoàn thành") return "👤 Hoàn thành";
  return "👤 Cập nhật";
}
function repairTimelineDotClass(status) {
  const s = normalizeRepairStatus(status || "Đang xử lý");
  if (s === "Đã hoàn thành") return "done";
  if (s === "Chờ linh kiện") return "waiting";
  if (s === "Không sửa được") return "failed";
  return "active";
}
function renderRepairTimeline(rows, repair = {}) {
  if (!rows.length) return `<div class="center-empty">Chưa có lịch sử xử lý.</div>`;
  return rows.map((r) => {
    const status = normalizeRepairStatus(r.new_status || r.old_status || repair.processing_status || "Đang xử lý");
    const cost = Number(r.cost ?? repair.cost ?? 0);
    return `
      <div class="timeline-item ${repairTimelineDotClass(status)}">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-head">
            <div>
              <div class="timeline-time">${formatDateTimeVN(r.action_time)}</div>
              <div class="timeline-actor">Thực hiện bởi: ${esc(r.actor || "Hệ thống")}</div>
            </div>
            <span class="tag ${repairStatusClass(status)}">${esc(status)}</span>
          </div>
          <div class="timeline-content">${esc(r.note || r.action_type || "")}</div>
          <div class="timeline-meta">
            <span>Chi phí: <b>${formatCurrency(cost)}</b></span>
            <span>${esc(repairHistoryTypeLabel(r))}</span>
          </div>
        </div>
      </div>`;
  }).join("");
}
async function showRepairHistory(id) {
  const rows = await api(`/api/repairs/${id}/history`);
  const repair = REPAIR_ROWS.find(x => Number(x.id) === Number(id)) || {};
  q("repairHistoryBody").innerHTML = renderRepairTimeline(rows, repair);
  q("repairHistoryDialog").showModal();
}
async function saveRepair(e) {
  e.preventDefault();
  const deviceId = Number(q("selectedDeviceId").value);
  if (!deviceId) return alert("Vui lòng chọn thiết bị trước khi lưu phiếu sửa chữa.");
  if (!q("repairDate").value) return alert("Vui lòng nhập thời gian tiếp nhận.");
  if (!q("issue").value.trim()) return alert("Vui lòng nhập tình trạng/nguyên nhân hỏng.");
  const payload = {
    device_id: deviceId,
    repair_date: fromDateTimeLocalValue(q("repairDate").value),
    received_at: fromDateTimeLocalValue(q("repairDate").value),
    issue: q("issue").value.trim(),
    work: q("work").value.trim(),
    person: q("person").value.trim(),
    priority: q("priority").value,
    reporter: q("reporter").value.trim(),
    note: q("note").value.trim(),
    method: q("method").value,
    cost: Number(q("cost").value || 0),
    result: q("result").value.trim(),
    status_after: (() => {
      const s = normalizeRepairStatus(q("repairStatus").value);
      if (s === "Không sửa được") return "Ngừng hoạt động";
      if (s === "Đang xử lý" || s === "Chờ linh kiện") return "Chờ sửa chữa";
      return ["Đang hoạt động","Hoạt động hạn chế"].includes(q("statusAfter").value) ? q("statusAfter").value : "Đang hoạt động";
    })(),
    processing_status: normalizeRepairStatus(q("repairStatus").value),
    action_time: q("actionTime") ? fromDateTimeLocalValue(q("actionTime").value) : "",
    skip_history: q("saveHistory") ? !q("saveHistory").checked : false
  };
  const id = q("repairId").value;
  if (id) await api(`/api/repairs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  else {
    await api("/api/repairs", { method: "POST", body: JSON.stringify(payload) });
  }
  closeRepairDialog();
  await loadData();
}
async function loadData() {
  DEVICES = await api("/api/devices");
  REPAIR_ROWS = (await api("/api/repairs")).map(r => ({ ...r, processing_status: normalizeRepairStatus(r.processing_status) }));
  META = await api("/api/meta");
  q("departmentFilter").innerHTML = `<option value="ALL">Tất cả khoa/phòng</option>` + (META.departments || []).map(d => `<option value="${d.code}">${esc(d.code)} - ${esc(d.name)}</option>`).join("");
  q("groupFilter").innerHTML = `<option value="ALL">Tất cả nhóm thiết bị</option>` + (META.groups || []).map(g => `<option value="${g.code}">${esc(g.code)} - ${esc(g.name)}</option>`).join("");
  q("deviceFilter").innerHTML = `<option value="ALL">Tất cả thiết bị</option>` + DEVICES.map(d => `<option value="${d.id}">${esc(deviceLabel(d))}</option>`).join("");
  bindDevicePicker("repairDeviceSearch","selectedDeviceId","deviceOptions",DEVICES,(d)=>setSelectedDevice(d));
  applyFilter();
}
function openRepairFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const repairId = params.get("repair_id");
  if (!repairId) return;
  const row = REPAIR_ROWS.find(x => Number(x.id) === Number(repairId));
  if (!row) {
    alert("Không tìm thấy phiếu sửa chữa liên kết.");
    return;
  }
  // Mở đúng phiếu sửa chữa; đồng thời đánh dấu dòng để người dùng không phải tự tìm.
  setTimeout(() => {
    const tr = document.getElementById(`repair-row-${Number(repairId)}`);
    if (tr) {
      tr.classList.add("highlight-row");
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
  editRepair(Number(repairId));
}

async function exportRepairsExcel() {
  const rows = FILTERED_REPAIRS.map((r, i) => ({
    "STT": i + 1,
    "Thời gian tiếp nhận": r.received_at || r.repair_date || "",
    "Mã thiết bị": r.device_code || "",
    "Tên thiết bị": r.device_name || "",
    "Khoa/phòng": r.department_name || r.department_code || "",
    "Vị trí": r.location || "",
    "Mức độ ưu tiên": r.priority || "",
    "Người báo / ghi nhận": r.reporter || "",
    "Nguyên nhân hỏng": r.issue || "",
    "Nội dung sửa chữa": r.work || "",
    "Người thực hiện": r.person || "",
    "Trạng thái xử lý": r.processing_status || "",
    "Hình thức": r.method || "",
    "Kinh phí": r.cost || 0,
    "Kết quả": r.result || "",
    "TTTB sau sửa": r.status_after || "",
    "Ghi chú": r.note || ""
  }));
  await exportXlsx(`bao_cao_sua_chua_${todayISO()}.xlsx`,[{name:"SuaChua",rows}]);
}

document.addEventListener("DOMContentLoaded", async () => {
  setLayout("maintenance", "Sửa chữa thiết bị", "Theo dõi phiếu sửa chữa, tình trạng xử lý và chi phí khắc phục sự cố thiết bị");
  setDefaultDateRange();
  await loadData();
  openRepairFromUrl();
  q("createRepairBtn").onclick = () => openRepairDialog("create");
  q("closeRepairDialogBtn").onclick = closeRepairDialog;
  q("cancelRepairBtn").onclick = closeRepairDialog;
  q("repairForm").addEventListener("submit", saveRepair);
  q("repairStatus").addEventListener("change", syncRepairDeviceStatus);
  syncRepairDeviceStatus();
  ["filterBtn","searchInput","fromDate","toDate","departmentFilter","groupFilter","deviceFilter","repairStatusFilter","methodFilter"].forEach(id => {
    const el = q(id); if (!el) return;
    el.addEventListener(id === "filterBtn" ? "click" : "input", applyFilter);
    el.addEventListener("change", applyFilter);
  });
  q("clearFilterBtn").onclick = clearFilters;
  q("exportRepairExcelBtn").onclick = exportRepairsExcel;
  q("closeRepairHistoryBtn").onclick = () => q("repairHistoryDialog").close();
});
