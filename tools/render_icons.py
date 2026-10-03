# Rend les icônes d'Odysseus depuis www/assets/icon/icon.svg (resvg : py -m pip install --user resvg-py pillow).
# - PWA : www/icons/icon-192.png, icon-512.png (carré arrondi, sujet recadré), icon-maskable-512.png (pleine page)
# - Android : mipmap-*/ic_launcher.png (carré arrondi), ic_launcher_round.png (rond), ic_launcher_foreground.png (pleine page, 108 dp)
# Lancer depuis la racine du projet : py tools/render_icons.py
import io, os, re
import resvg_py
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = open(os.path.join(ROOT, 'www', 'assets', 'icon', 'icon.svg'), encoding='utf-8').read()
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')


def render(size, crop=None):
    """crop = (x, y, côté) dans le repère 1024 : recadre la scène pour grossir le navire."""
    svg = SVG
    if crop:
        svg = re.sub(r'viewBox="[^"]*"', 'viewBox="%g %g %g %g"' % (crop[0], crop[1], crop[2], crop[2]), svg, count=1)
    png = resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size)
    return Image.open(io.BytesIO(bytes(png))).convert('RGBA')


def masked(img, shape, margin=0.0):
    """Découpe en carré arrondi ('rr') ou en rond ('round'), avec une marge transparente (fraction du côté)."""
    n = img.size[0]
    big = n * 4  # masque suréchantillonné : bords lisses
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    p = int(big * margin)
    if shape == 'round':
        d.ellipse((p, p, big - p - 1, big - p - 1), fill=255)
    else:
        d.rounded_rectangle((p, p, big - p - 1, big - p - 1), radius=int((big - 2 * p) * 0.22), fill=255)
    m = m.resize((n, n), Image.LANCZOS)
    inner = int(round(n * (1 - 2 * margin)))
    sub = img.resize((inner, inner), Image.LANCZOS) if margin else img
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(sub, ((n - inner) // 2, (n - inner) // 2))
    out.putalpha(Image.composite(out.getchannel('A'), Image.new('L', (n, n), 0), m))
    return out


CROP = (152, 150, 720)  # le navire et le soleil remplissent l'icône « classique »


def save(img, *path):
    full = os.path.join(*path)
    img.save(full, optimize=True)
    print('ok', os.path.relpath(full, ROOT), img.size)


# PWA
for s in (192, 512):
    save(masked(render(s * 2, CROP).resize((s, s), Image.LANCZOS), 'rr'), ROOT, 'www', 'icons', 'icon-%d.png' % s)
save(render(512), ROOT, 'www', 'icons', 'icon-maskable-512.png')

# Android
for dpi, (legacy, fg) in {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}.items():
    folder = os.path.join(RES, 'mipmap-' + dpi)
    base = render(legacy * 4, CROP).resize((legacy, legacy), Image.LANCZOS)
    save(masked(base, 'rr', 0.04), folder, 'ic_launcher.png')
    save(masked(base, 'round', 0.04), folder, 'ic_launcher_round.png')
    save(render(fg), folder, 'ic_launcher_foreground.png')
