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
  const [,,auth] = await Promise.all([loadBackups(),loadAudit(),api("/api/auth/status")]);
  q("authStatus").textContent = auth.auth_required
    ? (auth.ready ? "Xác thực: ĐANG BẬT · Quản trị viên đã sẵn sàng." : "Xác thực: ĐANG BẬT nhưng chưa có Quản trị viên có mật khẩu.")
    : "Xác thực: ĐANG TẮT · Phù hợp giai đoạn thử nghiệm; không nên dùng trạng thái này khi triển khai nhiều khoa.";
  q("reloadAuditBtn").onclick=loadAudit;
  q("backupBtn").onclick=async()=>{
    if(!confirm("Tạo một bản sao lưu dữ liệu hiện tại?")) return;
    q("backupBtn").disabled=true; q("backupStatus").textContent="Đang tạo bản sao lưu...";
    try{const r=await api("/api/system/backup",{method:"POST",body:JSON.stringify({actor:window.QY4_AUTH_USER?.full_name||"Quản trị viên"})});q("backupStatus").textContent=`Đã tạo: ${r.filename}`;await Promise.all([loadBackups(),loadAudit()]);}
    catch(e){q("backupStatus").textContent="Không tạo được bản sao lưu: "+(e.message||e);}
    finally{q("backupBtn").disabled=false;}
  };
});