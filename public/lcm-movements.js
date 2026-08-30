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
      if(hint) hint.textContent="Thu hồi: thiết bị được chuyển về C10 - Khoa Trang bị; vị trí mặc định là Khoa Trang bị / Kho nếu chưa nhập.";
      if(q("transferToLocation")&&!q("transferToLocation").value) q("transferToLocation").placeholder="Khoa Trang bị / Kho";
    }else if(type==="Cấp phát"){
      if(label) label.textContent="Khoa nhận cấp phát";
      if(target.value==="C10") target.value="";
      if(hint){
        const ready=d&&d.department_code==="C10";
        hint.textContent=ready?"Thiết bị đang do C10 quản lý, có thể cấp phát cho khoa sử dụng.":"Cấp phát chỉ dùng khi thiết bị đang do C10 - Khoa Trang bị quản lý. Nếu chuyển giữa hai khoa sử dụng, chọn Điều chuyển.";
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
        <td>${esc(t.from_department||"")}<small>${t.from_location?` · ${esc(t.from_location)}`:""}</small></td>
        <td>${esc(t.to_department||"")}<small>${t.to_location?` · ${esc(t.to_location)}`:""}</small></td>
        <td>${esc(t.to_location||"")}</td>
        <td>${esc(t.handover_condition||"")}</td>
        <td>${esc(t.document_no||"")}</td>
        <td>${esc(t.giver||"")}</td>
        <td>${esc(t.receiver||"")}</td>
        <td>${esc(t.reason||"")}</td>
      </tr>`).join("")||emptyRow(11);

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
    if(!p.device_id){alert("Chọn thiết bị.");return;}
    if(type!=="Thu hồi"&&!p.to_department){alert("Chọn khoa nhận.");return;}
    const confirmText=type==="Thu hồi"
      ?"Xác nhận thu hồi thiết bị về C10 - Khoa Trang bị?"
      :type==="Cấp phát"?"Xác nhận cấp phát thiết bị cho khoa sử dụng?":"Xác nhận điều chuyển thiết bị?";
    if(!confirm(confirmText)) return;
    try{
      await api("/api/lcm/movements",{method:"POST",body:JSON.stringify(p)});
      q("transferForm").reset();
      q("movementType").value="Điều chuyển";
      q("transferDate").value=todayISO();
      await reloadLcm();
      updateMovementCurrent();
    }catch(err){alert(err.message);}
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
        alert("Cấp phát phải đến khoa sử dụng, không chọn C10.");
      }
    });
    updateMovementCurrent();
  });
})();

(function installReplacementPlanning(){
  function install(){
    if(!document.querySelector('link[href="/lcm-replacement.css"]')){
      const link=document.createElement("link"); link.rel="stylesheet"; link.href="/lcm-replacement.css"; document.head.appendChild(link);
    }
    const tabs=document.getElementById("lcmTabs");
    if(tabs && !tabs.querySelector('[data-tab="replacement"]')){
      const btn=document.createElement("button");
      btn.dataset.tab="replacement"; btn.textContent="Kế hoạch thay thế";
      const before=tabs.querySelector('[data-tab="disposals"]');
      if(before) tabs.insertBefore(btn,before); else tabs.appendChild(btn);
      btn.onclick=()=>setTab("replacement");
    }
    if(!document.querySelector('[data-panel="replacement"]')){
      const panel=document.createElement("section");
      panel.className="lcm-panel"; panel.dataset.panel="replacement";
      panel.innerHTML=`
        <section class="card">
          <div class="table-card-header">
            <div><h3>Kế hoạch thay thế thiết bị 1 – 3 – 5 năm</h3>
            <span class="lcm-note">Xếp ưu tiên theo tuổi thiết bị, tình trạng, sửa chữa, chi phí, availability, chất lượng và mức độ quan trọng. Đây là gợi ý hỗ trợ quyết định; năm thay thế chính thức do đơn vị cấu hình/phê duyệt.</span></div>
            <a class="btn" id="replacementExportBtn" href="/api/lcm/replacement-plan.xlsx">Xuất Excel</a>
          </div>
          <div class="replacement-kpi-grid">
            <div class="replacement-kpi urgent"><span>Trong 1 năm</span><b id="rp1y">0</b><small id="rp1yCost">0 đ nguyên giá tham chiếu</small></div>
            <div class="replacement-kpi high"><span>Trong 3 năm</span><b id="rp3y">0</b><small id="rp3yCost">0 đ nguyên giá tham chiếu</small></div>
            <div class="replacement-kpi medium"><span>Trong 5 năm</span><b id="rp5y">0</b><small id="rp5yCost">0 đ nguyên giá tham chiếu</small></div>
            <div class="replacement-kpi follow"><span>Sau 5 năm / theo dõi</span><b id="rpLater">0</b><small>Chưa cần đưa vào kế hoạch gần</small></div>
          </div>
          <div class="replacement-filter-row">
            <select id="replacementDepartment"></select>
            <select id="replacementHorizon"><option value="ALL">Tất cả thời hạn</option><option value="1Y">Trong 1 năm</option><option value="3Y">Trong 3 năm</option><option value="5Y">Trong 5 năm</option><option value="LATER">Sau 5 năm / theo dõi</option></select>
            <select id="replacementPriority"><option value="ALL">Tất cả mức ưu tiên</option><option value="Khẩn">Khẩn</option><option value="Cao">Cao</option><option value="Trung bình">Trung bình</option><option value="Theo dõi">Theo dõi</option></select>
            <input id="replacementSearch" placeholder="Tìm mã / tên / model / serial" />
          </div>
        </section>
        <section class="card">
          <div class="table-card-header"><h3>Danh sách ưu tiên thay thế</h3><span id="replacementCount" class="lcm-note">0 thiết bị</span></div>
          <div class="table-wrap"><table class="lcm-table replacement-table">
            <thead><tr><th>Ưu tiên</th><th>Năm dự kiến</th><th>Thiết bị</th><th>Khoa</th><th>Tuổi / tuổi đời</th><th>Sửa/12T</th><th>Availability</th><th>CP sửa/Nguyên giá</th><th>Điểm KH</th><th>Căn cứ gợi ý</th><th></th></tr></thead>
            <tbody id="replacementRows"></tbody>
          </table></div>
        </section>`;
      const disposals=document.querySelector('[data-panel="disposals"]');
      if(disposals) disposals.parentNode.insertBefore(panel,disposals); else document.querySelector("main")?.appendChild(panel);
    }
    if(!document.querySelector('script[src="/lcm-replacement.js"]')){
      const script=document.createElement("script"); script.src="/lcm-replacement.js"; document.body.appendChild(script);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install);
  else install();
})();
