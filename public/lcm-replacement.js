let LCM_REPLACEMENT = {summary:{},rows:[]};
let RP_DEPARTMENTS = [];

function rpEsc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function rpCode(d){ return d.device_code||d.insurance_code||`TB-${d.id}`; }
function rpPriorityClass(p){ return p==="Khẩn"?"urgent":p==="Cao"?"high":p==="Trung bình"?"medium":"follow"; }

function loadAssessmentUiAssets(){
  if(!document.querySelector('link[href="/lcm-assessment-ui.css"]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/lcm-assessment-ui.css";
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[src="/lcm-assessment-ui.js"]')){
    const script=document.createElement("script");
    script.src="/lcm-assessment-ui.js";
    script.async=false;
    document.head.appendChild(script);
  }
}

function prepareReplacementUi(){
  const details=document.getElementById("replacementDetails");
  const table=details?.querySelector("table");
  if(table){
    const head=table.querySelector("thead tr");
    if(head) head.innerHTML="<th>Kế hoạch</th><th>Thiết bị</th><th>Khoa</th><th>Đã dùng / Dự kiến</th><th>Lý do chính</th><th>Hồ sơ</th>";
    table.classList.add("replacement-simple-table");
  }
  const priority=document.getElementById("replacementPriority");
  if(priority) priority.hidden=true;
  const horizon=document.getElementById("replacementHorizon");
  if(horizon){
    const labels={ALL:"Tất cả thời hạn","1Y":"Trong 1 năm","3Y":"Đến 3 năm","5Y":"Đến 5 năm",LATER:"Sau 5 năm / theo dõi"};
    [...horizon.options].forEach(o=>{if(labels[o.value])o.textContent=labels[o.value];});
  }
  const search=document.getElementById("replacementSearch");
  if(search) search.placeholder="Tìm mã / tên / model";
  const h3=details?.querySelector(".table-card-header h3");
  if(h3)h3.textContent="Danh sách cần xem xét";
  const note=details?.querySelector(".simple-note");
  if(note)note.textContent="Danh sách hỗ trợ lập kế hoạch; việc thay mới vẫn cần khảo sát, dự toán và phê duyệt theo quy định.";
  const laterCard=document.getElementById("rpLater")?.closest(".simple-plan-kpi");
  if(laterCard)laterCard.hidden=true;
}

function populateReplacementDepartments(){
  const el=document.getElementById("replacementDepartment");
  if(!el) return;
  const current=el.value||"ALL";
  const deps=RP_DEPARTMENTS;
  el.innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+deps.map(d=>`<option value="${rpEsc(d.code)}">${rpEsc(d.code)} - ${rpEsc(d.name)}</option>`).join("");
  el.value=deps.some(d=>d.code===current)?current:"ALL";
}

function renderReplacementSummary(){
  const s=LCM_REPLACEMENT.summary||{};
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set("rp1y",s.within_1y||0);
  set("rp3y",s.within_3y||0);
  set("rp5y",s.within_5y||0);
  set("rpLater",s.later||0);
  set("rp1yCost","Trong 1 năm");
  set("rp3yCost","Cộng dồn đến 3 năm");
  set("rp5yCost","Cộng dồn đến 5 năm");
}

function replacementFilteredRows(){
  const dep=document.getElementById("replacementDepartment")?.value||"ALL";
  const hor=document.getElementById("replacementHorizon")?.value||"ALL";
  const text=(document.getElementById("replacementSearch")?.value||"").trim().toLowerCase();
  return (LCM_REPLACEMENT.rows||[]).filter(d=>{
    if(dep!=="ALL" && d.department_code!==dep) return false;
    if(hor==="1Y" && d.horizon!=="1Y") return false;
    if(hor==="3Y" && !["1Y","3Y"].includes(d.horizon)) return false;
    if(hor==="5Y" && !["1Y","3Y","5Y"].includes(d.horizon)) return false;
    if(hor==="LATER" && d.horizon!=="LATER") return false;
    if(text){
      const hay=[rpCode(d),d.name,d.model,d.department_code].join(" ").toLowerCase();
      if(!hay.includes(text)) return false;
    }
    return true;
  });
}

function renderReplacementRows(){
  const rows=replacementFilteredRows();
  const body=document.getElementById("replacementRows");
  const count=document.getElementById("replacementCount");
  if(count) count.textContent=`${rows.length} thiết bị`;
  if(!body) return;
  body.innerHTML=rows.length?rows.map(d=>{
    const reasons=(d.reasons||[]).slice(0,2);
    const extra=(d.reasons||[]).length-reasons.length;
    return `<tr>
      <td><span class="replacement-priority ${rpPriorityClass(d.replacement_priority)}">${rpEsc(d.replacement_priority)}</span><small><b>${d.suggested_replacement_year||"—"}</b></small></td>
      <td><div class="lcm-device-name">${rpEsc(d.name)}</div><small class="lcm-code">${rpEsc(rpCode(d))}</small>${d.model?`<small>${rpEsc(d.model)}</small>`:""}</td>
      <td>${rpEsc(d.department_code||"—")}</td>
      <td>${Number(d.age_years||0)} / ${Number(d.planned_life_years||10)} năm</td>
      <td><ul class="replacement-reasons">${reasons.map(x=>`<li>${rpEsc(x)}</li>`).join("")}${extra>0?`<li class="more">+${extra} lý do khác</li>`:""}</ul></td>
      <td><div class="lcm-action-group"><a class="btn btn-sm" href="/device-detail.html?id=${d.id}&from=replacement">Hồ sơ</a><button class="btn btn-sm" onclick="openProfile(${d.id})">Điều chỉnh</button></div></td>
    </tr>`;
  }).join(""):'<tr><td colspan="6" class="lcm-empty">Không có thiết bị phù hợp bộ lọc.</td></tr>';
}

function updateReplacementExport(){
  const dep=document.getElementById("replacementDepartment")?.value||"ALL";
  const hor=document.getElementById("replacementHorizon")?.value||"ALL";
  const a=document.getElementById("replacementExportBtn");
  if(a) a.href=`/api/lcm/replacement-plan-v2.xlsx?department_code=${encodeURIComponent(dep)}&horizon=${encodeURIComponent(hor)}&priority=ALL`;
}

async function loadReplacementPlan(){
  try{
    const [plan,meta]=await Promise.all([api("/api/lcm/replacement-plan-v2"),api("/api/meta")]);
    LCM_REPLACEMENT=plan;
    RP_DEPARTMENTS=meta?.departments||[];
    populateReplacementDepartments();
    renderReplacementSummary();
    renderReplacementRows();
    updateReplacementExport();
  }catch(e){
    console.error("Replacement plan:",e);
    const body=document.getElementById("replacementRows");
    if(body) body.innerHTML=`<tr><td colspan="6" class="lcm-empty">Không tải được kế hoạch thay mới: ${rpEsc(e.message||"Lỗi không xác định")}</td></tr>`;
  }
}

function initReplacementPlanning(){
  prepareReplacementUi();
  ["replacementDepartment","replacementHorizon"].forEach(id=>{
    document.getElementById(id)?.addEventListener("change",()=>{renderReplacementRows();updateReplacementExport();});
  });
  document.getElementById("replacementSearch")?.addEventListener("input",renderReplacementRows);
  if(typeof saveProfile==="function" && !saveProfile.__replacementWrapped){
    const originalSaveProfile=saveProfile;
    const wrapped=async function(e){ await originalSaveProfile(e); await loadReplacementPlan(); };
    wrapped.__replacementWrapped=true;
    saveProfile=wrapped;
  }
  loadReplacementPlan();
  loadAssessmentUiAssets();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initReplacementPlanning);
else initReplacementPlanning();