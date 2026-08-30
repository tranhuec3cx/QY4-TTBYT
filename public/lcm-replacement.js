let LCM_REPLACEMENT = {summary:{},rows:[]};

function rpMoney(v){ return typeof formatCurrency==="function" ? formatCurrency(Number(v||0)) : Number(v||0).toLocaleString("vi-VN")+" đ"; }
function rpEsc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function rpCode(d){ return d.device_code||d.insurance_code||`TB-${d.id}`; }
function rpPriorityClass(p){ return p==="Khẩn"?"urgent":p==="Cao"?"high":p==="Trung bình"?"medium":"follow"; }
function rpHorizonLabel(h){ return h==="1Y"?"≤ 1 năm":h==="3Y"?"≤ 3 năm":h==="5Y"?"≤ 5 năm":"> 5 năm / theo dõi"; }

function populateReplacementDepartments(){
  const el=document.getElementById("replacementDepartment");
  if(!el) return;
  const current=el.value||"ALL";
  const deps=(typeof LCM_META!=="undefined" && LCM_META?.departments ? LCM_META.departments : []);
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
  set("rp1yCost",`${rpMoney(s.reference_cost_1y||0)} nguyên giá tham chiếu`);
  set("rp3yCost",`${rpMoney(s.reference_cost_3y||0)} nguyên giá tham chiếu`);
  set("rp5yCost",`${rpMoney(s.reference_cost_5y||0)} nguyên giá tham chiếu`);
}

function replacementFilteredRows(){
  const dep=document.getElementById("replacementDepartment")?.value||"ALL";
  const hor=document.getElementById("replacementHorizon")?.value||"ALL";
  const pri=document.getElementById("replacementPriority")?.value||"ALL";
  const text=(document.getElementById("replacementSearch")?.value||"").trim().toLowerCase();
  return (LCM_REPLACEMENT.rows||[]).filter(d=>{
    if(dep!=="ALL" && d.department_code!==dep) return false;
    if(hor!=="ALL" && d.horizon!==hor) return false;
    if(pri!=="ALL" && d.replacement_priority!==pri) return false;
    if(text){
      const hay=[rpCode(d),d.name,d.model,d.serial,d.department_code,d.manufacturer].join(" ").toLowerCase();
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
  body.innerHTML=rows.length?rows.map(d=>`
    <tr>
      <td><span class="replacement-priority ${rpPriorityClass(d.replacement_priority)}">${rpEsc(d.replacement_priority)}</span></td>
      <td><b>${d.suggested_replacement_year||"—"}</b><small class="replacement-basis">${rpEsc(d.planning_basis||"")}</small></td>
      <td><div class="lcm-device-name">${rpEsc(d.name)}</div><small class="lcm-code">${rpEsc(rpCode(d))}</small><small>${rpEsc(d.model||"")} ${rpEsc(d.serial||"")}</small></td>
      <td>${rpEsc(d.department_code||"")}</td>
      <td>${Number(d.age_years||0)} / ${Number(d.planned_life_years||10)} năm</td>
      <td>${Number(d.repair_count_12m||0)}</td>
      <td>${Number(d.availability_percent||0).toFixed(1)}%</td>
      <td>${d.cost?`${Number(d.repair_cost_ratio_percent||0).toFixed(1)}%<small>${rpMoney(d.repair_cost_total||0)}</small>`:"—"}</td>
      <td><span class="replacement-score">${Number(d.replacement_score||0)}/100</span><small>${rpEsc(rpHorizonLabel(d.horizon))}</small></td>
      <td><ul class="replacement-reasons">${(d.reasons||[]).slice(0,4).map(x=>`<li>${rpEsc(x)}</li>`).join("")}</ul></td>
      <td><div class="lcm-action-group"><a class="btn btn-sm" href="/device-detail.html?id=${d.id}&from=replacement">Hồ sơ</a><button class="btn btn-sm" onclick="openProfile(${d.id})">Cấu hình</button></div></td>
    </tr>`).join(""):`<tr><td colspan="11" class="lcm-empty">Không có thiết bị phù hợp bộ lọc.</td></tr>`;
}

function updateReplacementExport(){
  const dep=document.getElementById("replacementDepartment")?.value||"ALL";
  const hor=document.getElementById("replacementHorizon")?.value||"ALL";
  const pri=document.getElementById("replacementPriority")?.value||"ALL";
  const a=document.getElementById("replacementExportBtn");
  if(a) a.href=`/api/lcm/replacement-plan.xlsx?department_code=${encodeURIComponent(dep)}&horizon=${encodeURIComponent(hor)}&priority=${encodeURIComponent(pri)}`;
}

async function loadReplacementPlan(){
  try{
    LCM_REPLACEMENT=await api("/api/lcm/replacement-plan");
    populateReplacementDepartments();
    renderReplacementSummary();
    renderReplacementRows();
    updateReplacementExport();
  }catch(e){
    console.error("Replacement plan:",e);
    const body=document.getElementById("replacementRows");
    if(body) body.innerHTML=`<tr><td colspan="11" class="lcm-empty">Không tải được kế hoạch thay thế: ${rpEsc(e.message||"Lỗi không xác định")}</td></tr>`;
  }
}

function initReplacementPlanning(){
  ["replacementDepartment","replacementHorizon","replacementPriority"].forEach(id=>{
    document.getElementById(id)?.addEventListener("change",()=>{renderReplacementRows();updateReplacementExport();});
  });
  document.getElementById("replacementSearch")?.addEventListener("input",renderReplacementRows);
  loadReplacementPlan();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initReplacementPlanning);
else initReplacementPlanning();
