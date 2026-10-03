"""Assemble www/ en un seul fichier HTML (CSS et JS intégrés) pour la page de test mobile.

Usage : py tools/build_artifact.py  ->  dist/carnet.html
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "www"
OUT = ROOT / "dist" / "carnet.html"

html = (WWW / "index.html").read_text(encoding="utf-8")


def inline_css(m):
    css = (WWW / m.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"


def inline_js(m):
    js = (WWW / m.group(1)).read_text(encoding="utf-8")
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

# La page publiée reçoit déjà son squelette (doctype, head, body, meta).
for pattern in [r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</html>\s*", r"<head>\s*", r"</head>\s*",
                r"<body>\s*", r"</body>\s*", r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    html = re.sub(pattern, "", html, flags=re.IGNORECASE)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"OK {OUT} ({len(html) // 1024} Ko)")
