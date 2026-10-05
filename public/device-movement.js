let MOVE_META={departments:[],groups:[]};
let MOVE_DEVICES=[];
let MOVE_DEVICE=null;
let MOVE_MODE="location";
function moveEsc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function normalizeVi(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");}
function equipmentDepartment(){
  return MOVE_META.departments.find(d=>normalizeVi(d.name).includes("trang bi"))
    || MOVE_META.departments.find(d=>["KTB","KC10"].includes(String(d.code||"").toUpperCase()))
    || null;
}
function departmentLabel(code){const d=MOVE_META.departments.find(x=>String(x.code)===String(code));return d?`${d.code} - ${d.name}`:(code||"—");}
function deviceLabel(d){return `${d.device_code||"#"+d.id} - ${d.name||"Thiết bị"} (${d.department_code||"—"})`;}
function inferMovementType(x){
  const r=normalizeVi(x.reason);
  if(r.includes("thay doi vi tri trong khoa")) return "Thay đổi vị trí";
  if(r.includes("thu hoi ve khoa trang bi")) return "Thu hồi về Khoa Trang bị";
  if(r.includes("dieu chuyen sang khoa khac")) return "Điều chuyển khoa";
  if(String(x.from_department_code||"")===String(x.to_department_code||"")) return "Thay đổi vị trí";
  const ktb=equipmentDepartment();
  if(ktb && String(x.to_department_code||"")===String(ktb.code)) return "Thu hồi về Khoa Trang bị";
  if(ktb && String(x.from_department_code||"")===String(ktb.code)) return "Cấp/điều chuyển từ Khoa Trang bị";
  return "Điều chuyển khoa";
}
function renderCurrent(){
  const host=q("movementCurrent");
  if(!MOVE_DEVICE){host.innerHTML="";return;}
  host.innerHTML=`
    <div><span>Mã thiết bị</span><b>${moveEsc(MOVE_DEVICE.device_code||"—")}</b></div>
    <div><span>Khoa quản lý hiện tại</span><b>${moveEsc(departmentLabel(MOVE_DEVICE.department_code))}</b></div>
    <div><span>Vị trí hiện tại</span><b>${moveEsc(MOVE_DEVICE.location||"—")}</b></div>
    <div><span>Tình trạng</span><b><span class="tag ${statusTagClass(MOVE_DEVICE.status)}">${moveEsc(MOVE_DEVICE.status||"—")}</span></b></div>`;
}
function renderTimeline(){
  const rows=MOVE_DEVICE?.transfers||[];
  q("movementRows").innerHTML=rows.length?rows.map(x=>`<tr>
    <td>${formatDateTimeVN(x.transfer_datetime)}</td>
    <td><b>${moveEsc(inferMovementType(x))}</b></td>
    <td><b>${moveEsc(departmentLabel(x.from_department_code))}</b><div class="small">${moveEsc(x.from_location||"")}</div></td>
    <td><b>${moveEsc(departmentLabel(x.to_department_code))}</b><div class="small">${moveEsc(x.to_location||"")}</div></td>
    <td class="wrap-text">${moveEsc(String(x.reason||"").replace(/^\[[^\]]+\]\s*/,""))}</td>
    <td>${moveEsc(x.actor||"")}</td>
  </tr>`).join(""):'<tr><td colspan="6" class="center-empty">Thiết bị chưa có lịch sử biến động vị trí.</td></tr>';
}
function departmentOptions(excludeCurrent=false){
  return MOVE_META.departments.filter(d=>!excludeCurrent||String(d.code)!==String(MOVE_DEVICE?.department_code||"")).map(d=>`<option value="${moveEsc(d.code)}">${moveEsc(d.code)} - ${moveEsc(d.name)}</option>`).join("");
}
function setMode(mode){
  MOVE_MODE=mode;
  document.querySelectorAll(".movement-mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  const dept=q("movementDepartment"), loc=q("movementLocation"), reason=q("movementReason"), hint=q("movementHint");
  if(!MOVE_DEVICE)return;
  dept.disabled=false;
  if(mode==="location"){
    dept.innerHTML=departmentOptions(false);dept.value=MOVE_DEVICE.department_code||"";dept.disabled=true;
    loc.value="";loc.placeholder=`Vị trí mới trong ${MOVE_DEVICE.department_code||"khoa hiện tại"}`;
    reason.value="Bố trí lại vị trí sử dụng trong khoa";
    hint.innerHTML="Chỉ cập nhật <b>vị trí đặt máy</b>; khoa quản lý, mã thiết bị, Serial và QR giữ nguyên.";
  }else if(mode==="recall"){
    dept.innerHTML=departmentOptions(false);
    const ktb=equipmentDepartment();
    if(ktb) dept.value=ktb.code;
    loc.value=ktb?"Khu tiếp nhận - Khoa Trang bị":"";
    reason.value="Thu hồi thiết bị về Khoa Trang bị để quản lý / bố trí lại";
    hint.innerHTML=ktb?`Điểm đến đã chọn <b>${moveEsc(ktb.code)} - ${moveEsc(ktb.name)}</b>. Sau khi thu hồi, có thể chọn nghiệp vụ “Điều chuyển sang khoa khác” để cấp lại.`:"Chưa nhận diện được Khoa Trang bị trong danh mục. Hãy chọn đúng khoa nhận trước khi xác nhận.";
  }else{
    dept.innerHTML='<option value="">-- Chọn khoa/phòng nhận --</option>'+departmentOptions(true);
    loc.value="";loc.placeholder="Vị trí đặt máy tại khoa nhận";
    reason.value="Điều chuyển thiết bị theo nhu cầu sử dụng";
    hint.innerHTML="Dùng sau khi thiết bị đã được thu hồi về Khoa Trang bị hoặc khi có quyết định điều chuyển giữa các khoa. Mỗi lần điều chuyển là một mốc lịch sử riêng.";
  }
}
async function loadMovementDevice(id){
  if(!id){MOVE_DEVICE=null;q("movementActionCard").style.display="none";q("movementTimelineCard").style.display="none";renderCurrent();return;}
  MOVE_DEVICE=await api(`/api/devices/${encodeURIComponent(id)}`);
  q("movementActionCard").style.display="block";q("movementTimelineCard").style.display="block";
  renderCurrent();renderTimeline();setMode(MOVE_MODE);
}
function movementPrefix(){
  if(MOVE_MODE==="location")return "[THAY ĐỔI VỊ TRÍ TRONG KHOA]";
  if(MOVE_MODE==="recall")return "[THU HỒI VỀ KHOA TRANG BỊ]";
  return "[ĐIỀU CHUYỂN SANG KHOA KHÁC]";
}
async function saveMovement(e){
  e.preventDefault();
  if(!MOVE_DEVICE)return alert("Vui lòng chọn thiết bị.");
  const targetDept=q("movementDepartment").value;
  const targetLocation=q("movementLocation").value.trim();
  const actor=q("movementActor").value.trim();
  const reason=q("movementReason").value.trim();
  if(!targetDept)return alert("Vui lòng chọn khoa/phòng nhận.");
  if(!targetLocation)return alert("Vui lòng nhập vị trí mới.");
  if(!actor)return alert("Vui lòng nhập người thực hiện.");
  if(!reason)return alert("Vui lòng nhập lý do/căn cứ.");
  if(MOVE_MODE==="location" && String(targetDept)!==String(MOVE_DEVICE.department_code)) return alert("Thay đổi vị trí trong khoa không được làm thay đổi khoa quản lý.");
  if(MOVE_MODE==="location" && String(targetLocation)===String(MOVE_DEVICE.location||"")) return alert("Vị trí mới đang trùng vị trí hiện tại.");
  if(MOVE_MODE!=="location" && String(targetDept)===String(MOVE_DEVICE.department_code) && String(targetLocation)===String(MOVE_DEVICE.location||"")) return alert("Điểm đến đang trùng vị trí hiện tại.");
  const from=`${MOVE_DEVICE.department_code||"—"} / ${MOVE_DEVICE.location||"—"}`;
  const to=`${targetDept} / ${targetLocation}`;
  if(!confirm(`Xác nhận biến động thiết bị?\n\n${from}\n→ ${to}\n\nQR và toàn bộ lịch sử thiết bị vẫn được giữ nguyên.`))return;
  try{
    await api(`/api/devices/${MOVE_DEVICE.id}/transfer`,{method:"POST",body:JSON.stringify({
      transfer_datetime:fromDateTimeLocalValue(q("movementDate").value),
      to_department_code:targetDept,
      to_location:targetLocation,
      actor,
      reason:`${movementPrefix()} ${reason}`,
      note:q("movementNote").value.trim()
    })});
    q("movementNote").value="";
    q("movementDate").value=nowDateTimeLocalValue();
    await loadMovementDevice(MOVE_DEVICE.id);
    alert("Đã cập nhật vị trí/điều chuyển và ghi vào lịch sử thiết bị. QR không thay đổi.");
  }catch(err){alert(err.message||"Không thực hiện được biến động thiết bị.");}
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("inventory","Biến động thiết bị","Thay đổi vị trí trong khoa • Thu hồi về Khoa Trang bị • Điều chuyển sang khoa khác");
  [MOVE_META,MOVE_DEVICES]=await Promise.all([api("/api/meta"),api("/api/devices")]);
  q("movementDevice").innerHTML='<option value="">-- Chọn thiết bị --</option>'+MOVE_DEVICES.map(d=>`<option value="${Number(d.id)}">${moveEsc(deviceLabel(d))}</option>`).join("");
  q("movementDate").value=nowDateTimeLocalValue();
  q("movementActor").value=window.QY4_AUTH_USER?.full_name||"";
  document.querySelectorAll(".movement-mode").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  q("movementDevice").onchange=()=>loadMovementDevice(q("movementDevice").value);
  q("openDeviceBtn").onclick=()=>{const id=q("movementDevice").value;if(!id)return alert("Vui lòng chọn thiết bị.");window.location.href=`/device-detail.html?id=${encodeURIComponent(id)}`;};
  q("movementForm").onsubmit=saveMovement;
  const id=new URL(window.location.href).searchParams.get("device_id");
  if(id && MOVE_DEVICES.some(d=>String(d.id)===String(id))){q("movementDevice").value=id;await loadMovementDevice(id);}else setMode("location");
});
