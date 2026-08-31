// Audio interamente sintetizzato con la WebAudio API: nessun file da scaricare,
// nessun ritardo al primo suono, e il gioco resta un pacchetto minuscolo.
let ctx = null;
let master = null;
let enabled = true;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
}

// iOS sblocca l'audio solo dentro un gesto dell'utente
export function unlockAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  enabled = !m;
  if (master) master.gain.value = m ? 0 : 0.32;
}

export function isMuted() {
  return !enabled;
}

function env(node, t, a, d, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  node.connect(g);
  g.connect(master);
  return g;
}

function noiseBuffer() {
  if (ctx._noise) return ctx._noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ctx._noise = b;
  return b;
}

export function sfxFlap() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  // colpo d'ala: sweep breve verso il basso + soffio d'aria
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.09);
  env(o, t, 0.008, 0.09, 0.5);
  o.start(t);
  o.stop(t + 0.12);

  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 0.9;
  n.connect(f);
  env(f, t, 0.006, 0.07, 0.18);
  n.start(t);
  n.stop(t + 0.1);
}

export function sfxScore(n = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  // scaletta pentatonica: più punti di fila, nota più alta
  const steps = [0, 2, 4, 7, 9, 12];
  const semi = steps[Math.min(steps.length - 1, n % 6)];
  const base = 660 * Math.pow(2, semi / 12);
  [0, 0.07].forEach((off, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * (i ? 1.5 : 1);
    env(o, t + off, 0.006, 0.14, i ? 0.28 : 0.42);
    o.start(t + off);
    o.stop(t + off + 0.2);
  });
}

export function sfxHit() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(200, t + 0.3);
  n.connect(f);
  env(f, t, 0.004, 0.32, 0.9);
  n.start(t);
  n.stop(t + 0.4);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.28);
  env(o, t, 0.005, 0.3, 0.4);
  o.start(t);
  o.stop(t + 0.35);
}

export function sfxFall() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(500, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
  env(o, t, 0.01, 0.5, 0.3);
  o.start(t);
  o.stop(t + 0.6);
}

export function sfxRecord() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((semi, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 523.25 * Math.pow(2, semi / 12);
    env(o, t + i * 0.1, 0.01, 0.3, 0.35);
    o.start(t + i * 0.1);
    o.stop(t + i * 0.1 + 0.45);
  });
}
