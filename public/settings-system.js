function readinessClass(level){ return level==="Đạt"?"green":level==="Lưu ý"?"yellow":"red"; }
async function loadReadiness(){
  const r=await api("/api/system/readiness");
  const summary=[
    ["Trạng thái",r.overall||"—","Tổng thể"],
    ["Cần xử lý",r.blocking||0,"Ưu tiên xử lý trước chạy thật"],
    ["Lưu ý",r.warnings||0,"Không nhất thiết chặn chạy thử"],
    ["Thiết bị",r.system?.total_devices||0,`Người dùng hoạt động: ${r.system?.active_users||0}`]
  ];
  q("readinessSummary").innerHTML=summary.map(([t,v,d])=>`<div class="report-kpi-card"><span>${esc(t)}</span><strong>${esc(v)}</strong><small>${esc(d)}</small></div>`).join("");
  q("readinessGenerated").textContent=`Kiểm tra lúc: ${formatDateTimeVN(r.generated_at)} · Múi giờ: ${r.system?.time_zone||"—"} · QR đề xuất: ${r.system?.recommended_qr_origin||"Chưa xác định"}`;
  q("readinessRows").innerHTML=(r.checks||[]).map(x=>`<tr><td><span class="tag ${readinessClass(x.level)}">${esc(x.level)}</span></td><td><b>${esc(x.title)}</b></td><td class="wrap-text">${esc(x.detail)}</td></tr>`).join("") || '<tr><td colspan="3" class="center-empty">Chưa có dữ liệu kiểm tra.</td></tr>';
  return r;
}
function esc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
async function loadBackups(){
  const rows=await api("/api/system/backups");
  q("backupRows").innerHTML=rows.length?rows.map((x,i)=>`<tr><td>${i+1}</td><td class="device-code">${esc(x)}</td></tr>`).join(""):'<tr><td colspan="2" class="center-empty">Chưa có bản sao lưu.</td></tr>';
}
async function loadAudit(){
  const rows=await api("/api/audit-logs?limit=200");
  q("auditRows").innerHTML=rows.length?rows.map(x=>`<tr><td>${formatDateTimeVN(x.action_time)}</td><td>${esc(x.actor||"Hệ thống")}</td><td><b>${esc(x.action_type||"")}</b></td><td>${esc([x.entity_type,x.entity_id].filter(Boolean).join(" #"))}</td><td class="wrap-text">${esc(x.details||"")}</td></tr>`).join(""):'<tr><td colspan="5" class="center-empty">Chưa có nhật ký.</td></tr>';
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("settings","Hệ thống","Sao lưu, nhật ký thao tác và cấu hình quản trị","system");
  const [,,,auth] = await Promise.all([loadReadiness(),loadBackups(),loadAudit(),api("/api/auth/status")]);
  q("authStatus").textContent = auth.auth_required
    ? (auth.ready ? "Xác thực: ĐANG BẬT · Quản trị viên đã sẵn sàng." : "Xác thực: ĐANG BẬT nhưng chưa có Quản trị viên có mật khẩu.")
    : "Xác thực: ĐANG TẮT · Phù hợp giai đoạn thử nghiệm; không nên dùng trạng thái này khi triển khai nhiều khoa.";
  q("reloadAuditBtn").onclick=loadAudit;
  q("reloadReadinessBtn").onclick=loadReadiness;
  q("backupBtn").onclick=async()=>{
    if(!confirm("Tạo một bản sao lưu dữ liệu hiện tại?")) return;
    q("backupBtn").disabled=true; q("backupStatus").textContent="Đang tạo bản sao lưu...";
    try{const r=await api("/api/system/backup",{method:"POST",body:JSON.stringify({actor:window.QY4_AUTH_USER?.full_name||"Quản trị viên"})});q("backupStatus").textContent=`Đã tạo: ${r.filename}`;await Promise.all([loadBackups(),loadAudit(),loadReadiness()]);}
    catch(e){q("backupStatus").textContent="Không tạo được bản sao lưu: "+(e.message||e);}
    finally{q("backupBtn").disabled=false;}
  };
});