let DATA = {}, META = {departments:[], groups:[]}, CURRENT = [];

const REPORT_NAMES = {
  warrantySoon: "Thiết bị sắp hết bảo hành",
  maintenanceOverdue: "Thiết bị quá hạn bảo dưỡng",
  inspectionOverdue: "Thiết bị quá hạn kiểm định / hiệu chuẩn",
  frequentRepairs: "Thiết bị sửa chữa nhiều lần",
  costByDepartment: "Chi phí sửa chữa theo khoa/phòng",
  replaceList: "Thiết bị cần xem xét thay thế / thanh lý",
  statusRatio: "Thiết bị theo trạng thái"
};

const REPORT_HINTS = {
  warrantySoon: "Theo dõi các thiết bị sắp hết thời hạn bảo hành.",
  maintenanceOverdue: "Danh sách thiết bị đã quá hạn bảo dưỡng và cần thực hiện.",
  inspectionOverdue: "Danh sách thiết bị đã quá hạn kiểm định hoặc hiệu chuẩn.",
  frequentRepairs: "Thiết bị phát sinh sửa chữa nhiều lần để rà soát độ ổn định và phương án xử lý.",
  costByDepartment: "Tổng hợp số phiếu và chi phí sửa chữa theo khoa/phòng.",
  replaceList: "Danh sách hỗ trợ xem xét thay thế hoặc thanh lý; quyết định thực hiện theo đánh giá chuyên môn và thẩm quyền.",
  statusRatio: "Tổng hợp số lượng và tỷ lệ thiết bị theo trạng thái hiện tại."
};

function esc(v){return String(v??"").replace(/[&<>\"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));}
function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function money(v){return formatCurrency(Number(v||0));}
function codeOf(r){return r.device_code||r.insurance_code||`TB-${r.id||""}`;}
function dateVi(v){
  const s=String(v||"").trim().slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:s;
}
function todayVi(){
  const d=new Date();
  const p=n=>String(n).padStart(2,"0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}
function deviceNameCell(r){
  const title=esc(r.name||"");
  const inner=r.id?`<a class="report-device" href="/device-detail.html?id=${Number(r.id)}">${title}</a>`:`<span class="report-device">${title}</span>`;
  const meta=[r.model,r.group_name||r.group_code].filter(Boolean).map(esc).join(" · ");
  return `${inner}${meta?`<span class="report-device-meta">${meta}</span>`:""}`;
}
function statusCell(r){return `<span class="report-status">${esc(r.status||"—")}</span>`;}
function emptyRow(cols){return `<tr><td colspan="${cols}" class="reports-empty">Chưa có dữ liệu phù hợp.</td></tr>`;}

function syncFilterAvailability(){
  const type=q("reportType").value;
  const dep=q("deptFilter"), group=q("groupFilter");
  const isStatus=type==="statusRatio";
  const isCost=type==="costByDepartment";
  dep.disabled=isStatus;
  group.disabled=isStatus||isCost;
}

function applyFilter(){
  const type=q("reportType").value;
  const dept=q("deptFilter").value;
  const group=q("groupFilter").value;
  const text=norm(q("searchInput").value);
  let rows=DATA[type]||[];

  if(type==="statusRatio"){
    rows=rows.filter(r=>!text||norm([r.status,r.count].join(" ")).includes(text));
  }else if(type==="costByDepartment"){
    rows=rows.filter(r=>(dept==="ALL"||r.department_code===dept)&&(!text||norm([r.department_code,r.department_name,r.repair_count,r.total_cost].join(" ")).includes(text)));
  }else{
    rows=rows.filter(r=>(dept==="ALL"||r.department_code===dept)&&(group==="ALL"||r.group_code===group)&&(!text||norm([codeOf(r),r.name,r.model,r.department_code,r.department_name,r.group_code,r.group_name,r.status].join(" ")).includes(text)));
  }

  CURRENT=rows;
  render(type,rows);
}

function renderTechnical(type,rows){
  const dateLabel=type==="warrantySoon"?"Hạn bảo hành":type==="maintenanceOverdue"?"Hạn bảo dưỡng":"Hạn kiểm định / hiệu chuẩn";
  q("thead").innerHTML=`<tr><th>Mã TB</th><th>Thiết bị</th><th>Khoa</th><th>${dateLabel}</th><th>Tình trạng</th></tr>`;
  q("rows").innerHTML=rows.length?rows.map(r=>{
    const raw=type==="warrantySoon"?r.warranty_end:type==="maintenanceOverdue"?r.maintenance?.next_date:r.inspection?.next_date;
    const dateClass=type==="warrantySoon"?"soon":"overdue";
    return `<tr><td class="device-code">${esc(codeOf(r))}</td><td>${deviceNameCell(r)}</td><td>${esc(r.department_code||r.department_name||"—")}</td><td><span class="report-date ${dateClass}">${esc(dateVi(raw)||"—")}</span></td><td>${statusCell(r)}</td></tr>`;
  }).join(""):emptyRow(5);
}

function renderFrequentRepairs(rows){
  q("thead").innerHTML=`<tr><th>Mã TB</th><th>Thiết bị</th><th>Khoa</th><th>Số lần sửa</th><th>Chi phí sửa chữa</th><th>Tình trạng</th></tr>`;
  q("rows").innerHTML=rows.length?rows.map(r=>`<tr><td class="device-code">${esc(codeOf(r))}</td><td>${deviceNameCell(r)}</td><td>${esc(r.department_code||r.department_name||"—")}</td><td class="report-number">${Number(r.repair?.repair_count||0)}</td><td class="report-money">${money(r.repair?.total_cost||0)}</td><td>${statusCell(r)}</td></tr>`).join(""):emptyRow(6);
}

function renderReplace(rows){
  q("thead").innerHTML=`<tr><th>Mã TB</th><th>Thiết bị</th><th>Khoa</th><th>Chất lượng</th><th>Số lần sửa</th><th>Tình trạng</th></tr>`;
  q("rows").innerHTML=rows.length?rows.map(r=>`<tr><td class="device-code">${esc(codeOf(r))}</td><td>${deviceNameCell(r)}</td><td>${esc(r.department_code||r.department_name||"—")}</td><td>${esc(r.quality_level||"—")}</td><td class="report-number">${Number(r.repair?.repair_count||0)}</td><td>${statusCell(r)}</td></tr>`).join(""):emptyRow(6);
}

function renderCost(rows){
  q("thead").innerHTML=`<tr><th>Mã khoa</th><th>Khoa/phòng</th><th>Số phiếu sửa chữa</th><th>Tổng chi phí</th></tr>`;
  q("rows").innerHTML=rows.length?rows.map(r=>`<tr><td><b>${esc(r.department_code||"—")}</b></td><td>${esc(r.department_name||r.department_code||"—")}</td><td class="report-number">${Number(r.repair_count||0)}</td><td class="report-money">${money(r.total_cost||0)}</td></tr>`).join(""):emptyRow(4);
}

function renderStatus(rows){
  const total=rows.reduce((s,r)=>s+Number(r.count||0),0)||1;
  q("thead").innerHTML=`<tr><th>Trạng thái</th><th>Số lượng</th><th>Tỷ lệ</th></tr>`;
  q("rows").innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.status||"—")}</td><td class="report-number">${Number(r.count||0)}</td><td class="report-number">${Math.round(Number(r.count||0)*1000/total)/10}%</td></tr>`).join(""):emptyRow(3);
}

function render(type,rows){
  q("reportTitle").textContent=REPORT_NAMES[type]||"Báo cáo";
  q("reportHint").textContent=REPORT_HINTS[type]||"";
  const unit=type==="costByDepartment"?"khoa/phòng":type==="statusRatio"?"trạng thái":"thiết bị";
  q("countLabel").textContent=`${rows.length} ${unit}`;

  if(type==="costByDepartment") return renderCost(rows);
  if(type==="statusRatio") return renderStatus(rows);
  if(type==="frequentRepairs") return renderFrequentRepairs(rows);
  if(type==="replaceList") return renderReplace(rows);
  renderTechnical(type,rows);
}

async function exportExcel(){
  const btn=q("exportBtn");
  const oldText=btn.textContent;
  btn.disabled=true;
  btn.textContent="Đang xuất...";
  try{
    const type=q("reportType").value;
    const response=await fetch("/api/reports/export-xlsx",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        type,
        rows:CURRENT,
        form_code:"BM-BV-TB-02",
        period_label:`(Tính đến ngày ${todayVi()})`
      })
    });
    if(!response.ok){
      let message="Không xuất được báo cáo Excel.";
      try{const data=await response.json();if(data?.error)message=data.error;}catch{}
      throw new Error(message);
    }
    const blob=await response.blob();
    const disposition=response.headers.get("Content-Disposition")||"";
    const match=disposition.match(/filename="?([^";]+)"?/i);
    const filename=match?.[1]||`bao_cao_${new Date().toISOString().slice(0,10)}.xlsx`;
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){
    alert(e.message||"Không xuất được báo cáo Excel.");
  }finally{
    btn.disabled=false;
    btn.textContent=oldText;
  }
}

async function load(){
  META=await api("/api/meta");
  DATA=await api("/api/reports/summary");
  q("deptFilter").innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+(META.departments||[]).map(d=>`<option value="${esc(d.code)}">${esc(d.code)} - ${esc(d.name)}</option>`).join("");
  q("groupFilter").innerHTML='<option value="ALL">Tất cả nhóm</option>'+(META.groups||[]).map(g=>`<option value="${esc(g.code)}">${esc(g.code)} - ${esc(g.name)}</option>`).join("");
  syncFilterAvailability();
  applyFilter();
}

document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("reports","Báo cáo","Tổng hợp, lọc và xuất dữ liệu thiết bị");
  await load();
  ["deptFilter","groupFilter","searchInput"].forEach(id=>{
    q(id).addEventListener("input",applyFilter);
    q(id).addEventListener("change",applyFilter);
  });
  q("reportType").addEventListener("change",()=>{syncFilterAvailability();applyFilter();});
  q("exportBtn").onclick=exportExcel;
});
