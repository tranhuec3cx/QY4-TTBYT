(function(){
  let selectedMovementDeviceId=0;

  function normalize(v){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().trim();}
  function codeOfMovement(d){return d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;}
  function deviceSearchText(d){return normalize([codeOfMovement(d),d?.name,d?.model].filter(Boolean).join(" "));}
  function deviceSearchLabel(d){return [codeOfMovement(d),d?.name,d?.model].filter(Boolean).join(" - ");}
  function movementDevice(){return (typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(d=>Number(d.id)===Number(selectedMovementDeviceId))||null;}
  function escM(v){return typeof esc==="function"?esc(v):String(v??"");}

  function ensureDialog(){
    if(document.getElementById("movementDialog"))return;
    const dialog=document.createElement("dialog");
    dialog.id="movementDialog";
    dialog.className="movement-dialog";
    dialog.innerHTML=`
      <div class="movement-dialog-shell">
        <div class="movement-dialog-head">
          <div><h3 id="movementDialogTitle">Ghi nhận biến động</h3><p id="movementDialogSubtitle">Cập nhật cấp phát, thu hồi hoặc điều chuyển thiết bị.</p></div>
          <button type="button" class="movement-dialog-close" id="movementDialogClose" aria-label="Đóng">×</button>
        </div>
        <div id="movementDialogBody"></div>
      </div>`;
    document.body.appendChild(dialog);
    document.getElementById("movementDialogClose")?.addEventListener("click",()=>dialog.close());
    dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
  }

  function installMovementLayout(){
    const panel=document.querySelector('[data-panel="transfers"]');
    if(!panel||panel.dataset.redesigned==="1")return;
    panel.dataset.redesigned="1";
    const form=panel.querySelector("#transferForm");
    const rowsCard=form?.closest("section.card")?.nextElementSibling;
    if(!form||!rowsCard)return;

    form.hidden=true;
    form.closest("section.card").classList.add("movement-hidden-form-card");
    form.closest("section.card").hidden=true;

    const dashboard=document.createElement("section");
    dashboard.className="card movement-dashboard-card";
    dashboard.innerHTML=`
      <div class="table-card-header movement-dashboard-head">
        <div>
          <h3>Biến động thiết bị</h3>
          <span class="lcm-note">Theo dõi việc cấp phát, thu hồi và điều chuyển thiết bị giữa các khoa.</span>
        </div>
      </div>

      <div class="movement-current-card">
        <div class="movement-current-search">
          <label for="movementDeviceSearch">Tìm thiết bị</label>
          <input id="movementDeviceSearch" type="text" autocomplete="off" placeholder="Gõ mã thiết bị, tên thiết bị hoặc model để tìm" />
          <div id="movementDeviceSuggestions" class="movement-device-suggestions" hidden></div>
        </div>
        <div id="movementCurrentEmpty" class="movement-current-empty">Chọn một thiết bị để xem khoa, vị trí và trạng thái hiện tại.</div>
        <div id="movementCurrentInfo" class="movement-current-info" hidden>
          <div><span>Thiết bị</span><b id="movementCurrentDevice">—</b></div>
          <div><span>Khoa hiện tại</span><b id="movementCurrentDepartment">—</b></div>
          <div><span>Vị trí hiện tại</span><b id="movementCurrentLocation">—</b></div>
          <div><span>Trạng thái</span><b id="movementCurrentStatus">—</b></div>
        </div>
      </div>

      <div class="movement-action-grid">
        <button type="button" class="movement-action issue" data-movement-type="Cấp phát">
          <b>Cấp phát</b><span>Đưa thiết bị từ Khoa Trang bị đến khoa sử dụng.</span>
        </button>
        <button type="button" class="movement-action recall" data-movement-type="Thu hồi">
          <b>Thu hồi</b><span>Nhận thiết bị từ khoa sử dụng về Khoa Trang bị.</span>
        </button>
        <button type="button" class="movement-action transfer" data-movement-type="Điều chuyển">
          <b>Điều chuyển</b><span>Chuyển thiết bị trực tiếp từ khoa này sang khoa khác.</span>
        </button>
      </div>`;
    panel.insertBefore(dashboard,rowsCard);

    const oldHead=rowsCard.querySelector(".table-card-header");
    if(oldHead){
      oldHead.innerHTML=`<div><h3>Lịch sử biến động</h3><span id="movementSummary" class="lcm-note"></span></div>`;
    }
    bindMovementDashboard();
  }

  function renderMovementSuggestions(text){
    const box=document.getElementById("movementDeviceSuggestions");
    if(!box||typeof LCM_DEVICES==="undefined")return;
    const needle=normalize(text);
    let rows=LCM_DEVICES;
    if(needle)rows=rows.filter(d=>deviceSearchText(d).includes(needle));
    rows=rows.slice(0,20);
    if(!rows.length){box.innerHTML='<div class="movement-device-empty">Không tìm thấy thiết bị phù hợp.</div>';box.hidden=false;return;}
    box.innerHTML=rows.map(d=>`<button type="button" class="movement-device-option" data-device-id="${Number(d.id)}"><b>${escM(codeOfMovement(d))} - ${escM(d.name||"")}</b><span>${escM(d.model||"Chưa có model")}</span><small>${escM([d.department_code,d.location].filter(Boolean).join(" · "))}</small></button>`).join("");
    box.hidden=false;
  }

  function chooseMovementDevice(id){
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===Number(id));
    if(!d)return;
    selectedMovementDeviceId=Number(d.id);
    const input=document.getElementById("movementDeviceSearch");
    const box=document.getElementById("movementDeviceSuggestions");
    if(input)input.value=deviceSearchLabel(d);
    if(box)box.hidden=true;
    renderCurrentMovementDevice();
  }

  function renderCurrentMovementDevice(){
    const d=movementDevice();
    const empty=document.getElementById("movementCurrentEmpty");
    const info=document.getElementById("movementCurrentInfo");
    if(!d){if(empty)empty.hidden=false;if(info)info.hidden=true;return;}
    if(empty)empty.hidden=true;if(info)info.hidden=false;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||"—";};
    set("movementCurrentDevice",`${codeOfMovement(d)} - ${d.name||""}`);
    set("movementCurrentDepartment",[d.department_code,d.department_name].filter(Boolean).join(" - "));
    set("movementCurrentLocation",d.location||"Chưa cập nhật");
    set("movementCurrentStatus",d.status||"Chưa cập nhật");
  }

  function fillMovementFormFromSelection(type){
    const d=movementDevice();
    if(!d){alert("Vui lòng chọn thiết bị trước.");return false;}
    const form=document.getElementById("transferForm");
    if(!form)return false;
    form.reset();
    document.getElementById("movementType").value=type;
    document.getElementById("transferDevice").value=String(d.id);
    document.getElementById("transferDate").value=typeof todayISO==="function"?todayISO():new Date().toISOString().slice(0,10);
    if(typeof updateMovementCurrent==="function")updateMovementCurrent();
    return true;
  }

  function openMovementDialog(type){
    ensureDialog();
    if(!fillMovementFormFromSelection(type))return;
    const dialog=document.getElementById("movementDialog");
    const body=document.getElementById("movementDialogBody");
    const form=document.getElementById("transferForm");
    const title=document.getElementById("movementDialogTitle");
    const subtitle=document.getElementById("movementDialogSubtitle");
    if(!dialog||!body||!form)return;
    if(title)title.textContent=type;
    if(subtitle)subtitle.textContent=type==="Cấp phát"?"Ghi nhận việc đưa thiết bị đến khoa sử dụng.":type==="Thu hồi"?"Ghi nhận việc nhận thiết bị về Khoa Trang bị.":"Ghi nhận việc chuyển thiết bị giữa hai khoa.";
    body.appendChild(form);
    form.hidden=false;
    dialog.showModal();
  }

  function bindMovementDashboard(){
    const input=document.getElementById("movementDeviceSearch");
    const box=document.getElementById("movementDeviceSuggestions");
    input?.addEventListener("focus",()=>renderMovementSuggestions(input.value));
    input?.addEventListener("input",()=>{selectedMovementDeviceId=0;renderCurrentMovementDevice();renderMovementSuggestions(input.value);});
    input?.addEventListener("keydown",e=>{
      if(e.key==="Escape"){if(box)box.hidden=true;return;}
      if(e.key==="Enter"){
        const first=box?.querySelector(".movement-device-option");
        if(first){e.preventDefault();chooseMovementDevice(first.dataset.deviceId);}
      }
    });
    box?.addEventListener("click",e=>{const btn=e.target.closest(".movement-device-option");if(btn)chooseMovementDevice(btn.dataset.deviceId);});
    document.addEventListener("click",e=>{if(box&&!e.target.closest(".movement-current-search"))box.hidden=true;});
    document.querySelectorAll(".movement-action").forEach(btn=>btn.addEventListener("click",()=>openMovementDialog(btn.dataset.movementType)));
  }

  function refreshSelectedMovementDevice(){
    if(!selectedMovementDeviceId)return;
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===Number(selectedMovementDeviceId));
    if(!d){selectedMovementDeviceId=0;const input=document.getElementById("movementDeviceSearch");if(input)input.value="";}
    renderCurrentMovementDevice();
  }

  document.addEventListener("DOMContentLoaded",()=>{
    ensureDialog();
    installMovementLayout();
    const form=document.getElementById("transferForm");
    form?.addEventListener("submit",()=>setTimeout(()=>{
      const dialog=document.getElementById("movementDialog");
      if(dialog?.open)dialog.close();
      setTimeout(refreshSelectedMovementDevice,250);
    },0),true);
  });

  if(typeof reloadLcm==="function"){
    const originalReload=reloadLcm;
    reloadLcm=async function(){const r=await originalReload();refreshSelectedMovementDevice();return r;};
  }
})();
