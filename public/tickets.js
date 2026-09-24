let INCIDENT_ROWS = [];
let FILTERED_INCIDENTS = [];
let DEVICES = [];
function norm(value){ return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function esc(value){ return String(value ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }
function getDevice(id){ return DEVICES.find(d => Number(d.id) === Number(id)) || null; }
function deviceLabel(d){ return devicePickerLabel(d); }
function statusClass(v){ if(v==="Đã chuyển sửa chữa") return "green"; if(v==="Đã xử lý tại chỗ") return "blue"; if(v==="Đã tiếp nhận") return "orange"; if(v==="Mới ghi nhận") return "yellow"; return "gray"; }

function normalizeIncidentStatus(status, linkedRepairId){
  const raw = String(status || "").trim();
  if(raw === "Đã chuyển sửa chữa" || raw === "Chuyển sửa chữa" || raw === "Chờ linh kiện") return "Đã chuyển sửa chữa";
  if(raw === "Đã xử lý tại chỗ" || raw === "Đã xử lý" || raw === "Đóng" || raw === "Không cần sửa chữa") return "Đã xử lý tại chỗ";
  if(raw === "Đã tiếp nhận" || raw === "Tiếp nhận") return "Đã tiếp nhận";
  if(raw === "Mới ghi nhận" || raw === "Đã ghi nhận" || raw === "Theo dõi") return "Mới ghi nhận";
  const repairStatuses = ["Đang xử lý","Chờ linh kiện","Đã hoàn thành","Không sửa được","Mới tiếp nhận","Đang sửa chữa","Đang kiểm tra","Đã sửa xong","Bàn giao sử dụng","Hủy"];
  if(repairStatuses.includes(raw)) return linkedRepairId ? "Đã chuyển sửa chữa" : "Mới ghi nhận";
  return linkedRepairId ? "Đã chuyển sửa chữa" : "Mới ghi nhận";
}
function normalizeIncidentRow(r){ return { ...r, status: normalizeIncidentStatus(r.status, r.linked_repair_id) }; }
function fillDeviceMeta(){ const d=getDevice(q("deviceId").value); q("incidentDept").value=d?(d.department_code||d.department_name||""):""; q("incidentLocation").value=d?(d.location||""):""; }
function localDateTimeInputValue(){
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function resetIncidentForm(){
  q("incidentForm").reset();
  q("incidentId").value="";
  q("incidentFormTitle").textContent="Ghi nhận sự cố";
  q("saveIncidentBtn").textContent="Lưu sự cố";
  q("incidentTime").value = localDateTimeInputValue();
  q("status").value = "Mới ghi nhận";
  if(q("localResolutionNote")) q("localResolutionNote").value = "";
  toggleLocalResolutionField();
  q("reporter").value = (window.QY4_AUTH_USER?.role === "Người dùng khoa" ? (window.QY4_AUTH_USER?.full_name || "") : "");
  fillDeviceMeta();
}

function incidentActions(r){
  const id = Number(r.id);
  const deviceId = Number(r.device_id);
  const actions = [`<button class="btn btn-secondary" onclick="openDeviceProfile(${deviceId})">Xem HS</button>`];
  if (r.status === "Mới ghi nhận") {
    actions.push(`<button class="btn btn-primary" onclick="acknowledgeIncident(${id})">Tiếp nhận</button>`);
  } else if (r.status === "Đã tiếp nhận") {
    actions.push(`<button class="btn btn-primary" onclick="transferToRepair(${id})">Chuyển sửa chữa</button>`);
    actions.push(`<button class="btn" onclick="markOnsite(${id})">Xử lý tại chỗ</button>`);
  } else if (r.status === "Đã chuyển sửa chữa") {
    if (r.linked_repair_id) actions.push(`<button class="btn btn-primary" onclick="openLinkedRepair(${id})">Mở phiếu sửa chữa</button>`);
    else actions.push(`<button class="btn btn-primary" onclick="transferToRepair(${id})">Tạo phiếu sửa chữa</button>`);
  }
  return actions.join("");
}

function renderIncidentStats(rows){
  const stat = st => rows.filter(r => r.status === st).length;
  if(q("stTotalIncidents")) q("stTotalIncidents").textContent = rows.length;
  if(q("stNewIncidents")) q("stNewIncidents").textContent = stat("Mới ghi nhận");
  if(q("stAcceptedIncidents")) q("stAcceptedIncidents").textContent = stat("Đã tiếp nhận");
  if(q("stTransferIncidents")) q("stTransferIncidents").textContent = stat("Đã chuyển sửa chữa");
  if(q("stOnsiteIncidents")) q("stOnsiteIncidents").textContent = stat("Đã xử lý tại chỗ");
}
function toggleLocalResolutionField(){
  const show = q("status") && q("status").value === "Đã xử lý tại chỗ";
  const box = q("localResolutionField");
  if(box) box.style.display = show ? "flex" : "none";
  if(!show && q("localResolutionNote")) q("localResolutionNote").value = "";
}

function mediaCell(r){
  const files = Array.isArray(r.files) ? r.files : [];
  if (!files.length) return "";
  const img = files.find(f => String(f.file_mime||"").startsWith("image/"));
  const hasVideo = files.some(f => String(f.file_mime||"").startsWith("video/") || /\.(mp4|mov)$/i.test(f.original_name||""));
  const count = files.length;
  const thumb = img ? `<img class="media-thumb" src="${esc(img.file_path)}" alt="Ảnh sự cố" />` : "";
  const video = hasVideo ? `<span class="video-pill">Video</span>` : "";
  const more = count > 1 ? `<span class="media-count">+${count-1}</span>` : "";
  return `<button type="button" class="media-cell" onclick="openIncidentMedia(${Number(r.id)})">${thumb}${video}${more}</button>`;
}
function openIncidentMedia(id){
  const r = INCIDENT_ROWS.find(x => Number(x.id) === Number(id));
  const files = Array.isArray(r?.files) ? r.files : [];
  if (!files.length) return;
  q("mediaDialogBody").innerHTML = files.map(f => {
    const mime = String(f.file_mime||"");
    if (mime.startsWith("video/") || /\.(mp4|mov)$/i.test(f.original_name||"")) return `<div class="media-item"><video controls src="${esc(f.file_path)}"></video><a href="${esc(f.file_path)}" target="_blank">${esc(f.original_name||"Video")}</a></div>`;
    return `<div class="media-item"><img src="${esc(f.file_path)}" alt="Ảnh sự cố" /><a href="${esc(f.file_path)}" target="_blank">${esc(f.original_name||"Ảnh")}</a></div>`;
  }).join("");
  q("mediaDialog").showModal();
}
function validateMediaInput(){
  const input = q("incidentMedia");
  if(!input) return true;
  const files = Array.from(input.files || []);
  const images = files.filter(f => f.type.startsWith("image/"));
  const videos = files.filter(f => f.type.startsWith("video/") || /\.(mp4|mov)$/i.test(f.name));
  if(images.length > 5){ alert("Chỉ được tải tối đa 5 ảnh."); return false; }
  if(videos.length > 1){ alert("Chỉ được tải tối đa 1 video."); return false; }
  if(images.some(f => f.size > 5*1024*1024)){ alert("Mỗi ảnh tối đa 5MB."); return false; }
  if(videos.some(f => f.size > 30*1024*1024)){ alert("Video tối đa 30MB."); return false; }
  return true;
}
function buildIncidentFormData(payload){
  const fd = new FormData();
  Object.entries(payload).forEach(([k,v]) => fd.append(k, v ?? ""));
  Array.from(q("incidentMedia")?.files || []).forEach(f => fd.append("media", f));
  return fd;
}
async function apiForm(url, options={}){
  const res = await fetch(url, options);
  if(res.status===401){
    location.href=`/login.html?next=${encodeURIComponent(location.pathname+location.search)}`;
    throw new Error("Cần đăng nhập.");
  }
  if(!res.ok){
    const raw=await res.text();
    try{const obj=JSON.parse(raw); throw new Error(obj.error||raw);}catch(e){if(e instanceof SyntaxError) throw new Error(raw); throw e;}
  }
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return text; }
}
function currentTechnicalActor(){
  return window.QY4_AUTH_USER?.full_name || "";
}
function sourceTagClass(source){
  if(source==="QR") return "green";
  if(source==="Nhập trực tiếp") return "blue";
  return "gray";
}

function renderRows(rows){
  q("countLabel").textContent = `${rows.length} sự cố`;
  renderIncidentStats(rows);
  if(!rows.length){ q("rows").innerHTML = `<tr><td colspan="10" class="center-empty">Chưa có sự cố phù hợp.</td></tr>`; return; }
  q("rows").innerHTML = rows.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${formatDateTimeVNLines(r.incident_datetime)}</td>
      <td>${technicalDeviceCell(r)}</td>
      <td>${technicalLocationCell(r)}</td>
      <td class="wrap-text">${esc(r.description || "")}</td>
      <td><span class="tag ${sourceTagClass(r.source_channel)}">${esc(r.source_channel || "Không xác định")}</span></td>
      <td>${esc(r.reporter || "")}</td>
      <td><span class="tag ${statusClass(r.status)}">${esc(r.status || "")}</span></td>
      <td>${mediaCell(r)}</td>
      <td><div class="table-actions compact-actions">${incidentActions(r)}</div></td>
    </tr>`).join("");
}
function applyFilter(){
  const text=norm(q("searchInput").value); const from=q("fromDate").value; const to=q("toDate").value; const dev=q("deviceFilter").value; const st=q("statusFilter").value; const source=q("sourceFilter").value;
  const rows=INCIDENT_ROWS.filter(r => inDateRange(String(r.incident_datetime||"").slice(0,10), from, to) && (dev==="ALL"||String(r.device_id)===dev) && (st==="ALL"||r.status===st) && (source==="ALL"||String(r.source_channel||"Không xác định")===source) && (!text || norm([r.device_code,r.device_name,r.description,r.reporter,r.status,r.source_channel,r.acknowledged_by,r.note].join(" ")).includes(text))).sort((a,b)=>String(b.incident_datetime||"").localeCompare(String(a.incident_datetime||"")) || Number(b.id)-Number(a.id));
  FILTERED_INCIDENTS=rows; renderRows(rows);
}
function clearFilters(){ q("searchInput").value=""; q("deviceFilter").value="ALL"; q("statusFilter").value="ALL"; q("sourceFilter").value="ALL"; setDefaultDateRange(); applyFilter(); }
function openDeviceProfile(id){ if(id) window.location.href = `/device-detail.html?id=${id}&from=tickets`; }
function editIncident(id){ const r=INCIDENT_ROWS.find(x=>Number(x.id)===Number(id)); if(!r) return; q("incidentId").value=r.id; setDevicePickerSelection("deviceSearch","deviceId",DEVICES,r.device_id,()=>fillDeviceMeta()); q("incidentTime").value=String(r.incident_datetime||"").replace(" ","T").slice(0,16); q("description").value=r.description||""; q("reporter").value=r.reporter||""; q("status").value=r.status||"Mới ghi nhận"; q("localResolutionNote").value=r.local_resolution_note||""; if(q("reporterPhone")) q("reporterPhone").value=r.reporter_phone||""; q("note").value=r.note||""; q("incidentFormTitle").textContent="Cập nhật sự cố"; q("saveIncidentBtn").textContent="Cập nhật sự cố"; q("incidentForm").scrollIntoView({behavior:"smooth"}); }
async function deleteIncident(id){
  if(!confirm("Chỉ xóa bản ghi sự cố tạo nhầm khi CHƯA tiếp nhận và CHƯA chuyển sửa chữa. Hồ sơ đã có xử lý sẽ được giữ lại. Tiếp tục xóa bản ghi nhầm này?")) return;
  try{
    await api(`/api/incidents/${id}`, {method:"DELETE"});
    await loadData();
  }catch(e){ alert(e.message || "Không thể xóa sự cố này."); }
}
async function acknowledgeIncident(id){
  const r=INCIDENT_ROWS.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  try{
    await api(`/api/incidents/${id}/acknowledge`,{method:"POST",body:JSON.stringify({actor:currentTechnicalActor()})});
    await fetchIncidentRows(); applyFilter();
  }catch(e){alert(e.message||"Không tiếp nhận được sự cố.");}
}
async function transferToRepair(id){
  const r=INCIDENT_ROWS.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  if(!confirm(`Tạo phiếu sửa chữa từ sự cố #${id}? Sau khi tạo, sự cố sẽ chuyển trạng thái “Đã chuyển sửa chữa”.`)) return;
  try {
    const res = await api(`/api/incidents/${id}/transfer-repair`, {method:"POST", body:JSON.stringify({actor:currentTechnicalActor()})});
    if (res && res.repair_id) {
      window.location.href = `/maintenance.html?repair_id=${encodeURIComponent(res.repair_id)}&from=tickets`;
      return;
    }
    await loadData();
  } catch(e) { alert(e.message || "Không chuyển được sự cố sang sửa chữa."); }
}
async function markOnsite(id){
  const r=INCIDENT_ROWS.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  const detail = prompt("Nhập nội dung xử lý tại chỗ (bắt buộc):\nVí dụ: Kiểm tra nguồn, bật lại CB điện, máy hoạt động bình thường.", r.local_resolution_note || "");
  if(detail === null) return;
  if(!detail.trim()) return alert("Vui lòng nhập nội dung xử lý tại chỗ.");
  const payload={...r, status:"Đã xử lý tại chỗ", local_resolution_note: detail.trim()};
  await api(`/api/incidents/${id}`, {method:"PUT", body:JSON.stringify(payload)});
  await loadData();
}
async function openLinkedRepair(id){
  const incident = INCIDENT_ROWS.find(x => Number(x.id) === Number(id));
  let repairId = incident?.linked_repair_id;
  if (!repairId) {
    const repairs = await api('/api/repairs');
    const repair = repairs.find(x => Number(x.incident_id || x.source_incident_id) === Number(id));
    repairId = repair?.id;
  }
  if (repairId) window.location.href = `/maintenance.html?repair_id=${encodeURIComponent(repairId)}&from=tickets`;
  else alert('Chưa tìm thấy phiếu sửa chữa liên kết.');
}
async function fetchIncidentRows(){
  const from = q("fromDate")?.value || "1900-01-01";
  const to = q("toDate")?.value || "2999-12-31";
  INCIDENT_ROWS = (await api(`/api/incidents?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}`)).map(normalizeIncidentRow);
}
async function saveIncident(e){
  e.preventDefault();
  const payload={
    device_id:Number(q("deviceId").value),
    incident_datetime:fromDateTimeLocalValue(q("incidentTime").value),
    description:q("description").value.trim(),
    severity:"Trung bình",
    reporter:q("reporter").value.trim(),
    reporter_phone:(q("reporterPhone")?.value.trim() || ""),
    status:(q("status").value === "Đã xử lý tại chỗ" ? "Đã xử lý tại chỗ" : (q("status").value === "Đã tiếp nhận" ? "Đã tiếp nhận" : "Mới ghi nhận")),
    note:q("note").value.trim(),
    local_resolution_note:q("localResolutionNote").value.trim()
  };
  if(!payload.device_id) return alert("Vui lòng chọn thiết bị.");
  if(!payload.incident_datetime) return alert("Vui lòng nhập thời gian ghi nhận.");
  if(!payload.description) return alert("Vui lòng nhập mô tả sự cố.");
  if(!payload.reporter) return alert("Vui lòng nhập đúng người báo sự cố.");
  if(payload.status === "Đã xử lý tại chỗ" && !payload.local_resolution_note) return alert("Vui lòng nhập nội dung xử lý tại chỗ.");
  if(!validateMediaInput()) return;
  const id=q("incidentId").value;
  const formData = buildIncidentFormData(payload);
  try {
    const result = id
      ? await apiForm(`/api/incidents/${id}`, {method:"PUT", body:formData})
      : await apiForm("/api/incidents", {method:"POST", body:formData});

    // Bảo đảm bản ghi vừa tạo luôn nằm trong khoảng lọc hiện tại.
    const d = String(payload.incident_datetime).slice(0,10);
    if(q("fromDate").value && d < q("fromDate").value) q("fromDate").value = d;
    if(q("toDate").value && d > q("toDate").value) q("toDate").value = d;

    if (!id && result?.row) {
      INCIDENT_ROWS = [normalizeIncidentRow(result.row), ...INCIDENT_ROWS.filter(x => Number(x.id) !== Number(result.id))];
    } else {
      await fetchIncidentRows();
    }
    applyFilter();
    resetIncidentForm();
    alert(id ? "Đã cập nhật sự cố." : `Đã lưu sự cố${result?.id ? " #" + result.id : ""}. Bản ghi đã hiển thị trong bảng.`);
  } catch(err) {
    console.error("saveIncident error", err);
    alert(`Không lưu được sự cố: ${err.message || err}`);
  }
}
async function loadData(){
  DEVICES=await api("/api/devices");
  await fetchIncidentRows();
  q("deviceFilter").innerHTML=`<option value="ALL">Tất cả thiết bị</option>`+DEVICES.map(d=>`<option value="${d.id}">${esc(deviceLabel(d))}</option>`).join("");
  bindDevicePicker("deviceSearch","deviceId","incidentDeviceOptions",DEVICES,()=>fillDeviceMeta());
  const params = new URLSearchParams(window.location.search);
  const presetDeviceId = params.get("device_id");
  if (presetDeviceId && DEVICES.some(d => String(d.id) === String(presetDeviceId))) setDevicePickerSelection("deviceSearch","deviceId",DEVICES,presetDeviceId,()=>fillDeviceMeta());
  fillDeviceMeta();
  applyFilter();
}
async function openIncidentFromUrl(){
  const editId = Number(new URLSearchParams(window.location.search).get("edit_id") || 0);
  if(!editId) return false;
  let row = INCIDENT_ROWS.find(x => Number(x.id) === editId);
  if(!row){
    const allRows = (await api("/api/incidents")).map(normalizeIncidentRow);
    row = allRows.find(x => Number(x.id) === editId);
  }
  if(!row){
    alert("Không tìm thấy sự cố cần mở.");
    return false;
  }
  const d = String(row.incident_datetime || "").slice(0,10);
  if(d){
    q("fromDate").value = d;
    q("toDate").value = d;
    await fetchIncidentRows();
    applyFilter();
  } else if(!INCIDENT_ROWS.some(x => Number(x.id) === editId)) {
    INCIDENT_ROWS = [row, ...INCIDENT_ROWS];
    applyFilter();
  }
  editIncident(editId);
  return true;
}
async function exportIncidentsExcel(){ const rows=FILTERED_INCIDENTS.map((r,i)=>({"STT":i+1,"Thời gian báo":r.incident_datetime,"Thời điểm tiếp nhận":r.acknowledged_at||"","Thời gian phản hồi (phút)":r.response_minutes??"","Thời điểm hoàn thành sửa chữa":r.linked_repair_completed_at||"","Tổng thời gian xử lý (phút)":r.resolution_minutes??"","Mã thiết bị":r.device_code,"Tên thiết bị":r.device_name,"Khoa":r.department_name||r.department_code||"","Vị trí":r.location,"Mô tả sự cố":r.description,"Nguồn báo":r.source_channel||"Không xác định","Người báo":r.reporter,"Người tiếp nhận":r.acknowledged_by||"","Trạng thái sự cố":r.status,"Số điện thoại":r.reporter_phone||"","Nội dung xử lý tại chỗ":r.local_resolution_note || "","Ghi chú":r.note})); await exportXlsx(`su_co_${todayISO()}.xlsx`,[{name:"SuCo",rows}]); }
document.addEventListener("DOMContentLoaded", async()=>{ setLayout("tickets","Sự cố","Tiếp nhận, theo dõi và xử lý ticket sự cố thiết bị"); setDefaultDateRange(); await loadData(); const openedFromHistory=await openIncidentFromUrl(); if(!openedFromHistory) resetIncidentForm(); q("status").addEventListener("change", toggleLocalResolutionField); toggleLocalResolutionField(); q("incidentForm").addEventListener("submit", saveIncident); q("resetIncidentBtn").onclick=resetIncidentForm; q("newIncidentBtn").onclick=()=>q("incidentForm").scrollIntoView({behavior:"smooth"}); q("filterBtn").onclick=async()=>{ await fetchIncidentRows(); applyFilter(); }; q("clearFilterBtn").onclick=clearFilters; ["searchInput","deviceFilter","statusFilter","sourceFilter"].forEach(id=>{ const el=q(id); el.addEventListener("input", applyFilter); el.addEventListener("change", applyFilter); });
  ["fromDate","toDate"].forEach(id=>{ const el=q(id); el.addEventListener("change", async()=>{ await fetchIncidentRows(); applyFilter(); }); }); q("exportIncidentExcelBtn").onclick=exportIncidentsExcel; });
