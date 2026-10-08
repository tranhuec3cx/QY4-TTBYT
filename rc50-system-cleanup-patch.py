from pathlib import Path

html = Path('public/settings-system.html')
if not html.exists():
    raise SystemExit('public/settings-system.html not found')

s = html.read_text(encoding='utf-8')
marker = '<section class="card">\n  <div class="section-head">\n    <div><h2 class="section-title">Sẵn sàng triển khai</h2>'
start = s.find(marker)
if start >= 0:
    next_start = s.find('<section class="card">', start + len(marker))
    if next_start < 0:
        raise SystemExit('Could not find section after readiness block')
    s = s[:start] + s[next_start:]

s = s.replace('/styles.css?v=RC47-BACKUP', '/styles.css?v=RC50-SYSTEM')
s = s.replace('/api.js?v=RC47-BACKUP', '/api.js?v=RC50-SYSTEM')
s = s.replace('/settings-system.js?v=RC47-BACKUP', '/settings-system.js?v=RC50-SYSTEM')
html.write_text(s, encoding='utf-8')

js = Path('public/settings-system.js')
if not js.exists():
    raise SystemExit('public/settings-system.js not found')

t = js.read_text(encoding='utf-8')
idx = t.find('function esc(v)')
if idx >= 0:
    t = t[idx:]

t = t.replace(
    '  const [,,,auth] = await Promise.all([loadReadiness(),loadBackups(),loadAudit(),api("/api/auth/status")]);',
    '  const [,,auth] = await Promise.all([loadBackups(),loadAudit(),api("/api/auth/status")]);'
)
t = t.replace('  q("reloadReadinessBtn").onclick=loadReadiness;\n', '')
t = t.replace(
    'await Promise.all([loadBackups(),loadAudit(),loadReadiness()]);',
    'await Promise.all([loadBackups(),loadAudit()]);'
)
js.write_text(t, encoding='utf-8')

check = html.read_text(encoding='utf-8')
if 'Sẵn sàng triển khai' in check:
    raise SystemExit('Readiness block still present')
for required in ('Sao lưu & phục hồi dữ liệu', 'Nhật ký hệ thống', 'Người dùng và phân quyền', 'settingsTabsHost'):
    if required not in check:
        raise SystemExit(f'Missing required system section: {required}')

print('RC50 system cleanup patch applied')
