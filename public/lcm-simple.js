(function(){
  const GROUP_MAP={overview:"profile",receipts:"profile",profile:"profile",transfers:"transfers",movement:"transfers",risk:"assessment",finance:"assessment",replacement:"assessment",disposals:"assessment",assessment:"assessment"};
  const detailsMap={receipts:"receiptDetails",risk:"riskDetails",finance:"financeDetails",replacement:"replacementDetails",disposals:"disposalDetails"};
  let profileTimelineRequest=0;

  function simpleSetTab(name){
    const group=GROUP_MAP[name]||"profile";
    document.querySelectorAll("#lcmTabs button").forEach(b=>b.classList.toggle("active",(b.dataset.tab||b.dataset.simpleTab)===group));
    document.querySelectorAll(".simple-lcm-panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===group));
    const detailId=detailsMap[name];
    if(detailId){const d=document.getElementById(detailId);if(d)d.open=true;}
  }

  try{ setTab=simpleSetTab; }catch(_){ window.setTab=simpleSetTab; }

  function codeOfSimple(d){return d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;}
  function escSimple(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]||c));}
  function normalizeSimple(v){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().trim();}
  function moneySimple(v){return typeof formatCurrency==="function"?formatCurrency(Number(v||0)):`${Number(v||0).toLocaleString("vi-VN")} đ`;}
  function dateSimple(v){return v?(typeof formatDateVN==="function"?formatDateVN(String(v).slice(0,10)):String(v).slice(0,10)):"—";}
  function deviceSearchText(d){return normalizeSimple([codeOfSimple(d),d?.name,d?.model].filter(Boolean).join(" "));}
  function deviceSearchLabel(d){return [codeOfSimple(d),d?.name,d?.model].filter(Boolean).join(" - ");}
  function friendlyStage(stage){
    const s=String(stage||"");
    if(s==="Khai thác")return "Đang sử dụng";
    if(s==="Sửa chữa")return "Đang sửa chữa";
    if(s==="Ngừng khai thác")return "Ngừng sử dụng";
    if(s==="Thanh lý")return "Chờ thanh lý";
    return s||"Đang sử dụng";
  }

  function installProfileShell(){
    const grid=document.querySelector('[data-panel="profile"] .simple-profile-grid');
    if(!grid||grid.dataset.redesigned==="1")return;
    grid.dataset.redesigned="1";
    grid.innerHTML=`
      <div class="simple-profile-search-row">
        <div class="simple-device-search-wrap">
          <label for="simpleProfileSearch">Tìm thiết bị</label>
          <input id="simpleProfileSearch" type="text" autocomplete="off" placeholder="Gõ mã thiết bị, tên thiết bị hoặc model để tìm" />
          <input id="simpleProfileDevice" type="hidden" value="" />
          <div id="simpleProfileSuggestions" class="simple-device-suggestions" hidden></div>
        </div>
        <div class="simple-profile-actions">
          <a class="btn btn-primary disabled" id="simpleProfileOpen" href="#">Xem hồ sơ đầy đủ</a>
          <button class="btn" id="simpleProfileAssess" type="button" disabled>Xem đánh giá</button>
        </div>
      </div>

      <div id="simpleProfileContent" class="simple-profile-content" hidden>
        <div class="simple-asset-header">
          <div class="simple-asset-title-block">
            <div class="simple-asset-title-row">
              <h2 id="simpleAssetName">—</h2>
              <span id="simpleAssetStatus" class="simple-status-pill">—</span>
            </div>
            <div id="simpleAssetCodeModel" class="simple-asset-code">—</div>
            <div id="simpleAssetLocation" class="simple-asset-location">—</div>
          </div>
        </div>

        <div class="simple-profile-kpis">
          <div class="simple-metric stage"><span>Tình trạng hiện tại</span><b id="simpleProfileStage">—</b></div>
          <div class="simple-metric age"><span>Đã sử dụng / Dự kiến</span><b id="simpleProfileAge">—</b></div>
          <div class="simple-metric risk"><span>Mức cảnh báo</span><b id="simpleProfileRisk">—</b></div>
          <div class="simple-metric availability"><span>Khả năng hoạt động 12 tháng (ước tính)</span><b id="simpleProfileAvailability">—</b></div>
          <div class="simple-metric repairs"><span>Số lần sửa trong 12 tháng</span><b id="simpleProfileRepairs">—</b></div>
          <div class="simple-metric cost"><span>Tổng tiền sửa chữa</span><b id="simpleProfileRepairCost">—</b></div>
        </div>

        <div class="simple-lifecycle-card">
          <div class="simple-card-heading">
            <div><b>QUÁ TRÌNH SỬ DỤNG THIẾT BỊ</b><span>Cho biết thiết bị đang ở bước nào từ tiếp nhận đến thanh lý.</span></div>
          </div>
          <div id="simpleLifecycleProgress" class="simple-lifecycle-progress"></div>
        </div>

        <div class="simple-deadline-grid">
          <div id="simpleDeadlineMaintenance" class="simple-deadline"><span>Bảo dưỡng tiếp theo</span><b>—</b><small>—</small></div>
          <div id="simpleDeadlineInspection" class="simple-deadline"><span>Kiểm định / hiệu chuẩn tiếp theo</span><b>—</b><small>—</small></div>
          <div id="simpleDeadlineWarranty" class="simple-deadline"><span>Bảo hành</span><b>—</b><small>—</small></div>
        </div>

        <div class="simple-profile-decision">
          <div><b>GỢI Ý XỬ LÝ</b><span id="simpleProfileDecision">—</span></div>
          <small>Mức cảnh báo và gợi ý chỉ giúp theo dõi, sắp xếp ưu tiên công việc; không thay thế đánh giá chuyên môn hoặc quyết định của người có thẩm quyền.</small>
        </div>

        <div class="simple-timeline-card">
          <div class="simple-card-heading">
            <div><b>HOẠT ĐỘNG GẦN ĐÂY</b><span id="simpleTimelineCount">Chưa có dữ liệu</span></div>
            <a id="simpleTimelineOpen" class="simple-text-link disabled" href="#">Xem toàn bộ hồ sơ</a>
          </div>
          <div id="simpleTimeline" class="simple-timeline"><div class="simple-timeline-empty">Chọn thiết bị để xem các hoạt động gần đây.</div></div>
        </div>
      </div>`;
  }

  function statusClass(status){
    const s=normalizeSimple(status);
    if(s.includes("dang hoat dong"))return "active";
    if(s.includes("sua"))return "repair";
    if(s.includes("thanh ly")||s.includes("ngung"))return "stopped";
    return "neutral";
  }

  function stageState(d){
    const lifecycle=d?.lifecycle_stage||"Khai thác";
    const receipt=d?.receipt_status||"";
    if(lifecycle==="Đã thanh lý")return {index:5,allDone:true};
    if(lifecycle==="Thanh lý")return {index:5};
    if(lifecycle==="Ngừng khai thác")return {index:4};
    if(lifecycle==="Khai thác"||lifecycle==="Sửa chữa")return {index:3};
    if(lifecycle==="Tiếp nhận"){
      if(receipt==="Đã bàn giao"||receipt==="Hoàn thành")return {index:3};
      if(receipt==="Đã đào tạo")return {index:2};
      if(receipt==="Đã nghiệm thu")return {index:1};
      return {index:0};
    }
    return {index:3};
  }

  function renderLifecycleProgress(d){
    const host=document.getElementById("simpleLifecycleProgress");
    if(!host)return;
    const stages=["Tiếp nhận","Nghiệm thu","Bàn giao","Đang sử dụng","Xem xét thay mới","Thanh lý"];
    const state=stageState(d);
    host.innerHTML=stages.map((name,index)=>{
      const done=state.allDone||index<state.index;
      const current=!state.allDone&&index===state.index;
      const cls=done?"done":current?"current":"future";
      return `<div class="simple-stage ${cls}"><div class="simple-stage-dot">${done?"✓":current?"●":""}</div><span>${escSimple(name)}</span></div>`;
    }).join("");
  }

  function deadlineText(days,date){
    if(!date)return {title:"Chưa có lịch",meta:"Chưa nhập ngày tiếp theo",cls:"missing"};
    if(days===null||days===undefined||!Number.isFinite(Number(days)))return {title:dateSimple(date),meta:"Đã có lịch",cls:"normal"};
    const n=Number(days);
    if(n<0)return {title:`Quá hạn ${Math.abs(n)} ngày`,meta:dateSimple(date),cls:"overdue"};
    if(n===0)return {title:"Đến hạn hôm nay",meta:dateSimple(date),cls:"due"};
    if(n<=30)return {title:`Còn ${n} ngày`,meta:dateSimple(date),cls:"due"};
    return {title:`Còn ${n} ngày`,meta:dateSimple(date),cls:"normal"};
  }

  function renderDeadline(id,days,date){
    const box=document.getElementById(id);if(!box)return;
    const x=deadlineText(days,date);
    box.classList.remove("overdue","due","missing","normal");
    box.classList.add(x.cls);
    const b=box.querySelector("b"),small=box.querySelector("small");
    if(b)b.textContent=x.title;if(small)small.textContent=x.meta;
  }

  function clearProfile(){
    const content=document.getElementById("simpleProfileContent");if(content)content.hidden=true;
    const open=document.getElementById("simpleProfileOpen");
    const assess=document.getElementById("simpleProfileAssess");
    const timelineOpen=document.getElementById("simpleTimelineOpen");
    if(open){open.href="#";open.classList.add("disabled");}
    if(timelineOpen){timelineOpen.href="#";timelineOpen.classList.add("disabled");}
    if(assess)assess.disabled=true;
  }

  function renderSearchSuggestions(text){
    const box=document.getElementById("simpleProfileSuggestions");
    if(!box||typeof LCM_DEVICES==="undefined")return;
    const needle=normalizeSimple(text);
    let rows=LCM_DEVICES;
    if(needle)rows=rows.filter(d=>deviceSearchText(d).includes(needle));
    rows=rows.slice(0,20);
    if(!rows.length){box.innerHTML='<div class="simple-device-empty">Không tìm thấy thiết bị phù hợp.</div>';box.hidden=false;return;}
    box.innerHTML=rows.map(d=>`<button type="button" class="simple-device-option" data-device-id="${Number(d.id)}"><b>${escSimple(codeOfSimple(d))} - ${escSimple(d.name||"")}</b><span>${escSimple(d.model||"Chưa có model")}</span><small>${escSimple([d.department_code,d.location].filter(Boolean).join(" · "))}</small></button>`).join("");
    box.hidden=false;
  }

  function chooseProfileDevice(id){
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===Number(id));
    if(!d)return;
    const hidden=document.getElementById("simpleProfileDevice");
    const search=document.getElementById("simpleProfileSearch");
    const box=document.getElementById("simpleProfileSuggestions");
    if(hidden)hidden.value=String(d.id);
    if(search)search.value=deviceSearchLabel(d);
    if(box)box.hidden=true;
    renderSimpleProfile();
  }

  function fillProfileSelector(){
    installProfileShell();
    const hidden=document.getElementById("simpleProfileDevice");
    if(!hidden||typeof LCM_DEVICES==="undefined")return;
    const requested=new URL(location.href).searchParams.get("device_id")||"";
    const current=hidden.value||requested;
    if(current&&LCM_DEVICES.some(d=>String(d.id)===String(current))){chooseProfileDevice(current);return;}
    clearProfile();
  }

  function renderTimelineItems(items,d){
    const host=document.getElementById("simpleTimeline");
    const count=document.getElementById("simpleTimelineCount");
    if(!host)return;
    const rows=(Array.isArray(items)?items:[]).slice(0,5);
    if(count)count.textContent=rows.length?`${rows.length} hoạt động gần nhất`:"Chưa có hoạt động";
    host.innerHTML=rows.length?rows.map(x=>`
      <div class="simple-timeline-item">
        <div class="simple-timeline-axis"><i></i></div>
        <div class="simple-timeline-body">
          <div class="simple-timeline-top"><b>${escSimple(x.type||"Hoạt động")}${x.title?` · ${escSimple(x.title)}`:""}</b><time>${escSimple(dateSimple(x.date))}</time></div>
          ${x.detail?`<span>${escSimple(x.detail)}</span>`:""}
          ${x.status?`<small>${escSimple(x.status)}</small>`:""}
        </div>
      </div>`).join(""):'<div class="simple-timeline-empty">Chưa có hoạt động nào được ghi nhận.</div>';
    const timelineOpen=document.getElementById("simpleTimelineOpen");
    if(timelineOpen&&d){timelineOpen.href=`/device-detail.html?id=${d.id}&from=lcm`;timelineOpen.classList.remove("disabled");}
  }

  async function loadProfileTimeline(d){
    const request=++profileTimelineRequest;
    const host=document.getElementById("simpleTimeline");
    const count=document.getElementById("simpleTimelineCount");
    if(host)host.innerHTML='<div class="simple-timeline-empty">Đang tải hoạt động gần đây...</div>';
    if(count)count.textContent="Đang tải...";
    try{
      const items=await api(`/api/lcm/movement-timeline/${d.id}`);
      if(request!==profileTimelineRequest)return;
      renderTimelineItems(items,d);
    }catch(err){
      if(request!==profileTimelineRequest)return;
      console.error("LCM profile timeline:",err);
      if(host)host.innerHTML='<div class="simple-timeline-empty">Chưa tải được hoạt động gần đây. Hồ sơ thiết bị vẫn có thể mở bình thường.</div>';
      if(count)count.textContent="Không tải được lịch sử";
    }
  }

  function renderSimpleProfile(){
    const hidden=document.getElementById("simpleProfileDevice");
    const id=Number(hidden?.value||0);
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===id);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v??"—";};
    const open=document.getElementById("simpleProfileOpen");
    const assess=document.getElementById("simpleProfileAssess");
    const content=document.getElementById("simpleProfileContent");
    if(!d){clearProfile();return;}

    if(content)content.hidden=false;
    set("simpleAssetName",d.name||"Thiết bị");
    set("simpleAssetCodeModel",[codeOfSimple(d),d.manufacturer,d.model].filter(Boolean).join(" · "));
    set("simpleAssetLocation",[d.department_code,d.department_name,d.location].filter(Boolean).join(" · "));
    const status=document.getElementById("simpleAssetStatus");
    if(status){status.textContent=d.status||friendlyStage(d.lifecycle_stage);status.className=`simple-status-pill ${statusClass(d.status||d.lifecycle_stage)}`;}

    set("simpleProfileStage",friendlyStage(d.lifecycle_stage));
    set("simpleProfileAge",`${Number(d.age_years||0)} / ${Number(d.planned_life_years||10)} năm`);
    set("simpleProfileRisk",`${d.risk_level||"—"} · ${Number(d.risk_score||0)}/100`);
    set("simpleProfileAvailability",`${Number(d.availability_percent||0).toFixed(1)}%`);
    set("simpleProfileRepairs",`${Number(d.repair_count_12m||0)} lần`);
    set("simpleProfileRepairCost",moneySimple(d.repair_cost_total||0));
    set("simpleProfileDecision",d.recommendation||"Tiếp tục sử dụng");

    renderLifecycleProgress(d);
    renderDeadline("simpleDeadlineMaintenance",d.days_to_maintenance,d.next_maintenance);
    renderDeadline("simpleDeadlineInspection",d.days_to_inspection,d.next_inspection);
    renderDeadline("simpleDeadlineWarranty",d.days_to_warranty,d.warranty_end);

    if(open){open.href=`/device-detail.html?id=${d.id}&from=lcm`;open.classList.remove("disabled");}
    if(assess){assess.disabled=false;assess.onclick=()=>{simpleSetTab("risk");const s=document.getElementById("riskSearch");if(s){s.value=codeOfSimple(d);if(typeof renderRisk==="function")renderRisk();}document.getElementById("riskDetails")?.scrollIntoView({behavior:"smooth",block:"start"});};}
    loadProfileTimeline(d);
  }

  function bindProfileSearch(){
    const search=document.getElementById("simpleProfileSearch");
    const hidden=document.getElementById("simpleProfileDevice");
    const box=document.getElementById("simpleProfileSuggestions");
    if(!search||search.dataset.bound==="1")return;
    search.dataset.bound="1";
    search.addEventListener("focus",()=>renderSearchSuggestions(search.value));
    search.addEventListener("input",()=>{
      if(hidden)hidden.value="";
      clearProfile();
      renderSearchSuggestions(search.value);
    });
    search.addEventListener("keydown",e=>{
      if(e.key==="Escape"){if(box)box.hidden=true;return;}
      if(e.key==="Enter"){
        const first=box?.querySelector(".simple-device-option");
        if(first){e.preventDefault();chooseProfileDevice(first.dataset.deviceId);}
      }
    });
    box?.addEventListener("click",e=>{
      const btn=e.target.closest(".simple-device-option");
      if(btn)chooseProfileDevice(btn.dataset.deviceId);
    });
    document.addEventListener("click",e=>{
      if(box&&!e.target.closest(".simple-device-search-wrap"))box.hidden=true;
    });
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
    installProfileShell();
    bindProfileSearch();
    document.querySelectorAll("#lcmTabs button").forEach(b=>b.addEventListener("click",()=>simpleSetTab(b.dataset.tab||b.dataset.simpleTab)));
    document.getElementById("simpleRefreshProfile")?.addEventListener("click",async()=>{if(typeof reloadLcm==="function")await reloadLcm();});
    const requested=new URL(location.href).searchParams.get("tab");
    simpleSetTab(requested||"profile");
    setTimeout(fillProfileSelector,0);
  });
})();