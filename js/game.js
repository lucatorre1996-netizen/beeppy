import * as K from './constants.js';
import { Sim } from './sim.js';
import { randomSeed } from './rng.js';
import { P } from './palette.js';
import { sfxFlap, sfxScore, sfxHit, sfxFall, unlockAudio } from './audio.js';

const MAX_FRAME = 0.25; // se la scheda torna in primo piano non recuperiamo minuti di fisica

// Le particelle vivono in un serbatoio di dimensione fissa, creato una volta
// sola. Prima ogni battito ne allocava 5 e ogni morte 26, e la rimozione usava
// splice: decine di oggetti al secondo creati e buttati, piu' spostamenti di
// memoria. Su un telefono economico una pausa del garbage collector nel momento
// sbagliato e' uno scatto proprio mentre passi in un varco.
// Le vive stanno sempre in testa all'array: spegnerne una e' uno scambio con
// l'ultima viva, non una rimozione.
const MAX_PARTICELLE = 140;

function serbatoioParticelle() {
  const p = [];
  for (let i = 0; i < MAX_PARTICELLE; i++) {
    p.push({ x: 0, y: 0, vx: 0, vy: 0, r: 1, c: '#fff', a: 1, life: 0, max: 1, g: 0 });
  }
  return p;
}

// Vibrazione breve. Esiste solo su Android: su iOS il web non ha vibrazione, e
// non e' una dimenticanza. Racchiusa perche' alcuni browser la dichiarano e poi
// lanciano un'eccezione se la pagina non e' in primo piano.
function vibra(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* niente */ }
}

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.phase = 'menu'; // menu | ready | playing | dying | over
    this.acc = 0;
    this.time = 0;
    this.scrollX = 0;
    this.shake = 0;
    this.flash = 0;
    this.scorePop = 0;
    this.beeRot = 0;
    this.wingPhase = 0;
    this.beeVisible = false; // nel menu comanda il logo, non il canvas
    this.particles = serbatoioParticelle();
    this.particelleVive = 0;
    this.pollen = [];
    this.onGameOver = null;
    this.onStart = null;
    this.onScore = null;
    this.deathY = 0;
    this.deathVy = 0;
    this.freeze = 0;
    this.startedAt = 0;

    this.makePollen();
    this.newSim();
  }

  get worldW() {
    return this.renderer.view.worldW;
  }

  makePollen() {
    this.pollen = [];
    for (let i = 0; i < 26; i++) {
      this.pollen.push({
        x: Math.random() * 700,
        y: 40 + Math.random() * (K.WORLD_H - 180),
        r: 1.6 + Math.random() * 3.4,
        a: 0.25 + Math.random() * 0.5,
        w: 0.4 + Math.random() * 1.2,
        ph: Math.random() * 7,
      });
    }
  }

  newSim(seed = randomSeed()) {
    this.sim = new Sim(seed, this.worldW);
    this.beeRot = 0;
    this.particelleVive = 0;   // il serbatoio resta, si azzerano solo le vive
  }

  // Chiamato quando il canvas cambia dimensione (rotazione schermo, tastiera).
  onResize() {
    if (this.phase === 'playing' || this.phase === 'ready') {
      this.sim.worldW = this.worldW;
      this.sim.beeX = this.worldW * K.BEE_X_RATIO;
    } else {
      this.newSim(this.sim.seed);
    }
  }

  toMenu() {
    this.phase = 'menu';
    // nel menu l'ape del canvas si sovrappone al logo: la nascondiamo e resta
    // solo quella (ferma, elegante) del titolo.
    this.beeVisible = false;
    this.newSim();
  }

  arm() {
    // schermata "pronti": tronchi visibili ma fermi, si parte al primo tap
    this.newSim();
    this.phase = 'ready';
    this.beeVisible = true;
    this.scorePop = 0;
  }

  tap() {
    unlockAudio();
    // Durante la caduta il tocco la salta e porta subito al pannello. Fra la
    // morte e il "Rigioca" c'erano piu' di un secondo di animazione: chi vuole
    // riprovare subito non deve stare a guardarla.
    if (this.phase === 'dying') {
      this.atterra();
      return;
    }
    if (this.phase === 'ready') {
      this.phase = 'playing';
      this.startedAt = performance.now();
      if (this.onStart) this.onStart();
      this.sim.flap();
      this.puff();
      sfxFlap();
    } else if (this.phase === 'playing') {
      this.sim.flap();
    }
  }

  // Prende la prima particella spenta. Se il serbatoio e' pieno rinuncia: meglio
  // una scintilla in meno che un'allocazione durante la partita.
  accendi() {
    if (this.particelleVive >= MAX_PARTICELLE) return null;
    return this.particles[this.particelleVive++];
  }

  puff() {
    for (let i = 0; i < 5; i++) {
      const p = this.accendi();
      if (!p) return;
      p.x = this.sim.beeX - 14 + (Math.random() - 0.5) * 8;
      p.y = this.sim.bee.y + 8 + (Math.random() - 0.5) * 8;
      p.vx = -60 - Math.random() * 90;
      p.vy = 30 + Math.random() * 70;
      p.r = 2 + Math.random() * 3.6;
      p.c = 'rgba(255,255,255,0.75)';
      p.a = 0.6;
      p.life = 0.45;
      p.max = 0.45;
      p.g = 40;
    }
  }

  sparkle(n) {
    for (let i = 0; i < 10; i++) {
      const p = this.accendi();
      if (!p) return;
      const ang = Math.random() * Math.PI * 2;
      p.x = this.sim.beeX + 10;
      p.y = this.sim.bee.y;
      p.vx = Math.cos(ang) * (60 + Math.random() * 120);
      p.vy = Math.sin(ang) * (60 + Math.random() * 120);
      p.r = 1.4 + Math.random() * 2.6;
      p.c = P.pollen;
      p.a = 1;
      p.life = 0.5;
      p.max = 0.5;
      p.g = 120;
    }
  }

  burst() {
    for (let i = 0; i < 26; i++) {
      const p = this.accendi();
      if (!p) return;
      const ang = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 260;
      p.x = this.sim.beeX;
      p.y = this.sim.bee.y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp - 60;
      p.r = 1.5 + Math.random() * 4;
      p.c = Math.random() > 0.4 ? P.beeBody : 'rgba(255,255,255,0.9)';
      p.a = 1;
      p.life = 0.7 + Math.random() * 0.4;
      p.max = 1.1;
      p.g = 700;
    }
  }

  // Un solo passo di frame reale: fisica a passo fisso, grafica interpolata.
  update(dtReal) {
    const dt = Math.min(dtReal, MAX_FRAME);
    this.time += dt;
    this.shake *= Math.pow(0.0015, dt);
    this.flash *= Math.pow(0.002, dt);
    this.scorePop *= Math.pow(0.0001, dt);

    const scrollSpeed =
      this.phase === 'playing' ? K.speedRitmo(this.sim.score)
      : this.phase === 'dying' || this.phase === 'over' ? 0
      : K.SPEED_START * 0.45;
    this.scrollX += scrollSpeed * dt;

    // battito d'ali: veloce in volo, lento a terra
    const wingRate = this.phase === 'over' ? 0 : this.phase === 'playing' ? 58 : 34;
    this.wingPhase += wingRate * dt;

    if (this.phase === 'playing') {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= K.DT && guard++ < 600) {
        this.acc -= K.DT;
        const ev = this.sim.step();
        if (ev.flapped) {
          this.puff();
          sfxFlap();
        }
        if (ev.scored) {
          this.scorePop = 1;
          this.sparkle(this.sim.score);
          sfxScore(this.sim.score - 1);
          if (this.onScore) this.onScore(this.sim.score);
        }
        if (ev.dead) {
          this.die();
          break;
        }
      }
    } else if (this.phase === 'ready') {
      // l'ape aleggia in attesa
      this.sim.bee.y = K.WORLD_H * 0.42 + Math.sin(this.time * 2.6) * 12;
      this.sim.bee.vy = Math.cos(this.time * 2.6) * 30;
    } else if (this.phase === 'menu') {
      this.sim.bee.y = K.WORLD_H * 0.46 + Math.sin(this.time * 2.2) * 16;
      this.sim.bee.vy = Math.cos(this.time * 2.2) * 34;
    } else if (this.phase === 'dying') {
      if (this.freeze > 0) {
        // Fermo immagine sul punto d'impatto. Mezzo secondo in cui l'ape resta
        // dov'e' morta: chi capisce perche' e' morto riprova, chi non lo capisce
        // da' la colpa al gioco.
        this.freeze -= dt;
      } else {
        // caduta finale, indipendente dalla simulazione (che è già conclusa)
        this.deathVy = Math.min(1100, this.deathVy + 2400 * dt);
        this.sim.bee.y += this.deathVy * dt;
        if (this.sim.bee.y >= K.WORLD_H - K.GROUND_H - K.BEE_R) this.atterra();
      }
    }

    // inclinazione dell'ape guidata dalla velocità verticale
    const targetRot =
      this.phase === 'dying' || this.phase === 'over' ? 1.35
      : Math.max(-0.42, Math.min(0.95, this.sim.bee.vy / 780));
    const k = 1 - Math.pow(0.0009, dt);
    this.beeRot += (targetRot - this.beeRot) * k;

    // particelle: scambio con l'ultima viva invece di splice
    for (let i = this.particelleVive - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particelleVive--;
        this.particles[i] = this.particles[this.particelleVive];
        this.particles[this.particelleVive] = p;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  die() {
    this.phase = 'dying';
    this.deathVy = -220; // piccolo rimbalzo, come nei giochi arcade
    this.freeze = 0.32;
    this.shake = 14;
    this.flash = 0.55;
    this.burst();
    sfxHit();
    vibra(24);
  }

  // Fine della morte: chiamata sia dalla caduta arrivata a terra sia dal tocco
  // che la salta. Sta in un posto solo perche' deve annunciare la fine partita
  // esattamente una volta.
  atterra() {
    if (this.phase !== 'dying') return;
    this.sim.bee.y = K.WORLD_H - K.GROUND_H - K.BEE_R;
    this.phase = 'over';
    this.freeze = 0;
    this.shake = 7;
    sfxFall();
    if (this.onGameOver) this.onGameOver(this.result());
  }

  result() {
    return {
      score: this.sim.score,
      durationMs: Math.round(this.sim.time * 1000),
      flaps: this.sim.flaps,
      seed: this.sim.seed,
      inputLog: this.sim.inputLog,
    };
  }
}
