(function(){
  const STATE={devices:[],plan:{summary:{},rows:[]},actions:[]};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const codeOf=d=>d?.device_code||d?.insurance_code||`TB-${d?.id||""}`;
  const number=v=>Number(v||0);

  function setText(id,value){const el=$(id);if(el)el.textContent=value;}
  function daysText(v){return `${Math.abs(Number(v||0))} ngày`;}
  function unique(items){return [...new Set(items.filter(Boolean))];}

  function installPrimaryLayout(){
    const panel=document.querySelector('[data-panel="assessment"]');
    if(!panel||panel.dataset.assessmentUltraMinimal==="1")return;
    panel.dataset.assessmentUltraMinimal="1";

    const risk=$("riskDetails");
    const finance=$("financeDetails");
    const replacement=$("replacementDetails");
    const disposal=$("disposalDetails");

    // Giữ dữ liệu/logic cũ nhưng không đưa lên màn hình chính.
    [risk,finance,disposal].forEach(el=>{if(el){el.open=false;el.hidden=true;}});

    if(replacement){
      replacement.open=false;
      replacement.classList.add("assessment-primary-plan");
      const s=replacement.querySelector("summary");
      if(s)s.textContent="Kế hoạch xem xét thay mới";
      const laterCard=$("rpLater")?.closest(".simple-plan-kpi");
      if(laterCard)laterCard.hidden=true;
    }

    if(!$("assessmentActionRoot")){
      const root=document.createElement("section");
      root.id="assessmentActionRoot";
      root.className="assessment-action-root";
      root.innerHTML=`
        <div class="assessment-compact-head">
          <div>
            <h3>Cần xử lý</h3>
            <span id="assessmentActionCount">0 thiết bị</span>
          </div>
          <div class="assessment-action-filters">
            <select id="assessmentActionDepartment"><option value="ALL">Tất cả khoa/phòng</option></select>
            <input id="assessmentActionSearch" placeholder="Tìm mã / tên / model" autocomplete="off" />
          </div>
        </div>
        <div class="assessment-action-kpis">
          <div class="assessment-action-kpi urgent"><span>Xử lý ngay</span><b id="assessmentUrgent">0</b></div>
          <div class="assessment-action-kpi overdue"><span>Quá hạn kỹ thuật</span><b id="assessmentOverdue">0</b></div>
          <div class="assessment-action-kpi replace"><span>Thay mới ≤ 1 năm</span><b id="assessmentReplace1Y">0</b></div>
        </div>
        <div class="assessment-action-card">
          <div class="table-wrap">
            <table class="lcm-table assessment-action-table">
              <thead><tr><th>Thiết bị</th><th>Khoa</th><th>Cần xử lý</th><th>Việc cần làm</th><th>Hồ sơ</th></tr></thead>
              <tbody id="assessmentActionRows"></tbody>
            </table>
          </div>
          <p class="assessment-action-note">Gợi ý để sàng lọc và theo dõi; quyết định xử lý thực hiện theo đánh giá chuyên môn và thẩm quyền.</p>
        </div>`;

      const anchor=replacement||panel.firstChild;
      panel.insertBefore(root,anchor);
      $("assessmentActionDepartment")?.addEventListener("change",renderActions);
      $("assessmentActionSearch")?.addEventListener("input",renderActions);
    }
  }

  function actionForDevice(d,planRow){
    let rank=0;
    let level="watch";
    let primaryTask="";
    const issues=[];
    let overdue=false;

    const promote=(newRank,newLevel,task)=>{
      if(newRank>rank){rank=newRank;level=newLevel;primaryTask=task||primaryTask;}
      else if(newRank===rank&&!primaryTask&&task)primaryTask=task;
    };

    const status=String(d.status||"").trim();
    const maint=d.days_to_maintenance;
    const insp=d.days_to_inspection;

    if(status==="Ngừng hoạt động"){
      promote(3,"urgent","Đánh giá sửa chữa hoặc thay mới");
      issues.push("Đang ngừng hoạt động");
    }else if(status==="Chờ thanh lý"){
      promote(3,"urgent","Hoàn thiện hồ sơ thanh lý");
      issues.push("Đang chờ thanh lý");
    }else if(status==="Chờ sửa chữa"){
      promote(2,"action","Hoàn tất sửa chữa");
      issues.push("Đang chờ sửa chữa");
    }

    if(d.risk_level==="Cao"){
      promote(3,"urgent","Rà soát nguyên nhân và phương án xử lý");
      issues.push("Cảnh báo cao");
    }

    if(maint!==null&&maint!==undefined&&Number(maint)<0){
      promote(2,"action","Thực hiện bảo dưỡng");
      overdue=true;
      issues.push(`Bảo dưỡng quá hạn ${daysText(maint)}`);
    }else if(maint!==null&&maint!==undefined&&Number(maint)>=0&&Number(maint)<=30){
      promote(1,"watch","Lên lịch bảo dưỡng");
      issues.push(`Bảo dưỡng đến hạn trong ${daysText(maint)}`);
    }

    if(insp!==null&&insp!==undefined&&Number(insp)<0){
      promote(2,"action","Thực hiện kiểm định/hiệu chuẩn");
      overdue=true;
      issues.push(`Kiểm định/hiệu chuẩn quá hạn ${daysText(insp)}`);
    }else if(insp!==null&&insp!==undefined&&Number(insp)>=0&&Number(insp)<=30){
      promote(1,"watch","Lên lịch kiểm định/hiệu chuẩn");
      issues.push(`Kiểm định/hiệu chuẩn đến hạn trong ${daysText(insp)}`);
    }

    if(planRow?.horizon==="1Y"){
      promote(2,"action","Rà soát phương án thay mới");
      issues.push("Cần xem xét thay mới trong 1 năm");
    }

    // Không đưa thiết bị chỉ có cảnh báo trung bình lên danh sách hành động chính.
    if(!rank)return null;
    return {...d,level,rank,issues:unique(issues),primaryTask:primaryTask||"Theo dõi",overdue,plan:planRow||null};
  }

  function fillDepartmentFilter(){
    const select=$("assessmentActionDepartment");
    if(!select)return;
    const current=select.value||"ALL";
    const rows=[...new Map(STATE.devices.filter(d=>d.department_code).map(d=>[d.department_code,d.department_name||d.department_code])).entries()]
      .sort((a,b)=>String(a[0]).localeCompare(String(b[0]),"vi"));
    select.innerHTML='<option value="ALL">Tất cả khoa/phòng</option>'+rows.map(([code,name])=>`<option value="${esc(code)}">${esc(code)} - ${esc(name)}</option>`).join("");
    if([...select.options].some(o=>o.value===current))select.value=current;
  }

  function filteredActions(){
    const dep=$("assessmentActionDepartment")?.value||"ALL";
    const text=($("assessmentActionSearch")?.value||"").trim().toLowerCase();
    return STATE.actions.filter(d=>{
      if(dep!=="ALL"&&d.department_code!==dep)return false;
      if(text&&!([codeOf(d),d.name,d.model,d.department_code].join(" ").toLowerCase().includes(text)))return false;
      return true;
    });
  }

  function renderActions(){
    const rows=filteredActions();
    setText("assessmentActionCount",`${rows.length} thiết bị`);
    const body=$("assessmentActionRows");
    if(!body)return;

    body.innerHTML=rows.length?rows.map(d=>{
      const issues=d.issues.slice(0,2);
      const extra=d.issues.length-issues.length;
      const urgentBadge=d.level==="urgent"?'<span class="assessment-level urgent">Xử lý ngay</span>':"";
      const issueHtml=issues.map(x=>`<li${/quá hạn/i.test(x)?' class="overdue"':""}>${esc(x)}</li>`).join("");
      return `<tr>
        <td><b>${esc(d.name||"")}</b><small>${esc(codeOf(d))}${d.model?` · ${esc(d.model)}`:""}</small></td>
        <td>${esc(d.department_code||"—")}</td>
        <td>${urgentBadge}<ul class="assessment-issues">${issueHtml}${extra>0?`<li class="more">+${extra} nội dung khác</li>`:""}</ul></td>
        <td>${esc(d.primaryTask)}</td>
        <td><a class="btn btn-sm assessment-profile-btn" href="/device-detail.html?id=${Number(d.id)}&from=lcm">Mở hồ sơ</a></td>
      </tr>`;
    }).join(""):'<tr><td colspan="5" class="lcm-empty">Không có thiết bị cần xử lý theo bộ lọc.</td></tr>';
  }

  function renderSummary(){
    setText("assessmentUrgent",STATE.actions.filter(x=>x.level==="urgent").length);
    setText("assessmentOverdue",STATE.actions.filter(x=>x.overdue).length);
    setText("assessmentReplace1Y",number(STATE.plan?.summary?.within_1y));
  }

  async function loadAssessmentData(){
    try{
      const [devices,availability,plan]=await Promise.all([
        api("/api/lcm/devices"),
        api("/api/lcm/assessment-availability"),
        api("/api/lcm/replacement-plan-v2")
      ]);
      const aMap=new Map((availability||[]).map(x=>[Number(x.device_id),x]));
      STATE.devices=(devices||[]).map(d=>{
        const a=aMap.get(Number(d.id));
        return a?{...d,availability_percent:number(a.availability_percent),downtime_hours_12m:number(a.downtime_hours_12m)}:d;
      });
      STATE.plan=plan||{summary:{},rows:[]};
      const planMap=new Map((STATE.plan.rows||[]).map(x=>[Number(x.id),x]));
      STATE.actions=STATE.devices.map(d=>actionForDevice(d,planMap.get(Number(d.id)))).filter(Boolean)
        .sort((a,b)=>{
          if(b.rank!==a.rank)return b.rank-a.rank;
          if(number(b.risk_score)!==number(a.risk_score))return number(b.risk_score)-number(a.risk_score);
          return String(a.name||"").localeCompare(String(b.name||""),"vi");
        });
      fillDepartmentFilter();
      renderSummary();
      renderActions();
    }catch(err){
      console.error("Assessment action view:",err);
      const body=$("assessmentActionRows");
      if(body)body.innerHTML=`<tr><td colspan="5" class="lcm-empty">Không tải được dữ liệu: ${esc(err.message||"Lỗi không xác định")}</td></tr>`;
    }
  }

  function init(){
    installPrimaryLayout();
    loadAssessmentData();
    document.querySelector('[data-tab="assessment"]')?.addEventListener("click",()=>setTimeout(loadAssessmentData,0));
    $("refreshAllBtn")?.addEventListener("click",()=>setTimeout(loadAssessmentData,250));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();