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
    <td><select id="r_${x.id}" ${locked?"disabled":""}><option>Chưa kiểm kê</option><option>Có</option><option>Không thấy</option><option>Sai vị trí</option><option>Sai khoa</option></select></td>
    <td><select id="d_${x.id}" ${locked?"disabled":""}>${deptOptions(x.actual_department_code||x.expected_department_code)}</select></td>
    <td><input id="l_${x.id}" value="${esc(x.actual_location||x.expected_location||"")}" ${locked?"disabled":""}/></td>
    <td><input id="n_${x.id}" value="${esc(x.note||"")}" ${locked?"disabled":""}/></td>
    <td>${locked?"—":`<button class="btn btn-sm" onclick="saveItem(${x.id})">Lưu</button>`}</td>
  </tr>`;
}
async function openSession(id){
  CURRENT=await api(`/api/inventory-sessions/${id}`);
  q("detailCard").style.display="block";
  q("detailTitle").textContent=`Kiểm kê ${CURRENT.session.department_code} - ${formatDateVN(CURRENT.session.inventory_date)}`;
  q("detailMeta").textContent=`${CURRENT.items.length} thiết bị trong danh sách tại thời điểm tạo đợt kiểm kê`;
  q("completeSessionBtn").style.display=CURRENT.session.status==="Đã hoàn thành"?"none":"inline-flex";
  q("itemRows").innerHTML=CURRENT.items.length?CURRENT.items.map(itemRow).join(""):'<tr><td colspan="10" class="center-empty">Khoa chưa có thiết bị trong danh mục.</td></tr>';
  CURRENT.items.forEach(x=>{ const el=q(`r_${x.id}`); if(el) el.value=x.result||"Chưa kiểm kê"; });
  q("detailCard").scrollIntoView({behavior:"smooth"});
}
async function saveItem(id){
  const body={result:q(`r_${id}`).value,actual_department_code:q(`d_${id}`).value,actual_location:q(`l_${id}`).value.trim(),note:q(`n_${id}`).value.trim(),updated_by:q("inventoryActor").value.trim()};
  await api(`/api/inventory-items/${id}`,{method:"PUT",body:JSON.stringify(body)});
  await loadSessions(); await openSession(CURRENT.session.id);
}
async function loadSessions(){SESSIONS=await api("/api/inventory-sessions");renderSessions();}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("inventory","Kiểm kê / Điều chuyển","Kiểm kê theo khoa; điều chuyển được lưu trong hồ sơ từng thiết bị");
  META=await api("/api/meta"); q("inventoryDepartment").innerHTML=deptOptions("");
  q("inventoryDate").value=todayISO(); await loadSessions();
  q("sessionForm").onsubmit=async e=>{e.preventDefault();const r=await api("/api/inventory-sessions",{method:"POST",body:JSON.stringify({inventory_date:q("inventoryDate").value,department_code:q("inventoryDepartment").value,actor:q("inventoryActor").value.trim(),note:q("inventoryNote").value.trim()})});await loadSessions();await openSession(r.id);};
  q("completeSessionBtn").onclick=async()=>{if(!CURRENT)return;try{await api(`/api/inventory-sessions/${CURRENT.session.id}/complete`,{method:"POST",body:JSON.stringify({actor:q("inventoryActor").value.trim()})});await loadSessions();await openSession(CURRENT.session.id);}catch(e){alert(e.message||e);}};
});