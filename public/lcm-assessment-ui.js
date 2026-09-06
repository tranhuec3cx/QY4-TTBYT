(function(){
  function e(id){return document.getElementById(id);}
  function num(v){return Number(v||0);}
  function setText(id,value){const el=e(id);if(el)el.textContent=value;}

  function installAssessmentLayout(){
    const panel=document.querySelector('[data-panel="assessment"]');
    if(!panel||panel.dataset.assessmentUi==="1")return;
    panel.dataset.assessmentUi="1";

    const risk=document.getElementById("riskDetails");
    if(risk){
      risk.querySelector("summary").textContent="Tình trạng – Cảnh báo";
      const header=risk.querySelector(".table-card-header h3");
      if(header)header.textContent="Đánh giá tình trạng thiết bị";
      const note=risk.querySelector(".table-card-header .lcm-note");
      if(note)note.textContent="Tự tổng hợp từ tuổi thiết bị, sửa chữa, thời gian ngừng máy, bảo dưỡng, kiểm định, chất lượng và chi phí đã ghi nhận.";
      const level=e("riskLevel");
      if(level){
        const labels={ALL:"Tất cả mức cảnh báo",Cao:"Cảnh báo cao","Trung bình":"Cảnh báo trung bình",Thấp:"Cảnh báo thấp"};
        [...level.options].forEach(o=>{if(labels[o.value])o.textContent=labels[o.value];});
      }
      if(e("riskSearch"))e("riskSearch").placeholder="Tìm mã / tên / model";
      const table=risk.querySelector("table");
      if(table)table.classList.add("assessment-table");
      const heads=table?.querySelectorAll("thead th")||[];
      const labels=["Mã","Thiết bị","Khoa","Tình trạng vòng đời","Đã sử dụng","","Sửa 12 tháng","Ngừng máy 12 tháng","Mức hoạt động","Tiền sửa / Nguyên giá","Mức cảnh báo","Gợi ý xử lý",""];
      heads.forEach((th,i)=>{if(labels[i]!==undefined)th.textContent=labels[i];});
    }

    const finance=document.getElementById("financeDetails");
    if(finance){
      finance.querySelector("summary").textContent="Phân tích chi phí kỹ thuật";
      const spans=finance.querySelectorAll(".finance-kpi span");
      const smalls=finance.querySelectorAll(".finance-kpi small");
      if(spans[0])spans[0].textContent="Tổng nguyên giá";
      if(spans[1])spans[1].textContent="Tổng tiền sửa chữa";
      if(spans[2])spans[2].textContent="Giá trị còn lại ước tính";
      if(spans[3])spans[3].textContent="Nguyên giá + tiền sửa chữa";
      if(smalls[2])smalls[2].textContent="Ước tính để theo dõi kỹ thuật, không phải giá trị kế toán.";
      if(smalls[3])smalls[3].textContent="Tổng hai khoản đang có dữ liệu trong hệ thống.";
      const h3=finance.querySelector(".table-card-header h3");if(h3)h3.textContent="Chi phí theo từng thiết bị";
      if(e("financeSearch"))e("financeSearch").placeholder="Tìm mã / tên / model";
      const heads=finance.querySelectorAll("table thead th");
      const labels=["Mã","Thiết bị","Khoa","Nguyên giá","Đã dùng / Dự kiến","Tiền sửa chữa","Tiền sửa / NG","Giá trị còn lại (ước tính)","Nguyên giá + sửa chữa","Gợi ý xử lý",""];
      heads.forEach((th,i)=>{if(labels[i]!==undefined)th.textContent=labels[i];});
    }

    const replacement=document.getElementById("replacementDetails");
    if(replacement){
      replacement.querySelector("summary").textContent="Kế hoạch xem xét thay mới 1 – 3 – 5 năm";
      if(e("replacementSearch"))e("replacementSearch").placeholder="Tìm mã / tên / model";
      const h3=replacement.querySelector(".table-card-header h3");if(h3)h3.textContent="Danh sách cần xem xét";
      const heads=replacement.querySelectorAll("table thead th");
      const labels=["Mức ưu tiên","Năm dự kiến","Thiết bị","Khoa","Đã dùng / Dự kiến","Sửa 12 tháng","Mức hoạt động","Tiền sửa / NG","Điểm ưu tiên","Lý do","Hồ sơ"];
      heads.forEach((th,i)=>{if(labels[i]!==undefined)th.textContent=labels[i];});
      const note=replacement.querySelector(".simple-note");if(note)note.textContent="Nguyên giá chỉ dùng để tham khảo; kế hoạch thay mới vẫn cần khảo sát, dự toán và phê duyệt theo quy định.";
    }

    if(panel&&!document.getElementById("assessmentOverview")){
      const wrap=document.createElement("div");
      wrap.id="assessmentOverview";
      wrap.innerHTML=`
        <div class="assessment-banner"><b>Tổng quan đánh giá</b><span>Các số liệu dưới đây tự cập nhật từ hồ sơ thiết bị và các nghiệp vụ kỹ thuật đã ghi nhận.</span></div>
        <div class="assessment-overview">
          <div class="assessment-kpi total"><span>Tổng thiết bị</span><b id="assessmentTotal">0</b><small>Đang có trong danh mục.</small></div>
          <div class="assessment-kpi alert-high"><span>Cảnh báo cao</span><b id="assessmentHigh">0</b><small>Cần xem xét trước.</small></div>
          <div class="assessment-kpi alert-medium"><span>Cảnh báo trung bình</span><b id="assessmentMedium">0</b><small>Cần theo dõi thêm.</small></div>
          <div class="assessment-kpi maint"><span>Bảo dưỡng quá hạn</span><b id="assessmentMaintOverdue">0</b><small>Chưa thực hiện đúng hạn.</small></div>
          <div class="assessment-kpi insp"><span>Kiểm định/hiệu chuẩn quá hạn</span><b id="assessmentInspOverdue">0</b><small>Cần xử lý theo quy định.</small></div>
        </div>
        <div class="assessment-compliance">
          <div class="assessment-compliance-card"><span>Bảo dưỡng sắp hạn ≤ 30 ngày</span><b id="assessmentMaintDue">0</b></div>
          <div class="assessment-compliance-card"><span>Kiểm định/hiệu chuẩn sắp hạn ≤ 30 ngày</span><b id="assessmentInspDue">0</b></div>
          <div class="assessment-compliance-card"><span>Thiết bị đang chờ sửa chữa</span><b id="assessmentRepair">0</b></div>
          <div class="assessment-compliance-card"><span>Thiết bị ngừng hoạt động</span><b id="assessmentStopped">0</b></div>
        </div>`;
      panel.insertBefore(wrap,panel.firstChild);
    }
  }

  function renderOverview(){
    const rows=typeof LCM_DEVICES!=="undefined"?(LCM_DEVICES||[]):[];
    setText("assessmentTotal",rows.length);
    setText("assessmentHigh",rows.filter(x=>x.risk_level==="Cao").length);
    setText("assessmentMedium",rows.filter(x=>x.risk_level==="Trung bình").length);
    setText("assessmentMaintOverdue",rows.filter(x=>x.days_to_maintenance!==null&&x.days_to_maintenance<0).length);
    setText("assessmentInspOverdue",rows.filter(x=>x.days_to_inspection!==null&&x.days_to_inspection<0).length);
    setText("assessmentMaintDue",rows.filter(x=>x.days_to_maintenance!==null&&x.days_to_maintenance>=0&&x.days_to_maintenance<=30).length);
    setText("assessmentInspDue",rows.filter(x=>x.days_to_inspection!==null&&x.days_to_inspection>=0&&x.days_to_inspection<=30).length);
    setText("assessmentRepair",rows.filter(x=>String(x.status||"")==="Chờ sửa chữa").length);
    setText("assessmentStopped",rows.filter(x=>String(x.status||"")==="Ngừng hoạt động").length);
  }

  async function refreshReliableAvailability(){
    try{
      const rows=await api("/api/lcm/assessment-availability");
      const map=new Map((rows||[]).map(x=>[Number(x.device_id),x]));
      if(typeof LCM_DEVICES!=="undefined"){
        LCM_DEVICES.forEach(d=>{
          const r=map.get(Number(d.id));
          if(r){d.availability_percent=num(r.availability_percent);d.downtime_hours_12m=num(r.downtime_hours_12m);}
        });
      }
      if(typeof renderRisk==="function")renderRisk();
      renderOverview();
    }catch(err){console.error("Assessment availability:",err);renderOverview();}
  }

  function wrapReload(){
    if(typeof reloadLcm!=="function"||reloadLcm.__assessmentWrapped)return;
    const original=reloadLcm;
    const wrapped=async function(){
      const result=await original();
      await refreshReliableAvailability();
      return result;
    };
    wrapped.__assessmentWrapped=true;
    reloadLcm=wrapped;
  }

  function init(){
    installAssessmentLayout();
    wrapReload();
    renderOverview();
    setTimeout(refreshReliableAvailability,50);
    setTimeout(refreshReliableAvailability,500);
    document.querySelector('[data-tab="assessment"]')?.addEventListener("click",()=>setTimeout(refreshReliableAvailability,0));
    const refresh=e("refreshAllBtn");
    refresh?.addEventListener("click",()=>setTimeout(refreshReliableAvailability,300));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
