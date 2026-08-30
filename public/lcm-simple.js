(function(){
  const GROUP_MAP={overview:"profile",receipts:"profile",profile:"profile",transfers:"transfers",movement:"transfers",risk:"assessment",finance:"assessment",replacement:"assessment",disposals:"assessment",assessment:"assessment"};
  const detailsMap={receipts:"receiptDetails",risk:"riskDetails",finance:"financeDetails",replacement:"replacementDetails",disposals:"disposalDetails"};

  function simpleSetTab(name){
    const group=GROUP_MAP[name]||"profile";
    document.querySelectorAll("#lcmTabs button").forEach(b=>b.classList.toggle("active",(b.dataset.tab||b.dataset.simpleTab)===group));
    document.querySelectorAll(".simple-lcm-panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===group));
    const detailId=detailsMap[name];
    if(detailId){const d=document.getElementById(detailId);if(d)d.open=true;}
  }

  try{ setTab=simpleSetTab; }catch(_){ window.setTab=simpleSetTab; }

  function codeOfSimple(d){return d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;}
  function fillProfileSelector(){
    const sel=document.getElementById("simpleProfileDevice");
    if(!sel||typeof LCM_DEVICES==="undefined")return;
    const current=sel.value||new URL(location.href).searchParams.get("device_id")||"";
    sel.innerHTML='<option value="">Chọn thiết bị để xem hồ sơ vòng đời</option>'+LCM_DEVICES.map(d=>`<option value="${d.id}">${codeOfSimple(d)} - ${String(d.name||"").replace(/</g,"&lt;")} [${d.department_code||""}]</option>`).join("");
    if(current&&LCM_DEVICES.some(d=>String(d.id)===String(current)))sel.value=String(current);
    renderSimpleProfile();
  }

  function renderSimpleProfile(){
    const sel=document.getElementById("simpleProfileDevice");
    const id=Number(sel?.value||0);
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===id);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v??"—";};
    const open=document.getElementById("simpleProfileOpen");
    const assess=document.getElementById("simpleProfileAssess");
    if(!d){
      set("simpleProfileStage","—");set("simpleProfileAge","—");set("simpleProfileRisk","—");set("simpleProfileAvailability","—");set("simpleProfileRepairs","—");set("simpleProfileDecision","Chọn thiết bị để xem tóm tắt vòng đời và khuyến nghị quản lý.");
      if(open){open.href="#";open.classList.add("disabled");}
      if(assess)assess.disabled=true;
      return;
    }
    set("simpleProfileStage",d.lifecycle_stage||"Khai thác");
    set("simpleProfileAge",`${Number(d.age_years||0)} năm`);
    set("simpleProfileRisk",`${d.risk_level||"—"} · ${Number(d.risk_score||0)}/100`);
    set("simpleProfileAvailability",`${Number(d.availability_percent||0).toFixed(1)}%`);
    set("simpleProfileRepairs",`${Number(d.repair_count_12m||0)} lần/12T`);
    set("simpleProfileDecision",d.recommendation||"Tiếp tục khai thác");
    if(open){open.href=`/device-detail.html?id=${d.id}&from=lcm`;open.classList.remove("disabled");}
    if(assess){assess.disabled=false;assess.onclick=()=>{simpleSetTab("risk");const s=document.getElementById("riskSearch");if(s){s.value=codeOfSimple(d);if(typeof renderRisk==="function")renderRisk();}document.getElementById("riskDetails")?.scrollIntoView({behavior:"smooth",block:"start"});};}
  }

  function moveMenuLink(){
    const link=document.querySelector('.menu a[href="/lcm.html"]');
    const inspection=document.querySelector('.menu a[href="/inspections.html"]');
    if(link&&inspection&&inspection.nextSibling!==link) inspection.insertAdjacentElement("afterend",link);
  }

  if(typeof reloadLcm==="function"){
    const originalReload=reloadLcm;
    reloadLcm=async function(){const r=await originalReload();fillProfileSelector();if(typeof reloadLcmFinance==="function")await reloadLcmFinance();return r;};
  }

  document.addEventListener("DOMContentLoaded",()=>{
    moveMenuLink();
    document.querySelectorAll("#lcmTabs button").forEach(b=>b.addEventListener("click",()=>simpleSetTab(b.dataset.tab||b.dataset.simpleTab)));
    document.getElementById("simpleProfileDevice")?.addEventListener("change",renderSimpleProfile);
    document.getElementById("simpleRefreshProfile")?.addEventListener("click",async()=>{if(typeof reloadLcm==="function")await reloadLcm();});
    const requested=new URL(location.href).searchParams.get("tab");
    simpleSetTab(requested||"profile");
    setTimeout(fillProfileSelector,0);
  });
})();