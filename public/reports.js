let DATA = {}, META = {departments:[], groups:[]}, CURRENT = [], KPI = null, DATA_QUALITY = null;
const REPORT_NAMES = {
  warrantySoon: "Thiết bị sắp hết bảo hành",
  maintenanceOverdue: "Lịch bảo dưỡng quá hạn",
  inspectionOverdue: "Lịch KĐ/HC/ATBX quá hạn",
  inspectionFailed: "KĐ/HC/ATBX không đạt",
  inspectionMissingSchedule: "KĐ/HC/ATBX chưa có lịch",
  frequentRepairs: "Thiết bị sửa chữa nhiều lần",
  costByDepartment: "Chi phí sửa chữa theo khoa/phòng",
  replaceList: "Đề nghị thay thế/thanh lý",
  statusRatio: "Tỷ lệ thiết bị theo trạng thái"
};
const REPORT_HINTS = {
  warrantySoon: "Danh sách thiết bị có hạn bảo hành sắp kết thúc trong kỳ theo dõi.",
  maintenanceOverdue: "Mỗi dòng là một lịch bảo dưỡng theo loại công việc đã quá hạn; cùng một thiết bị có thể có nhiều nghĩa vụ song song.",
  inspectionOverdue: "Mỗi dòng là một nghĩa vụ KĐ/HC/ATBX theo loại công việc đã quá hạn; một hồ sơ mới của loại khác không che mất nghĩa vụ này.",
  inspectionFailed: "Hồ sơ mới nhất của đúng loại KĐ/HC/ATBX có kết quả Không đạt. Cảnh báo chỉ hết khi có hồ sơ mới hơn cùng loại với kết quả khác Không đạt.",
  inspectionMissingSchedule: "Thiết bị đã được khai báo phải theo dõi KĐ/HC/ATBX nhưng chưa có hồ sơ lần đầu hoặc hồ sơ mới nhất chưa đặt hạn tiếp theo.",
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
function isScheduleReport(type){return type==="maintenanceOverdue"||type==="inspectionOverdue"||type==="inspectionFailed"||type==="inspectionMissingSchedule";}
function deviceColumns(type){const scheduleCol=isScheduleReport(type)?"<th>Loại công việc</th>":"";return `<tr><th>STT</th><th>Mã TB</th><th>Tên thiết bị</th><th>Khoa/phòng</th><th>Nhóm</th><th>Model</th><th>Tình trạng</th>${scheduleCol}<th>Hạn/Ngày liên quan</th><th>Ghi chú</th></tr>`;}
function deviceRow(r,i,type){
  let date = type==="maintenanceOverdue" ? (r.maintenance?.next_date||"") : type==="inspectionOverdue" ? (r.inspection?.next_date||"") : type==="inspectionFailed" ? (r.inspection?.inspection_date||"") : type==="inspectionMissingSchedule" ? (r.inspection?.inspection_date||"") : type==="warrantySoon" ? (r.warranty_end||"") : (r.warranty_end || r.maintenance?.next_date || r.inspection?.next_date || "");
  let note = "";
  if(type==="inspectionFailed") note = `Kết quả: ${r.inspection?.result||"Không đạt"}${r.inspection?.certificate_no ? " · Số CN: "+r.inspection.certificate_no : ""}`;
  if(type==="inspectionMissingSchedule") note = r.schedule_issue || "Chưa có lịch";
  if(type==="frequentRepairs") note = `${r.repair?.repair_count||0} lần sửa chữa · ${formatCurrency(r.repair?.total_cost||0)}`;
  if(type==="replaceList") note = `Cấp CL: ${r.quality_level||""} · Sửa: ${r.repair?.repair_count||0}`;
  const scheduleCell=isScheduleReport(type)?`<td><span class="tag gray">${esc(r.obligation_type||r.maintenance?.type||r.inspection?.type||"")}</span></td>`:"";
  return `<tr><td>${i+1}</td><td class="device-code">${esc(r.device_code)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.department_name||r.department_code)}</td><td>${esc(r.group_name||r.group_code)}</td><td>${esc(r.model||"")}</td><td><span class="tag">${esc(r.status||"")}</span></td>${scheduleCell}<td>${esc(date)}</td><td>${esc(note)}</td></tr>`;
}
function applyFilter(){
  const type=q('reportType').value, dept=q('deptFilter').value, group=q('groupFilter').value, text=norm(q('searchInput').value);
  let rows = DATA[type] || [];
  if(type!=="costByDepartment" && type!=="statusRatio") rows = rows.filter(r=>(dept==='ALL'||r.department_code===dept)&&(group==='ALL'||r.group_code===group)&&(!text||norm([r.device_code,r.name,r.department_name,r.department_code,r.group_name,r.group_code,r.model,r.insurance_code,r.status,r.obligation_type].join(' ')).includes(text)));
  else rows = rows.filter(r=>!text||norm(Object.values(r).join(' ')).includes(text));
  CURRENT = rows; render(type, rows);
}
function renderCards(){
  const cards = [
    ["Sắp hết bảo hành", DATA.warrantySoon?.length||0, "Thiết bị cần theo dõi gia hạn/kiểm tra bảo hành"],
    ["Lịch bảo dưỡng quá hạn", DATA.maintenanceOverdue?.length||0, "Đếm theo thiết bị + loại công việc"],
    ["Lịch KĐ/HC/ATBX quá hạn", DATA.inspectionOverdue?.length||0, "Đếm riêng từng nghĩa vụ định kỳ"],
    ["KĐ/HC/ATBX không đạt", DATA.inspectionFailed?.length||0, "Kết quả mới nhất của đúng loại công việc là Không đạt"],
    ["KĐ/HC/ATBX chưa có lịch", DATA.inspectionMissingSchedule?.length||0, "Đã khai báo bắt buộc nhưng thiếu hồ sơ hoặc thiếu hạn tiếp theo"],
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
  q('thead').innerHTML = deviceColumns(type);
  q('rows').innerHTML = rows.length ? rows.map((r,i)=>deviceRow(r,i,type)).join('') : `<tr><td colspan="${isScheduleReport(type)?10:9}" class="center-empty">Chưa có dữ liệu.</td></tr>`;
}
async function exportExcel(){
  const type=q('reportType').value;
  const rows = CURRENT.map((r,i)=> type==='costByDepartment' ? {STT:i+1,'Mã khoa':r.department_code,'Khoa/phòng':r.department_name||r.department_code,'Số phiếu':r.repair_count||0,'Tổng chi phí':r.total_cost||0} : type==='statusRatio' ? {STT:i+1,'Trạng thái':r.status,'Số lượng':r.count} : {STT:i+1,'Mã thiết bị':r.device_code,'Tên thiết bị':r.name,'Khoa/phòng':r.department_name||r.department_code,'Nhóm':r.group_name||r.group_code,'Model':r.model,'Tình trạng':r.status,'Loại công việc':r.obligation_type||'','Hạn bảo hành':r.warranty_end,'Hạn bảo dưỡng':r.maintenance?.next_date,'Hạn KĐ/HC/ATBX':r.inspection?.next_date,'Kết quả KĐ/HC/ATBX':r.inspection?.result||'','Trạng thái lịch':r.schedule_issue||'','Số lần sửa':r.repair?.repair_count||0,'Chi phí sửa':r.repair?.total_cost||0});
  await exportXlsx(`${type}_${todayISO()}.xlsx`,[{name:REPORT_NAMES[type].slice(0,30),rows}]);
}
function dataQualityReasons(r){
  const reasons=[];
  if(!String(r.serial||"").trim()) reasons.push("Thiếu Serial");
  if(!String(r.model||"").trim()) reasons.push("Thiếu Model");
  if(!String(r.manufacturer||"").trim()) reasons.push("Thiếu hãng SX");
  if(!String(r.location||"").trim()) reasons.push("Thiếu vị trí");
  if(!Number(r.year_in_use||0)) reasons.push("Thiếu năm sử dụng");
  if(!String(r.serial||"").trim() && String(r.insurance_code||"").trim()) reasons.push("Serial trống nhưng mã bảo hiểm có dữ liệu – cần kiểm tra nguồn gốc");
  return reasons;
}
function renderDataQuality(){
  if(!DATA_QUALITY) return;
  const s=DATA_QUALITY.summary||{};
  const cards=[
    ["Dữ liệu cốt lõi đầy đủ",`${s.core_complete_percent||0}%`,`${s.core_complete_devices||0}/${s.total_devices||0} thiết bị`],
    ["Thiếu Serial",s.missing_serial||0,"Cần ưu tiên rà theo nhãn máy/hồ sơ"],
    ["Thiếu Model",s.missing_model||0,"Ảnh hưởng tra cứu kỹ thuật"],
    ["Thiếu vị trí",s.missing_location||0,"Ảnh hưởng kiểm kê và điều chuyển"],
    ["Serial trống + mã BH có dữ liệu",s.serial_blank_with_insurance_code||0,"Chỉ cảnh báo; không tự phục hồi"],
    ["Nhóm Serial trùng",s.duplicate_serial_groups||0,"Cần xác minh trước khi kết luận trùng máy"]
  ];
  q("dataQualityCards").innerHTML=cards.map(([t,v,d])=>`<div class="report-kpi-card"><span>${esc(t)}</span><strong>${esc(v)}</strong><small>${esc(d)}</small></div>`).join("");

  const map=new Map();
  (DATA_QUALITY.incomplete_devices||[]).forEach(r=>map.set(Number(r.id),{...r,reasons:dataQualityReasons(r)}));
  (DATA_QUALITY.suspicious_serial_rows||[]).forEach(r=>{
    const cur=map.get(Number(r.id))||{...r,reasons:[]};
    if(!cur.reasons.some(x=>x.includes("mã bảo hiểm"))) cur.reasons.push("Serial trống nhưng mã bảo hiểm có dữ liệu – cần kiểm tra nguồn gốc");
    map.set(Number(r.id),cur);
  });
  const rows=Array.from(map.values());
  q("dataQualityRows").innerHTML=rows.length?rows.map((r,i)=>`<tr><td>${i+1}</td><td class="device-code">${esc(r.device_code||"")}</td><td><b>${esc(r.name||"")}</b></td><td>${esc(r.department_code||"")}</td><td>${esc(r.serial||"")}</td><td>${esc(r.insurance_code||"")}</td><td class="wrap-text">${esc((r.reasons||[]).join("; "))}</td></tr>`).join(""):'<tr><td colspan="7" class="center-empty">Không có thiết bị thiếu dữ liệu cốt lõi.</td></tr>';
}
async function exportDataQualityExcel(){
  if(!DATA_QUALITY) return;
  const rows=(DATA_QUALITY.incomplete_devices||[]).map((r,i)=>({
    "STT":i+1,"Mã thiết bị":r.device_code||"","Tên thiết bị":r.name||"","Khoa":r.department_code||"",
    "Hãng SX":r.manufacturer||"","Model":r.model||"","Serial":r.serial||"","Mã bảo hiểm":r.insurance_code||"",
    "Năm sử dụng":r.year_in_use||"","Vị trí":r.location||"","Nội dung cần rà soát":dataQualityReasons(r).join("; ")
  }));
  const dup=(DATA_QUALITY.duplicate_serial_groups||[]).map((r,i)=>({"STT":i+1,"Serial":r.serial||"","Số bản ghi":r.count||0}));
  await exportXlsx(`chat_luong_du_lieu_${localTodayISO()}.xlsx`,[
    {name:"CanRaSoat",rows},
    {name:"SerialTrung",rows:dup}
  ]);
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
    ["Báo sự cố qua QR",`${s.qr_share_percent||0}%`,`${s.qr_incidents||0}/${s.total_incidents||0} sự cố`],
    ["Lượt kiểm tra QR",s.qr_checks||0,`${s.qr_check_unique_devices||0} thiết bị duy nhất`],
    ["QR phát hiện vấn đề",s.qr_check_issue_count||0,`Bình thường: ${s.qr_check_normal_count||0} lượt`],
    ["Phản hồi trung bình",fmtMinutesKpi(s.avg_response_minutes),`${s.responded_incidents||0} sự cố có mốc tiếp nhận`],
    ["Phản hồi trung vị",fmtMinutesKpi(s.median_response_minutes),"Ít bị ảnh hưởng bởi ca xử lý quá dài"],
    [`≤ ${p.response_target_minutes||30} phút`,`${s.response_within_target_percent||0}%`,`${s.response_within_target||0}/${s.responded_incidents||0} sự cố đã tiếp nhận`],
    ["Đã có kết quả xử lý",s.resolved_incidents||0,"Xử lý tại chỗ hoặc sửa chữa hoàn thành"],
    ["Thời gian xử lý TB",fmtMinutesKpi(s.avg_resolution_minutes),"Từ lúc báo đến khi có kết quả hoàn thành"],
    ["Đủ mốc tiếp nhận",`${s.response_data_completeness_percent||0}%`,`Còn mở: ${s.open_incidents||0} sự cố`]
  ];
  q("kpiCards").innerHTML=cards.map(([title,value,desc])=>`<div class="report-kpi-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(desc)}</small></div>`).join("");

  const total=Math.max(1,Number(s.total_incidents||0));
  const sourceRows=KPI.by_source||[];
  q("kpiSourceRows").innerHTML=sourceRows.length
    ? sourceRows.map(x=>`<tr>
        <td><b>${esc(x.source)}</b><div class="small">${(Number(x.count||0)*100/total).toFixed(1)}% tổng sự cố</div></td>
        <td>${Number(x.count||0)}</td>
        <td>${Number(x.responded_incidents||0)}</td>
        <td>${Number(x.response_data_completeness_percent||0).toFixed(1)}%</td>
        <td>${esc(fmtMinutesKpi(x.avg_response_minutes))}</td>
        <td>${esc(fmtMinutesKpi(x.median_response_minutes))}</td>
        <td>${Number(x.response_within_target_percent||0).toFixed(1)}%</td>
        <td>${Number(x.resolved_incidents||0)}</td>
        <td>${esc(fmtMinutesKpi(x.avg_resolution_minutes))}</td>
      </tr>`).join("")
    : '<tr><td colspan="9" class="center-empty">Chưa có dữ liệu.</td></tr>';
  const qrSource=sourceRows.find(x=>x.source==="QR");
  const directSource=sourceRows.find(x=>x.source==="Nhập trực tiếp");
  const smallSample=[qrSource,directSource].filter(Boolean).some(x=>Number(x.responded_incidents||0)<5);
  q("kpiSourceNote").textContent = qrSource && directSource
    ? `So sánh chỉ mang tính mô tả: QR n=${qrSource.count||0}, nhập trực tiếp n=${directSource.count||0}. ${smallSample ? "Ít nhất một nhóm có dưới 5 sự cố có mốc tiếp nhận; chưa nên suy diễn hiệu quả hay quan hệ nhân quả." : "Cần xem thêm khác biệt về mức độ sự cố, khoa và thời điểm trước khi diễn giải chênh lệch."}`
    : "Cần có dữ liệu ở cả nguồn QR và nhập trực tiếp để so sánh mô tả.";
  q("kpiMonthRows").innerHTML=(KPI.by_month||[]).length
    ? KPI.by_month.map(x=>`<tr><td>${esc(String(x.month||"").split("-").reverse().join("/"))}</td><td>${Number(x.count||0)}</td><td>${Number(x.qr_count||0)}</td><td>${Number(x.count||0)?(Number(x.qr_count||0)*100/Number(x.count)).toFixed(1):"0.0"}%</td><td>${Number(x.qr_checks||0)}</td></tr>`).join("")
    : '<tr><td colspan="5" class="center-empty">Chưa có dữ liệu.</td></tr>';
  q("kpiDayRows").innerHTML=(KPI.by_day||[]).length
    ? KPI.by_day.map(x=>`<tr><td><b>${esc(formatDateVN(x.date||""))}</b></td><td>${Number(x.qr_checks||0)}</td><td>${Number(x.qr_unique_devices||0)}</td><td>${Number(x.qr_check_issues||0)}</td><td>${Number(x.incidents||0)}</td><td>${Number(x.qr_incidents||0)}</td></tr>`).join("")
    : '<tr><td colspan="6" class="center-empty">Chưa có dữ liệu trong khoảng thời gian đã chọn.</td></tr>';

  const unknown=Number(s.unknown_source_incidents||0);
  q("kpiQualityNote").textContent = unknown
    ? `Lưu ý chất lượng dữ liệu: có ${unknown} sự cố lịch sử chưa xác định được nguồn báo. Không nên quy các bản ghi này là QR hay nhập trực tiếp khi phân tích.`
    : `Dữ liệu nguồn báo trong kỳ đã được phân loại. Tỷ lệ đáp ứng mục tiêu phản hồi chỉ tính trên ${s.responded_incidents||0} sự cố có mốc tiếp nhận.`;
}
async function exportKpiExcel(){
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
    ["Lượt kiểm tra thiết bị qua QR",s.qr_checks||0,"Hoạt động kiểm tra, không đồng nghĩa với sự cố"],
    ["Số thiết bị duy nhất được kiểm tra QR",s.qr_check_unique_devices||0,""],
    ["Lượt QR phát hiện vấn đề",s.qr_check_issue_count||0,""],
    ["Lượt QR bình thường",s.qr_check_normal_count||0,""],
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
  const source=(KPI.by_source||[]).map(x=>({
    "Nguồn báo":x.source,
    "Số sự cố":x.count,
    "Tỷ lệ tổng sự cố (%)":s.total_incidents?Number((x.count*100/s.total_incidents).toFixed(1)):0,
    "Có mốc tiếp nhận":x.responded_incidents||0,
    "Độ đầy đủ mốc tiếp nhận (%)":x.response_data_completeness_percent||0,
    "Phản hồi TB (phút)":x.avg_response_minutes??"",
    "Phản hồi trung vị (phút)":x.median_response_minutes??"",
    "Đáp ứng mục tiêu (%)":x.response_within_target_percent||0,
    "Đã có kết quả xử lý":x.resolved_incidents||0,
    "Xử lý TB (phút)":x.avg_resolution_minutes??"",
    "Xử lý trung vị (phút)":x.median_resolution_minutes??""
  }));
  const daily=(KPI.by_day||[]).map(x=>({
    "Ngày":x.date||"","Lượt kiểm tra QR":x.qr_checks||0,"Thiết bị duy nhất":x.qr_unique_devices||0,
    "Phát hiện vấn đề":x.qr_check_issues||0,"Tổng sự cố":x.incidents||0,"Sự cố qua QR":x.qr_incidents||0
  }));
  const qrChecks=(KPI.check_records||[]).map((r,i)=>({
    "STT":i+1,"Thời gian quét":r.check_datetime||"","Mã thiết bị":r.device_code||"",
    "Tên thiết bị":r.device_name||"","Khoa tại thời điểm quét":r.department_code_snapshot||"",
    "Vị trí tại thời điểm quét":r.location_snapshot||"","Người kiểm tra":r.inspector||"",
    "Kết quả":r.result||"","Nguồn":r.source_channel||"","Sự cố phát sinh #":r.incident_id||""
  }));
  const details=(KPI.records||[]).map((r,i)=>({
    "STT":i+1,"Mã sự cố":r.incident_code||"","Thời gian báo":r.incident_datetime||"",
    "Mã thiết bị":r.device_code||"","Tên thiết bị":r.device_name||"","Khoa/phòng":r.department_name||r.department_code||"",
    "Nguồn báo":r.source_channel||"Không xác định","Người báo":r.reporter||"",
    "Thời điểm tiếp nhận":r.acknowledged_at||"","Người tiếp nhận":r.acknowledged_by||"",
    "Phản hồi (phút)":r.response_minutes??"","Hoàn thành":r.repair_completed_at||r.completed_at||"",
    "Xử lý (phút)":r.resolution_minutes??"","Trạng thái":r.status||"","Mô tả":r.description||""
  }));
  await exportXlsx(`KPI_su_co_QR_${p.from_date||""}_${p.to_date||""}.xlsx`,[
    {name:"TongHopKPI",mode:"aoa",rows:summary},
    {name:"NguonBao",rows:source},
    {name:"TheoNgay",rows:daily},
    {name:"KiemTraQR",rows:qrChecks},
    {name:"ChiTietSuCo",rows:details}
  ]);
}

async function load(){
  [META,DATA,DATA_QUALITY] = await Promise.all([api('/api/meta'),api('/api/reports/summary'),api('/api/reports/data-quality')]);
  const deptOptions='<option value="ALL">Tất cả khoa/phòng</option>'+(META.departments||[]).map(d=>`<option value="${d.code}">${d.code} - ${esc(d.name)}</option>`).join('');
  q('deptFilter').innerHTML=deptOptions;
  q('kpiDeptFilter').innerHTML=deptOptions;
  q('groupFilter').innerHTML='<option value="ALL">Tất cả nhóm</option>'+(META.groups||[]).map(g=>`<option value="${g.code}">${g.code} - ${esc(g.name)}</option>`).join('');
  q("kpiFromDate").value=firstDayYearISO();
  q("kpiToDate").value=localTodayISO();
  renderCards(); applyFilter(); renderDataQuality(); await loadKpi();
}
document.addEventListener('DOMContentLoaded', async()=>{setLayout('reports','Báo cáo','Hiệu quả QR, xử lý sự cố, cảnh báo hạn, sửa chữa và chi phí'); await load(); ['reportType','deptFilter','groupFilter','searchInput'].forEach(id=>{q(id).addEventListener('input',applyFilter); q(id).addEventListener('change',applyFilter);}); q('filterBtn').onclick=applyFilter; q('exportBtn').onclick=exportExcel; q('loadKpiBtn').onclick=loadKpi; q('exportKpiBtn').onclick=exportKpiExcel; q('exportDataQualityBtn').onclick=exportDataQualityExcel;});
