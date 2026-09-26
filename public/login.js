function safeNext(){
  const raw=new URLSearchParams(location.search).get("next")||"/dashboard.html";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard.html";
}
async function loadStatus(){
  try{
    const r=await fetch("/api/auth/status",{headers:{"Accept":"application/json"}});
    const s=await r.json();
    if(!s.auth_required){
      document.getElementById("authOff").style.display="";
      document.getElementById("loginForm").querySelectorAll("input,button").forEach(x=>x.disabled=true);
      document.getElementById("continueBtn").style.display="";
      document.getElementById("continueBtn").href=safeNext();
      return;
    }
    const me=await fetch("/api/auth/me",{headers:{"Accept":"application/json"}});
    if(me.ok) location.href=safeNext();
  }catch(e){
    document.getElementById("loginError").textContent="Không kết nối được máy chủ.";
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  loadStatus();
  document.getElementById("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=document.getElementById("loginBtn");
    const err=document.getElementById("loginError");
    btn.disabled=true; err.textContent="";
    try{
      const r=await fetch("/api/auth/login",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          username:document.getElementById("username").value.trim(),
          password:document.getElementById("password").value
        })
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||"Đăng nhập không thành công.");
      location.href=safeNext();
    }catch(e){
      err.textContent=e.message||"Đăng nhập không thành công.";
    }finally{btn.disabled=false;}
  });
});