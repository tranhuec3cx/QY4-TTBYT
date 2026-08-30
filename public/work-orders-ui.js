(function(){
  const coreApi = api;
  let pendingEditId = null;

  function woEsc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function woPriorityClass(v){ return v==="Khẩn cấp"?"urgent":v==="Cao"?"high":v==="Trung bình"?"medium":v==="Thấp"?"low":"normal"; }
  function woDueText(v){
    if(!v) return "Chưa đặt hạn";
    const s=String(v).slice(0,16).replace("T"," ");
    const t=new Date(String(v).replace(" ","T")).getTime();
    if(!Number.isFinite(t)) return formatDateTimeVN(v);
    const delta=t-Date.now();
    if(delta<0) return `Quá hạn · ${formatDateTimeVN(s)}`;
    const hours=Math.ceil(delta/3600000);
    return hours<=24?`Còn ${hours} giờ`:`Còn ${Math.ceil(hours/24)} ngày`;
  }
  function woIsOverdue(r){
    if(!r?.due_at || normalizeRepairStatus(r.processing_status)==="Đã hoàn thành") return false;
    const t=new Date(String(r.due_at).replace(" ","T")).getTime();
    return Number.isFinite(t)&&t<Date.now();
  }
  function woMetaPayload(){
    return {
      priority:q("priority")?.value||"Bình thường",
      reporter:q("reporter")?.value?.trim()||"",
      assigned_to:q("woAssignedTo")?.value?.trim()||"",
      due_at:q("woDueAt")?.value ? fromDateTimeLocalValue(q("woDueAt").value) : "",
      waiting_reason:q("woWaitingReason")?.value?.trim()||"",
      handover_at:q("woHandoverAt")?.value ? fromDateTimeLocalValue(q("woHandoverAt").value) : "",
      handover_by:q("woHandoverBy")?.value?.trim()||"",
      accepted_by:q("woAcceptedBy")?.value?.trim()||"",
      work_order_note:q("woNote")?.value?.trim()||"",
      actor:q("person")?.value?.trim()||q("woAssignedTo")?.value?.trim()||"Khoa Trang bị"
    };
  }

  api = async function(url, options={}){
    const method=String(options.method||"GET").toUpperCase();
    if(url==="/api/repairs" && method==="GET") return coreApi("/api/work-orders", options);
    const result=await coreApi(url,options);
    try{
      if(url==="/api/repairs" && method==="POST"){
        const id=Number(result?.id||result?.repair_id||0);
        if(id) await coreApi(`/api/work-orders/${id}/meta`,{method:"PUT",body:JSON.stringify(woMetaPayload())});
      }else{
        const m=String(url).match(/^\/api\/repairs\/(\d+)$/);
        if(m && method==="PUT") await coreApi(`/api/work-orders/${m[1]}/meta`,{method:"PUT",body:JSON.stringify(woMetaPayload())});
      }
    }catch(e){ console.warn("Không lưu được metadata Work Order",e); }
    return result;
  };

  const coreResetRepairForm=resetRepairForm;
  resetRepairForm=function(){
    coreResetRepairForm();
    if(q("woAssignedTo")) q("woAssignedTo").value="";
    if(q("woDueAt")) q("woDueAt").value="";
    if(q("woWaitingReason")) q("woWaitingReason").value="";
    if(q("woHandoverAt")) q("woHandoverAt").value="";
    if(q("woHandoverBy")) q("woHandoverBy").value="";
    if(q("woAcceptedBy")) q("woAcceptedBy").value="";
    if(q("woNote")) q("woNote").value="";
    if(q("woCodeDisplay")) q("woCodeDisplay").value="Tự sinh khi lưu";
  };

  function fillWoFields(r){
    if(!r) return;
    if(!q("woAssignedTo")){ pendingEditId=Number(r.id); return; }
    q("woCodeDisplay").value=r.work_order_code||"";
    q("priority").value=r.priority||r.incident_severity||"Bình thường";
    q("reporter").value=r.reporter||r.incident_reporter||"";
    q("woAssignedTo").value=r.assigned_to||"";
    q("woDueAt").value=toDateTimeLocalValue(r.due_at||"");
    q("woWaitingReason").value=r.waiting_reason||"";
    q("woHandoverAt").value=toDateTimeLocalValue(r.handover_at||"");
    q("woHandoverBy").value=r.handover_by||"";
    q("woAcceptedBy").value=r.accepted_by||"";
    q("woNote").value=r.work_order_note||"";
  }

  const coreEditRepair=editRepair;
  editRepair=function(id){
    const r=REPAIR_ROWS.find(x=>Number(x.id)===Number(id));
    coreEditRepair(id);
    fillWoFields(r);
    if(q("repairDialogTitle")) q("repairDialogTitle").textContent=`Phiếu công việc kỹ thuật ${r?.work_order_code||""}`.trim();
  };

  renderStats=function(rows){
    const count=rows.length;
    const status=name=>rows.filter(r=>normalizeRepairStatus(r.processing_status)===name).length;
    const unassigned=rows.filter(r=>!["Đã hoàn thành","Không sửa được"].includes(normalizeRepairStatus(r.processing_status))&&!String(r.assigned_to||"").trim()).length;
    const overdue=rows.filter(woIsOverdue).length;
    const cards=[
      ["Tổng Work Order",count],
      ["Chưa phân công",unassigned],
      ["Đang xử lý",status("Đang xử lý")],
      ["Chờ linh kiện",status("Chờ linh kiện")],
      ["Đã hoàn thành",status("Đã hoàn thành")],
      ["Quá hạn",overdue]
    ];
    q("repairStats").innerHTML=cards.map(([label,value])=>`<div class="stat-card repair-stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
  };

  function woActions(r){
    const id=Number(r.id), st=normalizeRepairStatus(r.processing_status);
    const a=[`<button class="btn btn-secondary" onclick="openDeviceProfile(${Number(r.device_id)})">Hồ sơ</button>`];
    if(!r.assigned_to && !["Đã hoàn thành","Không sửa được"].includes(st)) a.push(`<button class="btn btn-primary" onclick="woAssign(${id})">Phân công</button>`);
    if(st==="Đang xử lý" && !r.started_at) a.push(`<button class="btn" onclick="woStart(${id})">Bắt đầu</button>`);
    if(st==="Chờ linh kiện") a.push(`<button class="btn" onclick="woStart(${id})">Tiếp tục</button>`);
    a.push(`<button class="btn" onclick="editRepair(${id})">Cập nhật</button>`);
    if(st==="Đã hoàn thành" && !r.handover_at) a.push(`<button class="btn btn-primary" onclick="woHandover(${id})">Bàn giao</button>`);
    a.push(`<button class="btn" onclick="showRepairHistory(${id})">Lịch sử</button>`);
    return a.join("");
  }

  renderRows=function(rows){
    q("countLabel").textContent=`${rows.length} phiếu công việc`;
    if(!rows.length){q("rows").innerHTML=`<tr><td colspan="13" class="center-empty">Chưa có phiếu công việc phù hợp.</td></tr>`;return;}
    q("rows").innerHTML=rows.map((r,i)=>{
      const st=normalizeRepairStatus(r.processing_status);
      return `<tr id="repair-row-${Number(r.id)}" class="${woIsOverdue(r)?"work-order-overdue":""}">
        <td>${i+1}</td>
        <td><b class="wo-code">${woEsc(r.work_order_code||`WO-${r.id}`)}</b><small>${formatDateTimeVN(r.received_at||r.repair_date)}</small>${r.incident_code?`<small>Nguồn: ${woEsc(r.incident_code)}</small>`:""}</td>
        <td><div><b>${woEsc(r.device_name||"")}</b></div><small>${woEsc(r.device_code||r.serial||"")}</small><small>${woEsc(r.model||"")}</small></td>
        <td><b>${woEsc(r.department_name||r.department_code||"")}</b><small>${woEsc(r.location||"")}</small></td>
        <td class="wrap-text">${woEsc(r.issue||"")}</td>
        <td><b>${woEsc(r.assigned_to||"Chưa phân công")}</b><small>${r.assigned_at?formatDateTimeVN(r.assigned_at):""}</small></td>
        <td><span class="wo-priority ${woPriorityClass(r.priority)}">${woEsc(r.priority||"Bình thường")}</span></td>
        <td><span class="tag ${repairStatusClass(st)}">${woEsc(st)}</span>${r.handover_at?`<small>Đã bàn giao ${formatDateTimeVN(r.handover_at)}</small>`:""}</td>
        <td class="${woIsOverdue(r)?"wo-due-over":""}">${woEsc(woDueText(r.due_at))}</td>
        <td>${woEsc(r.method||"")}</td>
        <td>${formatCurrency(r.cost||0)}</td>
        <td class="wrap-text">${woEsc(r.result||r.work||"")}<small>${woEsc(r.status_after||"")}</small></td>
        <td><div class="table-actions compact-actions">${woActions(r)}</div></td>
      </tr>`;
    }).join("");
  };

  exportRepairsExcel=function(){
    const rows=FILTERED_REPAIRS.map((r,i)=>({
      "STT":i+1,
      "Mã Work Order":r.work_order_code||"",
      "Thời gian tiếp nhận":r.received_at||r.repair_date||"",
      "Mã thiết bị":r.device_code||"",
      "Tên thiết bị":r.device_name||"",
      "Khoa/phòng":r.department_name||r.department_code||"",
      "Vị trí":r.location||"",
      "Nguồn":r.source_type||"",
      "Mã sự cố":r.incident_code||"",
      "Mức ưu tiên":r.priority||"",
      "Người báo":r.reporter||"",
      "Người phụ trách":r.assigned_to||"",
      "Hạn xử lý":r.due_at||"",
      "Trạng thái":r.processing_status||"",
      "Nguyên nhân hỏng":r.issue||"",
      "Nội dung xử lý":r.work||"",
      "Hình thức":r.method||"",
      "Kinh phí":r.cost||0,
      "Kết quả":r.result||"",
      "TTTB sau sửa":r.status_after||"",
      "Thời gian bàn giao":r.handover_at||"",
      "Người bàn giao":r.handover_by||"",
      "Người nhận":r.accepted_by||""
    }));
    const ws=XLSX.utils.json_to_sheet(rows), wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"WorkOrder");
    XLSX.writeFile(wb,`work_order_ky_thuat_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  async function woAction(id,action,payload={}){
    try{
      await coreApi(`/api/work-orders/${id}/action`,{method:"POST",body:JSON.stringify({action,...payload})});
      await loadData();
    }catch(e){alert(e.message||"Không thực hiện được thao tác Work Order.");}
  }
  window.woAssign=async function(id){
    const r=REPAIR_ROWS.find(x=>Number(x.id)===Number(id));
    const person=prompt("Người phụ trách phiếu công việc:",r?.assigned_to||"Khoa Trang bị");
    if(person===null||!person.trim()) return;
    await woAction(id,"assign",{assigned_to:person.trim(),priority:r?.priority||"Bình thường",due_at:r?.due_at||"",actor:person.trim()});
  };
  window.woStart=async function(id){
    const r=REPAIR_ROWS.find(x=>Number(x.id)===Number(id));
    if(!confirm(`Bắt đầu/tiếp tục xử lý ${r?.work_order_code||"phiếu này"}?`)) return;
    await woAction(id,"start",{actor:r?.assigned_to||"Khoa Trang bị"});
  };
  window.woHandover=async function(id){
    const r=REPAIR_ROWS.find(x=>Number(x.id)===Number(id));
    const receiver=prompt("Người/khoa nhận bàn giao thiết bị:",r?.accepted_by||r?.department_name||"");
    if(receiver===null||!receiver.trim()) return;
    await woAction(id,"handover",{handover_by:r?.assigned_to||"Khoa Trang bị",accepted_by:receiver.trim(),actor:r?.assigned_to||"Khoa Trang bị"});
  };

  function insertWorkOrderFields(){
    const sections=document.querySelectorAll("#repairForm .repair-section");
    if(sections.length<3||q("woAssignedTo")) return;
    const sec2=sections[1].querySelector(".repair-form-grid");
    sec2.insertAdjacentHTML("beforeend",`
      <label class="field"><span class="field-label">Mã Work Order</span><input id="woCodeDisplay" readonly value="Tự sinh khi lưu" /></label>
      <label class="field"><span class="field-label">Người phụ trách</span><input id="woAssignedTo" placeholder="Kỹ sư/KTV phụ trách" /></label>
      <label class="field"><span class="field-label">Hạn hoàn thành dự kiến</span><input id="woDueAt" type="datetime-local" /></label>`);
    const sec3=sections[2];
    sec3.querySelector(".repair-form-grid").insertAdjacentHTML("beforeend",`
      <label class="field span-3"><span class="field-label">Lý do chờ / vướng mắc</span><input id="woWaitingReason" placeholder="VD: Chờ linh kiện, chờ hãng, chờ phê duyệt..." /></label>`);
    sec3.insertAdjacentHTML("afterend",`
      <section class="repair-section work-order-handover-section">
        <h3>4. Bàn giao – kết thúc công việc</h3>
        <div class="form-grid repair-form-grid">
          <label class="field"><span class="field-label">Thời gian bàn giao</span><input id="woHandoverAt" type="datetime-local" /></label>
          <label class="field"><span class="field-label">Người bàn giao</span><input id="woHandoverBy" placeholder="Kỹ sư/KTV bàn giao" /></label>
          <label class="field"><span class="field-label">Người/khoa nhận</span><input id="woAcceptedBy" placeholder="Người sử dụng tiếp nhận" /></label>
          <label class="field span-3"><span class="field-label">Ghi chú Work Order</span><textarea id="woNote" placeholder="Thông tin cần lưu lại cho toàn bộ phiếu công việc"></textarea></label>
        </div>
      </section>`);
  }

  function updateTableHeader(){
    const tr=document.querySelector(".repair-table-v2 thead tr");
    if(!tr) return;
    tr.innerHTML="<th>STT</th><th>Work Order / Tiếp nhận</th><th>Thiết bị</th><th>Khoa/vị trí</th><th>Sự cố / nguyên nhân</th><th>Phụ trách</th><th>Ưu tiên</th><th>Trạng thái</th><th>Hạn xử lý</th><th>Hình thức</th><th>Kinh phí</th><th>Kết quả</th><th>Thao tác</th>";
  }

  document.addEventListener("DOMContentLoaded",()=>{
    insertWorkOrderFields();
    updateTableHeader();
    if(q("createRepairBtn")) q("createRepairBtn").textContent="+ Tạo phiếu công việc";
    if(q("exportRepairExcelBtn")) q("exportRepairExcelBtn").textContent="Xuất Work Order";
    if(q("pageTitle")) q("pageTitle").textContent="Sửa chữa – Phiếu công việc kỹ thuật";
    if(q("pageSubtitle")) q("pageSubtitle").textContent="Theo dõi một chuỗi từ tiếp nhận sự cố, phân công, xử lý, chờ linh kiện đến hoàn thành và bàn giao";
    if(q("repairDialogTitle")&&!q("repairId")?.value) q("repairDialogTitle").textContent="Tạo phiếu công việc kỹ thuật";
    if(q("repairDialogSubtitle")) q("repairDialogSubtitle").textContent="Work Order kỹ thuật gắn với một thiết bị và lưu toàn bộ lịch sử xử lý";
    if(pendingEditId){ const r=REPAIR_ROWS.find(x=>Number(x.id)===pendingEditId); fillWoFields(r); pendingEditId=null; }
    if(SOURCE_INCIDENT && q("priority")){
      q("priority").value=SOURCE_INCIDENT.severity||"Bình thường";
      if(q("reporter")) q("reporter").value=SOURCE_INCIDENT.reporter||"";
    }
  });
})();
