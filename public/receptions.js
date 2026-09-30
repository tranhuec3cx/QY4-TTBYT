let META={departments:[],groups:[]}, ROWS=[], CURRENT=null;

function escR(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function statusLabel(r){return r.status||"Đang tiếp nhận";}
function setPanels(step){
  q("step1Panel").style.display=step===1?"block":"none";
  q("step2Panel").style.display=step===2?"block":"none";
  q("step3Panel").style.display=step===3?"block":"none";
  [1,2,3].forEach(n=>{
    const el=q("step"+n+"Box"); el.classList.remove("active","done");
    if(n===step) el.classList.add("active"); else if(n<step) el.classList.add("done");
  });
}
function renderKpis(){
  q("kpiTotal").textContent=ROWS.length;
  q("kpiPendingProfile").textContent=ROWS.filter(x=>!x.device_id).length;
  q("kpiPendingHandover").textContent=ROWS.filter(x=>x.device_id&&x.status!=="Đã bàn giao").length;
}
function renderRows(){
  q("rows").innerHTML=ROWS.length?ROWS.map(r=>`<tr>
    <td><b>${escR(r.reception_code||"")}</b></td>
    <td>${formatDateTimeVNLines(r.reception_datetime)}</td>
    <td><b>${escR(r.name)}</b>${r.model?`<div class="small">${escR(r.model)}</div>`:""}</td>
    <td>${escR(r.serial||"—")}</td>
    <td><b>${escR(r.department_code||"—")}</b><div class="small">${escR(r.location||"")}</div></td>
    <td><span class="tag ${r.status==="Đã bàn giao"?"green":r.device_id?"yellow":"orange"}">${escR(statusLabel(r))}</span></td>
    <td><button class="btn btn-secondary btn-sm" data-open="${r.id}">${r.status==="Đã bàn giao"?"Hồ sơ":"Tiếp tục"}</button></td>
  </tr>`).join(""):`<tr><td colspan="7" class="center-empty">Chưa có hồ sơ tiếp nhận.</td></tr>`;
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openWorkflow(Number(b.dataset.open)));
}
async function loadRows(){
  const p=new URLSearchParams();
  if(q("fromDate").value)p.set("from_date",q("fromDate").value);
  if(q("toDate").value)p.set("to_date",q("toDate").value);
  if(q("departmentFilter").value&&q("departmentFilter").value!=="ALL")p.set("department_code",q("departmentFilter").value);
  if(q("searchInput").value.trim())p.set("q",q("searchInput").value.trim());
  ROWS=await api("/api/receptions?"+p.toString());
  renderKpis();renderRows();
}
function fillStep1(r){
  q("receptionDatetime").value=toDateTimeLocalValue(r?.reception_datetime||nowDateTimeLocalValue());
  q("deviceName").value=r?.name||"";q("serial").value=r?.serial||"";q("model").value=r?.model||"";
  q("manufacturer").value=r?.manufacturer||"";q("country").value=r?.country||"";q("supplier").value=r?.supplier||"";
  q("departmentCode").value=r?.department_code||"";q("location").value=r?.location||"";q("accessories").value=r?.accessories||"";
  q("receiver").value=r?.receiver||window.QY4_AUTH_USER?.full_name||"";q("documentsNote").value=r?.documents_note||"";
  q("missingDocuments").value=r?.missing_documents||"";q("note").value=r?.note||"";
  q("existingFiles").innerHTML=(r?.files||[]).map(f=>`<a class="reception-file" href="${escR(f.file_path)}" target="_blank" rel="noopener">${escR(f.original_name)}</a>`).join("");
}
function fillStep2(r){
  q("step2Summary").innerHTML=[
    ["Thiết bị",r.name],["Serial number",r.serial],["Khoa sử dụng",r.department_code],["Vị trí",r.location||"—"]
  ].map(x=>`<div><span>${x[0]}</span><b>${escR(x[1]||"—")}</b></div>`).join("");
  if(r.group_code)q("groupCode").value=r.group_code;
  q("yearManufactured").value=r.year_manufactured||"";
  q("funding").value=r.funding||"";q("cost").value=r.cost||0;q("warrantyEnd").value=r.warranty_end||"";
  if(r.device_id){
    q("profileForm").style.display="none";q("profileResult").style.display="block";
    q("profileResult").innerHTML=`Đã lập hồ sơ: <b>${escR(r.device_code||"")}</b> · QR UID: <code>${escR(r.qr_uid||"")}</code>`;
  }else{q("profileForm").style.display="block";q("profileResult").style.display="none";}
}
function fillStep3(r){
  q("handoverDatetime").value=toDateTimeLocalValue(r.handover_datetime||nowDateTimeLocalValue());
  q("handoverDepartment").value=r.department_code||"";q("handoverLocation").value=r.location||"";
  q("handoverActor").value=r.handover_actor||window.QY4_AUTH_USER?.full_name||"";
  q("handoverReceiver").value=r.handover_receiver||"";q("handoverDocNo").value=r.handover_doc_no||"";
}
async function openWorkflow(id){
  CURRENT=await api("/api/receptions/"+id);
  q("workflowCard").style.display="block";q("workflowCode").textContent=CURRENT.reception_code||"";
  fillStep1(CURRENT);fillStep2(CURRENT);fillStep3(CURRENT);
  const step=CURRENT.status==="Đã bàn giao"?3:(CURRENT.device_id?3:2);
  setPanels(step);
  if(CURRENT.status==="Đã bàn giao"){
    q("handoverForm").querySelectorAll("input,button").forEach(x=>x.disabled=true);
  }else q("handoverForm").querySelectorAll("input,button").forEach(x=>x.disabled=false);
  q("workflowCard").scrollIntoView({behavior:"smooth",block:"start"});
}
function newWorkflow(){
  CURRENT=null;q("workflowCard").style.display="block";q("workflowCode").textContent="Hồ sơ mới";
  q("receptionForm").reset();fillStep1(null);q("existingFiles").innerHTML="";setPanels(1);
  q("workflowCard").scrollIntoView({behavior:"smooth",block:"start"});
}
async function uploadFiles(receptionId){
  const files=Array.from(q("attachments").files||[]);
  for(const file of files){
    const fd=new FormData();fd.append("file",file);
    const res=await fetch(`/api/receptions/${receptionId}/files`,{method:"POST",body:fd});
    if(!res.ok){let m="Không tải được tệp.";try{m=(await res.json()).error||m;}catch{}throw new Error(m);}
  }
}
async function saveReception(e){
  e.preventDefault();
  const payload={
    reception_datetime:fromDateTimeLocalValue(q("receptionDatetime").value),name:q("deviceName").value.trim(),
    serial:q("serial").value.trim(),model:q("model").value.trim(),manufacturer:q("manufacturer").value.trim(),
    country:q("country").value.trim(),supplier:q("supplier").value.trim(),department_code:q("departmentCode").value,
    location:q("location").value.trim(),accessories:q("accessories").value.trim(),receiver:q("receiver").value.trim(),
    documents_note:q("documentsNote").value.trim(),missing_documents:q("missingDocuments").value.trim(),note:q("note").value.trim()
  };
  try{
    let r;
    if(CURRENT) r=await api("/api/receptions/"+CURRENT.id,{method:"PUT",body:JSON.stringify(payload)});
    else r=await api("/api/receptions",{method:"POST",body:JSON.stringify(payload)});
    const id=CURRENT?.id||r.id;await uploadFiles(id);await loadRows();await openWorkflow(id);
  }catch(err){alert(err.message||"Không lưu được hồ sơ tiếp nhận.");}
}
async function createProfile(e){
  e.preventDefault();
  try{
    await api(`/api/receptions/${CURRENT.id}/create-device`,{method:"POST",body:JSON.stringify({
      group_code:q("groupCode").value,year_manufactured:Number(q("yearManufactured").value||0),
      funding:q("funding").value.trim(),cost:Number(q("cost").value||0),warranty_end:q("warrantyEnd").value
    })});
    await loadRows();await openWorkflow(CURRENT.id);
  }catch(err){alert(err.message||"Không lập được hồ sơ thiết bị.");}
}
async function finishHandover(e){
  e.preventDefault();
  try{
    await api(`/api/receptions/${CURRENT.id}/handover`,{method:"POST",body:JSON.stringify({
      handover_datetime:fromDateTimeLocalValue(q("handoverDatetime").value),handover_actor:q("handoverActor").value.trim(),
      handover_receiver:q("handoverReceiver").value.trim(),handover_doc_no:q("handoverDocNo").value.trim()
    })});
    await loadRows();await openWorkflow(CURRENT.id);alert("Đã hoàn thành tiếp nhận và bàn giao thiết bị.");
  }catch(err){alert(err.message||"Không hoàn thành được bàn giao.");}
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("receptions","Tiếp nhận thiết bị","Tiếp nhận → Lập hồ sơ thiết bị → Bàn giao sử dụng");
  META=await api("/api/meta");
  q("departmentFilter").innerHTML=optDepartmentFilter(META.departments||[],"Tất cả khoa/phòng","ALL");
  q("departmentCode").innerHTML=optDepartmentFilter(META.departments||[],null,"");
  q("groupCode").innerHTML=opt(META.groups||[],null,"");
  q("fromDate").value=firstDayOfYearISO();q("toDate").value=todayISO();
  q("newReceptionBtn").onclick=newWorkflow;q("closeWorkflowBtn").onclick=()=>q("workflowCard").style.display="none";
  q("filterBtn").onclick=loadRows;q("receptionForm").addEventListener("submit",saveReception);
  q("profileForm").addEventListener("submit",createProfile);q("handoverForm").addEventListener("submit",finishHandover);
  await loadRows();
});