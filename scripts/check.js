// Controlla la sintassi di tutti i moduli ES del progetto.
// Li copia in .mjs perché node --check tratta i .js come CommonJS.
import { execSync } from 'node:child_process';
import { readdirSync, copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temp = mkdtempSync(join(tmpdir(), 'beeppy-'));
let errori = 0;
let controllati = 0;

function controlla(cartella) {
  for (const nome of readdirSync(cartella)) {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) {
      // la copia locale del client Supabase non la controlliamo: è codice
      // generato da altri, e nostro compito è solo non rompere il nostro
      if (percorso.includes('vendor')) continue;
      controlla(percorso);
      continue;
    }
    if (!/\.m?js$/.test(nome)) continue;
    const copia = join(temp, nome.replace(/\.js$/, '.mjs'));
    copyFileSync(percorso, copia);
    try {
      execSync(`node --check "${copia}"`, { stdio: 'pipe' });
      controllati++;
    } catch (e) {
      console.error('ERRORE', percorso, String(e.stderr).split('\n')[2] || '');
      errori++;
    }
  }
}

controlla('js');
controlla('scripts');
console.log(errori ? `${errori} file con errori` : `sintassi: ${controllati} moduli, tutti validi`);
process.exit(errori ? 1 : 0);
