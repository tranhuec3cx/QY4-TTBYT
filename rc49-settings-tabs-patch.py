from pathlib import Path

p = Path('public/settings.html')
text = p.read_text(encoding='utf-8')

if 'id="settingsTabsHost"' not in text:
    anchor = '      </div>\n\n      <section class="card permission-settings-entry">'
    replacement = '      </div>\n\n      <div id="settingsTabsHost"></div>\n\n      <section class="card permission-settings-entry">'
    if anchor not in text:
        raise SystemExit('RC49 settings tabs anchor not found')
    text = text.replace(anchor, replacement, 1)

text = text.replace('/api.js?v=RC45-LAN-QR', '/api.js?v=RC49-SETTINGS-TABS')
text = text.replace('/settings.js"></script>', '/settings.js?v=RC49-SETTINGS-TABS"></script>')
p.write_text(text, encoding='utf-8')

print('RC49 persistent settings tabs patch applied')
