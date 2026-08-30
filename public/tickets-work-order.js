(function(){
  incidentActions=function(r){
    const id=Number(r.id), deviceId=Number(r.device_id);
    const actions=[`<button class="btn btn-secondary" onclick="openDeviceProfile(${deviceId})">Xem HS</button>`];
    if(r.status==="Mới ghi nhận"){
      actions.push(`<button class="btn btn-primary" onclick="transferToRepair(${id})">Tạo Work Order</button>`);
      actions.push(`<button class="btn" onclick="markOnsite(${id})">Xử lý tại chỗ</button>`);
    }else if(r.status==="Đã chuyển sửa chữa"){
      actions.push(`<button class="btn btn-primary" onclick="openLinkedRepair(${id})">Mở Work Order</button>`);
    }
    return actions.join("");
  };

  transferToRepair=async function(id){
    const r=INCIDENT_ROWS.find(x=>Number(x.id)===Number(id));
    if(!r) return;
    if(!confirm(`Tạo phiếu công việc kỹ thuật từ sự cố ${r.incident_code||"#"+id}?\nThông tin thiết bị và mô tả sự cố sẽ được chuyển sang Work Order.`)) return;
    try{
      const res=await api(`/api/incidents/${id}/transfer-repair`,{method:"POST",body:JSON.stringify({actor:r.reporter||"Quản trị viên"})});
      if(res?.repair_id){ window.location.href=`/maintenance.html?repair_id=${encodeURIComponent(res.repair_id)}&from=tickets`; return; }
      await loadData();
    }catch(e){ alert(e.message||"Không tạo được Work Order từ sự cố."); }
  };

  document.addEventListener("DOMContentLoaded",()=>{
    if(q("pageSubtitle")) q("pageSubtitle").textContent="Ghi nhận ban đầu; sự cố cần xử lý kỹ thuật được chuyển thành một Work Order để phân công, theo dõi và bàn giao";
    const formNote=document.querySelector(".incident-form-card .table-card-header .small");
    if(formNote) formNote.textContent="Sự cố là bước ghi nhận ban đầu; khi cần xử lý kỹ thuật hãy tạo Work Order.";
  });
})();
