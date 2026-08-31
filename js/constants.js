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

// La salita della difficoltà è volutamente lunga: il gioco deve restare
// leggibile per un bel po' di punti, non trasformarsi in un muro dopo mezzo
// minuto. I plateau arrivano intorno al punto 42 (velocità) e al tronco 48
// (varco), invece che al 30 e al 37 come nella prima taratura.
export const GAP_START = 250;
export const GAP_MIN = 168;
export const GAP_STEP = 1.7;     // per tronco

// La velocità sale in due tempi. Prima una rampa leggibile fino a 330 (intorno
// al punto 30), poi una salita quasi impercettibile fino a 370, raggiunto solo
// oltre i 150 tronchi. Così la partita "normale" resta sempre nella fascia
// giocabile, e chi arriva molto lontano trova comunque qualcosa che si stringe
// invece di un livello identico all'infinito.
export const SPEED_START = 235;
export const SPEED_STEP = 3.2;        // per punto, nella prima rampa
export const SPEED_KNEE = 330;        // dove la rampa si spiana
// Il tetto non è solo una scelta di gioco: da esso dipende il tempo minimo per
// punto (SPACING/SPEED_MAX = 0,81 s), che deve restare comodamente sopra la
// soglia di plausibilità di submit_score() (0,7 s).
export const SPEED_MAX = 370;
export const SPEED_TOP_SCORE = 150;   // punteggio a cui si toccano i 370

export const GAP_MARGIN_TOP = 80;    // il varco non si incolla ai bordi
export const GAP_MARGIN_BOTTOM = 40; // rispetto al terreno

// Quanto può spostarsi il centro del varco da un tronco al successivo.
//
// Senza questo limite il generatore produce coppie fisicamente irraggiungibili:
// un varco in basso e il successivo in alto sono 396 unità di dislivello, ma
// nel tempo fra due tronchi l'ape ne risale al massimo 201. Non è difficoltà,
// è una partita persa a sorte. Il tetto è ricavato da quanto l'ape sale
// davvero, quindi si adatta da sé se cambiano gravità, impulso o velocità.
//
// Salire costa: ogni battito dà FLAP_V^2/(2*GRAVITY) unità e poi si ricade,
// quindi in salita continua la velocità media è circa metà dell'impulso.
// Scendere è molto più facile (si lascia fare alla gravità), per questo il
// limite verso il basso è più generoso: la varietà dei tracciati resta.
export const CLIMB_RATE = Math.abs(FLAP_V) / 2;
export const SHIFT_MARGIN = 0.62; // margine: arrivare non basta, va anche centrato
export const FALL_BONUS = 1.7;

export function maxGapShift(score) {
  return CLIMB_RATE * (SPACING / speedForScore(score)) * SHIFT_MARGIN;
}

export function gapForScore(score) {
  return Math.max(GAP_MIN, GAP_START - score * GAP_STEP);
}

// Punteggio in cui finisce la prima rampa (~30).
export const SPEED_KNEE_SCORE = (SPEED_KNEE - SPEED_START) / SPEED_STEP;

export function speedForScore(score) {
  if (score <= SPEED_KNEE_SCORE) return SPEED_START + score * SPEED_STEP;
  const t = Math.min(1, (score - SPEED_KNEE_SCORE) / (SPEED_TOP_SCORE - SPEED_KNEE_SCORE));
  return SPEED_KNEE + (SPEED_MAX - SPEED_KNEE) * t;
}
