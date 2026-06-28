function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function plusDaysISO(n){ const d=new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function esc(value){ return String(value ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }
function fmtDate(v){ return v ? String(v).slice(0,10).split("-").reverse().join("/") : ""; }
function setText(id, value){ const el=q(id); if(el) el.textContent=value; }
function isNormalCheck(x){ const r=String(x.result||"").trim(); return ["Bình thường","Tốt","Đạt"].includes(r); }
function isIssueCheck(x){ const r=String(x.result||"").trim(); return ["Có vấn đề","Nghiêm trọng","Đạt có lưu ý","Không đạt"].includes(r); }
function monthStartISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }

document.addEventListener("DOMContentLoaded", async () => {
  setLayout("dashboard", "Tổng quan", "Theo dõi nhanh tình hình thiết bị, sự cố và công việc kỹ thuật cần xử lý");
  const from = monthStartISO();
  const to = todayISO();
  const devices = await api("/api/devices");
  const checksToday = await api(`/api/checks?from_date=${todayISO()}&to_date=${todayISO()}`);
  const maints = await api(`/api/maintenances?from_date=${todayISO()}&to_date=${plusDaysISO(30)}`);
  const inspections = await api(`/api/inspections?from_date=2020-01-01&to_date=${plusDaysISO(365)}`);

  setText("dbTotal", devices.length);
  setText("dbActive", devices.filter(d => d.status === "Đang hoạt động").length);
  setText("dbWaitingRepair", devices.filter(d => d.status === "Chờ sửa chữa").length);
  setText("dbStopped", devices.filter(d => ["Ngừng hoạt động","Chờ thanh lý"].includes(d.status)).length);


  setText("dbQrTotal", checksToday.length);
  setText("dbQrNormal", checksToday.filter(isNormalCheck).length);
  setText("dbQrIssue", checksToday.filter(isIssueCheck).length);

  const dueMaint = maints.filter(x => x.next_date && x.next_date >= todayISO() && x.next_date <= plusDaysISO(30)).sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,5);
  q("dueMaints").innerHTML = dueMaint.length ? dueMaint.map(x => `<li>${esc(x.device_code||"")} - ${esc(x.device_name||"")} <b>${fmtDate(x.next_date || x.maintenance_date)}</b></li>`).join("") : `<li>Không có bảo dưỡng sắp đến hạn.</li>`;
  const dueIns = inspections.filter(x => x.next_date && x.next_date >= todayISO()).sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date))).slice(0,5);
  q("dueInspections").innerHTML = dueIns.length ? dueIns.map(x => `<li>${esc(x.device_code||"")} - ${esc(x.device_name||"")} <b>${fmtDate(x.next_date)}</b></li>`).join("") : `<li>Không có kiểm định sắp đến hạn.</li>`;
});
