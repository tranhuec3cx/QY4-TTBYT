let DATA = {}, META = {departments:[], groups:[]}, CURRENT = [], KPI = null;
const REPORT_NAMES = {
  warrantySoon: "Thiết bị sắp hết bảo hành",
  maintenanceOverdue: "Thiết bị quá hạn bảo dưỡng",
  inspectionOverdue: "Thiết bị quá hạn kiểm định",
  frequentRepairs: "Thiết bị sửa chữa nhiều lần",
  costByDepartment: "Chi phí sửa chữa theo khoa/phòng",
  replaceList: "Đề nghị thay thế/thanh lý",
  statusRatio: "Tỷ lệ thiết bị theo trạng thái"
};
const REPORT_HINTS = {
  warrantySoon: "Danh sách thiết bị có hạn bảo hành sắp kết thúc trong kỳ theo dõi.",
  maintenanceOverdue: "Thiết bị đã quá hạn bảo dưỡng, cần ưu tiên lập kế hoạch thực hiện.",
  inspectionOverdue: "Thiết bị quá hạn kiểm định/hiệu chuẩn, cần xử lý trước khi tiếp tục khai thác nếu có yêu cầu pháp lý/an toàn.",
  frequentRepairs: "Thiết bị phát sinh sửa chữa nhiều lần, dùng để xem xét sửa chữa lớn, thay thế hoặc thanh lý.",
  costByDepartment: "Tổng hợp số phiếu và chi phí sửa chữa theo khoa/phòng.",
  replaceList: "Danh sách gợi ý thiết bị cần đánh giá thay thế/thanh lý dựa trên trạng thái, chất lượng và số lần sửa chữa.",
  statusRatio: "Cơ cấu thiết bị theo tình trạng sử dụng hiện tại."
};
function esc(v){return String(v??"").replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));}
function localTodayISO(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
function firstDayYearISO(){const d=new Date();return `${d.getFullYear()}-01-01`;}
function fmtMinutesKpi(v){
  if(v===null||v===undefined||v==="") return "—";
  const n=Number(v); if(!Number.isFinite(n)) return "—";
  if(n<60) return `${Math.round(n)} phút`;
  if(n<1440) return `${(n/60).toFixed(n<600?1:0)} giờ`;
  return `${(n/1440).toFixed(1)} ngày`;
}
function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function deviceColumns(){return `<tr><th>STT</th><th>Mã TB</th><th>Tên thiết bị</th><th>Khoa/phòng</th><th>Nhóm</th><th>Model</th><th>Tình trạng</th><th>Hạn/Ngày liên quan</th><th>Ghi chú</th></tr>`;}
function deviceRow(r,i,type){
  let date = r.warranty_end || r.maintenance?.next_date || r.inspection?.next_date || "";
  let note = "";
  if(type==="frequentRepairs") note = `${r.repair?.repair_count||0} lần sửa chữa · ${formatCurrency(r.repair?.total_cost||0)}`;
  if(type==="replaceList") note = `Cấp CL: ${r.quality_level||""} · Sửa: ${r.repair?.repair_count||0}`;
  return `<tr><td>${i+1}</td><td class="device-code">${esc(r.device_code)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.department_name||r.department_code)}</td><td>${esc(r.group_name||r.group_code)}</td><td>${esc(r.model||"")}</td><td><span class="tag">${esc(r.status||"")}</span></td><td>${esc(date)}</td><td>${esc(note)}</td></tr>`;
}
function applyFilter(){
  const type=q('reportType').value, dept=q('deptFilter').value, group=q('groupFilter').value, text=norm(q('searchInput').value);
  let rows = DATA[type] || [];
  if(type!=="costByDepartment" && type!=="statusRatio") rows = rows.filter(r=>(dept==='ALL'||r.department_code===dept)&&(group==='ALL'||r.group_code===group)&&(!text||norm([r.device_code,r.name,r.department_name,r.department_code,r.group_name,r.group_code,r.model,r.insurance_code,r.status].join(' ')).includes(text)));
  else rows = rows.filter(r=>!text||norm(Object.values(r).join(' ')).includes(text));
  CURRENT = rows; render(type, rows);
}
function renderCards(){
  const cards = [
    ["Sắp hết bảo hành", DATA.warrantySoon?.length||0, "Thiết bị cần theo dõi gia hạn/kiểm tra bảo hành"],
    ["Quá hạn bảo dưỡng", DATA.maintenanceOverdue?.length||0, "Cần lập kế hoạch bảo dưỡng"],
    ["Quá hạn kiểm định", DATA.inspectionOverdue?.length||0, "Ưu tiên xử lý để đảm bảo pháp lý/an toàn"],
    ["Sửa nhiều lần", DATA.frequentRepairs?.length||0, "Thiết bị có nguy cơ kém ổn định"],
    ["Đề nghị thay thế", DATA.replaceList?.length||0, "Thiết bị cần đánh giá thay thế/thanh lý"]
  ];
  q("reportCards").innerHTML = cards.map(([title,value,desc])=>`<div class="report-kpi-card"><span>${title}</span><strong>${value}</strong><small>${desc}</small></div>`).join("");
}
function render(type, rows){
  q('countLabel').textContent = `${REPORT_NAMES[type]}: ${rows.length} dòng`; if(q("reportHint")) q("reportHint").textContent = REPORT_HINTS[type] || "";
  if(type === 'costByDepartment'){
    q('thead').innerHTML = `<tr><th>STT</th><th>Mã khoa</th><th>Khoa/phòng</th><th>Số phiếu sửa chữa</th><th>Tổng chi phí</th></tr>`;
    q('rows').innerHTML = rows.length ? rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.department_code)}</td><td>${esc(r.department_name||r.department_code)}</td><td>${r.repair_count||0}</td><td>${formatCurrency(r.total_cost||0)}</td></tr>`).join('') : `<tr><td colspan="5" class="center-empty">Chưa có dữ liệu.</td></tr>`;
    return;
  }
  if(type === 'statusRatio'){
    const total = rows.reduce((s,r)=>s+Number(r.count||0),0) || 1;
    q('thead').innerHTML = `<tr><th>STT</th><th>Trạng thái</th><th>Số lượng</th><th>Tỷ lệ</th></tr>`;
    q('rows').innerHTML = rows.length ? rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.status)}</td><td>${r.count}</td><td>${Math.round(Number(r.count||0)*1000/total)/10}%</td></tr>`).join('') : `<tr><td colspan="4" class="center-empty">Chưa có dữ liệu.</td></tr>`;
    return;
  }
  q('thead').innerHTML = deviceColumns();
  q('rows').innerHTML = rows.length ? rows.map((r,i)=>deviceRow(r,i,type)).join('') : `<tr><td colspan="9" class="center-empty">Chưa có dữ liệu.</td></tr>`;
}
function exportExcel(){
  const type=q('reportType').value;
  const rows = CURRENT.map((r,i)=> type==='costByDepartment' ? {STT:i+1,'Mã khoa':r.department_code,'Khoa/phòng':r.department_name||r.department_code,'Số phiếu':r.repair_count||0,'Tổng chi phí':r.total_cost||0} : type==='statusRatio' ? {STT:i+1,'Trạng thái':r.status,'Số lượng':r.count} : {STT:i+1,'Mã thiết bị':r.device_code,'Tên thiết bị':r.name,'Khoa/phòng':r.department_name||r.department_code,'Nhóm':r.group_name||r.group_code,'Model':r.model,'Tình trạng':r.status,'Hạn bảo hành':r.warranty_end,'Hạn bảo dưỡng':r.maintenance?.next_date,'Hạn kiểm định':r.inspection?.next_date,'Số lần sửa':r.repair?.repair_count||0,'Chi phí sửa':r.repair?.total_cost||0});
  const ws=XLSX.utils.json_to_sheet(rows), wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,REPORT_NAMES[type].slice(0,30)); XLSX.writeFile(wb,`${type}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
async function loadKpi(){
  const from=q("kpiFromDate").value||firstDayYearISO();
  const to=q("kpiToDate").value||localTodayISO();
  const dept=q("kpiDeptFilter").value||"ALL";
  const target=Math.max(1,Number(q("kpiResponseTarget").value||30));
  KPI=await api(`/api/reports/kpi?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&department_code=${encodeURIComponent(dept)}&response_target_minutes=${encodeURIComponent(target)}`);
  renderKpi();
}
function renderKpi(){
  if(!KPI) return;
  const s=KPI.summary||{}, p=KPI.period||{};
  const cards=[
    ["Tổng sự cố",s.total_incidents||0,"Sự cố phát sinh trong kỳ"],
    ["Báo qua QR",`${s.qr_share_percent||0}%`,`${s.qr_incidents||0}/${s.total_incidents||0} sự cố`],
    ["Phản hồi trung bình",fmtMinutesKpi(s.avg_response_minutes),`${s.responded_incidents||0} sự cố có mốc tiếp nhận`],
    ["Phản hồi trung vị",fmtMinutesKpi(s.median_response_minutes),"Ít bị ảnh hưởng bởi ca xử lý quá dài"],
    [`≤ ${p.response_target_minutes||30} phút`,`${s.response_within_target_percent||0}%`,`${s.response_within_target||0}/${s.responded_incidents||0} sự cố đã tiếp nhận`],
    ["Đã có kết quả xử lý",s.resolved_incidents||0,"Xử lý tại chỗ hoặc sửa chữa hoàn thành"],
    ["Thời gian xử lý TB",fmtMinutesKpi(s.avg_resolution_minutes),"Từ lúc báo đến khi có kết quả hoàn thành"],
    ["Đủ mốc tiếp nhận",`${s.response_data_completeness_percent||0}%`,`Còn mở: ${s.open_incidents||0} sự cố`]
  ];
  q("kpiCards").innerHTML=cards.map(([title,value,desc])=>`<div class="report-kpi-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(desc)}</small></div>`).join("");

  const total=Math.max(1,Number(s.total_incidents||0));
  q("kpiSourceRows").innerHTML=(KPI.by_source||[]).length
    ? KPI.by_source.map(x=>`<tr><td><b>${esc(x.source)}</b></td><td>${Number(x.count||0)}</td><td>${(Number(x.count||0)*100/total).toFixed(1)}%</td></tr>`).join("")
    : '<tr><td colspan="3" class="center-empty">Chưa có dữ liệu.</td></tr>';
  q("kpiMonthRows").innerHTML=(KPI.by_month||[]).length
    ? KPI.by_month.map(x=>`<tr><td>${esc(String(x.month||"").split("-").reverse().join("/"))}</td><td>${Number(x.count||0)}</td><td>${Number(x.qr_count||0)}</td><td>${Number(x.count||0)?(Number(x.qr_count||0)*100/Number(x.count)).toFixed(1):"0.0"}%</td></tr>`).join("")
    : '<tr><td colspan="4" class="center-empty">Chưa có dữ liệu.</td></tr>';

  const unknown=Number(s.unknown_source_incidents||0);
  q("kpiQualityNote").textContent = unknown
    ? `Lưu ý chất lượng dữ liệu: có ${unknown} sự cố lịch sử chưa xác định được nguồn báo. Không nên quy các bản ghi này là QR hay nhập trực tiếp khi phân tích.`
    : `Dữ liệu nguồn báo trong kỳ đã được phân loại. Tỷ lệ đáp ứng mục tiêu phản hồi chỉ tính trên ${s.responded_incidents||0} sự cố có mốc tiếp nhận.`;
}
function exportKpiExcel(){
  if(!KPI) return;
  const s=KPI.summary||{}, p=KPI.period||{};
  const summary=[
    ["Chỉ số","Giá trị","Ghi chú"],
    ["Từ ngày",p.from_date||"",""],
    ["Đến ngày",p.to_date||"",""],
    ["Khoa/phòng",p.department_code||"ALL","ALL = toàn viện"],
    ["Mục tiêu phản hồi (phút)",p.response_target_minutes||30,"Chỉ tiêu nội bộ"],
    ["Tổng sự cố",s.total_incidents||0,""],
    ["Sự cố báo qua QR",s.qr_incidents||0,""],
    ["Tỷ lệ báo qua QR (%)",s.qr_share_percent||0,""],
    ["Sự cố đã có mốc tiếp nhận",s.responded_incidents||0,""],
    ["Độ đầy đủ mốc tiếp nhận (%)",s.response_data_completeness_percent||0,""],
    ["Phản hồi trung bình (phút)",s.avg_response_minutes??"",""],
    ["Phản hồi trung vị (phút)",s.median_response_minutes??"",""],
    ["Đáp ứng mục tiêu phản hồi (%)",s.response_within_target_percent||0,`Mẫu số = ${s.responded_incidents||0} sự cố đã có mốc tiếp nhận`],
    ["Sự cố đã có kết quả xử lý",s.resolved_incidents||0,""],
    ["Thời gian xử lý TB (phút)",s.avg_resolution_minutes??"",""],
    ["Thời gian xử lý trung vị (phút)",s.median_resolution_minutes??"",""],
    ["Sự cố còn mở",s.open_incidents||0,""],
    ["Nguồn báo chưa xác định",s.unknown_source_incidents||0,"Không suy diễn là QR hay nhập trực tiếp"]
  ];
  const source=(KPI.by_source||[]).map(x=>({"Nguồn báo":x.source,"Số sự cố":x.count,"Tỷ lệ (%)":s.total_incidents?Number((x.count*100/s.total_incidents).toFixed(1)):0}));
  const details=(KPI.records||[]).map((r,i)=>({
    "STT":i+1,"Mã sự cố":r.incident_code||"","Thời gian báo":r.incident_datetime||"",
    "Mã thiết bị":r.device_code||"","Tên thiết bị":r.device_name||"","Khoa/phòng":r.department_name||r.department_code||"",
    "Nguồn báo":r.source_channel||"Không xác định","Người báo":r.reporter||"",
    "Thời điểm tiếp nhận":r.acknowledged_at||"","Người tiếp nhận":r.acknowledged_by||"",
    "Phản hồi (phút)":r.response_minutes??"","Hoàn thành":r.repair_completed_at||r.completed_at||"",
    "Xử lý (phút)":r.resolution_minutes??"","Trạng thái":r.status||"","Mô tả":r.description||""
  }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"TongHopKPI");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(source),"NguonBao");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(details),"ChiTietSuCo");
  XLSX.writeFile(wb,`KPI_su_co_QR_${p.from_date||""}_${p.to_date||""}.xlsx`);
}

async function load(){
  META = await api('/api/meta'); DATA = await api('/api/reports/summary');
  const deptOptions='<option value="ALL">Tất cả khoa/phòng</option>'+(META.departments||[]).map(d=>`<option value="${d.code}">${d.code} - ${esc(d.name)}</option>`).join('');
  q('deptFilter').innerHTML=deptOptions;
  q('kpiDeptFilter').innerHTML=deptOptions;
  q('groupFilter').innerHTML='<option value="ALL">Tất cả nhóm</option>'+(META.groups||[]).map(g=>`<option value="${g.code}">${g.code} - ${esc(g.name)}</option>`).join('');
  q("kpiFromDate").value=firstDayYearISO();
  q("kpiToDate").value=localTodayISO();
  renderCards(); applyFilter(); await loadKpi();
}
document.addEventListener('DOMContentLoaded', async()=>{setLayout('reports','Báo cáo','Hiệu quả QR, xử lý sự cố, cảnh báo hạn, sửa chữa và chi phí'); await load(); ['reportType','deptFilter','groupFilter','searchInput'].forEach(id=>{q(id).addEventListener('input',applyFilter); q(id).addEventListener('change',applyFilter);}); q('filterBtn').onclick=applyFilter; q('exportBtn').onclick=exportExcel; q('loadKpiBtn').onclick=loadKpi; q('exportKpiBtn').onclick=exportKpiExcel;});
