// Mattoni per le schede che compaiono sopra la mappa quando si seleziona una pedina.
import { esc } from './ui.js';
import { mod, prof, fmtMod, hexesFor, STAT_NAME, STATS } from './rules.js';

export const initialsOf = n => String(n).replace(/\s+\d+$/, '').slice(0, 2);
export const hpMeter = (hp, max) => `<div class="meter ${hp / (max || 1) < 0.34 ? 'low' : ''}" role="img" aria-label="${hp} punti ferita su ${max}"><i style="width:${Math.max(0, Math.min(100, (hp / (max || 1)) * 100))}%"></i></div>`;
export const hpLine = (hp, max) => `<div class="hpline"><span>PF</span>${hpMeter(hp, max)}<b>${hp}/${max}</b></div>`;
export const stat = (v, label) => `<div class="sstat"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
export const stats = items => `<div class="sstats">${items.map(([v, l]) => stat(v, l)).join('')}</div>`;
export const abilities = ch => `<div class="sabil">${STATS.map(([k, l]) => `<div title="${l}"><b>${fmtMod(mod(ch.stats[k]))}</b><span>${k.toUpperCase()} ${ch.stats[k]}</span></div>`).join('')}</div>`;
export const section = (title, inner) => (inner ? `<section class="sheet-sec"><h4>${title}</h4>${inner}</section>` : '');
export function head({ ico, cls, title, sub = '', tags = '', closeAct = 'sheet-close' }) {
  return `<header class="sheet-head"><div class="ico ${cls}">${esc(ico)}</div><div class="ttl"><h3>${esc(title)} ${tags}</h3><p class="muted">${sub}</p></div><button class="x" data-act="${closeAct}" aria-label="Chiudi la scheda">×</button></header>`;
}
/** Pulsante di azione: titolo + riga di dettaglio. */
export function actBtn({ act, data = {}, title, sub = '', cls = '', on = false, off = false }) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="act ${cls} ${on ? 'on' : ''}" data-act="${act}" ${attrs} ${off ? 'disabled' : ''}><b>${esc(title)}</b><small>${sub}</small></button>`;
}
export const acts = list => `<div class="acts">${list.join('')}</div>`;

const statOf = (ch, s) => (s === 'fin' ? (ch.stats.des >= ch.stats.for ? 'des' : 'for') : s);
export function weaponLine(ch, w) { const m = mod(ch.stats[statOf(ch, w.stat)]); return `${fmtMod(m + prof(ch.level))} per colpire, ${esc(w.dado)}${fmtMod(m)}, ${w.gittata} ft (${hexesFor(w.gittata)} esagoni)`; }
export function spellLine(ch, s) {
  const cm = mod(ch.stats[ch.data.cast || 'int']), pb = prof(ch.level);
  const kind = { attacco: `${fmtMod(cm + pb)} per colpire`, salvezza: `salvezza ${STAT_NAME[s.salva || 'des']} CD ${8 + pb + cm}`, auto: 'colpisce sempre', cura: 'cura' }[s.tipo];
  return `${kind}, ${esc(s.dado)}, ${s.gittata} ft (${hexesFor(s.gittata)} esagoni)${s.area ? `, area ${s.area} ft ◎` : ''}`;
}
export function monActionLine(a, ent) {
  const kind = { attacco: `${fmtMod(a.atk ?? ent.data.atk ?? 0)} per colpire`, auto: 'colpisce sempre', salvezza: `salvezza ${STAT_NAME[a.salva || 'des']} CD ${a.cd || 12}` }[a.tipo];
  return `${kind}, ${esc(a.dado)}, ${a.gittata} ft (${hexesFor(a.gittata)} esagoni)${a.area ? `, area ${a.area} ft ◎` : ''}`;
}
export const condition = (hp, max, dead) => (dead || hp <= 0 ? 'sconfitto' : hp / (max || 1) > 0.67 ? 'illeso' : hp / (max || 1) > 0.34 ? 'ferito' : 'in gravi condizioni');

/** Rende la scheda trascinabile dall'intestazione (la posizione si ricorda; doppio clic sull'intestazione = posizione originale). */
export function enableSheetDrag(el) {
  if (!el || window.matchMedia?.('(max-width: 920px)').matches) return; // su telefono la scheda sta in basso, a tutta larghezza
  const wrap = el.parentElement; const saved = JSON.parse(localStorage.getItem('dnd.sheetpos') || 'null');
  const place = (l, t) => { el.classList.add('moved'); el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; };
  if (saved) place(saved.l, saved.t);
  let st = null;
  el.addEventListener('pointerdown', e => {
    if (!e.target.closest('.sheet-head') || e.target.closest('button')) return;
    const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect(); st = { dx: e.clientX - r.left, dy: e.clientY - r.top, w }; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!st) return; const l = Math.max(0, Math.min(st.w.width - el.offsetWidth, e.clientX - st.w.left - st.dx)), t = Math.max(0, Math.min(st.w.height - 60, e.clientY - st.w.top - st.dy)); place(Math.round(l), Math.round(t));
  });
  el.addEventListener('pointerup', () => { if (st) { st = null; localStorage.setItem('dnd.sheetpos', JSON.stringify({ l: parseInt(el.style.left, 10), t: parseInt(el.style.top, 10) })); } });
  el.addEventListener('dblclick', e => { const hr = el.querySelector('.sheet-head')?.getBoundingClientRect(); if (!hr || e.clientY < hr.top || e.clientY > hr.bottom || document.elementFromPoint(e.clientX, e.clientY)?.closest('button')) return; // con il puntatore catturato e.target non è più l'intestazione
    el.classList.remove('moved'); ['left', 'top', 'right', 'bottom'].forEach(p => (el.style[p] = '')); localStorage.removeItem('dnd.sheetpos'); });
}
