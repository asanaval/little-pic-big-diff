"""Writes site/archived-mark.svg, the "ARCHIVED" watermark tile behind archived content, and
sets its size in site/style.css (--archived-mark). Run it again after changing the settings.

The word is drawn as vector outlines taken from a bold font (no browser font involved, so it
renders the same everywhere and is crisp at any zoom). The pattern is lines of words running
up at 45 degrees, every line shifted by half a word period against its neighbors (a brick
pattern), the lines LINE_GAP cap heights apart (clear space). Such a lattice repeats in a
square tile only when period / line spacing = 2n / k for whole n and k of the same parity
(the tile's side is then k x period / sqrt2, holding n x k words): the smallest such ratio
that leaves at least GAP px between the words of a line is used, the side rounded to whole
pixels and the rest derived from it, so the repeat is exact and seamless.

    python archived_mark.py    # needs fonttools (pip install fonttools) and FONT
"""
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

FONT = r"C:\Windows\Fonts\segoeuib.ttf"  # Segoe UI Bold
WORD = "ARCHIVED"
SIZE = 24  # px, cap height about 0.7 of it
SPACING = 2  # px between letters
GAP = 12  # px at least between consecutive words along a line (the exact value follows the tile)
LINE_GAP = 0.75  # clear space between two lines, as a fraction of the cap height
ANGLE = 45
OPACITY = 0.09
SITE = Path(__file__).resolve().parent / "site"

font = TTFont(FONT)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = SIZE / font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight * scale

letters = []
x = 0.0
for ch in WORD:
    name = cmap[ord(ch)]
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.0f}")
    glyphs[name].draw(pen)
    letters.append(f'<path transform="translate({x:.1f} 0) scale({scale:.5f} {-scale:.5f})" d="{pen.getCommands()}"/>')
    x += glyphs[name].width * scale + SPACING
length = x - SPACING

# The lattice of word centers, before rotation: (j * P + (i % 2) * P / 2, i * D), P the word
# period along a line, D the line spacing. It has vectors on both diagonals (so the 45-degree
# turn gives a square tile) when P / D = 2n / k, n and k whole and of the same parity; the
# diagonal vectors are then (k P / 2)(1, +-1), so the tile's side is T = k P / sqrt2.
D = cap * (1 + LINE_GAP)
ratios = sorted({(2 * n / k, k) for n in range(1, 13) for k in range(1, n + 1) if (n - k) % 2 == 0})
ratio, k = min((r, kk) for r, kk in ratios if r * D >= length + GAP)
T = round(k * ratio * D / math.sqrt(2))
P = T * math.sqrt(2) / k
D = P / ratio
c = s = math.cos(math.radians(ANGLE))
margin = length / 2 + cap
uses = []
for i in range(-16, 17):
    for j in range(-16, 17):
        ux, uy = j * P + (i % 2) * P / 2, i * D
        cx, cy = ux * c + uy * s + T / 2, -ux * s + uy * c + T / 2  # turned by -ANGLE, into the tile
        if -margin <= cx <= T + margin and -margin <= cy <= T + margin:
            uses.append(f'<use href="#w" transform="translate({cx:.2f} {cy:.2f}) rotate({-ANGLE})"/>')
word = f'<g id="w" fill="#000" fill-opacity="{OPACITY}" transform="translate({-length / 2:.1f} {cap / 2:.1f})">{"".join(letters)}</g>'
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{T}" height="{T}" viewBox="0 0 {T} {T}" data-period="{P:.3f}" data-line="{D:.3f}">'
       f'<defs>{word}</defs>{"".join(uses)}</svg>\n')
ET.fromstring(svg)
(SITE / "archived-mark.svg").write_text(svg, encoding="utf-8", newline="\n")

css_path = SITE / "style.css"
css = css_path.read_bytes().decode("utf-8")
css, n = re.subn(r"  --archived-mark: url\([^\n]*\n", f'  --archived-mark: url("archived-mark.svg") 0 0 / {T}px {T}px repeat;\n', css)
assert n == 1, "style.css: --archived-mark line not found"
css_path.write_bytes(css.encode("utf-8"))
print(f"word {length:.0f}px, cap {cap:.1f}px; period {P:.1f} (gap {P - length:.0f}), lines {D:.1f}px apart "
      f"(clear {D - cap:.1f} = {(D - cap) / cap:.0%} of the cap height); ratio {ratio:.2f} (k={k}); "
      f"tile {T}x{T}, {len(uses)} word instances, {len(svg)} bytes")
