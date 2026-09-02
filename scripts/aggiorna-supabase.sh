#!/bin/bash
# Aggiorna la copia locale del client Supabase in js/vendor.
#
# Perché una copia locale: senza rete il gioco deve poter leggere la sessione
# salvata e lasciar giocare, e un CDN lento non deve bloccare l'accesso.
#
# Uso:  bash scripts/aggiorna-supabase.sh 2.114.0
set -e
cd "$(dirname "$0")/.."
V="${1:?indica la versione, per esempio 2.114.0}"
B="https://esm.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

curl -sfL "$B/@supabase/supabase-js@$V/es2020/supabase-js.bundle.mjs" -o "$T/core.mjs"
for m in buffer process events tty async_hooks; do
  curl -sfL "$B/node/$m.mjs" -o "$T/$m.mjs"
done

python3 - "$T" "$V" <<'PY'
import re, sys, pathlib
tmp, ver = sys.argv[1], sys.argv[2]
dest = pathlib.Path('js/vendor'); dest.mkdir(parents=True, exist_ok=True)
# estensione .js e non .mjs: alcuni server servono i .mjs come
# application/octet-stream, e il browser si rifiuta di eseguire un modulo che
# non arriva dichiarato come JavaScript. Meglio non dipendere da quella
# configurazione.
for src, nome in [('core', 'supabase.js')] + [(m, m + '.js') for m in
                  ('buffer', 'process', 'events', 'tty', 'async_hooks')]:
    t = open(f'{tmp}/{src}.mjs', encoding='utf-8').read()
    t = re.sub(r'(["\'])/node/([a-z_]+)\.mjs\1', r'\1./\2.js\1', t)
    if nome == 'supabase.js':
        t = (f'/* Copia locale di @supabase/supabase-js {ver} (da esm.sh).\n'
             '   Sta nel progetto e non su un CDN: senza rete il gioco deve poter\n'
             '   leggere la sessione salvata e lasciar giocare, e un CDN lento non\n'
             '   deve poter bloccare l\'accesso.\n'
             '   Per aggiornarlo: bash scripts/aggiorna-supabase.sh <versione> */\n') + t
    (dest / nome).write_text(t, encoding='utf-8')
    print(f'  js/vendor/{nome}')
PY
echo "fatto. Ricordati di alzare la versione dei file in index.html."
