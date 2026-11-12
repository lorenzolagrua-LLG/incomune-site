"""Genera il PDF di /inizia/ da una copia autonoma della pagina (font, CSS e immagini incorporati),
cosi' la stampa non dipende dai tempi di caricamento. Uso: python build_pdf.py <radice sito> <cartella out>"""
import base64, io, mimetypes, os, re, subprocess, sys

site, out = sys.argv[1], sys.argv[2]
MIME = {'.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}


def data_uri(url_path):
    p = os.path.join(site, url_path.lstrip('/').replace('/', os.sep))
    ext = os.path.splitext(p)[1].lower()
    return 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(open(p, 'rb').read()).decode())


html = io.open(os.path.join(site, 'inizia', 'index.html'), encoding='utf-8').read()
css = io.open(os.path.join(site, 'styles.css'), encoding='utf-8').read()
css = re.sub(r"url\('(/assets/[^']+)'\)", lambda m: "url('%s')" % data_uri(m.group(1)), css)

html = re.sub(r'<link rel="preload"[^>]*>\n?', '', html)
assert '<link rel="stylesheet" href="/styles.css">' in html
html = html.replace('<link rel="stylesheet" href="/styles.css">', '<style>\n%s\n</style>' % css)
html = re.sub(r'src="(/(?:assets|inizia)/[^"]+)"', lambda m: 'src="%s"' % data_uri(m.group(1)), html)
left = re.findall(r'(?:src|href)="(/[^"]+)"', html)
print('riferimenti locali rimasti:', sorted(set(left)))

standalone = os.path.join(out, 'inizia-standalone.html')
io.open(standalone, 'w', encoding='utf-8', newline='\n').write(html)

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge):
    edge = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
pdf = os.path.join(out, 'InComune-prendi-la-tua-scheda.pdf')
if os.path.exists(pdf):
    os.remove(pdf)
r = subprocess.run([edge, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--timeout=6000',
                    '--print-to-pdf=' + pdf, 'file:///' + standalone.replace(os.sep, '/')],
                   capture_output=True, timeout=120)
d = open(pdf, 'rb').read()
print('exit', r.returncode, 'bytes', len(d))
print('pagine', len(re.findall(rb'/Type\s*/Page[^s]', d)))
print('font', sorted(set(x.decode() for x in re.findall(rb'/BaseFont\s*/[A-Z]+\+([A-Za-z0-9\-_,]+)', d))))
