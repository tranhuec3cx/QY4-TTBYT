let DATA = {}, META = {departments:[], groups:[]}, CURRENT = [];
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
async function load(){
  META = await api('/api/meta'); DATA = await api('/api/reports/summary');
  q('deptFilter').innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+(META.departments||[]).map(d=>`<option value="${d.code}">${d.code} - ${esc(d.name)}</option>`).join('');
  q('groupFilter').innerHTML='<option value="ALL">Tất cả nhóm</option>'+(META.groups||[]).map(g=>`<option value="${g.code}">${g.code} - ${esc(g.name)}</option>`).join('');
  renderCards(); applyFilter();
}
document.addEventListener('DOMContentLoaded', async()=>{setLayout('reports','Báo cáo','Cảnh báo hạn, sửa chữa, chi phí và trạng thái thiết bị'); await load(); ['reportType','deptFilter','groupFilter','searchInput'].forEach(id=>{q(id).addEventListener('input',applyFilter); q(id).addEventListener('change',applyFilter);}); q('filterBtn').onclick=applyFilter; q('exportBtn').onclick=exportExcel;});
