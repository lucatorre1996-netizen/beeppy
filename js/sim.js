import { makeRng } from './rng.js';
import * as K from './constants.js';

// Simulazione pura e deterministica: nessun accesso al DOM, nessun Math.random.
// A parità di (seed, worldW, sequenza di tap) l'esito è sempre identico:
// questo permetterà in futuro di validare i punteggi rigiocando la partita
// lato server.
export class Sim {
  constructor(seed, worldW) {
    this.seed = seed >>> 0;
    this.worldW = worldW;
    this.rng = makeRng(this.seed);

    this.beeX = worldW * K.BEE_X_RATIO;
    this.bee = { y: K.WORLD_H * 0.42, vy: 0 };
    this.trunks = [];
    this.nextTrunkX = worldW + 140;

    this.score = 0;
    this.alive = true;
    this.tick = 0;
    this.flaps = 0;
    this.flapCooldown = 0;
    this.inputLog = []; // tick di ogni tap valido -> replay
    this.pendingFlap = false;

    this.floorY = K.WORLD_H - K.GROUND_H;
    this.spawnUntil(worldW + K.SPACING * 3);
  }

  get time() {
    return this.tick * K.DT;
  }

  flap() {
    this.pendingFlap = true;
  }

  spawnUntil(x) {
    while (this.nextTrunkX < x) {
      const gap = K.gapForScore(this.trunks.length);
      const min = K.GAP_MARGIN_TOP + gap / 2;
      const max = this.floorY - K.GAP_MARGIN_BOTTOM - gap / 2;
      const gapY = min + this.rng() * (max - min);
      this.trunks.push({
        x: this.nextTrunkX,
        gapY,
        gap,
        scored: false,
        // varianti estetiche stabili per tronco (nodi, muschio, anelli)
        knot: this.rng(),
        moss: this.rng(),
        rings: 4 + Math.floor(this.rng() * 4),
        hue: this.rng(),
      });
      this.nextTrunkX += K.SPACING;
    }
  }

  step() {
    const ev = { scored: 0, dead: false, flapped: false };
    if (!this.alive) return ev;

    this.tick++;
    this.flapCooldown = Math.max(0, this.flapCooldown - K.DT);

    if (this.pendingFlap) {
      this.pendingFlap = false;
      if (this.flapCooldown === 0) {
        this.bee.vy = K.FLAP_V;
        this.flapCooldown = K.FLAP_COOLDOWN;
        this.flaps++;
        this.inputLog.push(this.tick);
        ev.flapped = true;
      }
    }

    this.bee.vy = Math.min(K.MAX_FALL, this.bee.vy + K.GRAVITY * K.DT);
    this.bee.y += this.bee.vy * K.DT;

    // il soffitto blocca ma non uccide
    if (this.bee.y - K.BEE_R < 0) {
      this.bee.y = K.BEE_R;
      if (this.bee.vy < 0) this.bee.vy = 0;
    }

    const speed = K.speedForScore(this.score);
    const dx = speed * K.DT;
    for (const t of this.trunks) t.x -= dx;
    this.nextTrunkX -= dx;
    this.spawnUntil(this.worldW + K.SPACING * 2);
    while (this.trunks.length && this.trunks[0].x < -K.TRUNK_W - 40) this.trunks.shift();

    for (const t of this.trunks) {
      if (!t.scored && t.x + K.TRUNK_W < this.beeX) {
        t.scored = true;
        this.score++;
        ev.scored++;
      }
      if (this.hitsTrunk(t)) {
        this.alive = false;
        ev.dead = true;
        return ev;
      }
    }

    if (this.bee.y + K.BEE_R >= this.floorY) {
      this.bee.y = this.floorY - K.BEE_R;
      this.alive = false;
      ev.dead = true;
    }
    return ev;
  }

  hitsTrunk(t) {
    if (this.beeX + K.BEE_R < t.x || this.beeX - K.BEE_R > t.x + K.TRUNK_W) return false;
    const top = t.gapY - t.gap / 2;
    const bottom = t.gapY + t.gap / 2;
    return circleRect(this.beeX, this.bee.y, K.BEE_R, t.x, 0, K.TRUNK_W, top) ||
           circleRect(this.beeX, this.bee.y, K.BEE_R, t.x, bottom, K.TRUNK_W, this.floorY - bottom);
  }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
