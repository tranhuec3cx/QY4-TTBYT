(function(){
  let FINANCE_DEVICES=[];

  function el(id){return document.getElementById(id);}
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]||c));}
  function money(v){return typeof formatCurrency==="function"?formatCurrency(Number(v||0)):Number(v||0).toLocaleString("vi-VN")+" đ";}
  function pct(v){return `${Number(v||0).toFixed(1)}%`;}
  function codeOf(d){return d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;}

  function financialMetrics(d){
    const original=Math.max(0,Number(d.cost||0));
    const repairs=Math.max(0,Number(d.repair_cost_total||0));
    const age=Math.max(0,Number(d.age_years||0));
    const life=Math.max(1,Number(d.planned_life_years||10));
    const elapsedRatio=Math.min(1,age/life);
    const accumulatedEstimated=original*elapsedRatio;
    const remainingEstimated=Math.max(0,original-accumulatedEstimated);
    const repairRatio=original>0?(repairs/original)*100:0;
    const technicalLifecycleCost=original+repairs;

    let suggestion="Tiếp tục theo dõi";
    if(!original) suggestion="Bổ sung nguyên giá để đánh giá chi phí";
    else if(age>=life&&repairRatio>=30) suggestion="Ưu tiên đánh giá thay thế";
    else if(repairRatio>=50) suggestion="Rà soát hiệu quả tiếp tục sửa chữa";
    else if(age>=life) suggestion="Đánh giá kéo dài khai thác hoặc thay thế";
    else if(repairRatio>=20) suggestion="Theo dõi chặt chi phí sửa chữa";

    return {...d,
      original_cost:original,
      repair_cost_total_fin:repairs,
      repair_cost_ratio_fin:repairRatio,
      estimated_accumulated_value:accumulatedEstimated,
      estimated_remaining_value:remainingEstimated,
      technical_lifecycle_cost:technicalLifecycleCost,
      planned_life_fin:life,
      suggestion_fin:suggestion
    };
  }

  function fillDepartments(){
    const select=el("financeDepartment");
    if(!select)return;
    const departments=[...new Map(FINANCE_DEVICES.map(d=>[d.department_code,d.department_name||d.department_code]).filter(x=>x[0])).entries()]
      .sort((a,b)=>String(a[0]).localeCompare(String(b[0]),"vi"));
    const current=select.value||"ALL";
    select.innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+departments.map(([code,name])=>`<option value="${esc(code)}">${esc(code)} - ${esc(name)}</option>`).join("");
    if([...select.options].some(o=>o.value===current))select.value=current;
  }

  function filtered(){
    const dep=el("financeDepartment")?.value||"ALL";
    const text=(el("financeSearch")?.value||"").trim().toLowerCase();
    return FINANCE_DEVICES.filter(d=>(dep==="ALL"||d.department_code===dep)&&(!text||[codeOf(d),d.name,d.model,d.serial,d.department_code].join(" ").toLowerCase().includes(text)));
  }

  function renderSummary(rows){
    const original=rows.reduce((s,d)=>s+d.original_cost,0);
    const repairs=rows.reduce((s,d)=>s+d.repair_cost_total_fin,0);
    const remaining=rows.reduce((s,d)=>s+d.estimated_remaining_value,0);
    const total=rows.reduce((s,d)=>s+d.technical_lifecycle_cost,0);
    if(el("financeOriginalTotal"))el("financeOriginalTotal").textContent=money(original);
    if(el("financeRepairTotal"))el("financeRepairTotal").textContent=money(repairs);
    if(el("financeRemainingTotal"))el("financeRemainingTotal").textContent=money(remaining);
    if(el("financeTechnicalTotal"))el("financeTechnicalTotal").textContent=money(total);
    if(el("financeCount"))el("financeCount").textContent=`${rows.length} thiết bị`;
  }

  function render(){
    const rows=filtered();
    renderSummary(rows);
    const body=el("financeRows");
    if(!body)return;
    body.innerHTML=rows.map(d=>`<tr>
      <td class="lcm-code">${esc(codeOf(d))}</td>
      <td><b>${esc(d.name||"")}</b><small>${esc([d.manufacturer,d.model].filter(Boolean).join(" · "))}</small></td>
      <td>${esc(d.department_code||"")}</td>
      <td>${d.original_cost?money(d.original_cost):"—"}</td>
      <td>${Number(d.age_years||0)} / ${Number(d.planned_life_fin||10)} năm</td>
      <td>${money(d.repair_cost_total_fin)}</td>
      <td>${d.original_cost?pct(d.repair_cost_ratio_fin):"—"}</td>
      <td>${d.original_cost?money(d.estimated_remaining_value):"—"}</td>
      <td>${d.original_cost?money(d.technical_lifecycle_cost):"—"}</td>
      <td>${esc(d.suggestion_fin)}</td>
      <td><a class="btn btn-sm" href="/device-detail.html?id=${d.id}&from=lcm">Hồ sơ</a></td>
    </tr>`).join("")||'<tr><td colspan="11" class="lcm-empty">Chưa có dữ liệu phù hợp.</td></tr>';
  }

  async function loadFinance(){
    try{
      const devices=await api("/api/lcm/devices");
      FINANCE_DEVICES=(devices||[]).map(financialMetrics);
      fillDepartments();
      render();
    }catch(e){
      console.error("Chi phí vòng đời:",e);
      const body=el("financeRows");
      if(body)body.innerHTML='<tr><td colspan="11" class="lcm-empty">Không tải được dữ liệu chi phí vòng đời.</td></tr>';
    }
  }

  window.reloadLcmFinance=loadFinance;

  document.addEventListener("DOMContentLoaded",()=>{
    el("financeDepartment")?.addEventListener("change",render);
    el("financeSearch")?.addEventListener("input",render);
    el("financeReset")?.addEventListener("click",()=>{
      if(el("financeDepartment"))el("financeDepartment").value="ALL";
      if(el("financeSearch"))el("financeSearch").value="";
      render();
    });
    loadFinance();
  });
})();
