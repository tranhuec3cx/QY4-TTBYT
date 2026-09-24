let ROWS=[], DEVICES=[], FILTERED=[];
function escQ(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(data){
  q('countLabel').textContent=`${data.length} đánh giá`;
  q('rows').innerHTML=data.length?data.map(r=>`<tr>
    <td class="device-code">${escQ(r.device_code)}</td>
    <td>${escQ(r.device_name)}</td>
    <td class="code-only">${escQ(r.department_code||'')}</td>
    <td>${formatDateVN(r.rating_date)}</td>
    <td>${Number(r.age_score||0)}</td>
    <td>${Number(r.performance_score||0)}</td>
    <td>${Number(r.repair_score||0)}</td>
    <td>${Number(r.inspection_score||0)}</td>
    <td>${Number(r.sparepart_score||0)}</td>
    <td><strong>${Number(r.total_score||0)}</strong></td>
    <td><span class="tag ${r.grade==='A'?'green':r.grade==='B'?'yellow':r.grade==='C'?'orange':'red'}">${escQ(r.grade||'')}</span>${Number(r.is_latest||0)===1?' <span class="tag green">Mới nhất</span>':''}</td>
    <td>${escQ(r.evaluator||'')}</td>
    <td>${escQ(r.recommendation||'')}</td>
    <td><div class="table-actions"><button class="btn" onclick="editRow(${Number(r.id)})">Cập nhật</button><span class="tag gray" title="Mỗi lần đánh giá được bảo toàn để truy vết">Lịch sử</span></div></td>
  </tr>`).join(''):'<tr><td colspan="14" class="center-empty">Chưa có dữ liệu.</td></tr>';
}
function applyFilter(){const text=q('searchInput').value.toLowerCase(); const grade=q('gradeFilter').value; FILTERED=ROWS.filter(r=>(!text||[r.device_code,r.device_name,r.department_code,r.evaluator].join(' ').toLowerCase().includes(text))&&(grade==='ALL'||r.grade===grade)); render(FILTERED);}
function resetForm(){
  q('form').reset();
  q('ratingId').value='';
  q('deviceId').disabled=false;
  q('ratingDate').value=todayISO();
  q('evaluator').value=window.QY4_AUTH_USER?.full_name || "";
  q('ageScore').value=25; q('performanceScore').value=25; q('repairScore').value=20; q('inspectionScore').value=15; q('sparepartScore').value=15;
  q('saveBtn').textContent='Lưu đánh giá mới';
}
function editRow(id){
  const r=ROWS.find(x=>Number(x.id)===Number(id)); if(!r)return;
  q('ratingId').value=r.id;
  q('deviceId').value=r.device_id;
  q('deviceId').disabled=true;
  q('ratingDate').value=r.rating_date||'';
  q('evaluator').value=r.evaluator||'';
  q('ageScore').value=r.age_score||0; q('performanceScore').value=r.performance_score||0; q('repairScore').value=r.repair_score||0; q('inspectionScore').value=r.inspection_score||0; q('sparepartScore').value=r.sparepart_score||0;
  q('recommendation').value=r.recommendation||''; q('note').value=r.note||'';
  q('saveBtn').textContent='Cập nhật đánh giá';
  q('form').scrollIntoView({behavior:'smooth'});
}
async function load(){DEVICES=await api('/api/devices'); ROWS=await api('/api/quality-ratings'); q('deviceId').innerHTML=DEVICES.map(d=>`<option value="${Number(d.id)}">${escQ(d.device_code)} - ${escQ(d.name)}</option>`).join(''); applyFilter();}
async function exportExcel(){const rows=FILTERED.map(r=>({'Mã thiết bị':r.device_code,'Tên thiết bị':r.device_name,'Khoa':r.department_code,'Ngày đánh giá':r.rating_date,'Người đánh giá':r.evaluator||'','Tổng điểm':r.total_score,'Cấp':r.grade,'Mới nhất':Number(r.is_latest||0)===1?'Có':'Không','Khuyến nghị':r.recommendation,'Ghi chú':r.note})); await exportXlsx('phan_cap_chat_luong.xlsx',[{name:'PhanCap',rows}]);}
document.addEventListener('DOMContentLoaded',async()=>{
  setLayout('quality','Phân cấp chất lượng','Lưu từng lần đánh giá A/B/C/D để theo dõi diễn biến chất lượng thiết bị');
  await load(); resetForm();
  q('filterBtn').onclick=applyFilter; q('searchInput').oninput=applyFilter; q('gradeFilter').onchange=applyFilter; q('exportBtn').onclick=exportExcel; q('resetBtn').onclick=resetForm;
  q('form').onsubmit=async e=>{
    e.preventDefault();
    const p={
      device_id:Number(q('deviceId').value), rating_date:q('ratingDate').value, evaluator:q('evaluator').value.trim(),
      age_score:Number(q('ageScore').value||0), performance_score:Number(q('performanceScore').value||0), repair_score:Number(q('repairScore').value||0),
      inspection_score:Number(q('inspectionScore').value||0), sparepart_score:Number(q('sparepartScore').value||0),
      recommendation:q('recommendation').value.trim(), note:q('note').value.trim()
    };
    try{
      const id=q('ratingId').value;
      await api(id?`/api/quality-ratings/${id}`:'/api/quality-ratings',{method:id?'PUT':'POST',body:JSON.stringify(p)});
      resetForm(); await load();
    }catch(err){alert(err.message || 'Không lưu được đánh giá chất lượng.');}
  };
});
