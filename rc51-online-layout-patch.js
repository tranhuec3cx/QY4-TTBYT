const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'styles.css');
if (!fs.existsSync(cssPath)) {
  throw new Error('Không tìm thấy public/styles.css');
}

let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* RC51 ONLINE RESPONSIVE LAYOUT FIX */';

if (!css.includes(marker)) {
  css += `\n\n${marker}\n/* Giữ bố cục máy tính/tablet ngang ổn định đến 721px; chỉ chuyển menu lên trên ở màn hình điện thoại nhỏ. */\n@media (min-width: 721px) and (max-width: 900px){\n  .layout{\n    flex-direction:row !important;\n    align-items:stretch !important;\n  }\n  .sidebar{\n    width:250px !important;\n    min-width:250px !important;\n    flex:0 0 250px !important;\n    height:100vh !important;\n    position:sticky !important;\n    top:0 !important;\n  }\n  .sidebar-footer{display:flex !important;}\n  .main{\n    flex:1 1 auto !important;\n    min-width:0 !important;\n    padding:20px 18px 30px !important;\n  }\n  .topbar{\n    flex-direction:row !important;\n    align-items:center !important;\n    margin:0 0 18px !important;\n    padding:16px 18px !important;\n    position:relative !important;\n  }\n  .page-title{font-size:27px !important;}\n}\n\n@media (max-width: 720px){\n  .layout{flex-direction:column !important;}\n  .sidebar{\n    width:100% !important;\n    min-width:0 !important;\n    height:auto !important;\n    position:relative !important;\n  }\n  .sidebar-footer{display:none !important;}\n}\n`;
  fs.writeFileSync(cssPath, css, 'utf8');
}

console.log('RC51 online responsive layout patch applied');
