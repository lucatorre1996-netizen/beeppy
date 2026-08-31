#!/usr/bin/env python3
"""Genera l'SVG di una schermata di avvio iOS.

Uso: python3 scripts/splash-svg.py LARGHEZZA ALTEZZA FILE_DI_USCITA

L'SVG viene generato QUADRATO (lato = altezza finale) perché qlmanage
rasterizza sempre dentro un canvas quadrato: il ritaglio al formato giusto lo
fa poi sips. Così non ci sono deformazioni e la posizione dell'ape è prevedibile.
Il disegno dell'ape è preso da assets/icon.svg: una sola fonte di verità.
"""
import sys
from pathlib import Path

W, H, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
root = Path(__file__).resolve().parent.parent

icon = (root / 'assets' / 'icon.svg').read_text(encoding='utf-8')
bee = icon.split('<rect width="512" height="512" rx="112" fill="url(#bg)"/>', 1)[1]
bee = bee.rsplit('</svg>', 1)[0].strip()

S = H                              # lato del quadrato
scale = min(W, H) * 0.34 / 512     # l'ape occupa il 34% del lato corto
bx = S / 2 - 256 * scale
by = S / 2 - 0.06 * H - 256 * scale  # dopo il ritaglio centrato cade al 44% dell'altezza

# Fondo a tinta unita, identico al background_color del manifest. Con un
# gradiente ogni PNG a queste dimensioni supererebbe il megabyte.
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd772"/>
      <stop offset="0.55" stop-color="#ffc542"/>
      <stop offset="1" stop-color="#f0a01c"/>
    </linearGradient>
  </defs>
  <rect width="{S}" height="{S}" fill="#5cbfe4"/>
  <g transform="translate({bx:.1f} {by:.1f}) scale({scale:.4f})">{bee}</g>
</svg>
'''
Path(out).write_text(svg, encoding='utf-8')
