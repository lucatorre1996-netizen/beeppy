// Tutte le misure sono in "unità logiche": il mondo è alto sempre 800 unità
// e il canvas viene scalato per riempire lo schermo. Così la fisica e la
// difficoltà sono identiche su qualsiasi telefono, a qualsiasi risoluzione.
export const WORLD_H = 800;
// La larghezza del mondo resta in una forbice strettissima, e non segue quella
// dello schermo: da essa dipende quanto preavviso hai sui tronchi che arrivano,
// e con una classifica condivisa non e' giusto che un tablet veda arrivare i
// tronchi con mezzo secondo di vantaggio rispetto a un telefono. Lo spazio in
// piu' viene riempito dallo sfondo (che sborda), non dall'area di gioco.
export const WORLD_W_MIN = 340;
export const WORLD_W_MAX = 400;
export const GROUND_H = 96;

export const DT = 1 / 120; // passo fisico fisso (deterministico)

export const GRAVITY = 1900;
export const FLAP_V = -520;
export const MAX_FALL = 900;
export const FLAP_COOLDOWN = 0.08; // evita che 10 tap al secondo teletrasportino l'ape

export const BEE_X_RATIO = 0.28; // posizione orizzontale fissa dell'ape
export const BEE_R = 15;         // raggio hitbox (più piccolo dello sprite: perdona)

export const TRUNK_W = 88;
export const SPACING = 300;      // distanza orizzontale fra coppie di tronchi

export const GAP_START = 250;
export const GAP_MIN = 168;
export const GAP_STEP = 2.2;     // per punto

export const SPEED_START = 235;
export const SPEED_MAX = 400;
export const SPEED_STEP = 5.5;   // per punto

export const GAP_MARGIN_TOP = 80;    // il varco non si incolla ai bordi
export const GAP_MARGIN_BOTTOM = 40; // rispetto al terreno

export function gapForScore(score) {
  return Math.max(GAP_MIN, GAP_START - score * GAP_STEP);
}

export function speedForScore(score) {
  return Math.min(SPEED_MAX, SPEED_START + score * SPEED_STEP);
}
