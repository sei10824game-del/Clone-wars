#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file.

Everything (CSS + JS) is inlined so the file runs by double-clicking it, from
the iOS Files app, or offline — no web server needed.
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "clone-survivors.html")

html = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
css = io.open(os.path.join(ROOT, "style.css"), encoding="utf-8").read()
js = io.open(os.path.join(ROOT, "game.js"), encoding="utf-8").read()

# the webfont @import needs the network; drop it so the bundle is truly offline-safe
css = re.sub(r"@import url\([^)]*\);\s*", "", css, count=1)

def inline_safe(text, tag):
    """Guard against an accidental </script> / </style> inside the source."""
    return text.replace("</" + tag, "<\\/" + tag)


html = re.sub(
    r'<link rel="stylesheet" href="style\.css[^"]*" />',
    lambda m: "<style>\n" + inline_safe(css, "style") + "\n</style>",
    html,
)
html = re.sub(
    r'<script src="game\.js[^"]*"></script>',
    lambda m: "<script>\n" + inline_safe(js, "script") + "\n</script>",
    html,
)

# make it obvious this is the offline copy
html = html.replace(
    "<title>CLONE SURVIVORS — クローンサバイバーズ</title>",
    "<title>CLONE SURVIVORS — クローンサバイバーズ (offline)</title>",
)

io.open(OUT, "w", encoding="utf-8").write(html)
print(f"wrote {OUT} ({os.path.getsize(OUT):,} bytes)")
print(f"  html {len(html):,} chars | css {len(css):,} | js {len(js):,}")
