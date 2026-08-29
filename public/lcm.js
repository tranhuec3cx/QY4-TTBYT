let LCM_META = { departments: [], groups: [] };
let LCM_DEVICES = [];
let LCM_RECEIPTS = [];
let LCM_TRANSFERS = [];
let LCM_DISPOSALS = [];
let LCM_ALERTS = {};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]||c));}
function deviceById(id){return LCM_DEVICES.find(x=>Number(x.id)===Number(id));}
function depName(code){return LCM_META.departments.find(x=>x.code===code)?.name||code||"";}
function codeOf(d){return d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;}
function deviceLabel(d){return `${codeOf(d)} - ${d.name} [${d.department_code||""}]`;}
function emptyRow(cols,msg="Chưa có dữ liệu."){return `<tr><td colspan="${cols}" class="lcm-empty">${msg}</td></tr>`;}
function riskPill(level,score){const cls=level==="Cao"?"high":level==="Trung bình"?"medium":"low";return `<span class="lcm-risk-pill ${cls}">${esc(level)} · ${Number(score||0)}</span>`;}
function pct(v){return `${Number(v||0).toFixed(1)}%`;}
function dateOrDash(v){return v?formatDateVN(v):"—";}

function addLcmMenuLink(){
  const menu=document.querySelector(".menu");
  if(!menu||menu.querySelector('[href="/lcm.html"]')) return;
  const a=document.createElement("a");
  a.href="/lcm.html";a.textContent="Vòng đời LCM";a.className="active";
  const deviceLink=menu.querySelector('[href="/index.html"]');
  if(deviceLink) deviceLink.insertAdjacentElement("afterend",a); else menu.appendChild(a);
}

function setTab(name){
  document.querySelectorAll("#lcmTabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.querySelectorAll(".lcm-panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
}

function fillSelect(id,rows,placeholder="Chọn thiết bị"){
  const el=q(id); if(!el) return;
  const current=el.value;
  el.innerHTML=`<option value="">${placeholder}</option>`+rows.map(d=>`<option value="${d.id}">${esc(deviceLabel(d))}</option>`).join("");
  if(current && rows.some(x=>String(x.id)===String(current))) el.value=current;
}

function populateSelectors(){
  ["receiptDevice","transferDevice","disposalDevice"].forEach(id=>fillSelect(id,LCM_DEVICES));
  if(q("transferToDepartment")) q("transferToDepartment").innerHTML='<option value="">Chọn khoa nhận</option>'+LCM_META.departments.map(d=>`<option value="${esc(d.code)}">${esc(d.code)} - ${esc(d.name)}</option>`).join("");
  if(q("riskDepartment")) q("riskDepartment").innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+LCM_META.departments.map(d=>`<option value="${esc(d.code)}">${esc(d.code)} - ${esc(d.name)}</option>`).join("");
}

function renderSummary(s){
  q("kTotal").textContent=s.total||0;
  q("kActive").textContent=s.active||0;
  q("kRepair").textContent=s.waiting_repair||0;
  q("kStopped").textContent=s.stopped||0;
  q("kHighRisk").textContent=s.high_risk||0;
  q("kMaintOverdue").textContent=s.maintenance_overdue||0;
  q("kMaintDue30").textContent=`${s.maintenance_due_30||0} sắp đến hạn`;
  q("kInspOverdue").textContent=s.inspection_overdue||0;
  q("kInspDue30").textContent=`${s.inspection_due_30||0} sắp đến hạn`;
  q("kReceipt").textContent=s.receipt_pending||0;
  q("kDisposal").textContent=s.disposal_pending||0;
  q("kWarrantyDue").textContent=s.warranty_due_30||0;
  q("kWarrantyExpired").textContent=s.warranty_expired||0;
  q("kTransfers").textContent=s.transfers_ytd||0;

  q("riskTopRows").innerHTML=(s.risk_top||[]).map(d=>`
    <tr>
      <td class="lcm-code">${esc(codeOf(d))}</td>
      <td><div class="lcm-device-name">${esc(d.name)}</div><small>${esc(d.model||"")}</small></td>
      <td>${esc(d.department_code||"")}</td>
      <td><span class="lcm-stage">${esc(d.lifecycle_stage||"")}</span></td>
      <td>${d.age_years||0} năm</td>
      <td>${d.repair_count_12m||0}</td>
      <td>${pct(d.availability_percent)}</td>
      <td><button class="lcm-risk-button" onclick="openRiskDetail(${d.id})">${riskPill(d.risk_level,d.risk_score)}</button></td>
      <td>${esc(d.recommendation||"")}</td>
    </tr>`).join("")||emptyRow(9);
}

function alertItem(d,dateField,label){
  return `<li><a href="/device-detail.html?id=${d.id}&from=lcm">${esc(codeOf(d))} - ${esc(d.name)}</a>${dateField&&d[dateField]?` <b>${esc(label||"")}${dateOrDash(d[dateField])}</b>`:""}</li>`;
}

function alertCard(title,count,items,emptyText){
  return `<div class="lcm-alert-card">
    <div class="lcm-alert-head"><h4>${esc(title)}</h4><b>${count}</b></div>
    <ul>${items.length?items.slice(0,5).join(""):`<li class="lcm-muted">${esc(emptyText)}</li>`}</ul>
  </div>`;
}

function renderAlerts(){
  const a=LCM_ALERTS||{};
  const high=(a.high_risk||[]).map(d=>`<li><button class="link-button" onclick="openRiskDetail(${d.id})">${esc(codeOf(d))} - ${esc(d.name)}</button> <b>${d.risk_score} điểm</b></li>`);
  const maint=(a.maintenance_overdue||[]).map(d=>alertItem(d,"next_maintenance",""));
  const insp=(a.inspection_overdue||[]).map(d=>alertItem(d,"next_inspection",""));
  const warr=(a.warranty_due_30||[]).map(d=>alertItem(d,"warranty_end",""));
  const receipts=(a.receipt_pending||[]).map(r=>`<li>${esc(r.device_code||"")} - ${esc(r.device_name||"")} <b>${Number(r.completion_percent||0)}%</b></li>`);
  const disposals=(a.disposal_pending||[]).map(x=>`<li>${esc(x.device_code||"")} - ${esc(x.device_name||"")} <b>${esc(x.status||"")}</b></li>`);
  q("alertGrid").innerHTML=[
    alertCard("Rủi ro cao",(a.high_risk||[]).length,high,"Không có thiết bị rủi ro cao."),
    alertCard("Bảo dưỡng quá hạn",(a.maintenance_overdue||[]).length,maint,"Không có bảo dưỡng quá hạn."),
    alertCard("Kiểm định quá hạn",(a.inspection_overdue||[]).length,insp,"Không có kiểm định quá hạn."),
    alertCard("Bảo hành sắp hết",(a.warranty_due_30||[]).length,warr,"Không có bảo hành hết hạn trong 30 ngày."),
    alertCard("Tiếp nhận chưa hoàn tất",(a.receipt_pending||[]).length,receipts,"Không có hồ sơ tiếp nhận tồn."),
    alertCard("Hồ sơ thanh lý đang xử lý",(a.disposal_pending||[]).length,disposals,"Không có hồ sơ thanh lý tồn.")
  ].join("");
}

function renderReceipts(){
  q("receiptRows").innerHTML=LCM_RECEIPTS.map(r=>`
    <tr>
      <td><div class="lcm-device-name">${esc(r.device_name)}</div><small class="lcm-code">${esc(r.device_code||"")}</small></td>
      <td>${esc(r.contract_no||"")}</td><td>${esc(r.supplier||"")}</td>
      <td>${dateOrDash(r.delivery_date)}</td><td>${dateOrDash(r.acceptance_date)}</td><td>${dateOrDash(r.handover_date)}</td>
      <td>${esc(r.co_cq_status||"")}</td><td>${esc(r.training_status||"")}</td>
      <td><div class="lcm-progress"><span style="width:${Number(r.completion_percent||0)}%"></span></div><small>${Number(r.completion_percent||0)}%</small></td>
      <td>${esc(r.status||"")}</td>
      <td><div class="lcm-action-group"><button class="btn btn-sm" onclick="editReceipt(${r.id})">Sửa</button><button class="btn btn-sm danger-light" onclick="deleteReceipt(${r.id})">Xóa</button></div></td>
    </tr>`).join("")||emptyRow(11);
}

function receiptPayload(){return{
  device_id:Number(q("receiptDevice").value),contract_no:q("receiptContract").value.trim(),supplier:q("receiptSupplier").value.trim(),
  delivery_date:q("receiptDelivery").value,installation_date:q("receiptInstall").value,acceptance_date:q("receiptAcceptance").value,
  training_date:q("receiptTrainingDate").value,handover_date:q("receiptHandover").value,receiver:q("receiptReceiver").value.trim(),
  co_cq_status:q("receiptCocq").value,training_status:q("receiptTraining").value,status:q("receiptStatus").value,note:q("receiptNote").value.trim()
};}
function resetReceipt(){q("receiptForm").reset();q("receiptId").value="";}
function editReceipt(id){const r=LCM_RECEIPTS.find(x=>Number(x.id)===Number(id));if(!r)return;setTab("receipts");q("receiptId").value=r.id;q("receiptDevice").value=r.device_id;q("receiptContract").value=r.contract_no||"";q("receiptSupplier").value=r.supplier||"";q("receiptDelivery").value=(r.delivery_date||"").slice(0,10);q("receiptInstall").value=(r.installation_date||"").slice(0,10);q("receiptAcceptance").value=(r.acceptance_date||"").slice(0,10);q("receiptTrainingDate").value=(r.training_date||"").slice(0,10);q("receiptHandover").value=(r.handover_date||"").slice(0,10);q("receiptReceiver").value=r.receiver||"";q("receiptCocq").value=r.co_cq_status||"Chưa cập nhật";q("receiptTraining").value=r.training_status||"Chưa thực hiện";q("receiptStatus").value=r.status||"Chuẩn bị tiếp nhận";q("receiptNote").value=r.note||"";q("receiptForm").scrollIntoView({behavior:"smooth",block:"start"});}
async function deleteReceipt(id){if(!confirm("Xóa phiếu tiếp nhận này?"))return;await api(`/api/lcm/receipts/${id}`,{method:"DELETE"});await reloadLcm();}
async function saveReceipt(e){e.preventDefault();const p=receiptPayload();if(!p.device_id){alert("Chọn thiết bị.");return;}const id=q("receiptId").value;await api(id?`/api/lcm/receipts/${id}`:"/api/lcm/receipts",{method:id?"PUT":"POST",body:JSON.stringify(p)});resetReceipt();await reloadLcm();}

function renderTransfers(){
  q("transferRows").innerHTML=LCM_TRANSFERS.map(t=>`<tr><td>${dateOrDash(t.transfer_date)}</td><td><div class="lcm-device-name">${esc(t.device_name)}</div><small class="lcm-code">${esc(t.device_code||"")}</small></td><td>${esc(t.from_department||"")}</td><td>${esc(t.to_department||"")}</td><td>${esc(t.from_location||"")}</td><td>${esc(t.to_location||"")}</td><td>${esc(t.reason||"")}</td><td>${esc(t.receiver||"")}</td></tr>`).join("")||emptyRow(8);
}

function updateTransferCurrent(){
  const d=deviceById(q("transferDevice").value);
  q("transferCurrent").textContent=d?`Hiện tại: ${d.department_code||"Chưa rõ khoa"} · ${d.location||"Chưa cập nhật vị trí"}`:"Chọn thiết bị để xem khoa/vị trí hiện tại.";
}

async function saveTransfer(e){
  e.preventDefault();
  const p={device_id:Number(q("transferDevice").value),transfer_date:q("transferDate").value,to_department:q("transferToDepartment").value,to_location:q("transferToLocation").value.trim(),reason:q("transferReason").value.trim(),approved_by:q("transferApprovedBy").value.trim(),receiver:q("transferReceiver").value.trim(),note:q("transferNote").value.trim()};
  if(!p.device_id||!p.to_department){alert("Chọn thiết bị và khoa nhận.");return;}
  try{await api("/api/lcm/transfers",{method:"POST",body:JSON.stringify(p)});q("transferForm").reset();q("transferDate").value=todayISO();updateTransferCurrent();await reloadLcm();}
  catch(e){alert(e.message);}
}

function filteredRiskDevices(){
  const dep=q("riskDepartment").value;const level=q("riskLevel").value;const text=q("riskSearch").value.trim().toLowerCase();
  return LCM_DEVICES.filter(d=>(dep==="ALL"||d.department_code===dep)&&(level==="ALL"||d.risk_level===level)&&(!text||[codeOf(d),d.name,d.serial,d.model,d.department_code].join(" ").toLowerCase().includes(text)));
}

function renderRisk(){
  const rows=filteredRiskDevices();
  q("riskRows").innerHTML=rows.map(d=>`<tr>
    <td class="lcm-code">${esc(codeOf(d))}</td>
    <td><div class="lcm-device-name">${esc(d.name)}</div><small>${esc(d.manufacturer||"")} ${esc(d.model||"")}</small></td>
    <td>${esc(d.department_code||"")}</td><td><span class="lcm-stage">${esc(d.lifecycle_stage||"")}</span></td>
    <td>${d.age_years||0} năm</td><td>${Number(d.usage_current_year||0).toLocaleString("vi-VN")}</td>
    <td>${d.repair_count_12m||0}</td><td>${Number(d.downtime_hours_12m||0).toFixed(1)} giờ</td><td>${pct(d.availability_percent)}</td>
    <td>${d.cost?`${pct(d.repair_cost_ratio_percent)}<br><small>${formatCurrency(d.repair_cost_total||0)}</small>`:"—"}</td>
    <td><button class="lcm-risk-button" onclick="openRiskDetail(${d.id})">${riskPill(d.risk_level,d.risk_score)}</button></td><td>${esc(d.recommendation||"")}</td>
    <td><div class="lcm-action-group"><a class="btn btn-sm" href="/device-detail.html?id=${d.id}&from=lcm">Hồ sơ</a><button class="btn btn-sm" onclick="openProfile(${d.id})">Cấu hình</button></div></td>
  </tr>`).join("")||emptyRow(13,"Không có thiết bị phù hợp bộ lọc.");
}

function componentLabel(k){return({age:"Tuổi thiết bị",repairs:"Tần suất sửa chữa",status:"Trạng thái",maintenance:"Bảo dưỡng",inspection:"Kiểm định",criticality:"Mức độ quan trọng",quality:"Chất lượng",repair_cost:"Chi phí sửa chữa"}[k]||k);}
function componentMax(k){return({age:20,repairs:15,status:20,maintenance:10,inspection:10,criticality:10,quality:10,repair_cost:5}[k]||0);}

function openRiskDetail(deviceId){
  const d=deviceById(deviceId);if(!d)return;
  q("riskDeviceName").textContent=`${deviceLabel(d)} · ${d.lifecycle_stage||""}`;
  const comps=d.risk_components||{};
  const componentRows=Object.keys(comps).map(k=>`<tr><td>${esc(componentLabel(k))}</td><td>${Number(comps[k]||0)} / ${componentMax(k)}</td><td><div class="lcm-progress"><span style="width:${componentMax(k)?Math.min(100,Number(comps[k]||0)/componentMax(k)*100):0}%"></span></div></td></tr>`).join("");
  const dueText=(days,label)=>days===null||days===undefined?`${label}: chưa có lịch`:days<0?`${label}: quá hạn ${Math.abs(days)} ngày`:days===0?`${label}: đến hạn hôm nay`:`${label}: còn ${days} ngày`;
  q("riskDetailBody").innerHTML=`
    <div class="lcm-risk-summary">
      <div>${riskPill(d.risk_level,d.risk_score)}<small>Tổng điểm rủi ro</small></div>
      <div><b>${pct(d.availability_percent)}</b><small>Availability 12 tháng</small></div>
      <div><b>${Number(d.downtime_hours_12m||0).toFixed(1)} giờ</b><small>Downtime 12 tháng</small></div>
      <div><b>${d.quality_grade||"—"}</b><small>Phân loại chất lượng</small></div>
    </div>
    <table class="lcm-component-table"><thead><tr><th>Thành phần</th><th>Điểm</th><th>Mức đóng góp</th></tr></thead><tbody>${componentRows}</tbody></table>
    <div class="lcm-due-box">
      <div>${esc(dueText(d.days_to_maintenance,"Bảo dưỡng"))}</div>
      <div>${esc(dueText(d.days_to_inspection,"Kiểm định"))}</div>
      <div>${esc(dueText(d.days_to_warranty,"Bảo hành"))}</div>
      <div>Chi phí sửa chữa/Nguyên giá: <b>${d.cost?pct(d.repair_cost_ratio_percent):"Chưa có nguyên giá"}</b></div>
    </div>
    <div class="lcm-recommendation"><b>Khuyến nghị:</b> ${esc(d.recommendation||"")}</div>`;
  q("riskModal").hidden=false;
}

function closeRiskDetail(){q("riskModal").hidden=true;}

async function openProfile(deviceId){
  const d=deviceById(deviceId);const p=await api(`/api/lcm/profiles/${deviceId}`);
  q("profileDeviceId").value=deviceId;q("profileDeviceName").textContent=d?deviceLabel(d):`Thiết bị #${deviceId}`;
  q("profileCriticality").value=p.clinical_criticality||3;q("profileLife").value=p.planned_life_years||10;q("profilePriority").value=p.replacement_priority||"Bình thường";q("profileReplacementYear").value=p.replacement_year||"";q("profileNote").value=p.note||"";
  q("profileModal").hidden=false;
}
function closeProfile(){q("profileModal").hidden=true;}
async function saveProfile(e){e.preventDefault();const id=Number(q("profileDeviceId").value);const p={clinical_criticality:Number(q("profileCriticality").value||3),planned_life_years:Number(q("profileLife").value||10),replacement_priority:q("profilePriority").value,replacement_year:Number(q("profileReplacementYear").value||0)||null,note:q("profileNote").value.trim()};await api(`/api/lcm/profiles/${id}`,{method:"PUT",body:JSON.stringify(p)});closeProfile();await reloadLcm();setTab("risk");}

function renderDisposals(){
  q("disposalRows").innerHTML=LCM_DISPOSALS.map(x=>`<tr><td><div class="lcm-device-name">${esc(x.device_name)}</div><small class="lcm-code">${esc(x.device_code||"")}</small></td><td>${esc(x.department_code||"")}</td><td>${dateOrDash(x.proposal_date)}</td><td>${esc(x.reason||"")}</td><td>${esc(x.decision_no||"")} ${dateOrDash(x.decision_date)}</td><td>${esc(x.disposal_method||"")}</td><td>${formatCurrency(x.value_recovered||0)}</td><td>${esc(x.status||"")}</td><td><div class="lcm-action-group"><button class="btn btn-sm" onclick="editDisposal(${x.id})">Sửa</button><button class="btn btn-sm danger-light" onclick="deleteDisposal(${x.id})">Xóa</button></div></td></tr>`).join("")||emptyRow(9);
}
function disposalPayload(){return{device_id:Number(q("disposalDevice").value),proposal_date:q("disposalProposal").value,reason:q("disposalReason").value.trim(),condition_summary:q("disposalCondition").value.trim(),appraisal_date:q("disposalAppraisal").value,decision_no:q("disposalDecisionNo").value.trim(),decision_date:q("disposalDecisionDate").value,disposal_method:q("disposalMethod").value.trim(),value_recovered:Number(q("disposalValue").value||0),status:q("disposalStatus").value,note:q("disposalNote").value.trim()};}
function resetDisposal(){q("disposalForm").reset();q("disposalId").value="";q("disposalProposal").value=todayISO();}
function editDisposal(id){const x=LCM_DISPOSALS.find(r=>Number(r.id)===Number(id));if(!x)return;setTab("disposals");q("disposalId").value=x.id;q("disposalDevice").value=x.device_id;q("disposalProposal").value=(x.proposal_date||"").slice(0,10);q("disposalReason").value=x.reason||"";q("disposalCondition").value=x.condition_summary||"";q("disposalAppraisal").value=(x.appraisal_date||"").slice(0,10);q("disposalDecisionNo").value=x.decision_no||"";q("disposalDecisionDate").value=(x.decision_date||"").slice(0,10);q("disposalMethod").value=x.disposal_method||"";q("disposalValue").value=x.value_recovered||0;q("disposalStatus").value=x.status||"Đề nghị thanh lý";q("disposalNote").value=x.note||"";q("disposalForm").scrollIntoView({behavior:"smooth",block:"start"});}
async function saveDisposal(e){e.preventDefault();const p=disposalPayload();if(!p.device_id){alert("Chọn thiết bị.");return;}if(p.status==="Đã thanh lý"&&!confirm("Xác nhận hồ sơ đã thanh lý? Trạng thái thiết bị sẽ chuyển sang Ngừng hoạt động."))return;const id=q("disposalId").value;await api(id?`/api/lcm/disposals/${id}`:"/api/lcm/disposals",{method:id?"PUT":"POST",body:JSON.stringify(p)});resetDisposal();await reloadLcm();}
async function deleteDisposal(id){if(!confirm("Xóa hồ sơ thanh lý này?"))return;try{await api(`/api/lcm/disposals/${id}`,{method:"DELETE"});await reloadLcm();}catch(e){alert(e.message);}}

async function reloadLcm(){
  try{
    const [meta,summary,alerts,devices,receipts,transfers,disposals]=await Promise.all([
      api("/api/meta"),api("/api/lcm/summary"),api("/api/lcm/alerts"),api("/api/lcm/devices"),api("/api/lcm/receipts"),api("/api/lcm/transfers"),api("/api/lcm/disposals")
    ]);
    LCM_META=meta;LCM_DEVICES=devices;LCM_RECEIPTS=receipts;LCM_TRANSFERS=transfers;LCM_DISPOSALS=disposals;LCM_ALERTS=alerts;
    populateSelectors();renderSummary(summary);renderAlerts();renderReceipts();renderTransfers();renderRisk();renderDisposals();updateTransferCurrent();
  }catch(e){console.error(e);alert("Không tải được phân hệ LCM: "+e.message);}
}

document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("lcm","Quản lý vòng đời thiết bị y tế (LCM)","Theo dõi thiết bị từ tiếp nhận, khai thác, bảo đảm kỹ thuật đến điều chuyển và thanh lý");
  addLcmMenuLink();
  q("transferDate").value=todayISO();q("disposalProposal").value=todayISO();
  document.querySelectorAll("#lcmTabs button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  document.querySelectorAll("[data-go-tab]").forEach(b=>b.onclick=()=>setTab(b.dataset.goTab));
  q("refreshAllBtn").onclick=reloadLcm;
  q("receiptForm").addEventListener("submit",saveReceipt);q("receiptReset").onclick=resetReceipt;
  q("transferForm").addEventListener("submit",saveTransfer);q("transferDevice").addEventListener("change",updateTransferCurrent);
  q("riskFilterBtn").onclick=renderRisk;q("riskSearch").addEventListener("input",renderRisk);q("riskDepartment").addEventListener("change",renderRisk);q("riskLevel").addEventListener("change",renderRisk);
  q("disposalForm").addEventListener("submit",saveDisposal);q("disposalReset").onclick=resetDisposal;
  q("profileForm").addEventListener("submit",saveProfile);q("profileClose").onclick=closeProfile;q("profileModal").addEventListener("click",e=>{if(e.target===q("profileModal"))closeProfile();});
  q("riskClose").onclick=closeRiskDetail;q("riskModal").addEventListener("click",e=>{if(e.target===q("riskModal"))closeRiskDetail();});
  await reloadLcm();
});
