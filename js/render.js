import * as K from './constants.js';
import { P } from './palette.js';

// Risoluzione dei livelli pre-cotti: 2x le unità di mondo, così restano
// nitidi anche su schermi retina senza ridisegnarli a ogni frame.
const RES = 2;
const TILE_W = 600; // larghezza dei tile di sfondo (ripetibili senza cuciture)

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES);
  c.height = Math.ceil(h * RES);
  const x = c.getContext('2d');
  x.scale(RES, RES);
  return { c, x, w, h };
}

function rnd(seedRef) {
  seedRef.s = (seedRef.s * 1664525 + 1013904223) >>> 0;
  return seedRef.s / 4294967296;
}

// ---------------------------------------------------------------- sfondo

function bakeHills(h, color, amp, seed) {
  const t = mk(TILE_W, h);
  const g = t.x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, -0.18));
  t.x.fillStyle = g;
  t.x.beginPath();
  t.x.moveTo(0, h);
  for (let x = 0; x <= TILE_W; x += 4) {
    const k = (x / TILE_W) * Math.PI * 2;
    const y = h * 0.45 + Math.sin(k + seed) * amp + Math.sin(k * 2 + seed * 2) * amp * 0.45 +
              Math.sin(k * 3 + seed * 3) * amp * 0.2;
    t.x.lineTo(x, y);
  }
  t.x.lineTo(TILE_W, h);
  t.x.closePath();
  t.x.fill();
  return t;
}

function bakeForest(h, seed) {
  const t = mk(TILE_W, h);
  const s = { s: seed >>> 0 };
  const trees = [];
  const step = 26;
  for (let x = -step; x < TILE_W + step; x += step) {
    trees.push({ x: x + rnd(s) * step * 0.7, hh: h * (0.45 + rnd(s) * 0.5), w: 16 + rnd(s) * 14, dark: rnd(s) > 0.5 });
  }
  for (const tr of trees) {
    t.x.fillStyle = tr.dark ? P.forestDark : P.forest;
    // conifera: tre falde sovrapposte
    for (let i = 0; i < 3; i++) {
      const top = h - tr.hh + (tr.hh * 0.26) * i;
      const half = (tr.w / 2) * (0.62 + i * 0.19);
      t.x.beginPath();
      t.x.moveTo(tr.x, top);
      t.x.lineTo(tr.x + half, top + tr.hh * 0.44);
      t.x.lineTo(tr.x - half, top + tr.hh * 0.44);
      t.x.closePath();
      t.x.fill();
    }
  }
  // base compatta che chiude la fila
  const g = t.x.createLinearGradient(0, h - 26, 0, h);
  g.addColorStop(0, 'rgba(47,115,83,0)');
  g.addColorStop(1, P.forestDark);
  t.x.fillStyle = g;
  t.x.fillRect(0, h - 26, TILE_W, 26);
  return t;
}

function bakeGround() {
  const h = K.GROUND_H;
  const t = mk(TILE_W, h);
  const s = { s: 20240607 };
  const g = t.x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, P.dirtTop);
  g.addColorStop(1, P.dirtBottom);
  t.x.fillStyle = g;
  t.x.fillRect(0, 0, TILE_W, h);

  // sassolini nella terra
  for (let i = 0; i < 90; i++) {
    const x = rnd(s) * TILE_W;
    const y = 18 + rnd(s) * (h - 22);
    t.x.fillStyle = `rgba(0,0,0,${0.06 + rnd(s) * 0.12})`;
    t.x.beginPath();
    t.x.ellipse(x, y, 1.5 + rnd(s) * 3.5, 1 + rnd(s) * 2, rnd(s) * 3, 0, 7);
    t.x.fill();
  }
  // fascia d'erba
  t.x.fillStyle = P.grassDark;
  t.x.fillRect(0, 0, TILE_W, 14);
  t.x.fillStyle = P.grass;
  t.x.fillRect(0, 0, TILE_W, 8);
  // fili d'erba
  for (let i = 0; i < 220; i++) {
    const x = rnd(s) * TILE_W;
    const hh = 6 + rnd(s) * 16;
    const lean = (rnd(s) - 0.5) * 9;
    t.x.strokeStyle = rnd(s) > 0.55 ? P.grassLight : P.grass;
    t.x.lineWidth = 1 + rnd(s) * 1.4;
    t.x.lineCap = 'round';
    t.x.beginPath();
    t.x.moveTo(x, 9);
    t.x.quadraticCurveTo(x + lean * 0.4, 9 - hh * 0.6, x + lean, 9 - hh);
    t.x.stroke();
  }
  return t;
}

// ---------------------------------------------------------------- tronchi

function bakeBark(seed) {
  const w = K.TRUNK_W;
  const h = K.WORLD_H;
  const t = mk(w, h);
  const s = { s: seed >>> 0 };

  // cilindro: chiaro a sinistra, scuro a destra
  const g = t.x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, P.barkDark);
  g.addColorStop(0.16, P.bark);
  g.addColorStop(0.4, P.barkLight);
  g.addColorStop(0.72, P.bark);
  g.addColorStop(1, P.barkEdge);
  t.x.fillStyle = g;
  t.x.fillRect(0, 0, w, h);

  // scanalature verticali della corteccia
  for (let i = 0; i < 46; i++) {
    const x = rnd(s) * w;
    const wid = 1 + rnd(s) * 5;
    const dark = rnd(s) > 0.45;
    t.x.strokeStyle = dark ? `rgba(52,32,14,${0.10 + rnd(s) * 0.26})`
                           : `rgba(226,180,124,${0.06 + rnd(s) * 0.16})`;
    t.x.lineWidth = wid;
    t.x.beginPath();
    let y = -20;
    let cx = x;
    t.x.moveTo(cx, y);
    while (y < h + 20) {
      y += 40 + rnd(s) * 70;
      cx += (rnd(s) - 0.5) * 7;
      t.x.lineTo(cx, y);
    }
    t.x.stroke();
  }
  // nodi del legno
  for (let i = 0; i < 5; i++) {
    const x = 12 + rnd(s) * (w - 24);
    const y = rnd(s) * h;
    const r = 5 + rnd(s) * 7;
    t.x.fillStyle = 'rgba(46,28,12,0.55)';
    t.x.beginPath();
    t.x.ellipse(x, y, r, r * 1.5, 0, 0, 7);
    t.x.fill();
    t.x.fillStyle = 'rgba(140,92,48,0.7)';
    t.x.beginPath();
    t.x.ellipse(x, y, r * 0.5, r * 0.85, 0, 0, 7);
    t.x.fill();
  }
  // bordi netti
  t.x.fillStyle = 'rgba(30,18,8,0.5)';
  t.x.fillRect(0, 0, 2, h);
  t.x.fillRect(w - 3, 0, 3, h);
  return t;
}

// Estremità tagliata del tronco: ellisse con anelli di crescita.
function drawCutEnd(ctx, cx, cy, w, rings, seedish, facingUp) {
  const rx = w / 2;
  const ry = w * 0.17;

  ctx.save();
  ctx.fillStyle = P.barkEdge;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 7);
  ctx.fill();

  const g = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
  g.addColorStop(0, P.woodDark);
  g.addColorStop(0.45, P.wood);
  g.addColorStop(1, P.woodDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 1.6, 0, 0, 7);
  ctx.fill();

  // anelli concentrici, centro leggermente decentrato
  const ox = (seedish - 0.5) * rx * 0.35;
  ctx.strokeStyle = P.woodRing;
  ctx.lineWidth = 1.1;
  for (let i = 1; i <= rings; i++) {
    const k = i / (rings + 0.6);
    ctx.globalAlpha = 0.75 - k * 0.35;
    ctx.beginPath();
    ctx.ellipse(cx + ox * (1 - k), cy, (rx - 4) * k, (ry - 2) * k, 0, 0, 7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // spacco radiale, tipico del legno tagliato
  ctx.strokeStyle = 'rgba(90,55,25,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx + ox, cy);
  ctx.lineTo(cx + ox + (rx - 5) * (seedish > 0.5 ? 1 : -1) * 0.9, cy + (ry - 3) * (seedish - 0.5));
  ctx.stroke();

  // luce sul labbro superiore
  ctx.strokeStyle = facingUp ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 1.5, ry - 0.8, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMoss(ctx, x, y, w, seedish) {
  const s = { s: (seedish * 4294967295) >>> 0 };
  ctx.save();
  ctx.fillStyle = P.moss;
  for (let i = 0; i < 9; i++) {
    const px = x + 4 + rnd(s) * (w - 8);
    const py = y + rnd(s) * 10;
    const r = 3 + rnd(s) * 6;
    ctx.globalAlpha = 0.55 + rnd(s) * 0.4;
    ctx.fillStyle = rnd(s) > 0.5 ? P.moss : P.mossDark;
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.62, 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- ape

export function drawBee(ctx, x, y, rot, wingPhase, sc = 1.12) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sc, sc);

  // ali: due, incernierate sulla spalla, che sbattono attorno alla posizione
  // di riposo (piegate indietro sopra il dorso)
  const flap = Math.sin(wingPhase);
  for (const pair of [1, 0]) {
    const rest = pair ? -1.15 : -0.62;           // la posteriore più inclinata
    const ang = rest + flap * (pair ? 0.34 : 0.46);
    ctx.save();
    ctx.translate(-1 - pair * 7, -8);
    ctx.rotate(ang);
    ctx.fillStyle = P.wing;
    ctx.strokeStyle = P.wingEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -14, 6.8 - pair * 1.2, 16 - pair * 3.5, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    // nervatura
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -26 + pair * 5);
    ctx.stroke();
    ctx.restore();
  }

  // corpo
  const bodyG = ctx.createLinearGradient(0, -13, 0, 14);
  bodyG.addColorStop(0, '#ffd772');
  bodyG.addColorStop(0.5, P.beeBody);
  bodyG.addColorStop(1, P.beeBodyDark);
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 21, 15.5, 0, 0, 7);
  ctx.fill();
  // contorno: senza questo l'ape si perde sul cielo chiaro
  ctx.strokeStyle = 'rgba(38,26,14,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // strisce, ritagliate sulla sagoma del corpo
  ctx.save();
  ctx.clip();
  ctx.fillStyle = P.beeStripe;
  for (const sx of [-13, -4, 5]) {
    ctx.beginPath();
    ctx.moveTo(sx, -18);
    ctx.lineTo(sx + 6.5, -18);
    ctx.lineTo(sx + 3, 18);
    ctx.lineTo(sx - 3.5, 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // pungiglione
  ctx.fillStyle = P.beeStripe;
  ctx.beginPath();
  ctx.moveTo(-20, -3);
  ctx.lineTo(-30, 0.5);
  ctx.lineTo(-20, 4);
  ctx.closePath();
  ctx.fill();

  // testa
  ctx.fillStyle = P.beeHead;
  ctx.beginPath();
  ctx.ellipse(15, -1, 11, 11.5, 0, 0, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,26,14,0.8)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // antenne
  ctx.strokeStyle = P.beeHead;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (const s of [-1, -0.35]) {
    ctx.beginPath();
    ctx.moveTo(17, -8);
    ctx.quadraticCurveTo(24, -16 + s * 3, 27 + s * 2, -19 + s * 4);
    ctx.stroke();
  }
  ctx.fillStyle = P.beeHead;
  ctx.beginPath();
  ctx.arc(25, -15, 2.1, 0, 7);
  ctx.arc(26.4, -21, 2.1, 0, 7);
  ctx.fill();

  // occhio
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(19, -3, 4.4, 5.2, 0.2, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#20180f';
  ctx.beginPath();
  ctx.ellipse(20.4, -2.4, 2.2, 2.8, 0.2, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(21.4, -4, 0.9, 0, 7);
  ctx.fill();

  // luce sul dorso
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-3, -9, 12, 4.2, -0.12, 0, 7);
  ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------- utili

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function tileX(img, ctx, offset, y, w, h, bleedL, bleedR) {
  let x = -((offset % TILE_W) + TILE_W) % TILE_W - bleedL - TILE_W;
  const end = w + bleedR;
  while (x < end) {
    ctx.drawImage(img, x, y, TILE_W, h);
    x += TILE_W;
  }
}

// ---------------------------------------------------------------- renderer

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.baked = {
      hillsFar: bakeHills(220, P.hillsFar, 22, 1.1),
      hillsMid: bakeHills(180, P.hillsMid, 30, 3.4),
      forest: bakeForest(150, 987654321),
      ground: bakeGround(),
      bark: [bakeBark(11111), bakeBark(2468013), bakeBark(777777)],
    };
    this.view = { cssW: 1, cssH: 1, dpr: 1, scale: 1, worldW: 400, bleed: 0 };
    this.resize();
  }

  resize() {
    // durante rotazioni e cambi di viewport le dimensioni possono valere 0 per
    // un istante: senza questo minimo finiremmo per calcolare Infinity/NaN.
    const cssW = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1);
    const cssH = Math.max(1, this.canvas.clientHeight || window.innerHeight || 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    const scale = cssH / K.WORLD_H;
    const wanted = cssW / scale;
    const worldW = Math.max(K.WORLD_W_MIN, Math.min(K.WORLD_W_MAX, wanted));
    // se lo schermo è più largo del mondo, lo sfondo sborda per riempirlo
    const bleed = Math.min(400, Math.max(0, (wanted - worldW) / 2));
    this.view = { cssW, cssH, dpr, scale, worldW, bleed };
    this._sky = null;  // i gradienti dipendono dalle dimensioni: vanno rifatti
    this._vig = null;
    return this.view;
  }

  draw(g) {
    const { ctx } = this;
    const v = this.view;
    const k = v.scale * v.dpr;
    ctx.setTransform(k, 0, 0, k, (v.bleed + 0) * k, 0);

    const W = v.worldW;
    const H = K.WORLD_H;
    const floorY = H - K.GROUND_H;
    const shake = g.shake;
    if (shake > 0.01) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    this.drawSky(ctx, W, H, v.bleed);
    this.drawParallax(ctx, g, W, floorY, v.bleed);
    this.drawPollen(ctx, g, W, H, 0.45, 0.55);

    // Lo sfondo sborda oltre il mondo per riempire schermi larghi, ma il gioco
    // no: senza questo ritaglio si vedrebbero i tronchi comparire dal nulla
    // appena fuori dall'area di gioco.
    const clipGame = () => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -20, W, H + 40);
      ctx.clip();
    };

    clipGame();
    for (const t of g.sim.trunks) this.drawTrunk(ctx, t, floorY);
    ctx.restore();

    this.drawGround(ctx, g, W, floorY, v.bleed);

    clipGame();
    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (g.beeVisible) {
      drawBee(ctx, g.sim.beeX, g.sim.bee.y, g.beeRot, g.wingPhase);
    }
    ctx.restore();

    this.drawPollen(ctx, g, W, H, 1.6, 1.15);
    this.drawVignette(ctx, W, H, v.bleed);

    if (g.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${g.flash})`;
      ctx.fillRect(-v.bleed - 4, -4, W + v.bleed * 2 + 8, H + 8);
    }
    if (g.phase === 'playing' || g.phase === 'dying' || g.phase === 'over') {
      this.drawScore(ctx, g, W);
    }
  }

  drawSky(ctx, W, H, bleed) {
    let g = this._sky;
    if (!g) {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P.skyTop);
      g.addColorStop(0.52, P.skyMid);
      g.addColorStop(0.92, P.skyHaze);
      this._sky = g;
    }
    ctx.fillStyle = g;
    ctx.fillRect(-bleed - 2, -2, W + bleed * 2 + 4, H + 4);

    // sole con alone
    const sx = W * 0.78, sy = H * 0.13;
    const rg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 150);
    rg.addColorStop(0, P.sun);
    rg.addColorStop(0.18, P.sunGlow);
    rg.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sx, sy, 150, 0, 7);
    ctx.fill();
  }

  drawParallax(ctx, g, W, floorY, bleed) {
    const b = this.baked;
    tileX(b.hillsFar.c, ctx, g.scrollX * 0.05, floorY - 210, W, 220, bleed, bleed);
    tileX(b.hillsMid.c, ctx, g.scrollX * 0.11, floorY - 155, W, 180, bleed, bleed);
    tileX(b.forest.c, ctx, g.scrollX * 0.26, floorY - 132, W, 150, bleed, bleed);
  }

  drawGround(ctx, g, W, floorY, bleed) {
    tileX(this.baked.ground.c, ctx, g.scrollX, floorY, W, K.GROUND_H + 8, bleed, bleed);
  }

  drawPollen(ctx, g, W, H, sizeMul, speedMul) {
    ctx.save();
    for (const p of g.pollen) {
      const x = ((p.x - g.scrollX * 0.08 * speedMul) % (W + 80) + W + 80) % (W + 80) - 40;
      const y = p.y + Math.sin(g.time * p.w + p.ph) * 14;
      ctx.globalAlpha = p.a * (sizeMul > 1 ? 0.5 : 0.75);
      ctx.fillStyle = P.pollen;
      ctx.beginPath();
      ctx.arc(x, y, p.r * sizeMul, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTrunk(ctx, t, floorY) {
    const bark = this.baked.bark[Math.floor(t.hue * 3) % 3];
    const w = K.TRUNK_W;
    const top = t.gapY - t.gap / 2;
    const bot = t.gapY + t.gap / 2;

    // tronco superiore: uso la parte bassa della texture, il taglio è in basso
    if (top > 0) {
      const sh = Math.min(K.WORLD_H, top);
      ctx.drawImage(bark.c, 0, (K.WORLD_H - sh) * RES, w * RES, sh * RES, t.x, top - sh, w, sh);
      drawCutEnd(ctx, t.x + w / 2, top, w, t.rings, t.knot, false);
    }
    // tronco inferiore
    if (bot < floorY) {
      const sh = Math.min(K.WORLD_H, floorY - bot);
      ctx.drawImage(bark.c, 0, 0, w * RES, sh * RES, t.x, bot, w, sh);
      drawCutEnd(ctx, t.x + w / 2, bot, w, t.rings, t.moss, true);
      if (t.moss > 0.35) drawMoss(ctx, t.x, bot + w * 0.13, w, t.moss);
    }
  }

  drawVignette(ctx, W, H, bleed) {
    let g = this._vig;
    if (!g) {
      g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(24,14,40,0.28)');
      this._vig = g;
    }
    ctx.fillStyle = g;
    ctx.fillRect(-bleed - 2, -2, W + bleed * 2 + 4, H + 4);
  }

  drawScore(ctx, g, W) {
    const s = String(g.sim.score);
    const pop = 1 + g.scorePop * 0.35;
    ctx.save();
    ctx.translate(W / 2, 92);
    ctx.scale(pop, pop);
    ctx.font = '700 62px "Baloo 2", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(43,33,24,0.55)';
    ctx.lineJoin = 'round';
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = '#fffdf3';
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
}
