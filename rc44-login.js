function safeNext(){
  const params=new URLSearchParams(location.search);
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
  const fallback=standalone ? "/mobile.html" : "/dashboard.html";
  const raw=params.get("next")||fallback;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJsonRetry(url,options={},attempts=4){
  let lastErr=null;
  for(let i=0;i<attempts;i++){
    try{
      const r=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
      const data=await r.json().catch(()=>({}));
      if(r.ok)return {r,data};
      if([502,503,504,408].includes(r.status) && i<attempts-1){await sleep(700*(i+1));continue;}
      const err=new Error(data.error||`Máy chủ trả về lỗi ${r.status}.`);err.status=r.status;throw err;
    }catch(e){
      lastErr=e;
      if(e?.status && ![502,503,504,408].includes(e.status))throw e;
      if(i<attempts-1){await sleep(700*(i+1));continue;}
    }
  }
  throw lastErr||new Error("Không kết nối được máy chủ.");
}
async function loadStatus(){
  const err=document.getElementById("loginError");
  try{
    const {data:s}=await fetchJsonRetry("/api/auth/status",{headers:{"Accept":"application/json"}},4);
    if(!s.auth_required){
      document.getElementById("authOff").style.display="";
      document.getElementById("loginForm").querySelectorAll("input,button").forEach(x=>x.disabled=true);
      document.getElementById("continueBtn").style.display="";
      document.getElementById("continueBtn").href=safeNext();
      return;
    }
    try{
      await fetchJsonRetry("/api/auth/me",{headers:{"Accept":"application/json"}},2);
      location.replace(safeNext());
    }catch(e){
      if(e?.status!==401 && e?.status!==403) throw e;
    }
    err.textContent="";
  }catch(e){
    err.textContent="Máy chủ đang khởi động hoặc kết nối chưa ổn định. Anh/chị vẫn có thể bấm Đăng nhập, hệ thống sẽ tự thử lại.";
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  loadStatus();
  document.getElementById("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=document.getElementById("loginBtn");
    const err=document.getElementById("loginError");
    const original=btn.textContent;
    btn.disabled=true;btn.textContent="Đang đăng nhập…";err.textContent="";
    try{
      const {data}=await fetchJsonRetry("/api/auth/login",{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({
          username:document.getElementById("username").value.trim(),
          password:document.getElementById("password").value
        })
      },4);
      if(!data?.ok)throw new Error("Đăng nhập không thành công.");
      try{await fetchJsonRetry("/api/auth/me",{headers:{"Accept":"application/json"}},3);}catch(_){ }
      location.replace(safeNext());
    }catch(e){
      if(e?.status===429)err.textContent=e.message||"Có quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.";
      else if(e?.status===401)err.textContent="Tài khoản hoặc mật khẩu không đúng.";
      else err.textContent=e.message||"Đăng nhập chưa thành công. Hệ thống đã tự thử lại nhưng máy chủ vẫn chưa phản hồi ổn định.";
    }finally{btn.disabled=false;btn.textContent=original;}
  });
});
