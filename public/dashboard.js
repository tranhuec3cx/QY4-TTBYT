function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function plusDaysISO(n){ const d=new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function esc(value){ return String(value ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }
function fmtDate(v){ return v ? String(v).slice(0,10).split("-").reverse().join("/") : ""; }
function setText(id, value){ const el=q(id); if(el) el.textContent=value; }
function fmtMinutes(v){ const n=Math.max(0,Number(v||0)); if(!n) return "—"; if(n<60) return Math.round(n)+" phút"; const h=n/60; return h<24 ? h.toFixed(h<10?1:0)+" giờ" : (h/24).toFixed(1)+" ngày"; }
function isIssueCheck(x){ const r=String(x.result||"").trim(); return ["Có vấn đề","Nghiêm trọng","Đạt có lưu ý","Không đạt"].includes(r); }

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
  const [ops, checksToday, maints, inspections] = await Promise.all([
    api("/api/dashboard/operations"),
    api(`/api/checks?from_date=${todayISO()}&to_date=${todayISO()}`),
    api("/api/maintenances"),
    api("/api/inspections")
  ]);

  setText("dbTotal", ops.total || 0);
  setText("dbActive", ops.active || 0);
  setText("dbWaitingRepair", ops.repairing || 0);
  setText("dbOpenIncidents", ops.openIncidents || 0);
  setText("dbDueInspection", ops.dueInspection || 0);
  setText("dbOverdueInspection", ops.overdueInspection || 0);
  setText("dbWaitingParts", ops.waitingParts || 0);
  setText("dbAvgResponse", fmtMinutes(ops.avgResponseMinutes));
  setText("dbAvgResolution", fmtMinutes(ops.avgResolutionMinutes));
  setText("dbQrTotal", checksToday.length);
  setText("dbQrIssue", checksToday.filter(isIssueCheck).length);

  const dueMaint = maints.filter(x => x.next_date && x.next_date >= todayISO() && x.next_date <= plusDaysISO(30))
    .sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,6);
  q("dueMaints").innerHTML = dueMaint.length
    ? dueMaint.map(x => `<li><a href="/device-detail.html?id=${Number(x.device_id)}">${esc(x.device_code||"")} - ${esc(x.device_name||"")}</a> <b>${fmtDate(x.next_date)}</b></li>`).join("")
    : "<li>Không có bảo dưỡng sắp đến hạn.</li>";

  const dueIns = inspections.filter(x => x.next_date && x.next_date >= todayISO() && x.next_date <= plusDaysISO(30))
    .sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,6);
  q("dueInspections").innerHTML = dueIns.length
    ? dueIns.map(x => `<li><a href="/device-detail.html?id=${Number(x.device_id)}">${esc(x.device_code||"")} - ${esc(x.device_name||"")}</a> <b>${fmtDate(x.next_date)}</b></li>`).join("")
    : "<li>Không có kiểm định/hiệu chuẩn sắp đến hạn.</li>";

  renderMonthlyIncidents(ops.monthlyIncidents || []);
});
