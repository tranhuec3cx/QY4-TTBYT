let META={departments:[],groups:[]};
let CURRENT_STEP=1;
function intakeEsc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function value(id){return q(id)?.value?.trim?.() ?? q(id)?.value ?? "";}
function selectedRequirements(){return Array.from(document.querySelectorAll('input[name="requiredType"]:checked')).map(x=>x.value);}
function showStep(step){
  CURRENT_STEP=Number(step)||1;
  document.querySelectorAll(".intake-panel").forEach(x=>x.style.display=Number(x.dataset.panel)===CURRENT_STEP?"block":"none");
  document.querySelectorAll(".intake-step").forEach(x=>{
    const n=Number(x.dataset.step);
    x.classList.toggle("active",n===CURRENT_STEP);
    x.classList.toggle("done",n<CURRENT_STEP);
  });
  document.querySelector(`.intake-panel[data-panel="${CURRENT_STEP}"]`)?.scrollIntoView({behavior:"smooth",block:"start"});
}
function validateStep1(){
  if(!value("receiptDate")) return "Vui lòng nhập ngày tiếp nhận.";
  if(!value("deviceName")) return "Vui lòng nhập tên thiết bị.";
  const y=Number(value("yearManufactured")||0);
  if(y && (y<1900 || y>2100)) return "Năm sản xuất không hợp lệ.";
  return "";
}
function validateAcceptance(){
  if(!value("acceptanceDate")) return "Vui lòng nhập ngày kiểm tra/nghiệm thu.";
  if(!value("inspector")) return "Vui lòng nhập người kiểm tra/nghiệm thu.";
  if(!value("acceptanceResult")) return "Vui lòng chọn kết quả nghiệm thu.";
  if(value("acceptanceResult")!=="Đạt") return "Thiết bị chưa đạt nghiệm thu nên chưa được mã hóa và lập hồ sơ sử dụng.";
  if(value("conditionStatus")==="Không đạt") return "Ngoại quan/phụ kiện đang ở trạng thái Không đạt. Hãy xử lý trước khi lập hồ sơ.";
  return "";
}
function validateProfile(){
  if(!value("department")) return "Vui lòng chọn khoa/phòng sử dụng.";
  if(!value("group")) return "Vui lòng chọn nhóm thiết bị.";
  if(!value("location")) return "Vui lòng nhập vị trí đặt máy sau bàn giao.";
  const y=Number(value("yearInUse")||0);
  if(y && (y<1900 || y>2100)) return "Năm đưa vào sử dụng không hợp lệ.";
  return "";
}
async function duplicateCheck(){
  const serial=value("serial"), name=value("deviceName"), model=value("model");
  if(!serial && !(name&&model)) return true;
  const r=await api(`/api/devices/duplicate-check?serial=${encodeURIComponent(serial)}&name=${encodeURIComponent(name)}&model=${encodeURIComponent(model)}`);
  if(r.serial_duplicate){
    const hit=(r.serial_matches||[])[0]||{};
    alert(`Serial ${serial} đã tồn tại ở ${hit.device_code||"một thiết bị khác"}. Không tạo hồ sơ mới để tránh trùng thiết bị.`);
    return false;
  }
  if((r.similar_matches||[]).length){
    const hit=r.similar_matches[0];
    return confirm(`Đã có thiết bị cùng tên và Model (${hit.device_code||"không rõ mã"}, Serial ${hit.serial||"—"}).\n\nVẫn tiếp tục lập hồ sơ cho một thiết bị vật lý khác?`);
  }
  return true;
}
function profileSummary(){
  const dept=META.departments.find(x=>String(x.code)===String(value("department")))||{};
  const group=META.groups.find(x=>String(x.code)===String(value("group")))||{};
  q("intakeSummary").innerHTML=`
    <div class="info-grid">
      <div class="info-section"><h3>Thiết bị</h3><div class="info-item"><div class="info-label">Tên</div><div class="info-value">${intakeEsc(value("deviceName"))}</div></div><div class="info-item"><div class="info-label">Model / Serial</div><div class="info-value">${intakeEsc([value("model"),value("serial")].filter(Boolean).join(" / ")||"—")}</div></div></div>
      <div class="info-section"><h3>Nghiệm thu</h3><div class="info-item"><div class="info-label">Kết quả</div><div class="info-value"><span class="tag green">${intakeEsc(value("acceptanceResult"))}</span></div></div><div class="info-item"><div class="info-label">Người kiểm tra</div><div class="info-value">${intakeEsc(value("inspector"))}</div></div></div>
      <div class="info-section"><h3>Quản lý sử dụng</h3><div class="info-item"><div class="info-label">Khoa/phòng</div><div class="info-value">${intakeEsc((dept.code?dept.code+" - ":"")+(dept.name||""))}</div></div><div class="info-item"><div class="info-label">Vị trí</div><div class="info-value">${intakeEsc(value("location"))}</div></div><div class="info-item"><div class="info-label">Nhóm</div><div class="info-value">${intakeEsc(group.name||group.code||"")}</div></div></div>
    </div>`;
}
function buildDeviceNote(){
  const items=[
    `Tiếp nhận ${value("receiptDate")}`,
    `Nghiệm thu ${value("acceptanceDate")}: ${value("acceptanceResult")}`,
    `Người kiểm tra: ${value("inspector")}`,
    `Hồ sơ kèm theo: ${value("documentStatus")}`,
    `Ngoại quan/phụ kiện: ${value("conditionStatus")}`,
    `Bàn giao ${value("handoverDate")}`,
    `Người bàn giao: ${value("handoverActor")}`,
    `Người/đơn vị nhận: ${value("receiver")}`
  ];
  if(value("receiptNote")) items.push(`Ghi chú tiếp nhận: ${value("receiptNote")}`);
  if(value("acceptanceNote")) items.push(`Ghi chú nghiệm thu: ${value("acceptanceNote")}`);
  if(value("handoverNote")) items.push(`Ghi chú bàn giao: ${value("handoverNote")}`);
  return `[HỒ SƠ TIẾP NHẬN] ${items.join(" | ")}`;
}
async function completeIntake(e){
  e.preventDefault();
  const err=validateStep1()||validateAcceptance()||validateProfile();
  if(err) return alert(err);
  if(!value("handoverDate")) return alert("Vui lòng nhập ngày bàn giao sử dụng.");
  if(!value("handoverActor")) return alert("Vui lòng nhập người bàn giao.");
  if(!value("receiver")) return alert("Vui lòng nhập người hoặc đơn vị tiếp nhận.");
  if(!(await duplicateCheck())) return;
  const payload={
    department_code:value("department"),
    group_code:value("group"),
    name:value("deviceName"),
    manufacturer:value("manufacturer"),
    model:value("model"),
    serial:value("serial"),
    country:value("country"),
    year_manufactured:Number(value("yearManufactured")||0),
    year_in_use:Number(value("yearInUse")||new Date().getFullYear()),
    warranty_end:value("warrantyEnd"),
    status:"Đang hoạt động",
    quality_level:2,
    cost:Number(value("cost")||0),
    funding:value("funding"),
    location:value("location"),
    insurance_code:value("insuranceCode"),
    inspection_required_types:selectedRequirements(),
    note:buildDeviceNote()
  };
  const btn=q("completeIntakeBtn");
  if(btn){btn.disabled=true;btn.textContent="Đang tạo hồ sơ...";}
  try{
    const created=await api("/api/devices",{method:"POST",body:JSON.stringify(payload)});
    const device=await api(`/api/devices/${created.id}`);
    alert(`Đã hoàn tất tiếp nhận và tạo hồ sơ.\nMã thiết bị: ${device.device_code||"—"}\nQR định danh đã được sinh và giữ cố định.`);
    window.location.href=`/device-detail.html?id=${encodeURIComponent(created.id)}`;
  }catch(err2){
    alert(err2.message||"Không tạo được hồ sơ thiết bị.");
    if(btn){btn.disabled=false;btn.textContent="Hoàn tất và tạo hồ sơ thiết bị";}
  }
}
document.addEventListener("DOMContentLoaded",async()=>{
  setLayout("devices","Tiếp nhận thiết bị mới","Tiếp nhận → Kiểm tra, nghiệm thu → Mã hóa, lập hồ sơ → Bàn giao sử dụng");
  META=await api("/api/meta");
  q("department").innerHTML='<option value="">-- Chọn khoa/phòng sử dụng --</option>'+META.departments.map(d=>`<option value="${intakeEsc(d.code)}">${intakeEsc(d.code)} - ${intakeEsc(d.name)}</option>`).join("");
  q("group").innerHTML='<option value="">-- Chọn nhóm thiết bị --</option>'+META.groups.map(g=>`<option value="${intakeEsc(g.code)}">${intakeEsc(g.code)} - ${intakeEsc(g.name)}</option>`).join("");
  const today=todayISO();
  q("receiptDate").value=today;q("acceptanceDate").value=today;q("handoverDate").value=today;
  q("yearInUse").value=String(new Date().getFullYear());
  q("handoverActor").value=window.QY4_AUTH_USER?.full_name||"";
  document.querySelectorAll("[data-next]").forEach(btn=>btn.onclick=()=>{
    const err=validateStep1(); if(err)return alert(err); showStep(Number(btn.dataset.next));
  });
  document.querySelectorAll("[data-back]").forEach(btn=>btn.onclick=()=>showStep(Number(btn.dataset.back)));
  q("acceptanceNext").onclick=()=>{const err=validateStep1()||validateAcceptance();if(err)return alert(err);showStep(3);};
  q("profileNext").onclick=async()=>{const err=validateStep1()||validateAcceptance()||validateProfile();if(err)return alert(err);if(!(await duplicateCheck()))return;profileSummary();showStep(4);};
  q("intakeForm").onsubmit=completeIntake;
  showStep(1);
});
