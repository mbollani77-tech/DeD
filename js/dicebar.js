// Barra dei dadi sotto la mappa: i dadi si accendono solo quando l'azione in corso richiede un tiro.
import { $, esc } from './ui.js';
import { rollD20, roll } from './dice.js';
import { hooks } from './rolls.js';

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pts = (n, rot = -90, R = 21) => Array.from({ length: n }, (_, i) => { const a = (rot + (360 / n) * i) * Math.PI / 180; return [24 + R * Math.cos(a), 25 + R * Math.sin(a)]; });
const fmt = p => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function dieSvg(s) {
  let body;
  if (s === 4) body = `<polygon points="${fmt(pts(3, -90, 22).map(([x, y]) => [x, y + 2]))}"/>`;
  else if (s === 6) body = '<rect x="6" y="6" width="36" height="36" rx="7"/>';
  else if (s === 8) body = `<polygon points="${fmt(pts(4, 0, 22))}"/><path class="f" d="M2 25h44"/>`;
  else if (s === 10) body = `<polygon points="${fmt([[24, 2], [43, 17], [36, 44], [12, 44], [5, 17]])}"/><path class="f" d="M24 2v42"/>`;
  else if (s === 12) body = `<polygon points="${fmt(pts(10, -90, 22))}"/>`;
  else if (s === 20) { const p = pts(6, -90, 22).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`); body = `<polygon points="${fmt(pts(6, -90, 22))}"/><path class="f" d="M${p[0]}L${p[2]}L${p[4]}ZM${p[1]}L${p[3]}L${p[5]}Z"/>`; }
  else body = '<circle cx="24" cy="25" r="21"/><circle class="f" cx="24" cy="25" r="14"/>';
  return `<svg viewBox="0 0 48 50" aria-hidden="true">${body}<text x="24" y="${s === 4 ? 33 : 30}">${s === 100 ? '%' : s}</text></svg>`;
}


/* ---------- dadi che rotolano sulla mappa ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Dai risultati di un tiro ricava i singoli dadi da far rotolare: { s: facce, v: valore, dim: scartato }. */
function diceOf(r) {
  const out = [];
  if (r.parts) {
    for (const p of r.parts) {
      if (!p.rolls) continue;
      const s = +(p.expr.match(/d(\d+)/)?.[1] || 6); const keep = [...(p.kept || p.rolls)];
      for (const v of p.rolls) { const i = keep.indexOf(v); if (i >= 0) { keep.splice(i, 1); out.push({ s, v, dim: false }); } else out.push({ s, v, dim: true }); }
    }
  } else if (r.rolls) {
    let used = false; for (const v of r.rolls) { const keep = !used && v === r.nat; if (keep) used = true; out.push({ s: 20, v, dim: !keep }); }
  }
  return out.slice(0, 12);
}

function launch(stage, from, list) {
  const layer = document.createElement('div'); layer.className = 'roll-layer'; stage.appendChild(layer);
  const W = stage.clientWidth, H = stage.clientHeight, n = list.length;
  const sx = from.x, sy = from.y; const done = [];
  list.forEach((d, i) => {
    const el = document.createElement('div'); el.className = 'rdie' + (d.dim ? ' dim' : '') + (d.s === 20 && !d.dim ? (d.v === 20 ? ' crit' : d.v === 1 ? ' fumble' : '') : '');
    el.innerHTML = '<i class="rshadow"></i>' + dieSvg(d.s); layer.appendChild(el);
    const txt = el.querySelector('text');
    const gap = Math.min(86, (W - 120) / Math.max(n, 1));
    const x = W / 2 + (i - (n - 1) / 2) * gap + rnd(-14, 14), y = H * 0.52 + rnd(-34, 34);
    const x1 = sx + (x - sx) * 0.35 + rnd(-30, 30), y1 = Math.min(sy, y) - rnd(90, 150);
    const x2 = sx + (x - sx) * 0.7, x3 = sx + (x - sx) * 0.88;
    const spin = (rnd(1, 2) | 0) * 360, dirn = Math.random() < 0.5 ? -1 : 1;
    const T = (px, py, rot, sc) => `translate(${px}px, ${py}px) rotate(${rot * dirn}deg) scale(${sc})`;
    const frames = [
      { transform: T(sx, sy, 0, 0.45), offset: 0, easing: 'ease-out' },
      { transform: T(x1, y1, spin * 0.5, 1.2), offset: 0.34, easing: 'ease-in' },
      { transform: T(x2, y, spin * 0.9, 1), offset: 0.6, easing: 'ease-out' },
      { transform: T(x3, y - rnd(24, 44), spin * 1.1, 1.05), offset: 0.78, easing: 'ease-in' },
      { transform: T(x, y, spin + rnd(-10, 10), 1), offset: 1 },
    ];
    const ms = 1100 + i * 90;
    const flip = setInterval(() => { txt.textContent = d.s === 100 ? 1 + ((Math.random() * 100) | 0) : 1 + ((Math.random() * d.s) | 0); }, 70);
    const setFinal = () => { clearInterval(flip); txt.textContent = d.v; };
    if (reduced()) { el.style.transform = T(x, y, 0, 1); setFinal(); done.push(Promise.resolve()); return; }
    const a = el.animate(frames, { duration: ms, fill: 'forwards' });
    setTimeout(setFinal, ms * 0.72);
    done.push(a.finished.catch(() => {}));
  });
  return { landed: Promise.all(done), clear: () => { layer.classList.add('fade'); setTimeout(() => layer.remove(), 450); } };
}

export function mountDicebar(el, { stage = null } = {}) {
  el.innerHTML = `<div class="db-info"><div class="db-prompt">Nessun tiro richiesto</div><div class="db-sub">I dadi si accendono quando l'azione ne ha bisogno.</div></div>
    <div class="db-dice">${SIDES.map(s => `<button type="button" class="die3" data-d="${s}" disabled aria-label="Tira d${s}">${dieSvg(s)}</button>`).join('')}</div>
    <output class="db-result" aria-live="polite"><b>–</b><span></span></output>`;
  const prompt = $('.db-prompt', el), sub = $('.db-sub', el), out = $('.db-result', el);
  const dice = [...el.querySelectorAll('.die3')];
  let pend = null;

  const enable = set => dice.forEach(b => { const on = set.has(+b.dataset.d); b.disabled = !on; b.classList.toggle('need', on); });
  const idle = () => { enable(new Set()); el.classList.remove('active'); prompt.textContent = 'Nessun tiro richiesto'; sub.textContent = 'I dadi si accendono quando l\'azione ne ha bisogno.'; };

  function ask({ sides, label, hint, doRoll, cancelable = false }) {
    return new Promise((res, rej) => {
      pend = { doRoll, res, rej, cancelable, busy: false, sides: new Set(sides) };
      prompt.textContent = label; sub.textContent = hint; el.classList.add('active'); enable(pend.sides);
    });
  }

  el.addEventListener('click', async e => {
    const b = e.target.closest('.die3'); if (!b || b.disabled || !pend || pend.busy) return;
    const p = pend; p.busy = true;
    const live = dice.filter(d => !d.disabled);
    live.forEach(d => d.classList.add('rolling'));
    let r; try { r = p.doRoll(); } catch (x) { live.forEach(d => d.classList.remove('rolling')); pend = null; idle(); return p.rej(x); }
    let fly = null;
    if (stage) {
      const sr = stage.getBoundingClientRect(), br = b.getBoundingClientRect();
      fly = launch(stage, { x: br.left + br.width / 2 - sr.left, y: Math.min(sr.height - 20, br.top + br.height / 2 - sr.top) }, diceOf(r));
    }
    await sleep(260); live.forEach(d => d.classList.remove('rolling'));
    if (fly) await fly.landed; else await sleep(500);
    out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop');
    out.innerHTML = `<b>${r.total}</b><span>${esc(r.text)}</span>`;
    await sleep(750);
    fly?.clear();
    pend = null; idle(); p.res(r);
  });

  const advHint = a => (a === 'adv' ? 'Vantaggio: si tirano 2 d20 e vale il più alto.' : a === 'dis' ? 'Svantaggio: si tirano 2 d20 e vale il più basso.' : '');
  hooks.d20 = (bonus, adv, label) => ask({
    sides: [20], label, cancelable: true, doRoll: () => rollD20(bonus, adv),
    hint: `Clicca il d20${bonus ? ` (${bonus > 0 ? '+' : '−'}${Math.abs(bonus)} al risultato)` : ''}. ${advHint(adv)} Esc per annullare.`.trim(),
  });
  hooks.expr = (expr, label) => {
    const found = [...new Set([...String(expr).matchAll(/d(\d+)/gi)].map(m => +m[1]))].filter(s => SIDES.includes(s));
    return ask({ sides: found.length ? found : SIDES, label, hint: `Clicca un dado acceso per tirare ${expr}.`, doRoll: () => roll(expr) });
  };

  return { cancel() { if (pend && pend.cancelable && !pend.busy) { const p = pend; pend = null; idle(); p.rej(new Error('Tiro annullato.')); } } };
}
