let WORK_TASKS = [];
let WORK_FILTERED = [];

function workEsc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch] || ch));
}
function workNorm(value){
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
}
function workToday(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function workDate(value){
  const s=String(value || "").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y,m,d]=s.split("-");
  return `${d}/${m}/${y}`;
}
function workDateTime(value){
  if(!value) return "";
  if(typeof formatDateTimeVN === "function") return formatDateTimeVN(value);
  return String(value).replace("T"," ").slice(0,16);
}
function normalizeScheduleType(value, fallback="Không phân loại"){
  const raw=String(value || "").trim();
  const key=workNorm(raw);
  if(!key) return fallback;
  if(key==="atbx" || key.includes("an toan buc xa")) return "Kiểm định an toàn bức xạ";
  if(key.includes("kiem xa")) return "Kiểm xạ";
  if(key.includes("hieu chuan")) return "Hiệu chuẩn";
  if(key.includes("kiem dinh")) return "Kiểm định";
  if(key==="bao duong" || key==="bao duong dinh ky") return "Bảo dưỡng định kỳ";
  return raw;
}
function latestByDeviceAndType(rows,dateField,fallback){
  const map=new Map();
  for(const row of rows || []){
    const deviceId=Number(row.device_id || row.id || 0);
    if(!deviceId) continue;
    const scheduleType=normalizeScheduleType(row.type,fallback);
    const key=`${deviceId}|${scheduleType}`;
    const rowKey=`${String(row?.[dateField] || "")}|${String(Number(row.id || 0)).padStart(12,"0")}`;
    const current=map.get(key);
    const currentKey=current ? `${String(current?.[dateField] || "")}|${String(Number(current.id || 0)).padStart(12,"0")}` : "";
    if(!current || rowKey>currentKey) map.set(key,{...row,schedule_type:scheduleType});
  }
  return Array.from(map.values());
}
function terminalRepairStatus(value){
  return ["Đã hoàn thành","Không sửa được"].includes(String(value || "").trim());
}
function openRepairStatus(value){
  return ["Đang xử lý","Đang sửa chữa","Đang kiểm tra","Chờ linh kiện","Mới tiếp nhận"].includes(String(value || "").trim());
}
function isFailedResult(value){
  return workNorm(value)==="khong dat";
}
function taskPriorityClass(priority){
  if(priority==="Khẩn") return "red";
  if(priority==="Cao") return "orange";
  return "blue";
}
function taskPriorityRank(priority){
  return priority==="Khẩn" ? 0 : priority==="Cao" ? 1 : 2;
}
function incidentPriority(row){
  const severity=workNorm(row.severity);
  if(severity.includes("khan")) return "Khẩn";
  if(severity==="cao") return "Cao";
  return row.status==="Mới ghi nhận" ? "Cao" : "Thường";
}
function daysOverdue(date){
  if(!date) return 0;
  const due=new Date(`${String(date).slice(0,10)}T12:00:00`);
  const now=new Date(`${workToday()}T12:00:00`);
  return Math.max(0,Math.floor((now-due)/86400000));
}
function taskLocation(row){
  return {
    department_code: row.department_code || row.department_name || "",
    department_name: row.department_name || "",
    location: row.location || ""
  };
}
function makeIncidentTasks(rows){
  return (rows || []).filter(r => ["Mới ghi nhận","Đã tiếp nhận"].includes(String(r.status || ""))).map(r => ({
    type:"Sự cố",
    priority:incidentPriority(r),
    date:r.incident_datetime || "",
    device_id:Number(r.device_id || 0),
    device_code:r.device_code || "",
    device_name:r.device_name || "",
    ...taskLocation(r),
    status:r.status || "",
    next_action:r.status==="Mới ghi nhận" ? "Tiếp nhận và phân loại" : "Xử lý tại chỗ hoặc chuyển sửa chữa",
    detail:r.description || "",
    href:`/tickets.html?edit_id=${Number(r.id)}&from=lcm`
  }));
}
function makeRepairTasks(rows){
  return (rows || []).filter(r => openRepairStatus(r.processing_status) && !terminalRepairStatus(r.processing_status)).map(r => {
    const waiting=String(r.processing_status || "")==="Chờ linh kiện";
    return {
      type:"Sửa chữa",
      priority:waiting ? "Cao" : (workNorm(r.priority).includes("khan") ? "Khẩn" : "Cao"),
      date:r.received_at || r.repair_date || "",
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      ...taskLocation(r),
      status:r.processing_status || "Đang xử lý",
      next_action:waiting ? "Theo dõi linh kiện và thời gian ngừng máy" : "Cập nhật tiến độ sửa chữa",
      detail:r.issue || "",
      href:`/maintenance.html?repair_id=${Number(r.id)}&from=lcm`
    };
  });
}
function makeMaintenanceTasks(rows){
  const today=workToday();
  return latestByDeviceAndType(rows,"maintenance_date","Bảo dưỡng định kỳ")
    .filter(r => !Number(r.is_archived || 0) && r.next_date && String(r.next_date).slice(0,10)<today)
    .map(r => {
      const overdue=daysOverdue(r.next_date);
      return {
        type:"Bảo dưỡng",
        priority:overdue>=30 ? "Cao" : "Thường",
        date:r.next_date || "",
        device_id:Number(r.device_id || 0),
        device_code:r.device_code || "",
        device_name:r.device_name || "",
        ...taskLocation(r),
        status:`Quá hạn ${overdue} ngày`,
        next_action:"Lập và thực hiện bảo dưỡng",
        detail:r.schedule_type || r.type || "Bảo dưỡng định kỳ",
        href:`/inspection.html?device_id=${Number(r.device_id)}&type=${encodeURIComponent(r.schedule_type || r.type || "Bảo dưỡng định kỳ")}&from=lcm`
      };
    });
}
function makeInspectionTasks(rows,ops){
  const today=workToday();
  const tasks=[];
  const activeKeys=new Set();
  const latest=latestByDeviceAndType(rows,"inspection_date","Kiểm định");
  for(const r of latest){
    if(Number(r.is_archived || 0)) continue;
    const failed=isFailedResult(r.result);
    const overdue=Boolean(r.next_date && String(r.next_date).slice(0,10)<today);
    if(!failed && !overdue) continue;
    const scheduleType=normalizeScheduleType(r.schedule_type || r.type,"Kiểm định");
    const key=`${Number(r.device_id || 0)}|${scheduleType}`;
    activeKeys.add(key);
    const overdueDays=overdue ? daysOverdue(r.next_date) : 0;
    tasks.push({
      type:"KĐ/HC/ATBX",
      priority:failed || overdueDays>=30 ? "Cao" : "Thường",
      date:r.next_date || r.inspection_date || "",
      device_id:Number(r.device_id || 0),
      device_code:r.device_code || "",
      device_name:r.device_name || "",
      ...taskLocation(r),
      status:failed ? "Kết quả không đạt" : `Quá hạn ${overdueDays} ngày`,
      next_action:failed ? "Đánh giá và lập hồ sơ xử lý tiếp theo" : "Thực hiện hồ sơ đến hạn",
      detail:scheduleType,
      href:`/inspections.html?device_id=${Number(r.device_id)}&type=${encodeURIComponent(scheduleType)}&from=lcm`
    });
  }
  for(const gap of (ops?.missingInspectionSchedules || [])){
    const deviceId=Number(gap.id || gap.device_id || 0);
    const type=normalizeScheduleType(gap.obligation_type || "Kiểm định","Kiểm định");
    if(activeKeys.has(`${deviceId}|${type}`)) continue;
    activeKeys.add(`${deviceId}|${type}`);
    tasks.push({
      type:"KĐ/HC/ATBX",
      priority:"Thường",
      date:"",
      device_id:deviceId,
      device_code:gap.device_code || "",
      device_name:gap.name || gap.device_name || "",
      department_code:gap.department_code || "",
      department_name:gap.department_name || "",
      location:gap.location || "",
      status:gap.schedule_issue || "Thiếu lịch",
      next_action:"Lập hồ sơ và hạn theo dõi",
      detail:type,
      href:`/inspections.html?device_id=${deviceId}&type=${encodeURIComponent(type)}&from=lcm`
    });
  }
  return tasks;
}
function renderWorkSummary(allTasks){
  const count=type => allTasks.filter(t => t.type===type).length;
  q("workIncidentCount").textContent=count("Sự cố");
  q("workRepairCount").textContent=count("Sửa chữa");
  q("workMaintenanceCount").textContent=count("Bảo dưỡng");
  q("workInspectionCount").textContent=count("KĐ/HC/ATBX");
}
function renderWorkRows(rows){
  q("workCountLabel").textContent=`${rows.length} công việc`;
  if(!rows.length){
    q("workRows").innerHTML='<tr><td colspan="7" class="center-empty">Không có công việc phù hợp bộ lọc hiện tại.</td></tr>';
    return;
  }
  q("workRows").innerHTML=rows.map(t => {
    const dept=workEsc(t.department_code || t.department_name || "—");
    const loc=workEsc(t.location || "");
    const date=t.date ? workDateTime(t.date) : "";
    return `<tr>
      <td><span class="tag ${taskPriorityClass(t.priority)}">${workEsc(t.priority)}</span></td>
      <td><b>${workEsc(t.type)}</b>${date ? `<div class="small">${workEsc(date)}</div>` : ""}</td>
      <td><a class="work-device-link" href="/device-detail.html?id=${Number(t.device_id)}&from=lcm">${workEsc(t.device_name || "Thiết bị")}</a><div class="small device-code">${workEsc(t.device_code || "")}</div></td>
      <td><b>${dept}</b>${loc ? `<div class="small">${loc}</div>` : ""}</td>
      <td><span class="work-status-text">${workEsc(t.status || "")}</span>${t.detail ? `<div class="small work-detail-line">${workEsc(t.detail)}</div>` : ""}</td>
      <td class="work-next-action">${workEsc(t.next_action || "")}</td>
      <td><a class="btn btn-primary btn-sm" href="${workEsc(t.href)}">Mở xử lý</a></td>
    </tr>`;
  }).join("");
}
function applyWorkFilters(){
  const type=q("workTypeFilter").value;
  const priority=q("workPriorityFilter").value;
  const search=workNorm(q("workSearchInput").value);
  WORK_FILTERED=WORK_TASKS.filter(t =>
    (type==="ALL" || t.type===type) &&
    (priority==="ALL" || t.priority===priority) &&
    (!search || workNorm([t.device_code,t.device_name,t.department_code,t.department_name,t.location,t.status,t.detail,t.next_action].join(" ")).includes(search))
  ).sort((a,b) => taskPriorityRank(a.priority)-taskPriorityRank(b.priority) || String(a.date || "9999").localeCompare(String(b.date || "9999")));
  renderWorkRows(WORK_FILTERED);
}
async function loadWorkCenter(){
  q("workRows").innerHTML='<tr><td colspan="7" class="center-empty">Đang tổng hợp công việc kỹ thuật...</td></tr>';
  try{
    const [incidents,repairs,maintenances,inspections,ops]=await Promise.all([
      api("/api/incidents"),
      api("/api/repairs"),
      api("/api/maintenances"),
      api("/api/inspections"),
      api("/api/dashboard/operations")
    ]);
    WORK_TASKS=[
      ...makeIncidentTasks(incidents),
      ...makeRepairTasks(repairs),
      ...makeMaintenanceTasks(maintenances),
      ...makeInspectionTasks(inspections,ops)
    ];
    renderWorkSummary(WORK_TASKS);
    applyWorkFilters();
  }catch(err){
    console.error("Không tải được Điều hành kỹ thuật",err);
    q("workRows").innerHTML=`<tr><td colspan="7" class="center-empty">Không tải được dữ liệu công việc: ${workEsc(err.message || err)}</td></tr>`;
  }
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("lcm","Điều hành kỹ thuật","Tập trung công việc đang cần Khoa Trang bị xử lý");
  q("workTypeFilter").addEventListener("change",applyWorkFilters);
  q("workPriorityFilter").addEventListener("change",applyWorkFilters);
  q("workSearchInput").addEventListener("input",applyWorkFilters);
  q("workResetBtn").onclick=()=>{
    q("workTypeFilter").value="ALL";
    q("workPriorityFilter").value="ALL";
    q("workSearchInput").value="";
    applyWorkFilters();
  };
  q("refreshWorkBtn").onclick=loadWorkCenter;
  await loadWorkCenter();
});
