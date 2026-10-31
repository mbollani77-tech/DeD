import { $, esc } from './ui.js';

/** Dado equo: rifiuta i valori che introdurrebbero bias. */
export function rollDie(n) {
  const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return (a[0] % n) + 1;
}
export const randInt = (a, b) => a + rollDie(b - a + 1) - 1;
export const pick = arr => arr[rollDie(arr.length) - 1];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rollDie(i + 1) - 1; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function describe(parts) {
  return parts.map((p, i) => {
    const sign = i ? (p.sign < 0 ? ' - ' : ' + ') : (p.sign < 0 ? '-' : '');
    return sign + (p.rolls ? `${p.expr} [${p.rolls.join(', ')}]` : p.flat);
  }).join('');
}

/** Espressioni tipo "2d6+3", "d20", "2d20kh1+5", "1d8+1d6+2". */
export function roll(expr) {
  const clean = String(expr).replace(/\s+/g, '').toLowerCase();
  if (!clean) throw new Error('Espressione vuota');
  const terms = clean.match(/[+-]?[^+-]+/g);
  let total = 0; const parts = [];
  for (const t of terms) {
    const sign = t.startsWith('-') ? -1 : 1; const body = t.replace(/^[+-]/, '');
    const m = body.match(/^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/);
    if (m) {
      const n = +(m[1] || 1), s = +m[2];
      if (n < 1 || n > 100 || s < 2 || s > 1000) throw new Error('Dado non valido: ' + body);
      const rolls = Array.from({ length: n }, () => rollDie(s));
      let kept = rolls;
      if (m[3]) { const k = Math.min(+m[4], n); const sorted = [...rolls].sort((a, b) => b - a); kept = m[3] === 'kh' ? sorted.slice(0, k) : sorted.slice(-k); }
      const sum = kept.reduce((a, b) => a + b, 0);
      total += sign * sum; parts.push({ expr: body, sign, rolls, kept, sum });
    } else if (/^\d+$/.test(body)) { total += sign * +body; parts.push({ expr: body, sign, flat: +body }); }
    else throw new Error('Espressione non valida: ' + t);
  }
  return { expr: clean, total, parts, text: describe(parts) };
}

/** Tiro di d20 con bonus; adv = 'adv' | 'dis' | null. */
export function rollD20(bonus = 0, adv = null) {
  const r = roll(adv === 'adv' ? '2d20kh1' : adv === 'dis' ? '2d20kl1' : '1d20');
  const nat = r.parts[0].sum;
  const rolls = r.parts[0].rolls.join(', ');
  const b = bonus ? ` ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}` : '';
  const tag = adv === 'adv' ? ' (vantaggio)' : adv === 'dis' ? ' (svantaggio)' : '';
  return { nat, total: nat + bonus, crit: nat === 20, fumble: nat === 1, text: `d20 [${rolls}]${b} = ${nat + bonus}${tag}` };
}

/** Raddoppia i dadi (non i bonus) per i colpi critici. */
export const critExpr = expr => String(expr).replace(/(\d*)d(\d+)/g, (_, n, s) => `${(+(n || 1)) * 2}d${s}`);

/** Scala i trucchetti col livello (5, 11, 17). */
export function scaleDice(expr, level) {
  if (level == null) return expr;
  const mult = 1 + (level >= 5) + (level >= 11) + (level >= 17);
  return mult === 1 ? expr : String(expr).replace(/^(\d*)d(\d+)/, (_, n, s) => `${(+(n || 1)) * mult}d${s}`);
}

/** Vassoio dadi: d4…d100, modificatore, vantaggio, formula libera. */
export function mountDiceTray(el, { who, say, canSecret = false }) {
  el.innerHTML = `
    <div class="tray">
      <div class="dice-row">${[4, 6, 8, 10, 12, 20, 100].map(d => `<button type="button" class="die" data-d="${d}" aria-label="Tira d${d}">d${d}</button>`).join('')}</div>
      <div class="tray-opts">
        <label>Modificatore <input type="number" id="dt-mod" value="0" step="1"></label>
        <label>d20 <select id="dt-adv"><option value="">normale</option><option value="adv">vantaggio</option><option value="dis">svantaggio</option></select></label>
        ${canSecret ? '<label class="check"><input type="checkbox" id="dt-secret"> segreto</label>' : ''}
      </div>
      <div class="tray-expr"><input type="text" id="dt-expr" placeholder="2d6+3" aria-label="Formula"><button type="button" class="btn" id="dt-go">Tira</button></div>
      <output class="dice-out" aria-live="polite"><span class="big">–</span><span class="det">Scegli un dado</span></output>
    </div>`;
  const out = $('.dice-out', el);
  const run = expr => {
    try {
      const r = roll(expr);
      out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop');
      out.innerHTML = `<span class="big">${r.total}</span><span class="det">${esc(r.expr)}: ${esc(r.text)}</span>`;
      const secret = canSecret && $('#dt-secret', el)?.checked;
      say(secret ? 'secret' : 'roll', `${who()} tira ${r.expr}: ${r.text} = ${r.total}`);
    } catch (e) { out.innerHTML = `<span class="big">!</span><span class="det">${esc(e.message)}</span>`; }
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('.die'); if (b) {
      const d = +b.dataset.d; const m = parseInt($('#dt-mod', el).value, 10) || 0; const adv = $('#dt-adv', el).value;
      let expr = d === 20 && adv ? (adv === 'adv' ? '2d20kh1' : '2d20kl1') : `1d${d}`;
      if (m) expr += (m > 0 ? '+' : '') + m;
      run(expr);
    }
    if (e.target.id === 'dt-go') { const v = $('#dt-expr', el).value.trim(); if (v) run(v); }
  });
  $('#dt-expr', el).addEventListener('keydown', e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) run(v); } });
}
