"""Assemble www/ en un seul fichier HTML (CSS et JS intégrés) pour la page de test mobile.

Usage : py tools/build_artifact.py  ->  dist/odysseum.html
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "www"
OUT = ROOT / "dist" / "odysseum.html"

html = (WWW / "index.html").read_text(encoding="utf-8")


def inline_css(m):
    css = (WWW / m.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"


def inline_js(m):
    js = (WWW / m.group(1)).read_text(encoding="utf-8")
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)
# Three.js : copie locale pour l'APK, CDN autorisé pour la page de test
html = html.replace('<script src="vendor/three.min.js"></script>',
                    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
# Modèles 3D (CC0) : chargeur depuis le CDN, et les fichiers .glb intégrés en data URI
# (la page de test est un fichier unique ; world.js lit window.ODY_ASSETS avant le réseau).
models = {}
for f in sorted((WWW / "assets" / "models").rglob("*.glb")):
    rel = f.relative_to(WWW).as_posix()
    models[rel] = "data:model/gltf-binary;base64," + base64.b64encode(f.read_bytes()).decode("ascii")
html = html.replace('<script src="vendor/GLTFLoader.js"></script>',
                    '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>\n'
                    '<script>window.ODY_ASSETS = ' + json.dumps(models) + ';</script>')

# La page publiée reçoit déjà son squelette (doctype, head, body, meta).
for pattern in [r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</html>\s*", r"<head>\s*", r"</head>\s*",
                r"<body>\s*", r"</body>\s*", r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    html = re.sub(pattern, "", html, flags=re.IGNORECASE)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"OK {OUT} ({len(html) // 1024} Ko)")
