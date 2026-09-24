function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function plusDaysISO(n){ const d=new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function firstDayMonthISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function esc(value){ return String(value ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }
function fmtDate(v){ return v ? String(v).slice(0,10).split("-").reverse().join("/") : ""; }
function setText(id, value){ const el=q(id); if(el) el.textContent=value; }
function fmtMinutes(v){ const n=Math.max(0,Number(v||0)); if(!n) return "—"; if(n<60) return Math.round(n)+" phút"; const h=n/60; return h<24 ? h.toFixed(h<10?1:0)+" giờ" : (h/24).toFixed(1)+" ngày"; }
function scheduleTypeKey(value,defaultType="Không phân loại"){
  const raw=String(value||"").trim();
  const key=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
  if(!key) return defaultType;
  if(key==="atbx" || key.includes("an toan buc xa")) return "Kiểm định an toàn bức xạ";
  if(key.includes("kiem xa")) return "Kiểm xạ";
  if(key.includes("hieu chuan")) return "Hiệu chuẩn";
  if(key.includes("kiem dinh")) return "Kiểm định";
  if(key==="bao duong" || key==="bao duong dinh ky") return "Bảo dưỡng định kỳ";
  return raw;
}
function latestTechnicalRows(rows,dateField,defaultType){
  const map=new Map();
  for(const row of (rows||[])){
    const deviceId=Number(row.device_id);
    if(!deviceId) continue;
    const scheduleType=scheduleTypeKey(row.type,defaultType);
    const key=`${deviceId}|${scheduleType}`;
    const cur=map.get(key);
    const rowKey=`${String(row?.[dateField]||"")}|${String(Number(row.id||0)).padStart(12,"0")}`;
    const curKey=cur ? `${String(cur?.[dateField]||"")}|${String(Number(cur.id||0)).padStart(12,"0")}` : "";
    if(!cur || rowKey>curKey) map.set(key,{...row,schedule_type:scheduleType});
  }
  return Array.from(map.values());
}
function renderMonthlyIncidents(rows){
  const host=q("incidentMonthBars"); if(!host) return;
  if(!rows?.length){ host.innerHTML='<div class="center-empty">Chưa có dữ liệu sự cố.</div>'; return; }
  const max=Math.max(1,...rows.map(x=>Number(x.count||0)));
  host.innerHTML=rows.map(x=>{
    const pct=Math.max(4,Math.round(Number(x.count||0)*100/max));
    const label=String(x.month||"").split("-").reverse().join("/");
    return `<div style="display:grid;grid-template-columns:80px 1fr 50px;gap:10px;align-items:center;margin:9px 0">
      <b>${esc(label)}</b><div style="height:12px;background:#edf2f7;border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:currentColor;opacity:.55"></div></div><b>${Number(x.count||0)}</b>
    </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  setLayout("dashboard", "Tổng quan", "Theo dõi nhanh thiết bị, sự cố và công việc kỹ thuật cần xử lý");
  const [ops, maints, inspections, monthKpi] = await Promise.all([
    api("/api/dashboard/operations"),
    api("/api/maintenances"),
    api("/api/inspections"),
    api(`/api/reports/kpi?from_date=${firstDayMonthISO()}&to_date=${todayISO()}&department_code=ALL&response_target_minutes=30`)
  ]);

  setText("dbTotal", ops.total || 0);
  setText("dbOperational", ops.operational || 0);
  setText("dbLimited", ops.limited || 0);
  setText("dbWaitingRepair", ops.repairing || 0);
  setText("dbStopped", ops.stopped || 0);
  setText("dbOpenIncidents", ops.openIncidents || 0);
  setText("dbUnacknowledged", ops.unacknowledgedIncidents || 0);
  setText("dbDueInspection", ops.dueInspection || 0);
  setText("dbOverdueInspection", ops.overdueInspection || 0);
  setText("dbMissingInspectionSchedule", ops.missingInspectionSchedule || 0);
  setText("dbWaitingParts", ops.waitingParts || 0);
  setText("dbAvgResponse", fmtMinutes(ops.avgResponseMinutes));
  setText("dbAvgResolution", fmtMinutes(ops.avgResolutionMinutes));
  setText("dbQrTotal", ops.qrChecksToday || 0);
  setText("dbQrIssue", ops.qrIssuesToday || 0);
  setText("dbQrIncidentShare", `${monthKpi?.summary?.qr_share_percent||0}% (${monthKpi?.summary?.qr_incidents||0}/${monthKpi?.summary?.total_incidents||0})`);
  setText("dbQrChecksMonth", monthKpi?.summary?.qr_checks || 0);
  setText("dbQrDevicesMonth", monthKpi?.summary?.qr_check_unique_devices || 0);
  setText("dbResponseCompleteness", `${monthKpi?.summary?.response_data_completeness_percent||0}%`);

  const dueMaint = latestTechnicalRows(maints,"maintenance_date","Bảo dưỡng định kỳ")
    .filter(x => !Number(x.is_archived||0) && x.next_date && x.next_date >= todayISO() && x.next_date <= plusDaysISO(30))
    .sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,6);
  q("dueMaints").innerHTML = dueMaint.length
    ? dueMaint.map(x => `<li><a href="/device-detail.html?id=${Number(x.device_id)}">${esc(x.device_code||"")} - ${esc(x.device_name||"")}</a> <span class="tag gray">${esc(x.schedule_type||x.type||"Bảo dưỡng")}</span> <b>${fmtDate(x.next_date)}</b></li>`).join("")
    : "<li>Không có bảo dưỡng sắp đến hạn.</li>";

  const dueIns = latestTechnicalRows(inspections,"inspection_date","Kiểm định")
    .filter(x => !Number(x.is_archived||0) && x.next_date && x.next_date >= todayISO() && x.next_date <= plusDaysISO(30))
    .sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,6);
  q("dueInspections").innerHTML = dueIns.length
    ? dueIns.map(x => `<li><a href="/device-detail.html?id=${Number(x.device_id)}">${esc(x.device_code||"")} - ${esc(x.device_name||"")}</a> <span class="tag gray">${esc(x.schedule_type||x.type||"KĐ/HC")}</span> <b>${fmtDate(x.next_date)}</b></li>`).join("")
    : "<li>Không có KĐ/HC/ATBX sắp đến hạn.</li>";

  const missingSchedules = Array.isArray(ops.missingInspectionSchedules) ? ops.missingInspectionSchedules : [];
  q("missingInspectionSchedules").innerHTML = missingSchedules.length
    ? missingSchedules.slice(0,6).map(x => `<li><a href="/device-detail.html?id=${Number(x.id)}">${esc(x.device_code||"")} - ${esc(x.name||"")}</a> <span class="tag gray">${esc(x.obligation_type||"KĐ/HC")}</span> <b>${esc(x.schedule_issue||"Chưa có lịch")}</b></li>`).join("")
    : "<li>Không có nghĩa vụ KĐ/HC/ATBX thiếu lịch.</li>";

  renderMonthlyIncidents(ops.monthlyIncidents || []);
});
