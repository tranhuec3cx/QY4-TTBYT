from pathlib import Path

ROOT = Path('.')


def replace_between(text, start_marker, end_marker, replacement):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]

# ---- api.js ----
p = ROOT / 'public' / 'api.js'
text = p.read_text(encoding='utf-8')

text = text.replace(
    'const nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height;',
    'const nw=img.naturalWidth||img.videoWidth||img.width,nh=img.naturalHeight||img.videoHeight||img.height;'
)

if 'let QY4_LEGACY_QR_PROMISE=null;' not in text:
    text = text.replace('let QY4_JSQR_PROMISE=null;', 'let QY4_JSQR_PROMISE=null;\nlet QY4_LEGACY_QR_PROMISE=null;')

if 'async function qy4EnsureLegacyQr(){' not in text:
    marker = 'function qy4LoadImageFile(file){'
    helper = '''async function qy4EnsureLegacyQr(){\n  if(window.qrcode?.process)return window.qrcode;\n  if(!QY4_LEGACY_QR_PROMISE){\n    QY4_LEGACY_QR_PROMISE=(async()=>{\n      try{\n        await qy4LoadQrScript("/vendor/qrcode-decoder-full.js?v=RC44",5000);\n        return window.qrcode?.process?window.qrcode:null;\n      }catch(_){ return null; }\n    })();\n  }\n  const decoder=await QY4_LEGACY_QR_PROMISE;\n  if(!decoder)QY4_LEGACY_QR_PROMISE=null;\n  return decoder;\n}\n'''
    text = text.replace(marker, helper + marker)

if 'function qy4DecodeImageVariantLegacy(img,opts={}){' not in text:
    marker = 'async function qy4DetectQrFromImage(file){'
    helper = '''function qy4DecodeImageVariantLegacy(img,opts={}){\n  if(!window.qrcode?.process)return "";\n  const nw=img.naturalWidth||img.videoWidth||img.width,nh=img.naturalHeight||img.videoHeight||img.height;\n  const crop=Math.max(.32,Math.min(1,Number(opts.crop)||1));\n  const angle=Number(opts.angle)||0,maxSide=Number(opts.maxSide)||1800;\n  const cx=Number.isFinite(Number(opts.cx))?Number(opts.cx):.5, cy=Number.isFinite(Number(opts.cy))?Number(opts.cy):.5;\n  const sw=Math.max(1,Math.round(nw*crop)),sh=Math.max(1,Math.round(nh*crop));\n  const sx=Math.max(0,Math.min(nw-sw,Math.round(nw*cx-sw/2))),sy=Math.max(0,Math.min(nh-sh,Math.round(nh*cy-sh/2)));\n  const scale=Math.min(2.2,maxSide/Math.max(sw,sh)),dw=Math.max(1,Math.round(sw*scale)),dh=Math.max(1,Math.round(sh*scale));\n  const canvas=document.createElement("canvas"),rot=Math.abs(angle)%180===90,pad=Math.max(0,Math.round(Math.min(dw,dh)*(Number(opts.pad)||0)));\n  canvas.width=(rot?dh:dw)+pad*2;canvas.height=(rot?dw:dh)+pad*2;\n  const ctx=canvas.getContext("2d",{willReadFrequently:true});\n  ctx.save();ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);ctx.filter=opts.filter||"none";ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);ctx.restore();ctx.filter="none";\n  const data=ctx.getImageData(0,0,canvas.width,canvas.height);\n  try{\n    window.qrcode.width=data.width;window.qrcode.height=data.height;window.qrcode.imagedata=data;window.qrcode.debug=false;\n    const raw=window.qrcode.process(ctx);\n    return raw instanceof Error?"":String(raw||"");\n  }catch(_){ return ""; }\n}\n\n'''
    text = text.replace(marker, helper + marker)

new_detect = '''async function qy4DetectQrFromImage(file){\n  if(!file) return false;\n  if("BarcodeDetector" in window){\n    try{\n      const formats=await BarcodeDetector.getSupportedFormats?.();\n      if(!formats || formats.includes("qr_code")){\n        const detector=new BarcodeDetector({formats:["qr_code"]});\n        const bmp=await createImageBitmap(file);\n        const codes=await detector.detect(bmp); bmp.close?.();\n        if(codes?.[0]?.rawValue) return qy4OpenQrTarget(codes[0].rawValue);\n      }\n    }catch(_){ }\n  }\n  try{\n    const img=await qy4LoadImageFile(file);\n    const attempts=[\n      {crop:1,maxSide:1500,angle:0,pad:.05},{crop:1,maxSide:2200,angle:0,pad:.08},\n      {crop:.86,maxSide:1800,angle:0,pad:.08},{crop:.68,maxSide:1700,angle:0,pad:.10},{crop:.52,maxSide:1600,angle:0,pad:.12},\n      {crop:.68,maxSide:1700,angle:0,pad:.10,filter:"grayscale(1) contrast(1.45)"},\n      {crop:.52,maxSide:1600,angle:0,pad:.12,filter:"grayscale(1) contrast(1.8)"},\n      {crop:1,maxSide:1600,angle:90,pad:.06},{crop:1,maxSide:1600,angle:180,pad:.06},{crop:1,maxSide:1600,angle:270,pad:.06}\n    ];\n    for(const crop of [.56,.38]) for(const cy of [.25,.5,.75]) for(const cx of [.25,.5,.75]) attempts.push({crop,maxSide:1450,cx,cy,pad:.12});\n\n    const decoder=await qy4EnsureJsQr();\n    if(decoder){\n      for(const options of attempts){\n        const raw=qy4DecodeImageVariant(decoder,img,options);\n        if(raw && qy4OpenQrTarget(raw))return true;\n      }\n    }\n    const legacy=await qy4EnsureLegacyQr();\n    if(legacy?.process || window.qrcode?.process){\n      for(const options of attempts){\n        const raw=qy4DecodeImageVariantLegacy(img,options);\n        if(raw && qy4OpenQrTarget(raw))return true;\n      }\n    }\n  }catch(_){ }\n  return false;\n}\n'''
text = replace_between(text, 'async function qy4DetectQrFromImage(file){', 'async function qy4StartLiveQrCamera(){', new_detect)

new_live = '''async function qy4StartLiveQrCamera(){\n  const live=document.getElementById("mobileQrLive"),video=document.getElementById("mobileQrVideo"),status=document.getElementById("mobileQrStatus");\n  if(!live||!video||!navigator.mediaDevices?.getUserMedia) return false;\n  try{\n    QY4_QR_DETECTOR=null;\n    if("BarcodeDetector" in window){\n      try{\n        const formats=await BarcodeDetector.getSupportedFormats?.();\n        if(!formats || formats.includes("qr_code")) QY4_QR_DETECTOR=new BarcodeDetector({formats:["qr_code"]});\n      }catch(_){ QY4_QR_DETECTOR=null; }\n    }\n    let legacyReady=false;\n    if(!QY4_QR_DETECTOR){\n      const legacy=await qy4EnsureLegacyQr();\n      legacyReady=!!(legacy?.process || window.qrcode?.process);\n      if(!legacyReady) return false;\n    }\n    QY4_QR_STREAM=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});\n    video.srcObject=QY4_QR_STREAM; live.hidden=false; await video.play();\n    if(status)status.textContent="Đưa mã QR vào giữa khung hình";\n    let lastScan=0;\n    const scan=async(now=0)=>{\n      if(!QY4_QR_STREAM||live.hidden)return;\n      try{\n        if(video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0 && (!lastScan || now-lastScan>260)){\n          lastScan=now;\n          if(QY4_QR_DETECTOR){\n            const codes=await QY4_QR_DETECTOR.detect(video);\n            if(codes?.[0]?.rawValue){ qy4OpenQrTarget(codes[0].rawValue); return; }\n          }else if(legacyReady){\n            for(const options of [\n              {crop:1,maxSide:1100,angle:0,pad:.03},\n              {crop:.82,maxSide:1100,angle:0,pad:.08},\n              {crop:.62,maxSide:1000,angle:0,pad:.10,filter:"grayscale(1) contrast(1.55)"}\n            ]){\n              const raw=qy4DecodeImageVariantLegacy(video,options);\n              if(raw && qy4OpenQrTarget(raw)) return;\n            }\n          }\n        }\n      }catch(_){ }\n      QY4_QR_TIMER=requestAnimationFrame(scan);\n    };\n    QY4_QR_TIMER=requestAnimationFrame(scan); return true;\n  }catch(err){\n    qy4StopQrCamera(); return false;\n  }\n}\n'''
text = replace_between(text, 'async function qy4StartLiveQrCamera(){', 'async function qy4StartQrAction(){', new_live)

text = text.replace(
    'alert("Chưa đọc được QR từ ảnh. Hãy chụp lại gần hơn, đủ sáng và để toàn bộ mã QR nằm trong khung. Nếu vẫn không được, chạy CHUAN_BI_QUET_QR_OFFLINE.cmd trên máy chủ một lần rồi thử lại.");',
    'alert("Chưa đọc được QR từ ảnh. Anh hãy chụp lại gần hơn, đủ sáng, tránh lóa và để mã QR chiếm khoảng 1/3 đến 1/2 khung hình rồi thử lại.");'
)
p.write_text(text, encoding='utf-8')

# ---- mobile-app.js ----
p = ROOT / 'public' / 'mobile-app.js'
text = p.read_text(encoding='utf-8')
text = text.replace(
    'const nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height;',
    'const nw=img.naturalWidth||img.videoWidth||img.width,nh=img.naturalHeight||img.videoHeight||img.height;'
)
new_mobile_live = '''async function startLiveQr(){\n    if(!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia))return false;\n    try{\n      let detector=null,decoder=null,useLegacy=false;\n      if("BarcodeDetector" in window){try{const formats=await BarcodeDetector.getSupportedFormats?.();if(!formats||formats.includes("qr_code"))detector=new BarcodeDetector({formats:["qr_code"]});}catch{}}\n      if(!detector){\n        if(window.qrcode?.process)useLegacy=true;\n        if(!useLegacy)decoder=await ensureJsQr();\n        if(!decoder && !useLegacy && window.qrcode?.process)useLegacy=true;\n      }\n      if(!detector&&!decoder&&!useLegacy)return false;\n      state.qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});const v=$("qrVideo");v.srcObject=state.qrStream;$("qrLive").hidden=false;$("qrLive").classList.remove("photo-processing");$("qrStatus").textContent="Đưa tem QR vào giữa khung hình";await v.play();\n      let last=0,busy=false;const canvas=$("qrCanvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});\n      const scan=async(now)=>{\n        if(!state.qrStream||$("qrLive").hidden)return;\n        if(!busy&&now-last>220&&v.readyState>=2){busy=true;last=now;try{\n          let raw="";\n          if(detector){const codes=await detector.detect(v);raw=codes?.[0]?.rawValue||"";}\n          else if(decoder){const max=900,scale=Math.min(1,max/Math.max(v.videoWidth||1,v.videoHeight||1));canvas.width=Math.max(1,Math.round(v.videoWidth*scale));canvas.height=Math.max(1,Math.round(v.videoHeight*scale));ctx.drawImage(v,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height);raw=decoder(image.data,image.width,image.height,{inversionAttempts:"attemptBoth"})?.data||"";}\n          else if(useLegacy){\n            for(const options of [{crop:1,maxSide:1100,pad:.03},{crop:.82,maxSide:1100,pad:.08},{crop:.62,maxSide:1000,pad:.10,filter:"grayscale(1) contrast(1.55)"}]){\n              raw=decodeImageVariantLegacy(v,options);\n              if(raw)break;\n            }\n          }\n          if(raw){if(openQrTarget(raw))return;$("qrStatus").textContent="QR không thuộc QY4-TTBYT. Hãy quét tem thiết bị.";}\n        }catch{}finally{busy=false;}}\n        state.qrTimer=requestAnimationFrame(scan);\n      };\n      state.qrTimer=requestAnimationFrame(scan);return true;\n    }catch{stopQr();return false;}\n  }\n'''
text = replace_between(text, 'async function startLiveQr(){', '  async function startQr(){', new_mobile_live)
p.write_text(text, encoding='utf-8')

# ---- styles.css ----
p = ROOT / 'public' / 'styles.css'
text = p.read_text(encoding='utf-8')
if '/* RC44 mobile action layout */' not in text:
    text += '''\n\n/* RC44 mobile action layout */\n@media(max-width:780px){\n  .khoa-device-table tr{overflow:hidden!important;gap:6px 10px!important}\n  .khoa-device-table td:nth-child(9){padding-top:10px!important;padding-bottom:2px!important;margin-top:2px!important}\n  .khoa-device-table .table-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:minmax(38px,auto)!important;gap:8px!important;width:100%!important;align-items:stretch!important}\n  .khoa-device-table .table-actions .btn{width:100%!important;min-width:0!important;min-height:38px!important;margin:0!important;text-align:center!important;justify-content:center!important}\n  .khoa-device-table .table-actions .btn:nth-child(3){grid-column:1/-1!important}\n}\n@media(max-width:420px){\n  .khoa-device-table .table-actions{grid-template-columns:1fr!important}\n  .khoa-device-table .table-actions .btn:nth-child(3){grid-column:auto!important}\n}\n'''
p.write_text(text, encoding='utf-8')

print('RC44 patch applied')
