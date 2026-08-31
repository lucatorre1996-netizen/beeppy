#!/bin/bash
# Genera le schermate di avvio per iOS (apple-touch-startup-image).
# Senza queste, aprendo Beeppy dalla home iOS mostra una pagina bianca per un
# istante; con queste si vede subito il colore del gioco.
#
# Richiede macOS: qlmanage rasterizza l'SVG, sips ritaglia al formato esatto.
# Uso:  bash scripts/make-splash.sh
set -e
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p assets/splash

# larghezza x altezza in pixel fisici. Coprono gli iPhone dal modello X in poi:
# iOS usa l'immagine solo se le misure combaciano esattamente, quindi ogni
# formato nuovo va aggiunto qui.
SIZES="1320x2868 1290x2796 1284x2778 1206x2622 1179x2556 1170x2532 1125x2436 1242x2688 828x1792 750x1334"

for size in $SIZES; do
  W="${size%x*}"; H="${size#*x}"
  python3 scripts/splash-svg.py "$W" "$H" "$TMP/s.svg"
  qlmanage -t -s "$H" -o "$TMP" "$TMP/s.svg" >/dev/null 2>&1
  sips -c "$H" "$W" "$TMP/s.svg.png" --out "assets/splash/splash-${W}x${H}.png" >/dev/null
  rm -f "$TMP/s.svg.png"
  echo "  assets/splash/splash-${W}x${H}.png"
done
echo "fatto."
