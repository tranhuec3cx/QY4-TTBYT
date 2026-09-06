(function(){
  let selectedMovementDeviceId=0;
  let initialized=false;

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
    const form=panel.querySelector("#transferForm");
    const formCard=form?.closest("section.card");
    const rowsCard=formCard?.nextElementSibling;
    if(!form||!formCard||!rowsCard)return;
    panel.dataset.redesigned="1";

    form.hidden=true;
    formCard.classList.add("movement-hidden-form-card");
    formCard.hidden=true;

    const dashboard=document.createElement("section");
    dashboard.className="card movement-dashboard-card";
    dashboard.innerHTML=`
      <div class="table-card-header movement-dashboard-head">
        <div>
          <h3>Biến động thiết bị</h3>
          <span class="lcm-note">Chọn thiết bị, sau đó chọn đúng nghiệp vụ cần thực hiện.</span>
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
        <button type="button" class="movement-action issue" data-movement-type="Cấp phát" disabled>
          <b>Cấp phát</b><span>Từ Khoa Trang bị → khoa sử dụng.</span>
        </button>
        <button type="button" class="movement-action recall" data-movement-type="Thu hồi" disabled>
          <b>Thu hồi</b><span>Từ khoa sử dụng → Khoa Trang bị.</span>
        </button>
        <button type="button" class="movement-action transfer" data-movement-type="Điều chuyển" disabled>
          <b>Điều chuyển</b><span>Từ khoa đang dùng → khoa sử dụng khác.</span>
        </button>
      </div>`;
    panel.insertBefore(dashboard,rowsCard);

    const oldHead=rowsCard.querySelector(".table-card-header");
    if(oldHead)oldHead.innerHTML=`<div><h3>Lịch sử biến động</h3><span id="movementSummary" class="lcm-note"></span></div>`;
    const thead=rowsCard.querySelector(".movement-table thead");
    if(thead)thead.innerHTML="<tr><th>Loại</th><th>Ngày</th><th>Thiết bị</th><th>Từ → Đến</th><th>Vị trí mới</th><th>Tình trạng</th><th>Văn bản</th><th>Bàn giao</th><th>Lý do</th></tr>";

    bindMovementDashboard();
    renderActionAvailability();
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

  function renderActionAvailability(){
    const d=movementDevice();
    const issue=document.querySelector('.movement-action[data-movement-type="Cấp phát"]');
    const recall=document.querySelector('.movement-action[data-movement-type="Thu hồi"]');
    const transfer=document.querySelector('.movement-action[data-movement-type="Điều chuyển"]');
    if(!d){
      [issue,recall,transfer].forEach(btn=>{if(btn){btn.disabled=true;btn.title="Chọn thiết bị trước";}});
      return;
    }
    const atEquipment=String(d.department_code||"")==="C10";
    if(issue){issue.disabled=!atEquipment;issue.title=atEquipment?"Cấp phát thiết bị cho khoa sử dụng":"Chỉ cấp phát khi thiết bị đang ở Khoa Trang bị";}
    if(recall){recall.disabled=atEquipment;recall.title=atEquipment?"Thiết bị đã ở Khoa Trang bị":"Thu hồi thiết bị về Khoa Trang bị";}
    if(transfer){transfer.disabled=atEquipment;transfer.title=atEquipment?"Thiết bị ở Khoa Trang bị nên dùng Cấp phát":"Điều chuyển trực tiếp giữa hai khoa sử dụng";}
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
    if(!d){if(empty)empty.hidden=false;if(info)info.hidden=true;renderActionAvailability();return;}
    if(empty)empty.hidden=true;if(info)info.hidden=false;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||"—";};
    set("movementCurrentDevice",`${codeOfMovement(d)} - ${d.name||""}`);
    set("movementCurrentDepartment",[d.department_code,d.department_name].filter(Boolean).join(" - "));
    set("movementCurrentLocation",d.location||"Chưa cập nhật");
    set("movementCurrentStatus",d.status||"Chưa cập nhật");
    renderActionAvailability();
  }

  function markRequiredFields(){
    const dateInput=document.getElementById("transferDate");
    const dateLabel=dateInput?.closest("label");
    if(dateLabel&&dateLabel.firstChild&&dateLabel.firstChild.nodeType===3)dateLabel.firstChild.textContent="Ngày thực hiện *";
    if(dateInput)dateInput.setAttribute("aria-required","true");

    const targetLabel=document.getElementById("movementTargetLabel");
    if(targetLabel){
      const text=String(targetLabel.textContent||"").replace(/\s*\*\s*$/g,"");
      targetLabel.textContent=`${text} *`;
    }
    document.getElementById("transferToDepartment")?.setAttribute("aria-required","true");
  }

  function fillMovementFormFromSelection(type){
    const d=movementDevice();
    if(!d){alert("Vui lòng chọn thiết bị trước.");return false;}
    const form=document.getElementById("transferForm");
    const typeSelect=document.getElementById("movementType");
    const deviceSelect=document.getElementById("transferDevice");
    const dateInput=document.getElementById("transferDate");
    if(!form||!typeSelect||!deviceSelect||!dateInput)return false;

    form.reset();
    typeSelect.value=type;
    deviceSelect.value=String(d.id);
    dateInput.value="";

    const typeLabel=typeSelect.closest("label");
    if(typeLabel){typeLabel.hidden=true;typeLabel.style.display="none";}
    deviceSelect.hidden=true;
    deviceSelect.style.display="none";

    if(typeof updateTransferCurrent==="function")updateTransferCurrent();
    markRequiredFields();

    const saveButton=form.querySelector('button[type="submit"]');
    if(saveButton)saveButton.textContent=type==="Cấp phát"?"Lưu cấp phát":type==="Thu hồi"?"Lưu thu hồi":"Lưu điều chuyển";
    return true;
  }

  function openMovementDialog(type){
    ensureDialog();
    if(!fillMovementFormFromSelection(type))return;
    const d=movementDevice();
    const dialog=document.getElementById("movementDialog");
    const body=document.getElementById("movementDialogBody");
    const form=document.getElementById("transferForm");
    const title=document.getElementById("movementDialogTitle");
    const subtitle=document.getElementById("movementDialogSubtitle");
    if(!dialog||!body||!form||!d)return;
    if(title)title.textContent=type;
    if(subtitle){
      const actionText=type==="Cấp phát"?"đến khoa sử dụng":type==="Thu hồi"?"về Khoa Trang bị":"sang khoa sử dụng khác";
      subtitle.textContent=`${codeOfMovement(d)} - ${d.name||"Thiết bị"} · Ghi nhận ${type.toLowerCase()} ${actionText}.`;
    }
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
    document.querySelectorAll(".movement-action").forEach(btn=>btn.addEventListener("click",()=>{if(!btn.disabled)openMovementDialog(btn.dataset.movementType);}));
  }

  function refreshSelectedMovementDevice(){
    if(!selectedMovementDeviceId){renderCurrentMovementDevice();return;}
    const d=(typeof LCM_DEVICES!=="undefined"?LCM_DEVICES:[]).find(x=>Number(x.id)===Number(selectedMovementDeviceId));
    if(!d){selectedMovementDeviceId=0;const input=document.getElementById("movementDeviceSearch");if(input)input.value="";}
    renderCurrentMovementDevice();
  }

  function init(){
    if(initialized)return;
    const panel=document.querySelector('[data-panel="transfers"]');
    if(!panel)return;
    initialized=true;
    ensureDialog();
    installMovementLayout();
    document.addEventListener("lcm:movement-saved",()=>{
      const dialog=document.getElementById("movementDialog");
      if(dialog?.open)dialog.close();
      setTimeout(refreshSelectedMovementDevice,0);
    });
    if(typeof reloadLcm==="function"){
      const originalReload=reloadLcm;
      reloadLcm=async function(){const r=await originalReload();refreshSelectedMovementDevice();return r;};
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
