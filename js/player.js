import { openCampaign, insert, update, remove, say } from './db.js';
import { $, esc, toast, ask, confirmBox } from './ui.js';
import { createView } from './view.js';
import { openDungeonMap } from './dungeonmap.js';
import { mountDiceTray, roll, rollDie } from './dice.js';
import { STATS, STAT_NAME, RACES, CLASSES, WEAPONS, SPELLS, mod, prof, fmtMod, hexesFor } from './rules.js';
import { weaponAttack, castSpell, opportunityAttack, doAction, moveCharacter, passDoor, lootEntity, useItem, disarmTrap, attemptQuest, blockedSet, liveMonsters, markVisited } from './combat.js';
import { getEco, weaponSlot, spellSlot, isRogue } from './economia.js';
import { mountDicebar } from './dicebar.js';
import { key, dist, neighbors, inBounds, reachable, hexesWithin, los } from './hex.js';

const fatal = msg => { document.body.innerHTML = `<div class="fatal"><h2>Non riesco ad aprire la campagna</h2><p>${esc(msg)}</p><a class="btn primary" href="index.html">Torna all'inizio</a></div>`; };
const join = JSON.parse(localStorage.getItem('dnd.join') || 'null');
if (!join) { location.replace('index.html'); await new Promise(() => {}); }
let store;
try { store = await openCampaign(join.id, () => render()); } catch (e) { fatal(e.message); throw e; }
const cid = join.id;

const S = { meId: localStorage.getItem('dnd.char.' + cid), mode: { t: 'move' }, tab: 'scheda', adv: '', busy: false, reach: new Map(), hl: new Map() };
const me = () => store.characters.find(c => c.id === S.meId) || null;
const roomOf = ch => store.rooms.find(r => r.id === ch?.room_id) || null;
const err = e => toast(e?.message || String(e), 'err');
const asked = new Set();
const PRIO = { barbaro: ['for', 'cos', 'des', 'sag', 'car', 'int'], bardo: ['car', 'des', 'cos', 'sag', 'int', 'for'], chierico: ['sag', 'cos', 'for', 'car', 'des', 'int'], druido: ['sag', 'cos', 'des', 'int', 'car', 'for'], guerriero: ['for', 'cos', 'des', 'sag', 'int', 'car'], ladro: ['des', 'int', 'car', 'cos', 'sag', 'for'], mago: ['int', 'cos', 'des', 'sag', 'car', 'for'], monaco: ['des', 'sag', 'cos', 'for', 'int', 'car'], paladino: ['for', 'car', 'cos', 'sag', 'des', 'int'], ranger: ['des', 'sag', 'cos', 'int', 'for', 'car'], stregone: ['car', 'cos', 'des', 'sag', 'int', 'for'], warlock: ['car', 'cos', 'des', 'sag', 'int', 'for'] };

/* ---------- mappa ---------- */
const board = createView({ svg: $('#board'), host3d: $('#board3d'), handlers: {
  async onClick({ col, row }) {
    const ch = me(); const r = roomOf(ch); if (!ch || !r || S.busy) return;
    if (ch.hp <= 0) return toast('Sei a terra: aspetta aiuto o il Master.');
    const k = key(col, row);
    if (S.mode.t === 'move') {
      const cost = S.reach.get(k); if (cost == null) return toast('Troppo lontano, oppure la strada è bloccata.');
      const trap = store.entities.find(e => e.room_id === r.id && e.kind === 'trap' && !e.hidden && e.data.armed !== false && e.col === col && e.row === row);
      if (trap && !(await confirmBox(`Lì c'è una trappola nota: «${trap.name}». Vuoi davvero metterci piede?`, 'Vai lo stesso'))) return;
      return busy(() => moveCharacter(store, ch, r, { col, row }, cost));
    }
    if (S.mode.t === 'reaz') {
      const t = liveMonsters(store, r.id).find(e => !e.hidden && e.col === col && e.row === row);
      if (!t || !S.hl.get(k)) return toast('Scegli un mostro adiacente.');
      return busy(async () => { await opportunityAttack(store, ch, t); S.mode = { t: 'move' }; });
    }
    const a = currentAction(ch); if (!a) return;
    if (!S.hl.get(k)) return toast('Fuori portata, oppure un muro blocca la vista.');
    return busy(async () => {
      if (a.kind === 'weapon') {
        const t = liveMonsters(store, r.id).find(e => !e.hidden && e.col === col && e.row === row);
        if (!t) return toast('Lì non c\'è nessun mostro.');
        await weaponAttack(store, ch, a.item, t, S.adv || null, { i: S.mode.i });
      } else await castSpell(store, ch, a.item, { col, row }, r, S.adv || null);
    });
  },
} });
async function busy(fn) { S.busy = true; try { await fn(); } catch (e) { err(e); } finally { S.busy = false; render(); } }

function currentAction(ch) {
  if (S.mode.t === 'weapon') { const item = (ch.data.armi || [])[S.mode.i]; return item && { kind: 'weapon', item }; }
  if (S.mode.t === 'spell') { const item = (ch.data.magie || [])[S.mode.i]; return item && { kind: 'spell', item }; }
  return null;
}

function computeHL(ch, r) {
  S.hl = new Map(); S.reach = new Map();
  if (!ch || !r || ch.hp <= 0) return;
  const from = { col: ch.col, row: ch.row };
  if (S.mode.t === 'move') {
    S.reach = reachable(r, from, ch.move_left, blockedSet(store, r, { exceptChar: ch.id }));
    S.reach.forEach((_, k) => S.hl.set(k, 'move'));
    return;
  }
  if (S.mode.t === 'reaz') {
    for (const m of liveMonsters(store, r.id)) if (!m.hidden && dist(from, m) <= 1) S.hl.set(key(m.col, m.row), 'atk');
    return;
  }
  const a = currentAction(ch); if (!a) { S.mode = { t: 'move' }; return computeHL(ch, r); }
  const it = a.item; const range = hexesFor(it.gittata || 5);
  const style = it.tipo === 'cura' ? 'heal' : it.area ? 'area' : 'atk';
  for (const h of hexesWithin(r, from, range)) {
    const k = key(h.col, h.row);
    if ((h.col === from.col && h.row === from.row && it.tipo !== 'cura') || r.cells[k] === 'w') continue;
    if (dist(from, h) <= 1 || los(r, from, h)) S.hl.set(k, style);
  }
}

function visibleSet(r) {
  if (!r.fog) return null;
  const set = new Set();
  const pcs = store.characters.filter(c => c.room_id === r.id && c.hp > 0);
  (pcs.length ? pcs : store.characters.filter(c => c.room_id === r.id)).forEach(c => hexesWithin(r, c, 7).forEach(h => set.add(key(h.col, h.row))));
  return set;
}

/* ---------- rendering ---------- */
function render() {
  const ch = me();
  if (S.meId && !ch) { S.meId = null; localStorage.removeItem('dnd.char.' + cid); }
  $('#chooser').hidden = !!ch;
  if (!ch) return renderChooser();
  const r = roomOf(ch);
  if (r && !(store.campaign.state?.visited || []).includes(r.id) && !asked.has(r.id)) { asked.add(r.id); markVisited(store, r.id); }
  computeHL(ch, r);
  renderTop(ch); renderToolbar(r); renderInit(ch); renderBoard(ch, r); renderActionbar(ch); renderStatus(ch, r);
  if (!(document.activeElement?.tagName === 'SELECT' && $('#panel').contains(document.activeElement))) renderPanel(ch);
  renderNear(ch, r); renderLog();
}

function renderChooser() {
  const list = store.characters;
  $('#chooser').innerHTML = `<div class="panelbox"><h2>Chi giochi stasera?</h2><p class="muted">Campagna «${esc(store.campaign.name)}»</p>
    <ul class="list">${list.map(c => `<li><button class="row" data-act="pick-char" data-id="${c.id}"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.race)} ${esc(c.class)} di livello ${c.level}${c.player ? ', ' + esc(c.player) : ''}</span><span class="chip">${c.hp}/${c.max_hp} PF</span></button></li>`).join('') || '<li class="muted">Nessun personaggio ancora.</li>'}</ul>
    <p></p><button class="btn primary" data-act="new-char">Crea un nuovo personaggio</button> <a class="btn ghost" href="index.html">Esci</a></div>`;
}

function renderTop(ch) {
  $('#top').innerHTML = `<h1>${esc(store.campaign.name)}</h1><span>${esc(ch.name)}</span><span class="sp"></span><span class="live ${store.status === 'SUBSCRIBED' ? 'ok' : ''}" title="${store.status === 'SUBSCRIBED' ? 'Collegato in tempo reale' : 'Connessione in corso'}"></span><button class="btn sm" data-act="switch-char">Cambia personaggio</button>`;
}
function renderToolbar(r) { const t = $('#toolbar'); t.innerHTML = r ? `<strong style="color:#e8efec">${esc(r.name)}</strong>` : ''; t.hidden = !r; }
function renderInit(ch) {
  const st = store.campaign.state || {}; const list = st.init || []; const el = $('#init'); el.hidden = false;
  if (!list.length) { el.innerHTML = '<span class="turn idle"><i></i><span>Nessuno scontro in corso</span></span><span class="rd">Muoviti e agisci liberamente: il Master tira l\'iniziativa quando inizia il combattimento.</span>'; S.lastTurn = null; return; }
  const cur = list[st.turn || 0]; const mine = cur?.id === ch.id; const mon = cur?.k === 'e';
  el.innerHTML = `<span class="turn ${mine ? 'mine' : mon ? 'mon' : 'pc'}"><i></i><span>${mine ? '<b>Tocca a te!</b>' : `Tocca a <b>${esc(cur?.name || '')}</b> <small>${mon ? 'mostro' : 'giocatore'}</small>`}</span></span><b class="rd">Round ${st.round || 1}</b>`
    + list.map((i, n) => `<span class="it ${n === (st.turn || 0) ? 'now' : ''} ${i.k === 'e' ? 'm' : ''}">${esc(i.name)} ${i.roll}${i.id === ch.id ? ' (tu)' : ''}</span>`).join('');
  const tk = `${st.round || 1}:${st.turn || 0}:${cur?.id}`; if (mine && S.lastTurn !== tk) toast('Tocca a te!'); S.lastTurn = tk;
}
function renderBoard(ch, r) {
  const empty = $('#empty'); empty.hidden = !!r; board.show(!!r);
  const vb = $('[data-act="view"]'); if (vb) vb.textContent = board.mode === '2d' ? '3D' : '2D';
  $('[data-act="mini"]')?.classList.toggle('on', board.miniOn);
  if (!r) { empty.innerHTML = '<div><h2>Aspetta il Master</h2><p>Il tuo personaggio non è ancora in nessuna stanza.</p></div>'; return; }
  board.render({ room: r, role: 'player', meId: ch.id, entities: store.entities.filter(e => e.room_id === r.id && !e.hidden), characters: store.characters.filter(c => c.room_id === r.id), hl: S.hl, turnId: (store.campaign.state?.init || [])[store.campaign.state?.turn || 0]?.id, visible: visibleSet(r) });
}
function renderActionbar(ch) {
  const el = $('#actionbar'); el.hidden = false;
  const m = S.mode; const e = getEco(ch);
  const slotTag = s => ({ extra: 'attacco extra', bonus: 'azione bonus' }[s] || '');
  const mode = (cls, on, attrs, label, sub = '', off = false) => `<button class="btn ${cls} ${on ? 'on' : ''}" data-act="mode" ${attrs} ${off ? 'disabled' : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  const act = (w, label, off, title) => `<button class="btn" data-act="act" data-w="${w}" ${off ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
  const pip = (name, used, what) => `<div class="pip ${used ? 'used' : ''}" title="${esc(what || 'libera')}"><b>${name}</b>${used ? 'usata' : 'libera'}</div>`;
  const armi = (ch.data.armi || []).map((w, i) => { const sl = weaponSlot(ch, w, i); return mode('weapon', m.t === 'weapon' && m.i === i, `data-t="weapon" data-i="${i}"`, esc(w.nome), `${esc(w.dado)}${slotTag(sl) ? ' · ' + slotTag(sl) : ''}`, !sl); }).join('');
  const magie = (ch.data.magie || []).map((s, i) => { const sl = spellSlot(ch, s); return mode('spell', m.t === 'spell' && m.i === i, `data-t="spell" data-i="${i}"`, esc(s.nome), `${s.livello ? 'liv. ' + s.livello : 'trucchetto'}${sl === 'bonus' ? ' · azione bonus' : ''}`, !sl); }).join('');
  const stati = [e.atk > 0 ? `<span class="chip gold">+${e.atk} attacchi</span>` : '', e.schiva ? '<span class="chip">Schivata</span>' : '', e.disimp ? '<span class="chip">Disimpegno</span>' : '', e.aiuto ? '<span class="chip gold">Aiutato</span>' : ''].join('');
  el.innerHTML = `<div class="grp"><h4>Round</h4><div class="pips">${pip('Azione', e.az, e.az)}${pip('Bonus', e.bo, e.bo)}${pip('Reaz.', e.re, e.re)}</div>${stati ? `<div class="states">${stati}</div>` : ''}</div>`
    + `<div class="grp"><h4>Movimento</h4>${mode('', m.t === 'move', 'data-t="move"', 'Muovi', `${ch.move_left} / ${hexesFor(ch.speed)} esagoni`)}</div>`
    + (armi ? `<div class="grp"><h4>Armi</h4>${armi}</div>` : '')
    + (magie ? `<div class="grp"><h4>Magie</h4>${magie}</div>` : '')
    + `<div class="grp"><h4>Azioni</h4><div class="two">${act('scatto', 'Scatta', e.az, 'Azione: raddoppia il movimento del round')}${act('schiva', 'Schiva', e.az, 'Azione: svantaggio a chi ti attacca, vantaggio ai tiri salvezza di Destrezza')}${act('disimp', 'Disimpegnati', e.az, 'Azione: ti muovi senza subire attacchi di opportunità')}${act('aiuto', 'Aiuta', e.az, 'Azione: il prossimo attacco di un compagno ha vantaggio')}</div></div>`
    + (isRogue(ch) ? `<div class="grp"><h4>Azione bonus</h4><div class="two">${act('scaltra-scatto', 'Scatta', e.bo, 'Azione scaltra del Ladro')}${act('scaltra-disimp', 'Disimpegnati', e.bo, 'Azione scaltra del Ladro')}</div></div>` : '')
    + `<div class="grp"><h4>Reazione</h4>${mode('', m.t === 'reaz', 'data-t="reaz"', 'Attacco di opportunità', '', !!e.re)}</div>`
    + `<div class="grp"><h4>Tiro</h4><select data-pick="adv" aria-label="Vantaggio o svantaggio"><option value="" ${!S.adv ? 'selected' : ''}>Tiro normale</option><option value="adv" ${S.adv === 'adv' ? 'selected' : ''}>Vantaggio</option><option value="dis" ${S.adv === 'dis' ? 'selected' : ''}>Svantaggio</option></select></div>`;
}
function renderStatus(ch, r) {
  const a = currentAction(ch); let t;
  if (ch.hp <= 0) t = 'Sei a terra. Il Master o un alleato può aiutarti.';
  else if (S.mode.t === 'reaz') t = 'Reazione: clicca un mostro adiacente per l\'attacco di opportunità (arma da mischia migliore).';
  else if (S.mode.t === 'move') t = `Muovi: ${ch.move_left} esagoni disponibili (${ch.move_left * 5} ft). Il terreno difficile e l'acqua costano doppio.`;
  else if (a?.item.tipo === 'cura') t = `${a.item.nome}: gittata ${hexesFor(a.item.gittata)} esagoni. Clicca un alleato evidenziato.`;
  else if (a?.item.area) t = `${a.item.nome}: gittata ${hexesFor(a.item.gittata)} esagoni, raggio ${hexesFor(a.item.area)}. Clicca il centro dell'esplosione.`;
  else if (a) t = `${a.item.nome}: gittata ${hexesFor(a.item.gittata || 5)} esagoni. Clicca un mostro evidenziato.`;
  $('#status').textContent = r ? t : '';
}

function renderPanel(ch) {
  const tabs = [['scheda', 'Scheda'], ['armi', 'Armi e magie'], ['zaino', 'Zaino']];
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('');
  $('#panel').innerHTML = { scheda: tabScheda, armi: tabArmi, zaino: tabZaino }[S.tab](ch);
}
const meter = (hp, max) => `<div class="meter ${hp / max < 0.34 ? 'low' : ''}" role="img" aria-label="${hp} punti ferita su ${max}"><i style="width:${Math.max(0, Math.min(100, (hp / max) * 100))}%"></i></div>`;
function tabScheda(ch) {
  const cast = ch.data.cast; const pb = prof(ch.level);
  const ab = ([k, l]) => { const mm = mod(ch.stats[k]); return `<div class="ab" title="${l} ${ch.stats[k]}"><span>${l.slice(0, 3).toUpperCase()}</span><b class="${mm < 0 ? 'neg' : ''}">${fmtMod(mm)}</b><small>${ch.stats[k]}</small></div>`; };
  return `<div class="sheet"><div class="sheet-head"><h2>${esc(ch.name)}</h2><p class="muted">${esc(ch.race)} ${esc(ch.class)} · livello ${ch.level}${ch.player ? ` · ${esc(ch.player)}` : ''}</p></div>
  <div class="hp"><span>PF</span>${meter(ch.hp, ch.max_hp)}<em>${ch.hp} / ${ch.max_hp}</em></div>
  <div class="vitals"><div class="vital"><b>${ch.ac}</b><span>CA</span></div><div class="vital"><b>${ch.speed}<small>ft</small></b><span>${hexesFor(ch.speed)} esagoni</span></div><div class="vital"><b>${fmtMod(pb)}</b><span>Competenza</span></div><div class="vital"><b>${fmtMod(mod(ch.stats.des))}</b><span>Iniziativa</span></div></div>
  <div class="abilities">${STATS.map(ab).join('')}</div>
  ${cast ? `<p class="castline">Magia: ${STAT_NAME[cast]} · CD ${8 + pb + mod(ch.stats[cast])}</p>` : ''}
  ${ch.data.note ? `<div class="card"><strong>Note</strong><p>${esc(ch.data.note)}</p></div>` : ''}
  </div>`;
}
function tabArmi(ch) {
  const pb = prof(ch.level); const cm = mod(ch.stats[ch.data.cast || 'int']);
  const wstat = w => (w.stat === 'fin' ? (ch.stats.des >= ch.stats.for ? 'des' : 'for') : w.stat);
  return `<div class="stack"><h3>Armi</h3><ul class="list">${(ch.data.armi || []).map((w, i) => `<li><div class="card"><strong>${esc(w.nome)}</strong><p class="muted">${fmtMod(mod(ch.stats[wstat(w)]) + pb)} per colpire, danni ${esc(w.dado)}${fmtMod(mod(ch.stats[wstat(w)]))}, gittata ${w.gittata} ft (${hexesFor(w.gittata)} esagoni)</p><button class="btn sm danger" data-act="del-weapon" data-i="${i}">Rimuovi</button></div></li>`).join('') || '<li class="muted">Nessuna arma.</li>'}</ul>
  <button class="btn" data-act="add-weapon">Aggiungi arma</button>
  <h3>Magie</h3><ul class="list">${(ch.data.magie || []).map((s, i) => `<li><div class="card"><strong>${esc(s.nome)}</strong> <span class="chip">${s.livello ? 'livello ' + s.livello : 'trucchetto'}</span><p class="muted">${{ attacco: 'Tiro per colpire ' + fmtMod(cm + pb), salvezza: 'Salvezza ' + (STAT_NAME[s.salva || 'des'] || '') + ' CD ' + (8 + pb + cm), auto: 'Colpisce sempre', cura: 'Cura' }[s.tipo]}, ${esc(s.dado)}, gittata ${s.gittata} ft (${hexesFor(s.gittata)} esagoni)${s.area ? `, raggio ${s.area} ft` : ''}</p><button class="btn sm danger" data-act="del-spell" data-i="${i}">Rimuovi</button></div></li>`).join('') || '<li class="muted">Nessuna magia.</li>'}</ul>
  <button class="btn" data-act="add-spell">Aggiungi magia</button></div>`;
}
function tabZaino(ch) {
  const items = ch.data.oggetti || [];
  return `<div class="stack"><div class="card"><strong>Monete d'oro:</strong> ${ch.data.oro || 0}</div>
  <ul class="list">${items.map((o, i) => `<li><div class="card"><strong>${esc(o.nome)}</strong><p class="muted">${esc(o.desc || '')}</p>${o.cura ? `<button class="btn sm primary" data-act="use-item" data-i="${i}">Usa (${esc(o.cura)})</button> ` : ''}<button class="btn sm danger" data-act="drop-item" data-i="${i}">Getta</button></div></li>`).join('') || '<li class="muted">Lo zaino è vuoto.</li>'}</ul></div>`;
}

function renderNear(ch, r) {
  const el = $('#near'); if (!r || ch.hp <= 0) { el.innerHTML = ''; return; }
  const out = [];
  for (const e of store.entities.filter(x => x.room_id === r.id && !x.hidden && dist(ch, x) <= 1)) {
    const d = e.data;
    if (e.kind === 'treasure' && !d.looted) out.push(`<button class="btn sm" data-act="loot" data-id="${e.id}">Apri «${esc(e.name)}»</button>`);
    else if (e.kind === 'monster' && d.dead && d.loot && !d.looted) out.push(`<button class="btn sm" data-act="loot" data-id="${e.id}">Saccheggia ${esc(e.name)}</button>`);
    else if (e.kind === 'trap' && d.armed !== false) out.push(`<button class="btn sm" data-act="disarm" data-id="${e.id}">Disarma «${esc(e.name)}» (CD ${d.disarm})</button>`);
    else if (e.kind === 'door') {
      if (d.locked) out.push(`<button class="btn sm" data-act="door" data-id="${e.id}">${esc(e.name)}: bloccata${d.quest_id ? ', tenta di aprirla' : ' (decide il Master)'}</button>`);
      else if (d.target_room) out.push(`<button class="btn sm primary" data-act="pass" data-id="${e.id}">Attraversa «${esc(e.name)}»</button>`);
    }
  }
  el.innerHTML = out.length ? `<strong>Vicino a te</strong><div>${out.join('')}</div>` : '';
}
function renderLog() {
  $('#log').innerHTML = [...store.log].filter(l => l.kind !== 'secret').slice(-80).reverse().map(l => `<li class="${esc(l.kind)}">${esc(l.text)}</li>`).join('') || '<li class="muted">Qui compaiono tiri, attacchi ed eventi.</li>';
}

/* ---------- creazione e modifica personaggio ---------- */
async function createCharacter() {
  const saved = JSON.parse(localStorage.getItem('dnd.lastPlayer') || '""');
  const extra = `<div class="stack"><div class="btnrow"><button type="button" class="btn sm" id="b-roll">Tira 4d6 e assegna</button><button type="button" class="btn sm" id="b-std">Valori standard</button></div><p class="muted" id="race-note"></p></div>`;
  const v = await ask({ title: 'Nuovo personaggio', wide: true, ok: 'Crea e gioca', extra, fields: [
    { name: 'player', label: 'Il tuo nome', value: saved }, { name: 'name', label: 'Nome del personaggio', required: true },
    { name: 'race', label: 'Razza', type: 'select', options: RACES.map(r => ({ v: r.id, l: `${r.nome} (${r.speed} ft)` })) },
    { name: 'cls', label: 'Classe', type: 'select', options: CLASSES.map(c => ({ v: c.id, l: c.nome })) },
    { name: 'level', label: 'Livello', type: 'number', value: 1, min: 1, max: 20 },
    ...STATS.map(([k, l]) => ({ name: 's_' + k, label: l + ' (base)', type: 'number', value: 10, min: 3, max: 20 })),
  ], onMount(form) {
    const note = () => { const r = RACES.find(x => x.id === form.elements.race.value); $('#race-note', form).textContent = `${r.nome}: ${r.nota}. Velocità ${r.speed} ft, cioè ${hexesFor(r.speed)} esagoni per round. Bonus razziali: ${Object.entries(r.bonus).map(([k, n]) => `${STAT_NAME[k]} +${n}`).join(', ')} (si sommano alla creazione).`; };
    const fill = vals => { const order = PRIO[form.elements.cls.value]; order.forEach((k, i) => (form.elements['s_' + k].value = vals[i])); };
    form.elements.race.addEventListener('change', note); note();
    $('#b-std', form).onclick = () => fill([15, 14, 13, 12, 10, 8]);
    $('#b-roll', form).onclick = () => fill(Array.from({ length: 6 }, () => roll('4d6kh3').total).sort((a, b) => b - a));
  } });
  if (!v) return;
  localStorage.setItem('dnd.lastPlayer', JSON.stringify(v.player || ''));
  const race = RACES.find(r => r.id === v.race), cls = CLASSES.find(c => c.id === v.cls), level = v.level || 1;
  const stats = Object.fromEntries(STATS.map(([k]) => [k, Math.max(1, (v['s_' + k] ?? 10) + (race.bonus[k] || 0))]));
  const m = Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, mod(s)]));
  const maxHp = Math.max(1, cls.dv + m.cos + (level - 1) * (Math.floor(cls.dv / 2) + 1 + m.cos));
  const first = [...store.rooms].sort((a, b) => a.sort - b.sort)[0] || null;
  const spot = first ? freeSpot(first) : { col: 1, row: 1 };
  const ch = await insert(store, 'characters', {
    campaign_id: cid, player: (v.player || '').trim(), name: v.name.trim(), race: race.nome, class: cls.nome, level, stats, hp: maxHp, max_hp: maxHp, ac: cls.ac(m), speed: race.speed, move_left: hexesFor(race.speed),
    room_id: first?.id || null, col: spot.col, row: spot.row,
    data: { raceId: race.id, classId: cls.id, cast: cls.cast || 'int', oro: 10, oggetti: [{ nome: 'Pozione di cura', desc: 'Recupera 2d4+2 punti ferita.', cura: '2d4+2' }], armi: cls.armi.map(id => ({ ...WEAPONS.find(w => w.id === id) })), magie: cls.magie.map(id => ({ ...SPELLS.find(s => s.id === id) })), note: '' },
  });
  S.meId = ch.id; localStorage.setItem('dnd.char.' + cid, ch.id); S.mode = { t: 'move' }; render();
}
function freeSpot(r) {
  const start = r.meta?.start || { col: 1, row: 1 }; const occ = new Set(store.characters.filter(c => c.room_id === r.id).map(c => key(c.col, c.row)));
  const q = [start]; const seen = new Set([key(start.col, start.row)]);
  while (q.length) { const c = q.shift(); const k = key(c.col, c.row); if (r.cells[k] !== 'w' && !occ.has(k)) return c; for (const n of neighbors(c.col, c.row)) { const nk = key(n.col, n.row); if (!seen.has(nk) && inBounds(r, n)) { seen.add(nk); q.push(n); } } }
  return start;
}

async function weaponDialog() {
  const v = await ask({ title: 'Aggiungi arma', wide: true, fields: [
    { name: 'preset', label: 'Dal catalogo', type: 'select', options: [...WEAPONS.map(w => ({ v: w.id, l: `${w.nome} (${w.dado}, ${w.gittata} ft)` })), { v: 'custom', l: 'Personalizzata (compila qui sotto)' }] },
    { name: 'nome', label: 'Nome', value: '' }, { name: 'dado', label: 'Danni', value: '1d6' },
    { name: 'stat', label: 'Caratteristica', type: 'select', value: 'for', options: [{ v: 'for', l: 'Forza' }, { v: 'des', l: 'Destrezza' }, { v: 'fin', l: 'Accurata (la migliore tra le due)' }] },
    { name: 'gittata', label: 'Gittata (ft)', type: 'number', value: 5, min: 5 },
  ] });
  if (!v) return null;
  if (v.preset !== 'custom') return { ...WEAPONS.find(w => w.id === v.preset) };
  if (!v.nome.trim()) throw new Error('Dai un nome all\'arma.'); roll(v.dado);
  return { nome: v.nome.trim(), dado: v.dado.trim(), stat: v.stat, gittata: v.gittata ?? 5 };
}
async function spellDialog() {
  const v = await ask({ title: 'Aggiungi magia', wide: true, fields: [
    { name: 'preset', label: 'Dal catalogo', type: 'select', options: [...SPELLS.map(s => ({ v: s.id, l: `${s.nome} (${s.livello ? 'liv. ' + s.livello : 'trucchetto'}, ${s.gittata} ft)` })), { v: 'custom', l: 'Personalizzata (compila qui sotto)' }] },
    { name: 'nome', label: 'Nome', value: '' }, { name: 'dado', label: 'Dadi', value: '2d6' },
    { name: 'tipo', label: 'Tipo', type: 'select', options: [{ v: 'attacco', l: 'Tiro per colpire' }, { v: 'salvezza', l: 'Tiro salvezza del bersaglio' }, { v: 'auto', l: 'Colpisce sempre' }, { v: 'cura', l: 'Cura un alleato' }] },
    { name: 'gittata', label: 'Gittata (ft)', type: 'number', value: 60, min: 5 }, { name: 'area', label: 'Raggio d\'area (ft, 0 = bersaglio singolo)', type: 'number', value: 0, min: 0 },
    { name: 'salva', label: 'Salvezza su', type: 'select', value: 'des', options: STATS.map(([k, l]) => ({ v: k, l })) },
    { name: 'meta', label: 'Danni dimezzati se il bersaglio supera la salvezza', type: 'checkbox', value: false },
    { name: 'livello', label: 'Livello (0 = trucchetto che cresce col livello)', type: 'number', value: 1, min: 0, max: 9 },
  ] });
  if (!v) return null;
  if (v.preset !== 'custom') return { ...SPELLS.find(s => s.id === v.preset) };
  if (!v.nome.trim()) throw new Error('Dai un nome alla magia.'); roll(v.dado);
  return { nome: v.nome.trim(), dado: v.dado.trim(), tipo: v.tipo, gittata: v.gittata ?? 60, area: v.area || 0, salva: v.salva, meta: v.meta, livello: v.livello ?? 1, mod: v.tipo === 'cura' };
}

async function questDialog(door) {
  const q = store.quests.find(x => x.id === door.data.quest_id); if (!q) return toast('Questa porta si apre solo con l\'intervento del Master.');
  const ch = me(); const d = q.data;
  const lead = `${d.prompt || ''}`;
  if (q.kind === 'riddle') {
    const v = await ask({ title: q.title, ok: 'Rispondi', intro: esc(lead), fields: [{ name: 'a', label: 'La tua risposta', required: true }] });
    if (v) await attemptQuest(store, ch, door, q, v.a);
  } else if (q.kind === 'check') {
    const v = await ask({ title: q.title, ok: 'Tira il d20', intro: esc(lead) + `<br><br>Prova di <b>${STAT_NAME[d.stat] || ''}</b> (CD ${d.dc}). Il tuo bonus è ${fmtMod(mod(ch.stats[d.stat || 'des']))}.` });
    if (v) await attemptQuest(store, ch, door, q, '');
  } else {
    const v = await ask({ title: q.title, ok: `Prova con «${d.key_item}»`, intro: esc(lead) + `<br><br>Serve: <b>${esc(d.key_item)}</b> (da qualcuno del gruppo in questa stanza).` });
    if (v) await attemptQuest(store, ch, door, q, '');
  }
}

/* ---------- azioni ---------- */
const ent = id => store.entities.find(e => e.id === id);
const acts = {
  'pick-char': d => { S.meId = d.id; localStorage.setItem('dnd.char.' + cid, d.id); S.mode = { t: 'move' }; render(); },
  'new-char': createCharacter,
  'switch-char': () => { S.meId = null; localStorage.removeItem('dnd.char.' + cid); render(); },
  tab: d => { S.tab = d.t; render(); },
  mode: d => { S.mode = d.t === 'move' ? { t: 'move' } : { t: d.t, i: +d.i }; render(); },
  act: d => busy(async () => {
    const ch = me(); let ally = null;
    if (d.w === 'aiuto') {
      const mates = store.characters.filter(c => c.room_id === ch.room_id && c.id !== ch.id && c.hp > 0);
      if (!mates.length) throw new Error('Non c\'è nessun compagno vicino da aiutare.');
      const v = await ask({ title: 'Aiuta un compagno', fields: [{ name: 'who', label: 'Chi aiuti?', type: 'select', value: mates[0].id, options: mates.map(c => ({ v: c.id, l: c.name })) }] });
      if (!v) return; ally = mates.find(c => c.id === v.who);
    }
    await doAction(store, ch, d.w, ally);
  }),
  mini: () => { board.toggleMini(); render(); },
  'zoom-in': () => board.zoom(0.8), 'zoom-out': () => board.zoom(1.25), fit: () => board.fit(),
  view: async () => { await board.set(board.mode === '2d' ? '3d' : '2d'); render(); },
  dmap: () => openDungeonMap({ store, role: 'player', currentRoomId: me()?.room_id }),
  loot: d => busy(() => lootEntity(store, me(), ent(d.id))),
  disarm: d => busy(() => disarmTrap(store, me(), ent(d.id))),
  pass: d => busy(() => passDoor(store, me(), ent(d.id))),
  door: d => busy(() => questDialog(ent(d.id))),
  'use-item': d => busy(() => useItem(store, me(), +d.i)),
  'drop-item': async d => { const ch = me(); const it = ch.data.oggetti[+d.i]; if (await confirmBox(`Gettare «${it.nome}»?`, 'Getta')) await update(store, 'characters', ch.id, { data: { ...ch.data, oggetti: ch.data.oggetti.filter((_, i) => i !== +d.i) } }); },
  'add-weapon': async () => { const w = await weaponDialog(); if (w) { const ch = me(); await update(store, 'characters', ch.id, { data: { ...ch.data, armi: [...(ch.data.armi || []), w] } }); } },
  'add-spell': async () => { const s = await spellDialog(); if (s) { const ch = me(); await update(store, 'characters', ch.id, { data: { ...ch.data, magie: [...(ch.data.magie || []), s] } }); } },
  'del-weapon': async d => { const ch = me(); S.mode = { t: 'move' }; await update(store, 'characters', ch.id, { data: { ...ch.data, armi: ch.data.armi.filter((_, i) => i !== +d.i) } }); },
  'del-spell': async d => { const ch = me(); S.mode = { t: 'move' }; await update(store, 'characters', ch.id, { data: { ...ch.data, magie: ch.data.magie.filter((_, i) => i !== +d.i) } }); },
};
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = acts[b.dataset.act]; if (!fn) return;
  try { await fn(b.dataset); } catch (x) { err(x); }
});
document.addEventListener('change', e => { if (e.target.dataset?.pick === 'adv') S.adv = e.target.value; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { dicebar.cancel(); S.mode = { t: 'move' }; render(); } });

if (localStorage.getItem('dnd.view') === '3d') board.set('3d').then(render);
const dicebar = mountDicebar($('#dicebar'), { stage: $('.board-wrap') });
mountDiceTray($('#dice-tray'), { who: () => me()?.name || 'Giocatore', say: (kind, text) => say(store, me()?.name || 'Giocatore', kind === 'secret' ? 'roll' : kind, text) });
render();
