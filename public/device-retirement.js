let RETIRE_DEVICES=[];
let RETIRE_DEVICE=null;
let RETIRE_STEP=1;
function retireEsc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function rv(id){return q(id)?.value?.trim?.() ?? q(id)?.value ?? "";}
function retireDeviceLabel(d){return `${d.device_code||"#"+d.id} - ${d.name||"Thiết bị"} (${d.department_code||"—"})`;}
function showRetireStep(step){
  RETIRE_STEP=Number(step)||1;
  document.querySelectorAll(".retirement-panel").forEach(x=>x.style.display=Number(x.dataset.panel)===RETIRE_STEP?"block":"none");
  document.querySelectorAll(".retirement-step").forEach(x=>{const n=Number(x.dataset.step);x.classList.toggle("active",n===RETIRE_STEP);x.classList.toggle("done",n<RETIRE_STEP);});
}
function renderRetireCurrent(){
  const host=q("retirementCurrent");
  if(!RETIRE_DEVICE){host.innerHTML="";return;}
  host.innerHTML=`
    <div><span>Mã thiết bị</span><b>${retireEsc(RETIRE_DEVICE.device_code||"—")}</b></div>
    <div><span>Khoa / vị trí</span><b>${retireEsc(RETIRE_DEVICE.department_code||"—")} / ${retireEsc(RETIRE_DEVICE.location||"—")}</b></div>
    <div><span>Tình trạng</span><b><span class="tag ${statusTagClass(RETIRE_DEVICE.status)}">${retireEsc(RETIRE_DEVICE.status||"—")}</span></b></div>
    <div><span>QR định danh</span><b>${RETIRE_DEVICE.qr_uid?"Đã có - giữ nguyên":"Chưa có"}</b></div>`;
}
async function loadRetireDevice(id){
  if(!id){RETIRE_DEVICE=null;q("retirementWorkflow").style.display="none";renderRetireCurrent();return;}
  RETIRE_DEVICE=await api(`/api/devices/${encodeURIComponent(id)}`);
  renderRetireCurrent();
  q("retirementWorkflow").style.display=RETIRE_DEVICE.is_archived?"none":"block";
  if(RETIRE_DEVICE.is_archived){
    q("retirementDone").style.display="block";
    q("retirementDoneText").innerHTML=`Thiết bị <b>${retireEsc(RETIRE_DEVICE.device_code||"")}</b> đã ngừng khai thác và được lưu hồ sơ lịch sử. <a class="btn btn-secondary btn-sm" href="/device-detail.html?id=${Number(RETIRE_DEVICE.id)}">Mở hồ sơ</a>`;
  }else{
    q("retirementDone").style.display="none";
    showRetireStep(1);
  }
}
function validateRetireStep1(){
  if(!RETIRE_DEVICE)return "Vui lòng chọn thiết bị.";
  if(!rv("proposalDate"))return "Vui lòng nhập ngày đề nghị thanh lý.";
  if(!rv("proposer"))return "Vui lòng nhập người đề nghị.";
  if(!rv("retirementReason"))return "Vui lòng mô tả hiện trạng và lý do đề nghị thanh lý.";
  return "";
}
function validateRetireStep2(){
  if(!rv("decisionDate"))return "Vui lòng nhập ngày quyết định/phê duyệt.";
  if(!rv("decisionNo"))return "Vui lòng nhập số quyết định hoặc hồ sơ phê duyệt.";
  if(!rv("approvedBy"))return "Vui lòng nhập người/cấp có thẩm quyền phê duyệt.";
  if(rv("decisionResult")!=="Được phê duyệt thanh lý")return "Hồ sơ chưa được phê duyệt thanh lý nên chưa thể kết thúc vòng đời thiết bị.";
  return "";
}
function renderRetirementSummary(){
  q("retirementSummary").innerHTML=`
    <div class="info-grid">
      <div class="info-section"><h3>Thiết bị</h3><div class="info-item"><div class="info-label">Mã / tên</div><div class="info-value">${retireEsc(RETIRE_DEVICE.device_code||"—")} - ${retireEsc(RETIRE_DEVICE.name||"")}</div></div><div class="info-item"><div class="info-label">Vị trí cuối</div><div class="info-value">${retireEsc(RETIRE_DEVICE.department_code||"—")} / ${retireEsc(RETIRE_DEVICE.location||"—")}</div></div></div>
      <div class="info-section"><h3>Đề nghị</h3><div class="info-item"><div class="info-label">Ngày / người đề nghị</div><div class="info-value">${retireEsc(rv("proposalDate"))} / ${retireEsc(rv("proposer"))}</div></div><div class="info-item"><div class="info-label">Lý do</div><div class="info-value">${retireEsc(rv("retirementReasonType"))}</div></div></div>
      <div class="info-section"><h3>Phê duyệt</h3><div class="info-item"><div class="info-label">Quyết định</div><div class="info-value">${retireEsc(rv("decisionNo"))} - ${retireEsc(rv("decisionDate"))}</div></div><div class="info-item"><div class="info-label">Kết quả</div><div class="info-value"><span class="tag green">${retireEsc(rv("decisionResult"))}</span></div></div></div>
    </div>`;
}
async function findOpenInventory(deviceId){
  const sessions=await api("/api/inventory-sessions");
  const open=(sessions||[]).filter(s=>String(s.status)==="Đang kiểm kê");
  for(const session of open){
    const detail=await api(`/api/inventory-sessions/${session.id}`);
    if((detail.items||[]).some(x=>Number(x.device_id)===Number(deviceId))) return session.id;
  }
  return null;
}
async function precheckRetirement(){
  const openIncident=(RETIRE_DEVICE.incidents||[]).find(x=>["Mới ghi nhận","Đã tiếp nhận"].includes(String(x.status||"")));
  if(openIncident)throw new Error(`Thiết bị còn sự cố #${openIncident.id} chưa hoàn tất.`);
  const openRepair=(RETIRE_DEVICE.repairs||[]).find(x=>["Đang xử lý","Đang sửa chữa","Chờ linh kiện","Mới tiếp nhận"].includes(String(x.processing_status||"")));
  if(openRepair)throw new Error(`Thiết bị còn phiếu sửa chữa #${openRepair.id} chưa hoàn thành.`);
  const inventoryId=await findOpenInventory(RETIRE_DEVICE.id);
  if(inventoryId)throw new Error(`Thiết bị đang nằm trong đợt kiểm kê #${inventoryId}. Hãy hoàn thành kiểm kê trước khi thanh lý.`);
}
function retirementRecordText(){
  const parts=[
    `Đề nghị ${rv("proposalDate")}`,
    `Người đề nghị: ${rv("proposer")}`,
    `Lý do: ${rv("retirementReasonType")} - ${rv("retirementReason")}`,
    `Quyết định: ${rv("decisionNo")} ngày ${rv("decisionDate")}`,
    `Phê duyệt: ${rv("approvedBy")}`,
    `Hoàn tất: ${rv("completedDate")}`,
    `Người thực hiện: ${rv("retirementActor")}`,
    `Phương án: ${rv("handlingMethod")}`
  ];
  if(rv("decisionNote"))parts.push(`Ghi chú quyết định: ${rv("decisionNote")}`);
  if(rv("completionNote"))parts.push(`Ghi chú hoàn tất: ${rv("completionNote")}`);
  return `[HỒ SƠ THANH LÝ] ${parts.join(" | ")}`;
}
function deviceUpdatePayload(device,status,note){
  return {
    department_code:device.department_code,
    group_code:device.group_code,
    device_code:device.device_code||"",
    insurance_code:device.insurance_code||"",
    name:device.name||"",
    manufacturer:device.manufacturer||"",
    model:device.model||"",
    serial:device.serial||"",
    country:device.country||"",
    year_manufactured:Number(device.year_manufactured||0),
    year_in_use:Number(device.year_in_use||0),
    warranty_end:device.warranty_end||"",
    status:status,
    quality_level:Number(device.quality_level||3),
    inspection_required_types:device.inspection_required_types||[],
    cost:Number(device.cost||0),
    funding:device.funding||"",
    location:device.location||"",
    note:note||""
  };
}
async function completeRetirement(e){
  e.preventDefault();
  const err=validateRetireStep1()||validateRetireStep2();
  if(err)return alert(err);
  if(!rv("completedDate"))return alert("Vui lòng nhập ngày hoàn tất thanh lý.");
  if(!rv("retirementActor"))return alert("Vui lòng nhập người hoàn tất hồ sơ.");
  const confirmText=`Xác nhận hoàn tất thanh lý thiết bị ${RETIRE_DEVICE.device_code||""} - ${RETIRE_DEVICE.name||""}?\n\nThiết bị sẽ ngừng khai thác nhưng QR và toàn bộ lịch sử vẫn được giữ.`;
  if(!confirm(confirmText))return;
  const btn=q("completeRetirementBtn");if(btn){btn.disabled=true;btn.textContent="Đang kiểm tra và hoàn tất...";}
  const oldStatus=RETIRE_DEVICE.status||"Đang hoạt động";
  const oldNote=RETIRE_DEVICE.note||"";
  let updated=false;
  try{
    await precheckRetirement();
    const note=[oldNote,retirementRecordText()].filter(Boolean).join("\n");
    await api(`/api/devices/${RETIRE_DEVICE.id}`,{method:"PUT",body:JSON.stringify(deviceUpdatePayload(RETIRE_DEVICE,"Ngừng hoạt động",note))});
    updated=true;
    await api(`/api/devices/${RETIRE_DEVICE.id}`,{method:"DELETE"});
    q("retirementWorkflow").style.display="none";
    q("retirementDone").style.display="block";
    q("retirementDoneText").innerHTML=`
      <p>Thiết bị <b>${retireEsc(RETIRE_DEVICE.device_code||"")} - ${retireEsc(RETIRE_DEVICE.name||"")}</b> đã kết thúc khai thác theo hồ sơ <b>${retireEsc(rv("decisionNo"))}</b>.</p>
      <p>Mã thiết bị, QR và lịch sử kỹ thuật vẫn được bảo toàn để tra cứu.</p>
      <div class="form-actions"><a class="btn" href="/device-detail.html?id=${Number(RETIRE_DEVICE.id)}">Mở hồ sơ đã thanh lý</a><a class="btn btn-primary" href="/index.html">Về danh mục đang quản lý</a></div>`;
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(ex){
    if(updated){
      try{await api(`/api/devices/${RETIRE_DEVICE.id}`,{method:"PUT",body:JSON.stringify(deviceUpdatePayload(RETIRE_DEVICE,oldStatus,oldNote))});}catch(_rollback){}
    }
    alert(ex.message||"Chưa thể hoàn tất thanh lý thiết bị.");
    if(btn){btn.disabled=false;btn.textContent="Xác nhận hoàn tất thanh lý";}
  }
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("devices","Thanh lý thiết bị","Đề nghị → Quyết định được phê duyệt → Hoàn tất và lưu hồ sơ lịch sử");
  RETIRE_DEVICES=await api("/api/devices");
  q("retirementDevice").innerHTML='<option value="">-- Chọn thiết bị --</option>'+RETIRE_DEVICES.map(d=>`<option value="${Number(d.id)}">${retireEsc(retireDeviceLabel(d))}</option>`).join("");
  const today=todayISO();q("proposalDate").value=today;q("decisionDate").value=today;q("completedDate").value=today;
  q("proposer").value=window.QY4_AUTH_USER?.full_name||"";q("retirementActor").value=window.QY4_AUTH_USER?.full_name||"";
  q("retirementDevice").onchange=()=>loadRetireDevice(q("retirementDevice").value);
  q("openRetirementDeviceBtn").onclick=()=>{const id=q("retirementDevice").value;if(!id)return alert("Vui lòng chọn thiết bị.");window.location.href=`/device-detail.html?id=${encodeURIComponent(id)}`;};
  q("retirementStep1Next").onclick=()=>{const err=validateRetireStep1();if(err)return alert(err);showRetireStep(2);};
  q("retirementStep2Next").onclick=()=>{const err=validateRetireStep1()||validateRetireStep2();if(err)return alert(err);renderRetirementSummary();showRetireStep(3);};
  document.querySelectorAll("[data-retirement-back]").forEach(b=>b.onclick=()=>showRetireStep(Number(b.dataset.retirementBack)));
  q("retirementForm").onsubmit=completeRetirement;
  const id=new URL(window.location.href).searchParams.get("device_id");
  if(id&&RETIRE_DEVICES.some(d=>String(d.id)===String(id))){q("retirementDevice").value=id;await loadRetireDevice(id);}
});
