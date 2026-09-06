(function(){
  function movementClass(type){return type==="Cấp phát"?"issue":type==="Thu hồi"?"recall":"transfer";}
  function movementPill(type){return `<span class="movement-pill ${movementClass(type)}">${esc(type||"Điều chuyển")}</span>`;}

  function updateMovementType(){
    const type=q("movementType")?.value||"Điều chuyển";
    const target=q("transferToDepartment");
    const label=q("movementTargetLabel");
    const hint=q("movementHint");
    const d=deviceById(q("transferDevice")?.value);
    if(!target) return;

    target.disabled=false;
    if(type==="Thu hồi"){
      target.value="C10";
      target.disabled=true;
      if(label) label.textContent="Nơi thu hồi";
      if(hint) hint.textContent="Thiết bị sẽ được thu hồi về Khoa Trang bị. Nếu chưa nhập vị trí, hệ thống dùng Khoa Trang bị / Kho.";
      if(q("transferToLocation")&&!q("transferToLocation").value) q("transferToLocation").placeholder="Khoa Trang bị / Kho";
    }else if(type==="Cấp phát"){
      if(label) label.textContent="Khoa nhận cấp phát";
      if(target.value==="C10") target.value="";
      if(hint){
        const ready=d&&d.department_code==="C10";
        hint.textContent=ready?"Thiết bị đang ở Khoa Trang bị và có thể cấp phát cho khoa sử dụng.":"Cấp phát chỉ dùng cho thiết bị đang ở Khoa Trang bị. Nếu chuyển trực tiếp giữa hai khoa sử dụng, chọn Điều chuyển.";
        hint.classList.toggle("warn",Boolean(d&&!ready));
      }
      if(q("transferToLocation")) q("transferToLocation").placeholder="Vị trí đặt máy tại khoa nhận";
    }else{
      if(label) label.textContent="Khoa nhận điều chuyển";
      if(hint) hint.textContent="Điều chuyển dùng khi chuyển thiết bị trực tiếp từ khoa đang sử dụng sang khoa khác.";
      if(q("transferToLocation")) q("transferToLocation").placeholder="Vị trí mới";
    }
  }

  function updateMovementCurrent(){
    const d=deviceById(q("transferDevice")?.value);
    if(q("transferCurrent")) q("transferCurrent").textContent=d
      ?`Hiện tại: ${d.department_code||"Chưa rõ khoa"} · ${d.location||"Chưa cập nhật vị trí"} · ${d.status||"Chưa rõ trạng thái"}`
      :"Chọn thiết bị để xem khoa/vị trí hiện tại.";
    updateMovementType();
  }

  function renderMovements(){
    const rows=LCM_TRANSFERS||[];
    if(q("transferRows")) q("transferRows").innerHTML=rows.map(t=>`
      <tr>
        <td>${movementPill(t.movement_type||"Điều chuyển")}</td>
        <td>${dateOrDash(t.transfer_date)}</td>
        <td><div class="lcm-device-name">${esc(t.device_name||"")}</div><small class="lcm-code">${esc(t.device_code||"")}</small></td>
        <td class="movement-route-cell"><b>${esc(t.from_department||"—")}</b><span>→</span><b>${esc(t.to_department||"—")}</b><small>${[t.from_department_name,t.to_department_name].filter(Boolean).map(esc).join(" → ")}</small></td>
        <td>${esc(t.to_location||"—")}</td>
        <td>${esc(t.handover_condition||"—")}</td>
        <td>${esc(t.document_no||"—")}</td>
        <td class="movement-handover-cell"><span>${esc(t.giver||"—")} → ${esc(t.receiver||"—")}</span>${t.approved_by?`<small>Duyệt: ${esc(t.approved_by)}</small>`:""}</td>
        <td>${esc(t.reason||"—")}</td>
      </tr>`).join("")||emptyRow(9);

    if(q("movementSummary")){
      const counts={"Cấp phát":0,"Thu hồi":0,"Điều chuyển":0};
      rows.forEach(x=>{const k=x.movement_type||"Điều chuyển";counts[k]=(counts[k]||0)+1;});
      q("movementSummary").textContent=`Tổng ${rows.length} phiếu · Cấp phát ${counts["Cấp phát"]||0} · Thu hồi ${counts["Thu hồi"]||0} · Điều chuyển ${counts["Điều chuyển"]||0}`;
    }
  }

  async function saveMovement(e){
    e.preventDefault();
    const type=q("movementType").value;
    const target=type==="Thu hồi"?"C10":q("transferToDepartment").value;
    const p={
      movement_type:type,
      device_id:Number(q("transferDevice").value),
      transfer_date:q("transferDate").value,
      to_department:target,
      to_location:q("transferToLocation").value.trim(),
      reason:q("transferReason").value.trim(),
      document_no:q("transferDocumentNo").value.trim(),
      handover_condition:q("transferCondition").value.trim(),
      giver:q("transferGiver").value.trim(),
      receiver:q("transferReceiver").value.trim(),
      approved_by:q("transferApprovedBy").value.trim(),
      note:q("transferNote").value.trim()
    };
    if(!p.device_id){alert("Vui lòng chọn thiết bị.");return false;}
    if(type!=="Thu hồi"&&!p.to_department){alert("Vui lòng chọn khoa nhận.");return false;}
    const confirmText=type==="Thu hồi"
      ?"Xác nhận thu hồi thiết bị về Khoa Trang bị?"
      :type==="Cấp phát"?"Xác nhận cấp phát thiết bị cho khoa sử dụng?":"Xác nhận điều chuyển thiết bị?";
    if(!confirm(confirmText)) return false;
    try{
      await api("/api/lcm/movements",{method:"POST",body:JSON.stringify(p)});
      const savedDeviceId=p.device_id;
      q("transferForm").reset();
      q("movementType").value="Điều chuyển";
      q("transferDate").value=todayISO();
      await reloadLcm();
      updateMovementCurrent();
      document.dispatchEvent(new CustomEvent("lcm:movement-saved",{detail:{device_id:savedDeviceId,movement_type:type}}));
      return true;
    }catch(err){alert(err.message);return false;}
  }

  function loadMovementUiAssets(){
    if(!document.querySelector('link[href="/lcm-movement-ui.css"]')){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="/lcm-movement-ui.css";
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[src="/lcm-movement-ui.js"]')){
      const script=document.createElement("script");
      script.src="/lcm-movement-ui.js";
      script.async=false;
      document.head.appendChild(script);
    }
  }

  // Ghi đè ba hàm cũ của mục Điều chuyển nhưng giữ nguyên cơ chế reload LCM hiện có.
  renderTransfers=renderMovements;
  saveTransfer=saveMovement;
  updateTransferCurrent=updateMovementCurrent;

  document.addEventListener("DOMContentLoaded",()=>{
    const type=q("movementType");
    if(type) type.addEventListener("change",updateMovementType);
    const target=q("transferToDepartment");
    if(target) target.addEventListener("change",()=>{
      if(q("movementType")?.value==="Cấp phát"&&target.value==="C10"){
        target.value="";
        alert("Khoa nhận cấp phát phải là khoa sử dụng, không chọn Khoa Trang bị.");
      }
    });
    updateMovementCurrent();
  });

  loadMovementUiAssets();
})();
