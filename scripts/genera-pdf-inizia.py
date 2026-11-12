"""Genera il PDF di una pagina di /inizia/ da una copia autonoma (font, CSS e immagini incorporati),
cosi' la stampa non dipende dai tempi di caricamento.
Uso: python genera-pdf-inizia.py <radice sito> <cartella out> [inizia|primi-passi]"""
import base64, io, os, re, subprocess, sys

site, out = sys.argv[1], sys.argv[2]
which = sys.argv[3] if len(sys.argv) > 3 else 'inizia'
PAGES = {
    'inizia': (os.path.join('inizia', 'index.html'), 'InComune-prendi-la-tua-scheda.pdf'),
    'primi-passi': (os.path.join('inizia', 'primi-passi', 'index.html'), 'InComune-primi-passi.pdf'),
}
page, pdf_name = PAGES[which]
MIME = {'.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}


def data_uri(url_path):
    p = os.path.join(site, url_path.lstrip('/').replace('/', os.sep))
    ext = os.path.splitext(p)[1].lower()
    return 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(open(p, 'rb').read()).decode())


html = io.open(os.path.join(site, page), encoding='utf-8').read()
css = io.open(os.path.join(site, 'styles.css'), encoding='utf-8').read()
css = re.sub(r"url\('(/assets/[^']+)'\)", lambda m: "url('%s')" % data_uri(m.group(1)), css)

html = re.sub(r'<link rel="preload"[^>]*>\n?', '', html)
assert '<link rel="stylesheet" href="/styles.css">' in html
html = html.replace('<link rel="stylesheet" href="/styles.css">', '<style>\n%s\n</style>' % css)
html = re.sub(r'src="(/(?:assets|inizia)/[^"]+)"', lambda m: 'src="%s"' % data_uri(m.group(1)), html)
# I link tra le pagine devono funzionare anche dal PDF: indirizzo completo.
html = html.replace('href="/inizia/', 'href="https://incomune.app/inizia/')
left = re.findall(r'(?:src|href)="(/[^"]+)"', html)
print('riferimenti locali rimasti:', sorted(set(left)))

standalone = os.path.join(out, which + '-standalone.html')
io.open(standalone, 'w', encoding='utf-8', newline='\n').write(html)

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge):
    edge = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
pdf = os.path.join(out, pdf_name)
if os.path.exists(pdf):
    os.remove(pdf)
r = subprocess.run([edge, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--timeout=6000',
                    '--print-to-pdf=' + pdf, 'file:///' + standalone.replace(os.sep, '/')],
                   capture_output=True, timeout=120)
d = open(pdf, 'rb').read()
print('exit', r.returncode, 'bytes', len(d))
print('pagine', len(re.findall(rb'/Type\s*/Page[^s]', d)))
print('font', sorted(set(x.decode() for x in re.findall(rb'/BaseFont\s*/[A-Z]+\+([A-Za-z0-9\-_,]+)', d))))
