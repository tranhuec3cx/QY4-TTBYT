from pathlib import Path

p = Path('public/login.html')
text = p.read_text(encoding='utf-8')
text = text.replace('<script src="/login.js"></script>', '<script src="/login.js?v=RC44-LOGIN3"></script>')
text = text.replace('<link rel="stylesheet" href="/styles.css?v=RC38" />', '<link rel="stylesheet" href="/styles.css?v=RC44" />')
p.write_text(text, encoding='utf-8')

sw = Path('public/sw.js')
if sw.exists():
    s = sw.read_text(encoding='utf-8')
    s = s.replace('qy4-mobile-rc42-final-v1', 'qy4-mobile-rc44-v3')
    # Do not cache login/auth scripts: they must always come from the current deployment.
    old = 'if(url.origin!==self.location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith(".html")) return;'
    new = 'if(url.origin!==self.location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith(".html") || url.pathname==="/login.js") return;'
    if old in s:
        s = s.replace(old, new)
    sw.write_text(s, encoding='utf-8')

print('RC44 login cache patch applied')
