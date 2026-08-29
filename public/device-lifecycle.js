(function(){
  const riskLabels = {
    age:"Tuổi / tuổi đời kế hoạch",
    repairs:"Tần suất sửa chữa 12 tháng",
    status:"Trạng thái hiện tại",
    maintenance:"Bảo dưỡng",
    inspection:"Kiểm định / hiệu chuẩn",
    criticality:"Mức độ quan trọng lâm sàng",
    quality:"Đánh giá chất lượng",
    repair_cost:"Chi phí sửa chữa / nguyên giá"
  };

  function el(id){ return document.getElementById(id); }
  function text(id,v){ const x=el(id); if(x) x.textContent = v ?? "—"; }
  function escLife(v){ return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
  function fmtNum(v,d=0){ return Number(v||0).toLocaleString("vi-VN",{minimumFractionDigits:d,maximumFractionDigits:d}); }
  function fmtMoney(v){ return typeof formatCurrency==="function" ? formatCurrency(v||0) : `${fmtNum(v||0)} đ`; }
  function fmtDate(v){ return typeof formatDateVN==="function" ? formatDateVN(v) : (v||"—"); }
  function dayText(days,date){
    if(date==null||date==="") return "Chưa thiết lập";
    if(days==null||!Number.isFinite(Number(days))) return fmtDate(date);
    const n=Number(days);
    if(n<0) return `Quá hạn ${Math.abs(n)} ngày · ${fmtDate(date)}`;
    if(n===0) return `Đến hạn hôm nay · ${fmtDate(date)}`;
    return `Còn ${n} ngày · ${fmtDate(date)}`;
  }
  function deadlineClass(days){
    if(days==null||days==="") return "";
    const n=Number(days);
    if(Number.isFinite(n)&&n<0) return "overdue";
    if(Number.isFinite(n)&&n<=30) return "due";
    return "";
  }
  function riskClass(level){ return level==="Cao"?"high":level==="Trung bình"?"medium":"low"; }

  function renderMetrics(d){
    text("lifecycleStage",d.lifecycle_stage||"Đang khai thác");
    text("lifecycleAge",`${fmtNum(d.age_years||0)} năm`);
    text("lifecycleAvailability",`${fmtNum(d.availability_percent||0,1)}%`);
    text("lifecycleRepairCount",fmtNum(d.repair_count_12m||0));
    text("lifecycleDowntime",`${fmtNum(d.downtime_hours_12m||0,1)} giờ`);
    text("lifecycleRepairCost",fmtMoney(d.repair_cost_total||0));
    text("lifecycleCriticality",`${fmtNum(d.clinical_criticality||3)}/5`);
    text("lifecycleReplacement",d.replacement_year||"Chưa xác định");

    const badge=el("lifecycleRiskBadge");
    if(badge){
      badge.className=`lifecycle-risk-badge ${riskClass(d.risk_level)}`;
      badge.textContent=`Rủi ro ${d.risk_level||"—"} · ${fmtNum(d.risk_score||0)}/100`;
    }

    text("lifecycleRecommendation",d.recommendation||"Tiếp tục khai thác");
    const meta=el("lifecycleDecisionMeta");
    if(meta) meta.innerHTML=[
      `<div><b>Ưu tiên thay thế:</b> ${escLife(d.replacement_priority||"Bình thường")}</div>`,
      `<div><b>Chất lượng:</b> ${escLife(d.quality_grade||("Cấp "+(d.quality_level||"—")))}</div>`,
      `<div><b>Chi phí SC/nguyên giá:</b> ${fmtNum(d.repair_cost_ratio_percent||0,1)}%</div>`,
      `<div><b>Sử dụng năm nay:</b> ${fmtNum(d.usage_current_year||0)}</div>`
    ].join("");

    const deadlines=el("lifecycleDeadlines");
    if(deadlines) deadlines.innerHTML=[
      ["Bảo dưỡng",d.days_to_maintenance,d.next_maintenance],
      ["Kiểm định",d.days_to_inspection,d.next_inspection],
      ["Bảo hành",d.days_to_warranty,d.warranty_end]
    ].map(([label,days,date])=>`<div class="lifecycle-deadline ${deadlineClass(days)}"><span>${label}</span><b>${escLife(dayText(days,date))}</b></div>`).join("");

    const components=d.risk_components||{};
    const maxByKey={age:20,repairs:15,status:20,maintenance:10,inspection:10,criticality:10,quality:10,repair_cost:5};
    const box=el("lifecycleRiskBreakdown");
    if(box){
      const entries=Object.entries(components);
      box.innerHTML=entries.length?entries.map(([k,v])=>{
        const max=maxByKey[k]||20, pct=Math.max(0,Math.min(100,Number(v||0)/max*100));
        return `<div class="risk-row"><span>${escLife(riskLabels[k]||k)}</span><b>${fmtNum(v||0)} điểm</b><div class="risk-bar"><i style="width:${pct}%"></i></div></div>`;
      }).join(""):`<div class="lifecycle-empty">Chưa có dữ liệu cấu phần rủi ro.</div>`;
    }
  }

  function renderTimeline(items){
    const host=el("lifecycleTimeline");
    if(!host) return;
    text("lifecycleTimelineCount",`${items.length} sự kiện`);
    const shown=(items||[]).slice(0,18);
    host.innerHTML=shown.length?shown.map(x=>`
      <div class="lifecycle-event">
        <div class="lifecycle-event-date">${escLife(fmtDate(String(x.date||"").slice(0,10)))}</div>
        <div class="lifecycle-event-axis"></div>
        <div class="lifecycle-event-body">
          <b>${escLife(x.type||"Sự kiện")} · ${escLife(x.title||"")}</b>
          ${x.detail?`<span>${escLife(x.detail)}</span>`:""}
          ${x.status?`<small>${escLife(x.status)}</small>`:""}
        </div>
      </div>`).join(""):`<div class="lifecycle-empty">Chưa có dữ liệu vòng đời.</div>`;
  }

  async function loadLifecycle(){
    const id=Number(new URL(location.href).searchParams.get("id")||0);
    if(!id) return;
    const open=el("openLcmBtn");
    if(open) open.href=`/lcm.html?device_id=${encodeURIComponent(id)}`;
    try{
      const [devices,timeline]=await Promise.all([
        api("/api/lcm/devices"),
        api(`/api/lcm/timeline/${id}`)
      ]);
      const d=(devices||[]).find(x=>Number(x.id)===id);
      if(!d) throw new Error("Không tìm thấy dữ liệu LCM của thiết bị.");
      renderMetrics(d);
      renderTimeline(timeline||[]);
    }catch(e){
      console.error("LCM device overview:",e);
      const badge=el("lifecycleRiskBadge");
      if(badge){ badge.className="lifecycle-risk-badge"; badge.textContent="Chưa tải được LCM"; }
      text("lifecycleRecommendation","Không tải được dữ liệu LCM. Kiểm tra lại phân hệ LCM.");
    }
  }

  document.addEventListener("DOMContentLoaded",loadLifecycle);
})();
