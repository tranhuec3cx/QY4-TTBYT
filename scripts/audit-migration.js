const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function argValue(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const jsonMode = process.argv.includes("--json");
const root = process.cwd();
const afterPath = path.resolve(root, argValue("--after", path.join("db","qy4_ttbyt.sqlite")));

function latestPrestartDb() {
  const base = path.join(root,"backups");
  if (!fs.existsSync(base)) return "";
  const dirs = fs.readdirSync(base,{withFileTypes:true})
    .filter(x=>x.isDirectory() && /^prestart_/i.test(x.name))
    .map(x=>({name:x.name, full:path.join(base,x.name)}))
    .sort((a,b)=>b.name.localeCompare(a.name));
  for (const d of dirs) {
    const p=path.join(d.full,"qy4_ttbyt.sqlite");
    if(fs.existsSync(p)) return p;
  }
  return "";
}
const beforeArg = argValue("--before","");
const beforePath = beforeArg ? path.resolve(root,beforeArg) : latestPrestartDb();

const blockers=[];
const warnings=[];
const notes=[];
const stats={tables:{},device_identity_changes:{}};
const block=m=>blockers.push(m);
const warn=m=>warnings.push(m);
const ok=m=>notes.push(m);

function finish(code){
  const out={
    ok:blockers.length===0,
    before:beforePath || null,
    after:afterPath,
    blockers,warnings,notes,stats
  };
  if(jsonMode) process.stdout.write(JSON.stringify(out,null,2)+"\n");
  else{
    console.log("============================================");
    console.log(" QY4-TTBYT 5.0.0 - MIGRATION AUDIT");
    console.log("============================================");
    console.log("Truoc:",beforePath || "(khong tim thay)");
    console.log("Sau  :",afterPath);
    for(const x of notes) console.log("[DAT] ",x);
    for(const x of warnings) console.log("[LUU Y]",x);
    for(const x of blockers) console.log("[CHAN]",x);
    console.log("--------------------------------------------");
    console.log(blockers.length
      ? `KET QUA: MIGRATION AUDIT KHONG DAT (${blockers.length} muc can xu ly)`
      : `KET QUA: MIGRATION AUDIT DAT (${warnings.length} luu y)`);
  }
  process.exitCode=code;
}

if(!beforePath || !fs.existsSync(beforePath)){
  block("Không tìm thấy database trước nâng cấp. Truyền --before hoặc giữ thư mục backups/prestart_*.");
  finish(2);
  return;
}
if(!fs.existsSync(afterPath)){
  block("Không tìm thấy database sau nâng cấp.");
  finish(2);
  return;
}

let before=null, after=null;
try{
  before=new Database(beforePath,{readonly:true,fileMustExist:true});
  after=new Database(afterPath,{readonly:true,fileMustExist:true});

  const quickBefore=String(Object.values(before.prepare("PRAGMA quick_check").get()||{})[0]||"");
  const quickAfter=String(Object.values(after.prepare("PRAGMA quick_check").get()||{})[0]||"");
  stats.quick_check_before=quickBefore;
  stats.quick_check_after=quickAfter;
  if(quickBefore.toLowerCase()!=="ok") block(`Database trước nâng cấp quick_check không đạt: ${quickBefore}`);
  if(quickAfter.toLowerCase()!=="ok") block(`Database sau nâng cấp quick_check không đạt: ${quickAfter}`);
  if(quickBefore.toLowerCase()==="ok" && quickAfter.toLowerCase()==="ok") ok("SQLite trước/sau đều quick_check=ok.");

  const tableExists=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const columns=(db,name)=>tableExists(db,name) ? db.prepare(`PRAGMA table_info("${name.replace(/"/g,'""')}")`).all() : [];
  const colSet=(db,name)=>new Set(columns(db,name).map(x=>x.name));
  const qid=name=>`"${String(name).replace(/"/g,'""')}"`;

  const specs=[
    ["devices","id"],
    ["incidents","id"],
    ["repairs","id"],
    ["maintenances","id"],
    ["inspections","id"],
    ["daily_checks","id"],
    ["device_transfers","id"],
    ["documents","id"],
    ["incident_files","id"],
    ["quality_ratings","id"],
    ["operation_logs","id"],
    ["usage_reports","id"],
    ["inventory_sessions","id"],
    ["inventory_items","id"],
    ["accessories","id"],
    ["users","id"],
    ["departments","code"],
    ["device_groups","code"]
  ];

  const identityColumns={
    devices:["name","serial","department_code","group_code","location"],
    incidents:["device_id"],
    repairs:["device_id","incident_id"],
    maintenances:["device_id"],
    inspections:["device_id"],
    daily_checks:["device_id","incident_id"],
    device_transfers:["device_id"],
    documents:["device_id"],
    incident_files:["incident_id","device_id"],
    quality_ratings:["device_id"],
    operation_logs:["device_id"],
    usage_reports:["device_id"],
    inventory_items:["session_id","device_id"],
    accessories:["device_id"],
    users:["username","role","department_code"]
  };

  for(const [table,key] of specs){
    if(!tableExists(before,table)) continue;
    if(!tableExists(after,table)){
      block(`Bảng ${table} tồn tại trước nâng cấp nhưng bị mất sau nâng cấp.`);
      stats.tables[table]={before:null,after:null,missing_table:true};
      continue;
    }
    const beforeCols=colSet(before,table);
    const afterCols=colSet(after,table);
    if(!beforeCols.has(key) || !afterCols.has(key)){
      block(`Không thể audit ${table}: thiếu khóa ${key} ở database trước/sau.`);
      continue;
    }
    const beforeKeys=before.prepare(`SELECT ${qid(key)} k FROM ${qid(table)} ORDER BY ${qid(key)}`).all().map(x=>String(x.k));
    const afterKeys=after.prepare(`SELECT ${qid(key)} k FROM ${qid(table)} ORDER BY ${qid(key)}`).all().map(x=>String(x.k));
    const afterSet=new Set(afterKeys);
    const lost=beforeKeys.filter(x=>!afterSet.has(x));
    stats.tables[table]={
      before:beforeKeys.length,
      after:afterKeys.length,
      lost_keys:lost.length,
      new_keys:Math.max(0,afterKeys.length-beforeKeys.length),
      lost_key_sample:lost.slice(0,20)
    };
    if(lost.length){
      block(`${table}: mất ${lost.length}/${beforeKeys.length} khóa cũ sau migration${lost.length<=10 ? " ("+lost.join(", ")+")" : ""}.`);
    }else{
      ok(`${table}: giữ đủ ${beforeKeys.length} khóa cũ; sau nâng cấp có ${afterKeys.length} bản ghi.`);
    }

    const fields=(identityColumns[table]||[]).filter(x=>beforeCols.has(x)&&afterCols.has(x));
    if(!fields.length || !beforeKeys.length) continue;
    const select=[key,...fields].map(qid).join(",");
    const afterRows=after.prepare(`SELECT ${select} FROM ${qid(table)}`).all();
    const afterMap=new Map(afterRows.map(r=>[String(r[key]),r]));
    const beforeRows=before.prepare(`SELECT ${select} FROM ${qid(table)}`).all();
    const changed={};
    for(const field of fields) changed[field]=0;
    for(const row of beforeRows){
      const current=afterMap.get(String(row[key]));
      if(!current) continue;
      for(const field of fields){
        const a=row[field]===null || row[field]===undefined ? "" : String(row[field]).trim();
        const b=current[field]===null || current[field]===undefined ? "" : String(current[field]).trim();
        if(a!==b) changed[field]+=1;
      }
    }
    const changedFields=Object.entries(changed).filter(([,count])=>count>0);
    if(changedFields.length){
      stats.tables[table].identity_changes=Object.fromEntries(changedFields);
      block(`${table}: migration đã thay đổi trường liên kết/định danh cũ: ${changedFields.map(([f,c])=>f+"="+c).join("; ")}.`);
    }
  }

  if(tableExists(before,"devices") && tableExists(after,"devices")){
    const bc=colSet(before,"devices"), ac=colSet(after,"devices");
    if(bc.has("device_code") && ac.has("device_code")){
      const oldRows=before.prepare("SELECT id,device_code FROM devices ORDER BY id").all();
      const newMap=new Map(after.prepare("SELECT id,device_code FROM devices").all().map(x=>[Number(x.id),String(x.device_code||"")]));
      let changed=0;
      for(const row of oldRows){
        if(newMap.has(Number(row.id)) && String(row.device_code||"")!==String(newMap.get(Number(row.id))||"")) changed++;
      }
      stats.device_identity_changes.device_code_normalized=changed;
      if(changed) warn(`Có ${changed} mã thiết bị được chuẩn hóa khi nâng cấp; ID/Serial/khoa/nhóm/vị trí vẫn phải giữ nguyên.`);
    }
  }

  const fkAfter=after.prepare("PRAGMA foreign_key_check").all();
  stats.foreign_key_violations_after=fkAfter.length;
  if(fkAfter.length) block(`Database sau nâng cấp có ${fkAfter.length} vi phạm khóa ngoại.`);
  else ok("Database sau nâng cấp không có vi phạm khóa ngoại.");

}catch(e){
  block("Migration audit gặp lỗi: "+e.message);
}finally{
  try{before?.close();}catch{}
  try{after?.close();}catch{}
}
finish(blockers.length?2:0);
