function dashEsc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch] || ch));
}
function dashNorm(value){
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
}
function dashDateISO(date=new Date()){
  const d=new Date(date), pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function dashShiftDays(days){
  const d=new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+Number(days||0));
  return dashDateISO(d);
}
function dashFmtDate(value){
  const s=String(value || "").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y,m,d]=s.split("-");
  return `${d}/${m}/${y}`;
}
function dashFmtDateTime(value){
  if(!value) return "—";
  if(typeof formatDateTimeVN==="function") return formatDateTimeVN(value);
  return String(value).replace("T"," ").slice(0,16);
}
function dashDaysBetween(from,to){
  if(!from || !to) return 0;
  const a=new Date(`${String(from).slice(0,10)}T12:00:00`);
  const b=new Date(`${String(to).slice(0,10)}T12:00:00`);
  return Math.round((b-a)/86400000);
}
function dashCanonicalType(value,fallback="Không phân loại"){
  const raw=String(value || "").trim();
  const key=dashNorm(raw);
  if(!key) return fallback;
  if(key==="atbx" || key.includes("an toan buc xa")) return "Kiểm định an toàn bức xạ";
  if(key.includes("kiem xa")) return "Kiểm xạ";
  if(key.includes("hieu chuan")) return "Hiệu chuẩn";
  if(key.includes("kiem dinh")) return "Kiểm định";
  if(key==="bao duong" || key==="bao duong dinh ky") return "Bảo dưỡng định kỳ";
  return raw;
}
function dashLatestByDeviceType(rows,dateField,fallback){
  const map=new Map();
  for(const row of rows || []){
    const deviceId=Number(row.device_id || 0);
    if(!deviceId || Number(row.is_archived || 0)) continue;
    const type=dashCanonicalType(row.type,fallback);
    const key=`${deviceId}|${type}`;
    const rowKey=`${String(row?.[dateField] || "")}|${String(Number(row.id||0)).padStart(12,"0")}`;
    const old=map.get(key);
    const oldKey=old ? `${String(old?.[dateField] || "")}|${String(Number(old.id||0)).padStart(12,"0")}` : "";
    if(!old || rowKey>oldKey) map.set(key,{...row,schedule_type:type});
  }
  return Array.from(map.values());
}
function dashPriorityClass(priority){
  if(priority==="Khẩn") return "red";
  if(priority==="Cao") return "orange";
  return "gray";
}
function dashPriorityRank(priority){
  return priority==="Khẩn" ? 0 : priority==="Cao" ? 1 : 2;
}
function dashOpenRepair(status){
  return ["Đang xử lý","Đang sửa chữa","Đang kiểm tra","Chờ linh kiện","Mới tiếp nhận"].includes(String(status || "").trim());
}
function dashTaskAge(date){
  const raw=String(date || "").slice(0,10);
  if(!raw) return "—";
  const days=Math.max(0,dashDaysBetween(raw,dashDateISO()));
  if(days===0) return "Hôm nay";
  return `${days} ngày`;
}
function dashIncidentPriority(row){
  const severity=dashNorm(row.severity);
  if(severity.includes("khan")) return "Khẩn";
  if(severity==="cao" || row.status==="Mới ghi nhận") return "Cao";
  return "Thường";
}
function buildPriorityTasks(incidents,repairs,maintenances,inspections,ops){
  const today=dashDateISO();
  const tasks=[];

  for(const r of incidents || []){
    if(!["Mới ghi nhận","Đã tiếp nhận"].includes(String(r.status || ""))) continue;
    tasks.push({
      type:"Sự cố",
      type_rank:1,
      priority:dashIncidentPriority(r),
      date:r.incident_datetime || "",
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      detail:r.description || "",
      status:r.status || "",
      href:`/tickets.html?edit_id=${Number(r.id)}&from=dashboard`
    });
  }

  for(const r of repairs || []){
    if(!dashOpenRepair(r.processing_status)) continue;
    const priority=dashNorm(r.priority).includes("khan") ? "Khẩn" : (r.processing_status==="Chờ linh kiện" || dashNorm(r.priority)==="cao" ? "Cao" : "Thường");
    tasks.push({
      type:"Sửa chữa",
      type_rank:0,
      priority,
      date:r.received_at || r.repair_date || "",
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      detail:r.issue || r.work || "",
      status:r.processing_status || "Đang xử lý",
      href:`/maintenance.html?repair_id=${Number(r.id)}&from=dashboard`
    });
  }

  for(const r of dashLatestByDeviceType(maintenances,"maintenance_date","Bảo dưỡng định kỳ")){
    const due=String(r.next_date || "").slice(0,10);
    if(!due || due>=today) continue;
    const overdue=Math.max(0,dashDaysBetween(due,today));
    tasks.push({
      type:"Bảo dưỡng",
      type_rank:3,
      priority:overdue>=30 ? "Cao" : "Thường",
      date:due,
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      detail:r.schedule_type || r.type || "Bảo dưỡng định kỳ",
      status:`Quá hạn ${overdue} ngày`,
      href:`/inspection.html?device_id=${Number(r.device_id)}&type=${encodeURIComponent(r.schedule_type || r.type || "Bảo dưỡng định kỳ")}&from=dashboard`
    });
  }

  const inspectionKeys=new Set();
  for(const r of dashLatestByDeviceType(inspections,"inspection_date","Kiểm định")){
    const due=String(r.next_date || "").slice(0,10);
    const failed=dashNorm(r.result)==="khong dat";
    const overdue=Boolean(due && due<today);
    if(!failed && !overdue) continue;
    const type=dashCanonicalType(r.schedule_type || r.type,"Kiểm định");
    inspectionKeys.add(`${Number(r.device_id || 0)}|${type}`);
    const overdueDays=overdue ? Math.max(0,dashDaysBetween(due,today)) : 0;
    tasks.push({
      type:"KĐ/HC/ATBX",
      type_rank:2,
      priority:failed || overdueDays>=30 ? "Cao" : "Thường",
      date:due || r.inspection_date || "",
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      detail:type,
      status:failed ? "Kết quả không đạt" : `Quá hạn ${overdueDays} ngày`,
      href:`/inspections.html?device_id=${Number(r.device_id)}&type=${encodeURIComponent(type)}&from=dashboard`
    });
  }

  for(const gap of ops?.missingInspectionSchedules || []){
    const deviceId=Number(gap.id || gap.device_id || 0);
    const type=dashCanonicalType(gap.obligation_type || "Kiểm định","Kiểm định");
    if(!deviceId || inspectionKeys.has(`${deviceId}|${type}`)) continue;
    tasks.push({
      type:"KĐ/HC/ATBX",
      type_rank:2,
      priority:"Thường",
      date:"",
      device_id:deviceId,
      device_code:gap.device_code || "",
      device_name:gap.name || gap.device_name || "",
      detail:type,
      status:gap.schedule_issue || "Thiếu lịch",
      href:`/inspections.html?device_id=${deviceId}&type=${encodeURIComponent(type)}&from=dashboard`
    });
  }

  tasks.sort((a,b)=>
    dashPriorityRank(a.priority)-dashPriorityRank(b.priority)
    || a.type_rank-b.type_rank
    || String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31"))
  );

  const onePerDevice=new Map();
  for(const task of tasks){
    if(!task.device_id || onePerDevice.has(task.device_id)) continue;
    onePerDevice.set(task.device_id,task);
  }
  return Array.from(onePerDevice.values()).slice(0,7);
}
function renderPriorityRows(rows){
  const host=q("priorityRows");
  if(!host) return;
  if(!rows.length){
    host.innerHTML='<tr><td colspan="5" class="center-empty">Không có công việc kỹ thuật cần ưu tiên xử lý.</td></tr>';
    return;
  }
  host.innerHTML=rows.map(t=>`<tr class="priority-row priority-${dashPriorityClass(t.priority)}">
    <td><a class="work-device-link" href="/device-detail.html?id=${Number(t.device_id)}&from=dashboard">${dashEsc(t.device_name || "Thiết bị")}</a><div class="small device-code">${dashEsc(t.device_code || "")}</div></td>
    <td><b>${dashEsc(t.type)}</b>${t.detail ? `<div class="small work-detail-line">${dashEsc(t.detail)}</div>` : ""}</td>
    <td><span class="work-status-text">${dashEsc(t.status || "")}</span><div class="small priority-hint">${dashEsc(t.priority || "")}</div></td>
    <td>${dashEsc(dashTaskAge(t.date))}</td>
    <td><a class="btn btn-soft-action btn-sm" href="${dashEsc(t.href)}">Xem chi tiết</a></td>
  </tr>`).join("");
}
function presetRange(preset){
  const today=new Date();
  const to=dashDateISO(today);
  const from=new Date(today);
  from.setHours(12,0,0,0);
  if(preset==="last7") from.setDate(from.getDate()-6);
  else if(preset==="last30") from.setDate(from.getDate()-29);
  else if(preset==="last90") from.setDate(from.getDate()-89);
  else if(preset==="thisMonth") from.setDate(1);
  else if(preset==="thisYear"){ from.setMonth(0,1); }
  else return null;
  return {from:dashDateISO(from),to};
}
function syncRangeFromPreset(){
  const range=presetRange(q("periodPreset").value);
  if(!range) return;
  q("periodFrom").value=range.from;
  q("periodTo").value=range.to;
}
function currentRangeLabel(){
  const preset=q("periodPreset").value;
  const labels={
    last7:"7 ngày gần nhất",
    last30:"30 ngày gần nhất",
    last90:"90 ngày gần nhất",
    thisMonth:"Tháng này",
    thisYear:"Năm nay",
    custom:"Khoảng tùy chọn"
  };
  return labels[preset] || "Khoảng thời gian";
}
async function loadDashboard(){
  const from=q("periodFrom").value;
  const to=q("periodTo").value;
  if(!from || !to || from>to){
    q("periodContext").textContent="Khoảng thời gian chưa hợp lệ.";
    return;
  }

  q("periodContext").textContent="Đang cập nhật...";
  const filterBtn=q("applyPeriodBtn");
  if(filterBtn) filterBtn.disabled=true;

  try{
    const [summary,ops,incidents,repairs,maints,inspections]=await Promise.all([
      api(`/api/dashboard/summary?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}`),
      api("/api/dashboard/operations"),
      api("/api/incidents"),
      api("/api/repairs"),
      api("/api/maintenances"),
      api("/api/inspections")
    ]);

    q("dbTotal").textContent=Number(ops.total || summary.device_total || 0);
    q("dbActive").textContent=Number(ops.operational || ops.active || 0);
    q("dbTechnical").textContent=Number(ops.technicalActionDevices ?? summary.backlog_at_end ?? 0);
    q("dbUnackIncidents").textContent=Number(ops.unacknowledgedIncidents || 0);
    q("dbOverdueInspection").textContent=Number(ops.overdueInspection ?? summary.overdue_inspection_at_end ?? 0);

    q("periodContext").textContent=`${currentRangeLabel()}: ${dashFmtDate(summary.period?.from_date || from)} – ${dashFmtDate(summary.period?.to_date || to)}`;

    const priority=buildPriorityTasks(incidents,repairs,maints,inspections,ops);
    renderPriorityRows(priority);

    q("currentWorkContext").textContent=
      `${Number(ops.unacknowledgedIncidents || 0)} sự cố chờ tiếp nhận · `+
      `${Number((repairs || []).filter(r=>dashOpenRepair(r.processing_status)).length)} sửa chữa đang mở · `+
      `${Number(ops.overdueInspection || 0)} KĐ/HC quá hạn.`;
  }catch(err){
    console.error("Không tải được Tổng quan",err);
    q("periodContext").textContent=`Không tải được dữ liệu: ${err.message || err}`;
    q("priorityRows").innerHTML='<tr><td colspan="5" class="center-empty">Không tải được dữ liệu công việc.</td></tr>';
  }finally{
    if(filterBtn) filterBtn.disabled=false;
  }
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout(
    "dashboard",
    "Tổng quan điều hành",
    "Theo dõi thiết bị, công việc kỹ thuật và các nội dung cần xử lý"
  );

  syncRangeFromPreset();

  q("periodPreset").addEventListener("change",()=>{
    syncRangeFromPreset();
  });
  q("periodFrom").addEventListener("change",()=>{
    q("periodPreset").value="custom";
  });
  q("periodTo").addEventListener("change",()=>{
    q("periodPreset").value="custom";
  });
  q("applyPeriodBtn").addEventListener("click",loadDashboard);

  await loadDashboard();
});
