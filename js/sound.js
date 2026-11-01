// Suoni e musica: tutto sintetizzato al volo con Web Audio (nessun file da scaricare).
// - gli effetti partono dagli eventi del registro, quindi tutti sentono ciò che fanno gli altri;
// - la musica cambia con il luogo: mondo, paese, dungeon (per ambientazione), combattimento, boss.
import { ask } from './ui.js';
import { isFumbleText } from './flavor.js';

const LS = 'dnd.sound';
const LEVELS = [['off', 'Spenta', 0], ['basso', 'Bassa', 0.25], ['medio', 'Media', 0.5], ['alto', 'Alta', 0.85]];
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
export const settings = { music: saved.music ?? 0.4, sfx: saved.sfx ?? 0.7 };
const persist = () => { try { localStorage.setItem(LS, JSON.stringify(settings)); } catch { /* niente */ } };

let ctx = null, master, musicBus, sfxBus;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- base ---------- */
function build(c) {
  ctx = c;
  master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.music * 0.8; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx; sfxBus.connect(master);
  // un po' di riverbero per la musica
  const len = Math.floor(ctx.sampleRate * 2.4); const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.38; musicBus.connect(conv); conv.connect(wet); wet.connect(master);
  return ctx;
}
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  return build(new AC());
}
let noiseBuf = null;
const noiseBuffer = () => noiseBuf ||= (() => { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();

/** Nota con inviluppo. { t, f, f2, type, dur, vol, a, dest, lp, vib } */
function tone(o) {
  const t0 = o.t ?? ctx.currentTime; const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const a = Math.min(o.a ?? 0.005, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol ?? 0.25, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let out = osc;
  if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + o.dur + 0.05); }
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; out.connect(f); out = f; }
  out.connect(g); g.connect(o.dest || sfxBus); osc.start(t0); osc.stop(t0 + o.dur + 0.05);
}
/** Rumore filtrato. { t, dur, vol, type, f, f2, q, dest } */
function noise(o) {
  const t0 = o.t ?? ctx.currentTime; const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1; f.frequency.setValueAtTime(o.f, t0);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
  const g = ctx.createGain(); const a = Math.min(o.a ?? 0.003, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f); f.connect(g); g.connect(o.dest || sfxBus); src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
}

/* ---------- percussioni (condivise da effetti e musica) ---------- */
const kick = (t, d, v = 0.55) => { tone({ t, f: 150, f2: 42, dur: 0.18, vol: v, dest: d }); noise({ t, dur: 0.03, vol: v * 0.3, type: 'lowpass', f: 900, dest: d }); };
const snare = (t, d, v = 0.3) => { noise({ t, dur: 0.16, vol: v, type: 'bandpass', f: 1900, q: 0.8, dest: d }); tone({ t, f: 200, f2: 120, dur: 0.1, vol: v * 0.6, type: 'triangle', dest: d }); };
const hat = (t, d, v = 0.07) => noise({ t, dur: 0.04, vol: v, type: 'highpass', f: 7500, dest: d });
const tom = (t, d, f = 190, v = 0.4) => tone({ t, f, f2: f * 0.45, dur: 0.22, vol: v, dest: d });

/* ---------- effetti sonori ---------- */
const SFX = {
  dice(t) { for (let i = 0; i < 11; i++) { const k = t + i * 0.055 + rand(0, 0.02); noise({ t: k, dur: 0.035, vol: 0.7 * (1 - i / 14), type: 'bandpass', f: rand(1800, 4200), q: 3 }); } },
  land(t) { tone({ t, f: 190, f2: 85, dur: 0.1, vol: 0.35, type: 'triangle' }); noise({ t, dur: 0.05, vol: 0.2, type: 'bandpass', f: 2600, q: 2 }); },
  step(t) { noise({ t, dur: 0.08, vol: 0.9, type: 'lowpass', f: 900, f2: 300 }); },
  hit(t) { tone({ t, f: 160, f2: 48, dur: 0.2, vol: 0.55 }); noise({ t, dur: 0.13, vol: 0.35, type: 'lowpass', f: 1600, f2: 260 }); noise({ t, dur: 0.07, vol: 0.18, type: 'highpass', f: 3500 }); },
  miss(t) { noise({ t, dur: 0.3, vol: 0.7, type: 'bandpass', f: 500, f2: 2600, q: 1.4, a: 0.08 }); },
  crit(t) { SFX.hit(t); [72, 76, 79, 84].forEach((n, i) => tone({ t: t + 0.12 + i * 0.07, f: midi(n), dur: 0.5, vol: 0.2, type: 'triangle' })); tone({ t: t + 0.4, f: midi(88), dur: 0.9, vol: 0.12, type: 'sine' }); },
  fumble(t) { [[392, 0], [370, 0.28], [330, 0.56], [262, 0.84]].forEach(([f, d], i) => tone({ t: t + d, f, f2: f * (i === 3 ? 0.8 : 0.97), dur: i === 3 ? 0.7 : 0.3, vol: 0.24, type: 'sawtooth', lp: 900, vib: [6, 6] })); },
  spell(t) { tone({ t, f: 420, f2: 1900, dur: 0.5, vol: 0.18, type: 'sine' }); noise({ t, dur: 0.55, vol: 0.12, type: 'highpass', f: 5000, a: 0.15 }); [88, 91, 95].forEach((n, i) => tone({ t: t + 0.18 + i * 0.07, f: midi(n), dur: 0.35, vol: 0.07 })); },
  heal(t) { [76, 80, 83, 88].forEach((n, i) => tone({ t: t + i * 0.09, f: midi(n), dur: 0.9, vol: 0.16, type: 'sine' })); tone({ t, f: 440, f2: 880, dur: 0.4, vol: 0.06, type: 'triangle' }); },
  death(t) { tone({ t, f: 230, f2: 55, dur: 0.7, vol: 0.4, type: 'sawtooth', lp: 700 }); noise({ t, dur: 0.5, vol: 0.2, type: 'lowpass', f: 900, f2: 120 }); },
  coin(t) { [[88, 0], [93, 0.09], [100, 0.2]].forEach(([n, d]) => tone({ t: t + d, f: midi(n), dur: 0.35, vol: 0.14, type: 'square', lp: 5000 })); noise({ t: t + 0.04, dur: 0.18, vol: 0.06, type: 'highpass', f: 7000 }); },
  door(t) { tone({ t, f: 140, f2: 210, dur: 0.5, vol: 0.2, type: 'sawtooth', lp: 380, vib: [9, 14] }); noise({ t: t + 0.05, dur: 0.4, vol: 0.06, type: 'bandpass', f: 600, f2: 300 }); tone({ t: t + 0.52, f: 90, f2: 50, dur: 0.15, vol: 0.4 }); },
  bell(t) { [[1, 0.3], [2.4, 0.14], [3.7, 0.08]].forEach(([m, v]) => tone({ t, f: 660 * m, dur: 1.3 / Math.sqrt(m), vol: v })); },
  gong(t) { [[1, 0.35], [1.5, 0.2], [2.2, 0.14], [3.1, 0.08]].forEach(([m, v]) => tone({ t, f: 110 * m, dur: 2.6 / Math.sqrt(m), vol: v, a: 0.01 })); noise({ t, dur: 0.6, vol: 0.12, type: 'lowpass', f: 1500, f2: 200 }); },
  drums(t) { [0, 0.16, 0.32, 0.48].forEach((d, i) => tom(t + d, null, 170 - i * 18, 0.45)); kick(t + 0.64, undefined, 0.6); noise({ t: t + 0.64, dur: 0.6, vol: 0.1, type: 'highpass', f: 6000, a: 0.2 }); },
  ambush(t) { [110, 116.5, 164].forEach(f => tone({ t, f, f2: f * 1.04, dur: 1.1, vol: 0.14, type: 'sawtooth', lp: 1100, a: 0.25 })); kick(t + 0.45, undefined, 0.6); tom(t + 0.5, undefined, 110, 0.5); },
  fanfare(t) { [[60, 0], [64, 0.13], [67, 0.26], [72, 0.4]].forEach(([n, d]) => tone({ t: t + d, f: midi(n), dur: 0.45, vol: 0.2, type: 'triangle' })); [72, 76, 79, 84].forEach(n => tone({ t: t + 0.62, f: midi(n), dur: 1.4, vol: 0.1, type: 'triangle' })); },
  trap(t) { noise({ t, dur: 0.06, vol: 0.5, type: 'highpass', f: 2500 }); tone({ t, f: 1400, f2: 700, dur: 0.25, vol: 0.2, type: 'square', lp: 4000 }); tone({ t: t + 0.05, f: 120, f2: 55, dur: 0.2, vol: 0.4 }); },
  find(t) { [79, 86].forEach((n, i) => tone({ t: t + i * 0.12, f: midi(n), dur: 0.7, vol: 0.14, type: 'sine' })); },
  whoosh(t) { noise({ t, dur: 0.35, vol: 0.7, type: 'bandpass', f: 300, f2: 1800, q: 1.2, a: 0.1 }); },
  quest(t) { [67, 72, 76].forEach((n, i) => tone({ t: t + i * 0.11, f: midi(n), dur: 0.5, vol: 0.17, type: 'triangle' })); },
};

export function play(name, delay = 0) {
  if (!settings.sfx || !SFX[name]) return;
  const c = ensure(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { SFX[name](c.currentTime + 0.02 + delay); } catch { /* il suono non deve mai rompere il gioco */ }
}

/** Dal testo di una voce del registro, quali suoni far partire. */
export function sfxFromLog(text) {
  const out = [];
  const T = String(text);
  if (/→ CRITICO/.test(T)) out.push(['crit', 0]);
  else if (/→ colpito/.test(T)) out.push([/lancia/.test(T) ? 'spell' : 'hit', 0], ...(/lancia/.test(T) ? [['hit', 0.35]] : []));
  else if (/→ mancato/.test(T)) out.push([isFumbleText(T) ? 'fumble' : 'miss', 0]);
  else if (/usa il potere «/.test(T)) out.push([/PF recuperati|recupera \d+ PF/.test(T) ? 'heal' : 'spell', 0]);
  else if (/lancia .* su .*PF recuperati|usa «.*PF \(/.test(T)) out.push(['heal', 0]);
  else if (/lancia .*\(CD \d+\)/.test(T)) out.push(['spell', 0]);
  else if (/fa scattare «/.test(T) || /è (avvelenato|in fiamme|congelato|spaventato|stordito|maledetto)!/.test(T)) out.push(['trap', 0]);
  else if (/Incarico compiuto|sale al livello|impara una magia|si unisce al gruppo|Dungeon ripulito|si è rimodellato/.test(T)) out.push(['fanfare', 0]);
  else if (/Ricompense in proporzione/.test(T)) out.push(['coin', 0]);
  else if (/Compaiono:|è un mimic|agguato|sbuca|sbarra il passo|alza la polvere|dietro una roccia|dalla palude|guadate/i.test(T)) out.push(['ambush', 0]);
  else if (/^Iniziativa:/.test(T)) out.push(['drums', 0]);
  else if (/^Inizia il round/.test(T)) out.push(['gong', 0]);
  else if (/^Tocca a /.test(T)) out.push(['bell', 0]);
  else if (/attraversa «/.test(T)) out.push(['door', 0]);
  else if (/apre «|compra |vende |Saccheggia/.test(T)) out.push(['coin', 0]);
  else if (/passa la notte|riposa all'oasi/.test(T)) out.push(['heal', 0]);
  else if (/avvista|individua una trappola|accetta un incarico|entra nell'oasi|raccoglie .* da «/.test(T)) out.push([/incarico/.test(T) ? 'quest' : 'find', 0]);
  else if (/scatta|si mette sulla difensiva|si disimpegna|aiuta /.test(T)) out.push(['whoosh', 0]);
  else if (/si allontana da .*attacco di opportunità/.test(T)) out.push(['whoosh', 0]);
  if (/è sconfitto/.test(T) && !/Ricompense/.test(T)) out.push(['death', 0.25]);
  return out;
}

let seen = null; const boot = Date.now();
/** Da chiamare a ogni aggiornamento del registro: suona solo le voci nuove (e non quelle già presenti all'apertura). */
export function onLog(list) {
  if (seen === null || Date.now() - boot < 4000) { seen = list.length; return; } // la storia già scritta non si suona
  const fresh = list.slice(seen); seen = list.length;
  fresh.filter(l => l.kind !== 'secret').slice(-3).forEach((l, i) => sfxFromLog(l.text).forEach(([n, d]) => play(n, d + i * 0.5)));
}

/* ---------- musica ---------- */
const bassNote = (t, f, dur, d, v = 0.14) => tone({ t, f, dur, vol: v, type: 'triangle', dest: d, a: 0.01 });
const pluck = (t, f, dur, d, v = 0.12) => { tone({ t, f, dur, vol: v, type: 'triangle', dest: d, lp: 2600 }); tone({ t, f: f * 2, dur: dur * 0.4, vol: v * 0.35, type: 'sine', dest: d }); };
function pad(notes, t, dur, d, v = 0.05, lp = 900) {
  for (const n of notes) for (const det of [-7, 7]) tone({ t, f: midi(n), dur: dur + 1.2, vol: v, type: 'sawtooth', detune: det, lp, a: dur * 0.35, dest: d });
}
const bellTone = (f, t, d, glass = false) => { tone({ t, f, dur: glass ? 2.8 : 2.2, vol: glass ? 0.08 : 0.1, type: glass ? 'triangle' : 'sine', dest: d, a: 0.004 }); tone({ t, f: f * (glass ? 3 : 2.01), dur: 1.2, vol: 0.035, dest: d }); };

const ENGINES = {
  /** Atmosfera: accordi lenti, campanelle rade, a volte un colpo cupo. */
  ambient(P, out) {
    let step = 0, ci = 0; const spb = 60 / P.bpm;
    return { out, next(t) {
      if (step % 8 === 0) { const ch = P.chords[ci++ % P.chords.length]; pad(ch.map(n => P.root + n), t, 8 * spb, out, P.padVol ?? 0.045, P.lp ?? 800); bassNote(t, midi(P.root + ch[0] - 12), 8 * spb, out, 0.1); }
      if (Math.random() < P.density) bellTone(midi(P.root + pick(P.scale) + pick(P.glass ? [24, 36] : [12, 24])), t + rand(0, spb * 0.8), out, P.glass);
      if (P.thud && step % 16 === 8 && Math.random() < 0.6) { tom(t, out, 80, 0.22); }
      if (P.birds && Math.random() < 0.18) { const f = rand(2400, 3600); tone({ t: t + rand(0, spb), f, f2: f * 1.35, dur: 0.12, vol: 0.05, dest: out, a: 0.01 }); tone({ t: t + rand(0.15, spb), f: f * 1.2, f2: f * 0.9, dur: 0.1, vol: 0.04, dest: out }); }
      step++; return t + spb; } };
  },
  /** Strumento a corde pizzicate in stile popolare: arpeggi su una progressione di accordi, con una melodia che ondeggia. */
  folk(P, out) {
    let step = 0, bar = 0, mel = 0; const eighth = 60 / P.bpm / 2;
    return { out, next(t) {
      const s = step % 8; const ch = P.chords[bar % P.chords.length];
      if (s === 0 || s === 4) bassNote(t, midi(P.root + ch[0] - 12), eighth * 3.5, out, 0.16);
      const arp = [0, 2, 1, 2, 0, 2, 1, 2][s]; pluck(t, midi(P.root + ch[arp % ch.length] + 12), eighth * 2.4, out, 0.1);
      if (s % 2 === 0 && Math.random() < P.melody) { mel = Math.max(0, Math.min(P.scale.length - 1, mel + pick([-2, -1, -1, 0, 1, 1, 2]))); const n = P.root + 24 + P.scale[mel]; tone({ t, f: midi(n), dur: eighth * 3, vol: 0.075, type: 'triangle', dest: out, a: 0.03, vib: [5.5, 3] }); }
      if (P.drum && (s === 0 || s === 4)) { tom(t, out, 120, 0.12); } if (P.drum && s % 2 === 1) hat(t, out, 0.03);
      step++; if (step % 8 === 0) bar++; return t + eighth; } };
  },
  /** Combattimento: percussioni, un basso incalzante e accordi minori. */
  battle(P, out) {
    let step = 0, bar = 0, mel = 0; const e = 60 / P.bpm / 2; const riff = P.boss ? [0, 0, 1, 0, 0, 3, 1, 0] : [0, 0, 12, 0, 0, 10, 0, 7];
    return { out, next(t) {
      const s = step % 8;
      if (s === 0 || s === 4 || (P.boss && s === 7)) kick(t, out, 0.4); if (s === 2 || s === 6) snare(t, out, 0.2); hat(t, out, 0.045);
      if (P.boss && s % 2 === 1) tom(t, out, 100 + (bar % 2) * 25, 0.18);
      tone({ t, f: midi(P.root + (P.boss ? riff[s] : riff[s])), dur: e * 0.9, vol: 0.16, type: 'sawtooth', lp: 520, dest: out, a: 0.004 });
      if (s === 0 || s === 3) pad([P.root + 12, P.root + 15 - (P.boss ? 2 : 0), P.root + 19], t, e * 1.4, out, 0.03, 1300);
      if (s === 0 && bar % 2 === 0) { for (let i = 0; i < 4; i++) { mel = Math.max(0, Math.min(P.scale.length - 1, mel + pick([-2, -1, 1, 2]))); tone({ t: t + i * e * 2, f: midi(P.root + 36 + P.scale[mel]), dur: e * 1.8, vol: 0.07, type: 'square', lp: 2200, dest: out, a: 0.01 }); } }
      step++; if (step % 8 === 0) bar++; return t + e; } };
  },
};

const MOODS = {
  viaggio: { engine: 'folk', root: 48, bpm: 74, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], melody: 0.55 },
  paese: { engine: 'folk', root: 50, bpm: 108, scale: [0, 2, 4, 5, 7, 9, 10], chords: [[0, 4, 7], [-2, 2, 5], [5, 9, 12], [0, 4, 7]], melody: 0.7, drum: true },
  dungeon: { engine: 'ambient', root: 45, bpm: 48, scale: [0, 3, 5, 7, 10], chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [-7, 0, 5, 8], [-5, 2, 7, 10]], density: 0.4, thud: true, lp: 650 },
  tempio: { engine: 'ambient', root: 50, bpm: 56, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12, 16], [5, 12, 17, 21], [9, 16, 21, 24], [7, 14, 19, 23]], density: 0.5, lp: 950 },
  ghiaccio: { engine: 'ambient', root: 57, bpm: 54, scale: [0, 2, 7, 9, 12, 14], chords: [[0, 7, 12, 14], [5, 12, 17, 19], [-3, 4, 9, 12]], density: 0.55, glass: true, lp: 1100, padVol: 0.035 },
  bosco: { engine: 'ambient', root: 52, bpm: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12, 16], [5, 12, 16, 21], [7, 14, 19, 23]], density: 0.35, birds: true, lp: 1000 },
  combattimento: { engine: 'battle', root: 38, bpm: 150, scale: [0, 2, 3, 5, 7, 8, 10] },
  boss: { engine: 'battle', root: 36, bpm: 164, scale: [0, 1, 3, 5, 7, 8, 10], boss: true },
};

/** Quale musica per questo momento? */
export function moodFor(store, room) {
  if (!room) return null; const st = store.campaign?.state || {};
  if ((st.init || []).length) return store.entities.some(e => e.room_id === room.id && e.kind === 'monster' && e.data.boss && !e.data.dead) ? 'boss' : 'combattimento';
  if (room.meta?.world) return 'viaggio'; if (room.meta?.town) return 'paese';
  return ({ foresta: 'bosco', ghiaccio: 'ghiaccio', tempio: 'tempio' })[room.meta?.theme] || 'dungeon';
}

let wanted = null, current = null, timer = null, nextT = 0, inst = null;
function fadeOut(node, secs = 1.4) { try { node.gain.cancelScheduledValues(ctx.currentTime); node.gain.setValueAtTime(node.gain.value, ctx.currentTime); node.gain.linearRampToValueAtTime(0, ctx.currentTime + secs); setTimeout(() => node.disconnect(), secs * 1000 + 300); } catch { /* niente */ } }
function stopMusic() { if (timer) clearInterval(timer); timer = null; if (inst) fadeOut(inst.out); inst = null; current = null; }
function startMusic() {
  if (!ctx || ctx.state !== 'running' || !wanted || !settings.music) return;
  if (current === wanted && timer) return;
  stopMusic();
  const P = MOODS[wanted]; const out = ctx.createGain(); out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2); out.connect(musicBus);
  inst = ENGINES[P.engine](P, out); current = wanted; nextT = ctx.currentTime + 0.15;
  timer = setInterval(() => { try { const horizon = ctx.currentTime + 0.7; let n = 0; while (nextT < horizon && n++ < 40) nextT = inst.next(nextT); } catch { /* niente */ } }, 150);
}
export function setMood(m) {
  wanted = m; if (!ctx) return; if (ctx.state === 'suspended') return; // parte al primo clic
  startMusic();
}

/* ---------- avvio al primo gesto dell'utente (regole dei browser) e controlli ---------- */
const unlock = () => { const c = ensure(); if (!c) return; c.resume().then(() => startMusic()).catch(() => {}); };
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { once: false, passive: true }));

export function applySettings() {
  persist(); if (!ctx) return;
  musicBus.gain.setTargetAtTime(settings.music * 0.8, ctx.currentTime, 0.1); sfxBus.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.1);
  if (!settings.music) stopMusic(); else startMusic();
}
const levelKey = v => (LEVELS.reduce((best, l) => (Math.abs(l[2] - v) < Math.abs(best[2] - v) ? l : best), LEVELS[2]))[0];

export async function soundDialog() {
  const opts = LEVELS.map(([v, l]) => ({ v, l }));
  const v = await ask({ title: 'Suoni', ok: 'Fatto', cancel: 'Chiudi', intro: 'Musica di sottofondo ed effetti sono generati dal browser: non scarica nulla. Cambia con il luogo (mondo, paese, dungeon) e col combattimento.',
    fields: [{ name: 'music', label: 'Musica', type: 'select', value: levelKey(settings.music), options: opts }, { name: 'sfx', label: 'Effetti sonori', type: 'select', value: levelKey(settings.sfx), options: opts }] });
  if (!v) return;
  const val = k => LEVELS.find(l => l[0] === k)[2];
  settings.music = val(v.music); settings.sfx = val(v.sfx); unlock(); applySettings(); play('bell');
}
export const soundOn = () => settings.music > 0 || settings.sfx > 0;

/* per le prove automatiche */
export const __test = { SFX, ENGINES, MOODS, build, tone, noise, setCtx: c => build(c) };
