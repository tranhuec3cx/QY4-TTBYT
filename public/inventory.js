let META={departments:[]}, SESSIONS=[], CURRENT=null;
function esc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function pct(a,b){return b?Math.round(Number(a||0)*100/Number(b)):0;}
function renderSessions(){
  q("sessionRows").innerHTML=SESSIONS.length?SESSIONS.map(s=>`<tr>
    <td>${formatDateVN(s.inventory_date)}</td>
    <td><b>${esc(s.department_code||"")}</b><div class="small">${esc(s.department_name||"")}</div></td>
    <td>${Number(s.checked_items||0)}/${Number(s.total_items||0)} (${pct(s.checked_items,s.total_items)}%)</td>
    <td>${Number(s.missing_items||0)}</td><td>${Number(s.mismatch_items||0)}</td>
    <td><span class="tag ${s.status==="Đã hoàn thành"?"green":"orange"}">${esc(s.status||"")}</span></td>
    <td><button class="btn btn-sm" onclick="openSession(${Number(s.id)})">Mở</button></td>
  </tr>`).join(""):'<tr><td colspan="7" class="center-empty">Chưa có đợt kiểm kê.</td></tr>';
}
function deptOptions(selected){
  return META.departments.map(d=>`<option value="${esc(d.code)}" ${String(d.code)===String(selected)?"selected":""}>${esc(d.code)} - ${esc(d.name)}</option>`).join("");
}
function itemRow(x,i){
  const locked=CURRENT?.session?.status==="Đã hoàn thành";
  return `<tr>
    <td>${i+1}</td><td class="device-code">${esc(x.device_code||"")}</td><td><b>${esc(x.device_name||"")}</b></td>
    <td>${esc([x.model,x.serial].filter(Boolean).join(" / "))}</td><td>${esc(x.expected_location||"")}</td>
    <td><select id="r_${x.id}" onchange="onInventoryResultChange(${Number(x.id)})" ${locked?"disabled":""}><option>Chưa kiểm kê</option><option>Có</option><option>Không thấy</option><option>Sai vị trí</option><option>Sai khoa</option></select></td>
    <td><select id="d_${x.id}" ${locked?"disabled":""}>${deptOptions(x.actual_department_code||x.expected_department_code)}</select></td>
    <td><input id="l_${x.id}" value="${esc(x.actual_location||x.expected_location||"")}" ${locked?"disabled":""}/></td>
    <td><input id="n_${x.id}" value="${esc(x.note||"")}" ${locked?"disabled":""}/></td>
    <td><div class="table-actions">${locked
      ? `<button class="btn btn-secondary btn-sm" id="t_${x.id}" onclick="transferFromInventory(${x.id})" style="display:none">Điều chuyển</button>`
      : `<button class="btn btn-sm" onclick="saveItem(${x.id})">Lưu</button>`}<button class="btn btn-secondary btn-sm" onclick="openInventoryDevice(${Number(x.device_id)})">Mở HS</button></div></td>
  </tr>`;
}
function onInventoryResultChange(id){
  const x=(CURRENT?.items||[]).find(v=>Number(v.id)===Number(id));
  if(!x) return;
  const result=q(`r_${id}`)?.value || "Chưa kiểm kê";
  const dept=q(`d_${id}`), loc=q(`l_${id}`);
  if(!dept || !loc) return;
  const locked=CURRENT?.session?.status==="Đã hoàn thành";
  const transferBtn=q(`t_${id}`);
  if(locked){
    dept.disabled=true;
    loc.disabled=true;
    const mismatch=result==="Sai khoa" || result==="Sai vị trí";
    const alreadyAtRecordedPlace=
      String(x.current_department_code||"")===String(x.actual_department_code||"") &&
      String(x.current_location||"")===String(x.actual_location||"");
    if(transferBtn) transferBtn.style.display=(mismatch && !alreadyAtRecordedPlace) ? "inline-flex" : "none";
    return;
  }

  if(result==="Có" || result==="Không thấy" || result==="Chưa kiểm kê"){
    dept.value=x.expected_department_code || "";
    loc.value=x.expected_location || "";
    dept.disabled=true;
    loc.disabled=true;
  }else if(result==="Sai vị trí"){
    dept.value=x.expected_department_code || "";
    dept.disabled=true;
    loc.disabled=false;
  }else if(result==="Sai khoa"){
    dept.disabled=false;
    loc.disabled=false;
  }
}

function openInventoryDevice(deviceId){ window.location.href=`/device-detail.html?id=${encodeURIComponent(deviceId)}&from=inventory`; }
async function openSession(id){
  CURRENT=await api(`/api/inventory-sessions/${id}`);
  q("detailCard").style.display="block";
  q("detailTitle").textContent=`Kiểm kê ${CURRENT.session.department_code} - ${formatDateVN(CURRENT.session.inventory_date)}`;
  q("detailMeta").textContent=`${CURRENT.items.length} thiết bị trong danh sách tại thời điểm tạo đợt kiểm kê`;
  q("completeSessionBtn").style.display=CURRENT.session.status==="Đã hoàn thành"?"none":"inline-flex";
  q("itemRows").innerHTML=CURRENT.items.length?CURRENT.items.map(itemRow).join(""):'<tr><td colspan="10" class="center-empty">Khoa chưa có thiết bị trong danh mục.</td></tr>';
  CURRENT.items.forEach(x=>{
    const el=q(`r_${x.id}`);
    if(el) el.value=x.result||"Chưa kiểm kê";
    onInventoryResultChange(x.id);
  });
  q("detailCard").scrollIntoView({behavior:"smooth"});
}
function inventoryItemPayload(id){
  return {result:q(`r_${id}`).value,actual_department_code:q(`d_${id}`).value,actual_location:q(`l_${id}`).value.trim(),note:q(`n_${id}`).value.trim(),updated_by:q("inventoryActor").value.trim()};
}
async function saveItem(id){
  const body=inventoryItemPayload(id);
  try{
    await api(`/api/inventory-items/${id}`,{method:"PUT",body:JSON.stringify(body)});
    const sessionId=CURRENT.session.id;
    await loadSessions();
    await openSession(sessionId);
  }catch(e){
    alert(e.message||"Không lưu được kết quả kiểm kê.");
  }
}
async function transferFromInventory(id){
  if(!CURRENT || CURRENT.session.status!=="Đã hoàn thành") {
    return alert("Hãy hoàn thành đợt kiểm kê trước khi thực hiện điều chuyển.");
  }
  const item=(CURRENT.items||[]).find(x=>Number(x.id)===Number(id));
  if(!item) return alert("Không tìm thấy dòng kiểm kê.");
  if(!["Sai khoa","Sai vị trí"].includes(item.result)) return alert("Chỉ điều chuyển các dòng kết luận Sai khoa hoặc Sai vị trí.");
  const targetDepartment=String(item.actual_department_code||"").trim();
  const targetLocation=String(item.actual_location||"").trim();
  if(!targetDepartment) return alert("Dòng kiểm kê chưa có khoa/phòng thực tế.");
  if(!targetLocation) return alert("Dòng kiểm kê chưa có vị trí thực tế.");
  if(String(item.current_department_code||"")===targetDepartment && String(item.current_location||"")===targetLocation){
    return alert("Thiết bị hiện đã ở đúng khoa/vị trí ghi nhận trong kiểm kê.");
  }
  const actor=window.QY4_AUTH_USER?.full_name || q("inventoryActor").value.trim() || "Khoa Trang bị";
  const reason=`Điều chuyển theo kết quả kiểm kê #${CURRENT.session.id}`;
  const detail=`${item.expected_department_code||""}/${item.expected_location||""} → ${targetDepartment}/${targetLocation}`;
  if(!confirm(`Xác nhận điều chuyển thiết bị sau khi đã hoàn thành kiểm kê?\n${detail}\n\nBiên bản kiểm kê vẫn giữ nguyên sai lệch ban đầu để truy vết.`)) return;
  try{
    await api(`/api/devices/${item.device_id}/transfer`,{method:"POST",body:JSON.stringify({
      transfer_datetime:fromDateTimeLocalValue(nowDateTimeLocalValue()),
      to_department_code:targetDepartment,
      to_location:targetLocation,
      actor,
      reason,
      note:[item.note,`Kiểm kê #${CURRENT.session.id}: ${detail}`].filter(Boolean).join(" | ")
    })});
    alert("Đã điều chuyển thiết bị theo kết quả kiểm kê.");
    const sessionId=CURRENT.session.id;
    await loadSessions();
    await openSession(sessionId);
  }catch(e){
    alert(e.message||"Không điều chuyển được thiết bị.");
  }
}
async function loadSessions(){SESSIONS=await api("/api/inventory-sessions");renderSessions();}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("inventory","Kiểm kê / Điều chuyển","Kiểm kê theo khoa; điều chuyển được lưu trong hồ sơ từng thiết bị");
  META=await api("/api/meta"); q("inventoryDepartment").innerHTML=deptOptions("");
  q("inventoryDate").value=todayISO();
  if(q("inventoryActor") && !q("inventoryActor").value) q("inventoryActor").value=window.QY4_AUTH_USER?.full_name || "Khoa Trang bị";
  await loadSessions();
  q("sessionForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const r=await api("/api/inventory-sessions",{method:"POST",body:JSON.stringify({
        inventory_date:q("inventoryDate").value,
        department_code:q("inventoryDepartment").value,
        actor:q("inventoryActor").value.trim(),
        note:q("inventoryNote").value.trim()
      })});
      await loadSessions();
      await openSession(r.id);
    }catch(err){
      alert(err.message||"Không tạo được đợt kiểm kê.");
    }
  };
  q("completeSessionBtn").onclick=async()=>{if(!CURRENT)return;try{await api(`/api/inventory-sessions/${CURRENT.session.id}/complete`,{method:"POST",body:JSON.stringify({actor:q("inventoryActor").value.trim()})});await loadSessions();await openSession(CURRENT.session.id);}catch(e){alert(e.message||e);}};
});