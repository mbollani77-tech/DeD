import { openCampaign, verifyMaster, insert, insertMany, update, remove, say, setCampaignState } from './db.js';
import { $, $$, esc, toast, ask, confirmBox, copyText } from './ui.js';
import { createBoard } from './board.js';
import { mountDiceTray, roll, rollD20, randInt, pick } from './dice.js';
import { STATS, STAT_NAME, BESTIARY, TRAPS, mod, hexesFor, fmtMod, crLabel } from './rules.js';
import { generateRoom, randomMonster, randomTreasure, randomTrap, randomQuest, monsterFromPreset, trapFromPreset, itemsToText, parseItems } from './random.js';
import { monsterAttack, monsterAutoTurn, damageEntity, damageChar, healChar, liveMonsters } from './combat.js';
import { key, dist, neighbors, inBounds } from './hex.js';

/* ---------- sessione ---------- */
const fatal = msg => { document.body.innerHTML = `<div class="fatal"><h2>Non riesco ad aprire la campagna</h2><p>${esc(msg)}</p><a class="btn primary" href="index.html">Torna all'inizio</a></div>`; };
const saved = JSON.parse(localStorage.getItem('dnd.master') || 'null');
if (!saved) { location.replace('index.html'); await new Promise(() => {}); }
try {
  const okId = await verifyMaster(saved.code, saved.key);
  if (okId !== saved.id) { localStorage.removeItem('dnd.master'); location.replace('index.html'); await new Promise(() => {}); }
} catch (e) { fatal(e.message); throw e; }

const S = { roomId: null, tool: { t: 'select' }, sel: null, moving: false, tab: 'stanze', pick: { monster: 'goblin', trap: 'dardi' } };
let store;
try { store = await openCampaign(saved.id, () => render()); } catch (e) { fatal(e.message); throw e; }
const cid = saved.id;

const room = () => store.rooms.find(r => r.id === S.roomId) || store.rooms[0] || null;
const partyLevel = () => (store.characters.length ? Math.max(1, Math.round(store.characters.reduce((a, c) => a + c.level, 0) / store.characters.length)) : 1);
const entsIn = r => store.entities.filter(e => e.room_id === r.id);
const err = e => toast(e?.message || String(e), 'err');
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { err(e); } };

/* ---------- mappa ---------- */
const board = createBoard($('#board'), {
  onClick({ col, row, stack }) {
    const r = room(); if (!r) return;
    if (S.moving && S.sel) return moveSelected(col, row);
    if (S.tool.t === 'place') return place(col, row);
    if (S.tool.t === 'start') return update(store, 'rooms', r.id, { meta: { ...r.meta, start: { col, row } } }).then(() => toast('Punto di partenza impostato')).catch(err);
    if (S.tool.t === 'paint') return;
    const toSel = x => ({ kind: x.kind === 'pc' ? 'char' : 'entity', id: x.id });
    if (stack.length) {
      const cur = S.sel ? stack.findIndex(x => toSel(x).id === S.sel.id) : -1;
      S.sel = toSel(stack[(cur + 1) % stack.length]);
    } else S.sel = null;
    render();
  },
  onPaint(col, row) {
    const r = room(); const v = S.tool.v; if (!r) return;
    if (v === 'f') delete r.cells[key(col, row)]; else r.cells[key(col, row)] = v;
    board.paintCell(col, row, v);
  },
  onPaintEnd: guard(async () => { const r = room(); if (r) await update(store, 'rooms', r.id, { cells: { ...r.cells } }); }),
});

/* ---------- rendering ---------- */
let rendering = false;
function render() {
  if (rendering) return; rendering = true;
  try {
    const r = room(); S.roomId = r?.id || null;
    if (S.sel && !(S.sel.kind === 'entity' ? store.entities : store.characters).some(x => x.id === S.sel.id)) { S.sel = null; S.moving = false; }
    renderTop(); renderToolbar(); renderInit(); renderBoard(r); renderStatus(r);
    if (!(document.activeElement?.tagName === 'SELECT' && $('#panel').contains(document.activeElement))) renderPanel();
    renderInspector(); renderLog();
  } finally { rendering = false; }
}

function renderTop() {
  $('#top').innerHTML = `<h1>${esc(store.campaign.name)}</h1><button class="code" data-act="copy-code" title="Copia il codice per i giocatori">${esc(store.campaign.code)}</button><span class="sp"></span><span class="live ${store.status === 'SUBSCRIBED' ? 'ok' : ''}" title="${store.status === 'SUBSCRIBED' ? 'Collegato in tempo reale' : 'Connessione in corso'}"></span><a class="btn sm" href="player.html" target="_blank" rel="noopener">Vista giocatore</a><button class="btn sm" data-act="leave">Esci</button>`;
}

function renderToolbar() {
  const T = S.tool;
  const b = (t, v, label) => `<button class="btn ${T.t === t && (v === undefined || T.v === v) ? 'on' : ''}" data-act="tool" data-t="${t}" ${v ? `data-v="${v}"` : ''}>${label}</button>`;
  $('#toolbar').innerHTML = b('select', undefined, 'Seleziona') + '<span class="sep"></span>' + b('paint', 'w', 'Muro') + b('paint', 'f', 'Pavimento') + b('paint', 'd', 'Difficile') + b('paint', 'a', 'Acqua') + '<span class="sep"></span>' + b('start', undefined, 'Punto di partenza')
    + (T.t === 'place' ? `<span class="sep"></span><button class="btn on" data-act="tool" data-t="select">Smetti di piazzare: ${esc(T.label)}</button>` : '');
}

function renderInit() {
  const st = store.campaign.state || {}; const el = $('#init'); const list = st.init || [];
  el.hidden = !list.length; if (!list.length) return;
  el.innerHTML = `<b>Round ${st.round || 1}</b>` + list.map((i, n) => `<span class="it ${n === (st.turn || 0) ? 'now' : ''}">${esc(i.name)} ${i.roll}</span>`).join('');
}

function renderBoard(r) {
  $('#empty').hidden = !!r; $('#board').style.display = r ? '' : 'none';
  if (!r) { $('#empty').innerHTML = '<div><h2>Il tavolo è vuoto</h2><p>Crea la tua prima stanza, oppure fai generare un dungeon dalla scheda Stanze.</p></div>'; return; }
  board.render({ room: r, role: 'master', entities: entsIn(r), characters: store.characters.filter(c => c.room_id === r.id), sel: S.sel, paint: S.tool.t === 'paint', showStart: true });
}

function renderStatus(r) {
  const T = S.tool; let t = r ? `${r.name}: ${r.cols}×${r.rows} esagoni, 1 esagono = 5 ft.` : 'Nessuna stanza.';
  if (S.moving) t = 'Clicca l\'esagono di destinazione (Esc per annullare).';
  else if (T.t === 'paint') t = 'Trascina sulla mappa per disegnare.';
  else if (T.t === 'start') t = 'Clicca dove devono comparire i giocatori.';
  else if (T.t === 'place') t = `Clicca sulla mappa per piazzare: ${T.label}. Esc per smettere.`;
  $('#status').textContent = t;
}

const TABS = [['stanze', 'Stanze'], ['aggiungi', 'Aggiungi'], ['quest', 'Quest'], ['gruppo', 'Gruppo']];
function renderPanel() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('');
  $('#panel').innerHTML = { stanze: tabStanze, aggiungi: tabAggiungi, quest: tabQuest, gruppo: tabGruppo }[S.tab]();
}

function tabStanze() {
  const r = room();
  return `<div class="stack"><div class="btnrow"><button class="btn primary" data-act="room-new">Nuova stanza</button><button class="btn" data-act="room-gen">Stanza casuale</button><button class="btn" data-act="room-dungeon">Dungeon casuale</button></div>
  <ul class="list">${store.rooms.map(x => `<li class="${x.id === r?.id ? 'on' : ''}"><button class="row" data-act="room-open" data-id="${x.id}"><strong>${esc(x.name)}</strong><span class="muted">${x.cols}×${x.rows}${x.fog ? ', nebbia' : ''}</span><span class="chip">${store.characters.filter(c => c.room_id === x.id).length} PG</span></button></li>`).join('') || '<li class="muted">Nessuna stanza ancora.</li>'}</ul>
  ${r ? `<div class="card stack"><h3>${esc(r.name)}</h3><p class="muted">${esc(r.notes || 'Nessuna nota per questa stanza.')}</p><div class="btnrow"><button class="btn" data-act="room-edit">Modifica</button><button class="btn" data-act="room-fill">Riempi a caso</button><button class="btn" data-act="party-here">Porta qui il gruppo</button><button class="btn" data-act="room-clear">Svuota oggetti</button><button class="btn danger" data-act="room-del">Elimina</button></div></div>` : ''}</div>`;
}

function tabAggiungi() {
  if (!room()) return '<p class="muted">Crea prima una stanza.</p>';
  const sel = (id, k, opts) => `<select id="${id}" data-pick="${k}">${opts.map(o => `<option value="${o.v}" ${S.pick[k] === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  return `<div class="stack">
  <div class="card stack"><h3>Mostri</h3><div class="fld"><label for="pk-m">Dal bestiario</label>${sel('pk-m', 'monster', BESTIARY.map(m => ({ v: m.id, l: `${m.nome} (GS ${crLabel(m.cr)}, ${m.hp} PF)` })))}</div>
    <div class="btnrow"><button class="btn" data-act="place-monster">Piazza</button><button class="btn" data-act="custom-monster">Personalizzato…</button><button class="btn" data-act="random-monster">Casuale</button></div></div>
  <div class="card stack"><h3>Tesori</h3><div class="btnrow"><button class="btn" data-act="custom-treasure">Crea tesoro…</button><button class="btn" data-act="random-treasure">Casuale</button></div></div>
  <div class="card stack"><h3>Trappole</h3><div class="fld"><label for="pk-t">Dal catalogo</label>${sel('pk-t', 'trap', TRAPS.map(t => ({ v: t.id, l: `${t.nome} (CD ${t.detect})` })))}</div>
    <div class="btnrow"><button class="btn" data-act="place-trap">Piazza</button><button class="btn" data-act="custom-trap">Personalizzata…</button><button class="btn" data-act="random-trap">Casuale</button></div></div>
  <div class="card stack"><h3>Porte</h3><p class="muted">Collegano due stanze e possono richiedere una quest.</p><button class="btn" data-act="custom-door">Crea porta…</button></div></div>`;
}

function tabQuest() {
  return `<div class="stack"><div class="btnrow"><button class="btn primary" data-act="quest-new">Nuova quest</button><button class="btn" data-act="quest-gen">Casuale</button></div>
  <ul class="list">${store.quests.map(q => {
    const doors = store.entities.filter(e => e.kind === 'door' && e.data.quest_id === q.id).length;
    return `<li><div class="card"><strong>${esc(q.title)}</strong> <span class="chip ${q.solved ? '' : 'gold'}">${q.solved ? 'risolta' : { riddle: 'enigma', check: 'prova', key: 'chiave' }[q.kind]}</span><p class="muted">${esc(q.data.prompt || '')}</p><p class="muted">${doors ? `Chiude ${doors} port${doors === 1 ? 'a' : 'e'}.` : 'Non è collegata a nessuna porta: assegnala dalla modifica della porta.'}</p><div class="btnrow"><button class="btn sm" data-act="quest-edit" data-id="${q.id}">Modifica</button><button class="btn sm danger" data-act="quest-del" data-id="${q.id}">Elimina</button></div></div></li>`;
  }).join('') || '<li class="muted">Nessuna quest.</li>'}</ul></div>`;
}

function tabGruppo() {
  const st = store.campaign.state || {};
  return `<div class="stack"><div class="card stack"><h3>Combattimento</h3><div class="btnrow"><button class="btn" data-act="init-roll">Tira iniziativa</button><button class="btn" data-act="init-next">Prossimo turno</button><button class="btn" data-act="round-reset">Nuovo round</button><button class="btn" data-act="init-clear">Fine scontro</button></div><p class="muted">${(st.init || []).length ? `Round ${st.round || 1}, turno di ${esc(st.init[st.turn || 0]?.name || '')}.` : 'L\'iniziativa riguarda la stanza attuale. «Nuovo round» ridà il movimento a tutti.'}</p></div>
  <ul class="list">${store.characters.map(c => `<li class="${S.sel?.id === c.id ? 'on' : ''}"><button class="row" data-act="char-sel" data-id="${c.id}"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.race)} ${esc(c.class)} liv. ${c.level}, ${esc(c.player || 'giocatore')}</span><span class="chip ${c.hp <= 0 ? 'red' : ''}">${c.hp}/${c.max_hp}</span></button></li>`).join('') || '<li class="muted">Nessun personaggio: i giocatori li creano entrando con il codice.</li>'}</ul></div>`;
}

function entityInspector(e) {
  const d = e.data; const r = room();
  const tags = (e.hidden ? '<span class="chip gold">nascosto</span> ' : '') + (d.dead ? '<span class="chip red">sconfitto</span>' : '');
  const common = `<button class="btn sm" data-act="ent-edit">Modifica</button><button class="btn sm" data-act="ent-reveal">${e.hidden ? 'Rivela' : 'Nascondi'}</button><button class="btn sm" data-act="ent-move">Sposta</button><button class="btn sm danger" data-act="ent-del">Elimina</button><button class="btn sm ghost" data-act="sel-clear">Chiudi</button>`;
  if (e.kind === 'monster') {
    const pcs = store.characters.filter(c => c.room_id === e.room_id && c.hp > 0);
    return `<div class="card stack"><h3>${esc(e.name)} ${tags}</h3><dl class="kv"><dt>PF</dt><dd>${d.hp}/${d.maxHp}</dd><dt>CA</dt><dd>${d.ac}</dd><dt>Movimento</dt><dd>${d.speed} ft (${hexesFor(d.speed)} esagoni)</dd><dt>Attacco</dt><dd>${fmtMod(d.atk || 0)}, ${esc(d.dado)}, ${d.gittata} ft (${hexesFor(d.gittata)} esagoni)</dd>${d.loot ? `<dt>Bottino</dt><dd>${d.loot.oro || 0} mo${(d.loot.oggetti || []).length ? ', ' + d.loot.oggetti.map(o => esc(o.nome)).join(', ') : ''}</dd>` : ''}</dl>
    <div class="btnrow"><button class="btn sm" data-act="mon-hp">Danni o cura…</button><button class="btn sm primary" data-act="mon-turn" ${d.dead ? 'disabled' : ''}>Turno automatico</button></div>
    ${pcs.length && !d.dead ? `<div class="inline"><div class="fld"><label for="insp-target">Attacca</label><select id="insp-target">${pcs.map(c => `<option value="${c.id}">${esc(c.name)} (a ${dist(e, c)} esagoni)</option>`).join('')}</select></div><button class="btn sm" data-act="mon-atk">Attacca</button></div>` : ''}
    <div class="btnrow">${common}</div></div>`;
  }
  if (e.kind === 'treasure') return `<div class="card stack"><h3>${esc(e.name)} ${tags}</h3><dl class="kv"><dt>Oro</dt><dd>${d.oro || 0}</dd><dt>Oggetti</dt><dd>${(d.oggetti || []).map(o => esc(o.nome)).join(', ') || 'nessuno'}</dd><dt>Stato</dt><dd>${d.looted ? 'già aperto' : 'chiuso'}</dd></dl><div class="btnrow">${common}</div></div>`;
  if (e.kind === 'trap') return `<div class="card stack"><h3>${esc(e.name)} ${tags}</h3><p class="muted">${esc(d.desc || '')}</p><dl class="kv"><dt>Individuare</dt><dd>CD ${d.detect}</dd><dt>Disarmare</dt><dd>CD ${d.disarm}</dd><dt>Salvezza</dt><dd>${STAT_NAME[d.save] || ''} CD ${d.dc}, ${esc(d.dado)}${d.half ? ' (dimezza)' : ''}</dd><dt>Stato</dt><dd>${d.armed === false ? 'disinnescata' : 'armata'}</dd></dl><div class="btnrow"><button class="btn sm" data-act="trap-arm">${d.armed === false ? 'Riarma' : 'Disinnesca'}</button>${common}</div></div>`;
  const q = store.quests.find(x => x.id === d.quest_id); const tr = store.rooms.find(x => x.id === d.target_room);
  return `<div class="card stack"><h3>${esc(e.name)} ${tags}</h3><dl class="kv"><dt>Stato</dt><dd>${d.locked ? 'bloccata' : 'aperta'}</dd><dt>Quest</dt><dd>${q ? esc(q.title) : 'nessuna'}</dd><dt>Porta verso</dt><dd>${tr ? esc(tr.name) : 'nessuna stanza'}</dd></dl><div class="btnrow"><button class="btn sm" data-act="door-lock">${d.locked ? 'Sblocca' : 'Blocca'}</button>${common}</div></div>`;
}

function charInspector(c) {
  const r = store.rooms.find(x => x.id === c.room_id);
  return `<div class="card stack"><h3>${esc(c.name)}</h3><p class="muted">${esc(c.race)} ${esc(c.class)} di livello ${c.level}, giocatore: ${esc(c.player || '—')}</p>
  <dl class="kv"><dt>PF</dt><dd>${c.hp}/${c.max_hp}</dd><dt>CA</dt><dd>${c.ac}</dd><dt>Velocità</dt><dd>${c.speed} ft (${hexesFor(c.speed)} esagoni)</dd><dt>Movimento rimasto</dt><dd>${c.move_left} esagoni</dd><dt>Stanza</dt><dd>${r ? esc(r.name) : 'nessuna'}</dd></dl>
  <div class="btnrow"><button class="btn sm" data-act="char-hp">Danni o cura…</button><button class="btn sm" data-act="char-edit">Modifica</button><button class="btn sm" data-act="ent-move">Sposta</button><button class="btn sm" data-act="char-reset">Ridai movimento</button><button class="btn sm" data-act="char-here">Porta nella stanza attuale</button><button class="btn sm danger" data-act="char-del">Rimuovi</button><button class="btn sm ghost" data-act="sel-clear">Chiudi</button></div></div>`;
}

function renderInspector() {
  const el = $('#inspector'); const s = S.sel; if (!s) { el.innerHTML = ''; return; }
  if (s.kind === 'entity') { const e = store.entities.find(x => x.id === s.id); el.innerHTML = e ? entityInspector(e) : ''; }
  else { const c = store.characters.find(x => x.id === s.id); el.innerHTML = c ? charInspector(c) : ''; }
}

function renderLog() {
  $('#log').innerHTML = [...store.log].slice(-80).reverse().map(l => `<li class="${esc(l.kind)}">${l.kind === 'secret' ? '<b>Segreto:</b> ' : ''}${esc(l.text)}</li>`).join('') || '<li class="muted">Qui compaiono tiri, attacchi ed eventi.</li>';
}

/* ---------- finestre di modifica ---------- */
const statOpts = STATS.map(([v, l]) => ({ v, l }));
const checkDice = d => { try { roll(d); return true; } catch (e) { toast('Dadi non validi: ' + d, 'err'); return false; } };

async function monsterDialog(ent) {
  const d = ent?.data || {}; const g = BESTIARY[2];
  const v = await ask({ title: ent ? 'Modifica mostro' : 'Mostro personalizzato', wide: true, fields: [
    { name: 'name', label: 'Nome', value: ent?.name || 'Mostro', required: true },
    { name: 'ac', label: 'Classe armatura', type: 'number', value: d.ac ?? g.ac },
    { name: 'hp', label: 'Punti ferita attuali', type: 'number', value: d.hp ?? g.hp, min: 0 },
    { name: 'maxHp', label: 'Punti ferita massimi', type: 'number', value: d.maxHp ?? g.hp, min: 1 },
    { name: 'speed', label: 'Velocità (ft; 5 ft = 1 esagono)', type: 'number', value: d.speed ?? 30, min: 0 },
    { name: 'gittata', label: 'Gittata attacco (ft)', type: 'number', value: d.gittata ?? 5, min: 5 },
    { name: 'atk', label: 'Bonus per colpire', type: 'number', value: d.atk ?? 4 },
    { name: 'dado', label: 'Danni (es. 1d6+2)', value: d.dado ?? '1d6+2' },
    { name: 'dex', label: 'Salvezza Destrezza', type: 'number', value: d.dex ?? 0 },
    { name: 'xp', label: 'Punti esperienza', type: 'number', value: d.xp ?? 50, min: 0 },
    { name: 'oro', label: 'Bottino: monete d\'oro', type: 'number', value: d.loot?.oro ?? 0, min: 0 },
    { name: 'oggetti', label: 'Bottino: oggetti (uno per riga, «Nome | descrizione»)', type: 'textarea', value: itemsToText(d.loot?.oggetti || []) },
    { name: 'hidden', label: 'Nascosto ai giocatori (imboscata)', type: 'checkbox', value: ent?.hidden || false },
  ] });
  if (!v || !checkDice(v.dado)) return null;
  const hp = Math.min(v.hp ?? 1, v.maxHp ?? 1);
  return { kind: 'monster', name: v.name.trim(), hidden: v.hidden, data: { ...d, hp, maxHp: v.maxHp ?? 1, ac: v.ac ?? 10, speed: v.speed ?? 30, atk: v.atk ?? 0, dado: v.dado.trim(), gittata: v.gittata ?? 5, dex: v.dex ?? 0, xp: v.xp ?? 0, dead: hp <= 0, loot: (v.oro || v.oggetti.trim()) ? { oro: v.oro || 0, oggetti: parseItems(v.oggetti) } : undefined } };
}
async function treasureDialog(ent) {
  const d = ent?.data || {};
  const v = await ask({ title: ent ? 'Modifica tesoro' : 'Nuovo tesoro', fields: [
    { name: 'name', label: 'Nome', value: ent?.name || 'Forziere', required: true },
    { name: 'oro', label: 'Monete d\'oro', type: 'number', value: d.oro ?? 25, min: 0 },
    { name: 'oggetti', label: 'Oggetti (uno per riga, «Nome | descrizione»)', type: 'textarea', rows: 4, value: itemsToText(d.oggetti || []), hint: 'Una descrizione come «Recupera 2d4+2 punti ferita» rende l\'oggetto utilizzabile come pozione.' },
    { name: 'hidden', label: 'Nascosto ai giocatori', type: 'checkbox', value: ent?.hidden || false },
  ] });
  if (!v) return null;
  return { kind: 'treasure', name: v.name.trim(), hidden: v.hidden, data: { ...d, oro: v.oro || 0, oggetti: parseItems(v.oggetti), looted: d.looted || false } };
}
async function trapDialog(ent) {
  const d = ent?.data || TRAPS[0];
  const v = await ask({ title: ent ? 'Modifica trappola' : 'Trappola personalizzata', wide: true, fields: [
    { name: 'name', label: 'Nome', value: ent?.name || d.nome || 'Trappola', required: true },
    { name: 'desc', label: 'Descrizione', value: d.desc || '' },
    { name: 'detect', label: 'CD per individuarla', type: 'number', value: d.detect ?? 13 },
    { name: 'disarm', label: 'CD per disarmarla', type: 'number', value: d.disarm ?? 13 },
    { name: 'save', label: 'Tiro salvezza', type: 'select', options: statOpts, value: d.save || 'des' },
    { name: 'dc', label: 'CD del tiro salvezza', type: 'number', value: d.dc ?? 13 },
    { name: 'dado', label: 'Danni', value: d.dado || '2d6' },
    { name: 'half', label: 'Danni dimezzati se il tiro riesce', type: 'checkbox', value: d.half ?? true },
    { name: 'reusable', label: 'Si riarma dopo lo scatto', type: 'checkbox', value: d.reusable ?? false },
    { name: 'hidden', label: 'Nascosta ai giocatori', type: 'checkbox', value: ent ? ent.hidden : true },
  ] });
  if (!v || !checkDice(v.dado)) return null;
  return { kind: 'trap', name: v.name.trim(), hidden: v.hidden, data: { ...(ent?.data || {}), desc: v.desc, detect: v.detect ?? 13, disarm: v.disarm ?? 13, save: v.save, dc: v.dc ?? 13, dado: v.dado.trim(), half: v.half, reusable: v.reusable, armed: ent?.data.armed ?? true } };
}
async function doorDialog(ent) {
  const d = ent?.data || {}; const r = room();
  const v = await ask({ title: ent ? 'Modifica porta' : 'Nuova porta', fields: [
    { name: 'name', label: 'Nome', value: ent?.name || 'Porta', required: true },
    { name: 'locked', label: 'Bloccata', type: 'checkbox', value: d.locked ?? false },
    { name: 'quest', label: 'Quest che la apre', type: 'select', value: d.quest_id || '', options: [{ v: '', l: 'Nessuna (la sblocchi tu)' }, ...store.quests.map(q => ({ v: q.id, l: q.title + (q.solved ? ' (risolta)' : '') }))] },
    { name: 'target', label: 'Porta verso la stanza', type: 'select', value: d.target_room || '', options: [{ v: '', l: 'Nessuna (porta decorativa)' }, ...store.rooms.map(x => ({ v: x.id, l: x.name }))] },
    { name: 'tcol', label: 'Arrivo: colonna (vuoto = partenza)', type: 'number', value: d.tcol ?? '', min: 0 },
    { name: 'trow', label: 'Arrivo: riga (vuoto = partenza)', type: 'number', value: d.trow ?? '', min: 0 },
  ] });
  if (!v) return null;
  const tr = store.rooms.find(x => x.id === v.target); const st = tr?.meta?.start || { col: 1, row: 1 };
  return { kind: 'door', name: v.name.trim(), hidden: false, data: { ...d, locked: v.locked, quest_id: v.quest || null, target_room: v.target || null, tcol: v.target ? (v.tcol ?? st.col) : null, trow: v.target ? (v.trow ?? st.row) : null } };
}
async function questDialog(q) {
  const d = q?.data || {};
  const v = await ask({ title: q ? 'Modifica quest' : 'Nuova quest', wide: true, fields: [
    { name: 'title', label: 'Titolo', value: q?.title || '', required: true },
    { name: 'kind', label: 'Tipo', type: 'select', value: q?.kind || 'riddle', options: [{ v: 'riddle', l: 'Enigma (risposta scritta)' }, { v: 'check', l: 'Prova di caratteristica' }, { v: 'key', l: 'Chiave (oggetto nello zaino)' }] },
    { name: 'prompt', label: 'Testo mostrato ai giocatori', type: 'textarea', value: d.prompt || '' },
    { name: 'answer', label: 'Enigma: risposte accettate', value: d.answer || '', hint: 'Più varianti separate da «|», senza maiuscole né accenti.' },
    { name: 'stat', label: 'Prova: caratteristica', type: 'select', options: statOpts, value: d.stat || 'des' },
    { name: 'dc', label: 'Prova: CD', type: 'number', value: d.dc ?? 13 },
    { name: 'key_item', label: 'Chiave: nome dell\'oggetto', value: d.key_item || 'Chiave di ferro' },
    { name: 'consume', label: 'Chiave: l\'oggetto si consuma', type: 'checkbox', value: d.consume ?? true },
  ] });
  if (!v) return null;
  return { title: v.title.trim(), kind: v.kind, data: { prompt: v.prompt, answer: v.answer, stat: v.stat, dc: v.dc ?? 13, key_item: v.key_item, consume: v.consume } };
}

/* ---------- piazzamento e spostamenti ---------- */
function uniqueName(base) {
  const r = room(); const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( \\d+)?$');
  const n = entsIn(r).filter(e => e.kind === 'monster' && re.test(e.name)).length;
  return n ? `${base} ${n + 1}` : base;
}
function setPlace(label, make) { S.tool = { t: 'place', label, make }; S.sel = null; render(); }
const placeFrom = (label, tpl) => setPlace(label, () => JSON.parse(JSON.stringify(tpl)));

async function place(col, row) {
  const r = room(); if (r.cells[key(col, row)] === 'w') return toast('Non puoi piazzare su un muro.', 'err');
  const t = S.tool.make();
  await insert(store, 'entities', { campaign_id: cid, room_id: r.id, kind: t.kind, name: t.kind === 'monster' ? uniqueName(t.name) : t.name, col, row, hidden: !!t.hidden, data: t.data }).catch(err);
}
async function moveSelected(col, row) {
  const r = room();
  if (r.cells[key(col, row)] === 'w') return toast('Lì c\'è un muro.', 'err');
  S.moving = false;
  const s = S.sel; await update(store, s.kind === 'entity' ? 'entities' : 'characters', s.id, { col, row }).catch(err);
}

/* ---------- stanze ---------- */
const frame = (cols, rows) => { const c = {}; for (let x = 0; x < cols; x++) { c[key(x, 0)] = 'w'; c[key(x, rows - 1)] = 'w'; } for (let y = 0; y < rows; y++) { c[key(0, y)] = 'w'; c[key(cols - 1, y)] = 'w'; } return c; };

async function roomDialog(r) {
  return ask({ title: r ? 'Modifica stanza' : 'Nuova stanza', fields: [
    { name: 'name', label: 'Nome', value: r?.name || '', required: true },
    { name: 'notes', label: 'Note per te (descrizione, segreti)', type: 'textarea', value: r?.notes || '' },
    { name: 'cols', label: 'Colonne', type: 'number', value: r?.cols ?? 14, min: 6, max: 30 },
    { name: 'rows', label: 'Righe', type: 'number', value: r?.rows ?? 10, min: 6, max: 24 },
    { name: 'fog', label: 'Nebbia: i giocatori vedono solo vicino ai personaggi', type: 'checkbox', value: r?.fog || false },
    ...(r ? [] : [{ name: 'walls', label: 'Cornice di muri', type: 'checkbox', value: true }]),
  ] });
}

async function createGenerated(n, link) {
  const level = partyLevel(), party = Math.max(2, store.characters.length || 3);
  let linkInfo = null;
  if (link) {
    const A = link; const occ = new Set(entsIn(A).map(e => key(e.col, e.row))); const cand = [];
    for (let y = 1; y < A.rows - 1; y++) for (let x = 1; x < A.cols - 1; x++) if (A.cells[key(x, y)] !== 'w' && !occ.has(key(x, y)) && dist({ col: x, row: y }, A.meta?.start || { col: 1, row: 1 }) > 2) cand.push({ col: x, row: y });
    if (!cand.length) { toast('Nella stanza attuale non c\'è spazio per una porta.', 'err'); return; }
    const cell = pick(cand);
    const ret = neighbors(cell.col, cell.row).find(h => inBounds(A, h) && A.cells[key(h.col, h.row)] !== 'w' && !occ.has(key(h.col, h.row))) || cell;
    linkInfo = { room: A, cell, ret };
  }
  const gens = Array.from({ length: n }, (_, i) => generateRoom({ level, party, hasEntrance: link ? true : i > 0, hasExit: i < n - 1, difficulty: 1 + Math.floor(i / 3) }));
  const base = Math.max(0, ...store.rooms.map(r => r.sort)) + 1;
  const rooms = await insertMany(store, 'rooms', gens.map((g, i) => ({ campaign_id: cid, name: g.name, cols: g.cols, rows: g.rows, cells: g.cells, meta: g.meta, sort: base + i })));
  rooms.sort((a, b) => a.sort - b.sort);
  const quests = [];
  for (const g of gens) quests.push(g.quest ? await insert(store, 'quests', { campaign_id: cid, title: g.quest.title, kind: g.quest.kind, data: g.quest.data }) : null);
  const rows = [];
  gens.forEach((g, i) => g.entities.forEach(e => {
    const { _role, ...rest } = e;
    const row = { campaign_id: cid, room_id: rooms[i].id, kind: rest.kind, name: rest.name, col: rest.col, row: rest.row, hidden: !!rest.hidden, data: { ...rest.data } };
    if (_role === 'exit' && i < n - 1) { Object.assign(row.data, { target_room: rooms[i + 1].id, tcol: gens[i + 1].meta.start.col, trow: gens[i + 1].meta.start.row }); if (quests[i]) row.data.quest_id = quests[i].id; }
    if (_role === 'entrance') {
      if (i > 0) Object.assign(row.data, { target_room: rooms[i - 1].id, tcol: gens[i - 1].meta.exitFront.col, trow: gens[i - 1].meta.exitFront.row });
      else if (linkInfo) Object.assign(row.data, { target_room: linkInfo.room.id, tcol: linkInfo.ret.col, trow: linkInfo.ret.row });
    }
    rows.push(row);
  }));
  if (linkInfo) rows.push({ campaign_id: cid, room_id: linkInfo.room.id, kind: 'door', name: 'Passaggio', col: linkInfo.cell.col, row: linkInfo.cell.row, hidden: false, data: { locked: false, target_room: rooms[0].id, tcol: gens[0].meta.start.col, trow: gens[0].meta.start.row } });
  await insertMany(store, 'entities', rows);
  S.roomId = rooms[0].id; S.sel = null; render();
  toast(n > 1 ? `Dungeon di ${n} stanze creato` : `Creata: ${rooms[0].name}`);
}

async function fillRoom(r) {
  const level = partyLevel(); const occ = new Set(entsIn(r).map(e => key(e.col, e.row)));
  const start = r.meta?.start || { col: 1, row: 1 }; const free = [];
  for (let y = 1; y < r.rows - 1; y++) for (let x = 1; x < r.cols - 1; x++) if (r.cells[key(x, y)] !== 'w' && !occ.has(key(x, y)) && dist({ col: x, row: y }, start) > 2) free.push({ col: x, row: y });
  const take = () => free.splice(randInt(0, free.length - 1), 1)[0];
  const tpls = [];
  for (let i = 0, n = randInt(2, 4); i < n; i++) tpls.push(randomMonster(level));
  tpls.push(randomTreasure(level)); for (let i = 0, n = randInt(0, 2); i < n; i++) tpls.push({ ...randomTrap(level) });
  const rows = []; const counts = {};
  for (const t of tpls) { const h = take(); if (!h) break; counts[t.name] = (counts[t.name] || 0) + 1; rows.push({ campaign_id: cid, room_id: r.id, kind: t.kind, name: counts[t.name] > 1 ? `${t.name} ${counts[t.name]}` : t.name, col: h.col, row: h.row, hidden: !!t.hidden, data: t.data }); }
  await insertMany(store, 'entities', rows); toast(`Aggiunti ${rows.length} elementi`);
}

/* ---------- combattimento ---------- */
const hexRing = (r, c) => { const out = []; const seen = new Set(); const q = [c]; seen.add(key(c.col, c.row)); while (q.length && out.length < 30) { const cur = q.shift(); for (const n of neighbors(cur.col, cur.row)) { const k = key(n.col, n.row); if (seen.has(k) || !inBounds(r, n)) continue; seen.add(k); q.push(n); if (r.cells[k] !== 'w') out.push(n); } } return out; };

async function rollInit() {
  const r = room(); const list = [];
  store.characters.filter(c => c.room_id === r.id && c.hp > 0).forEach(c => list.push({ k: 'c', id: c.id, name: c.name, roll: rollD20(mod(c.stats.des)).total }));
  liveMonsters(store, r.id).filter(e => !e.hidden).forEach(e => list.push({ k: 'e', id: e.id, name: e.name, roll: rollD20(e.data.dex || 0).total }));
  if (!list.length) return toast('Nessuno da mettere in ordine in questa stanza.', 'err');
  list.sort((a, b) => b.roll - a.roll);
  await setCampaignState(store, { init: list, turn: 0, round: 1 });
  say(store, 'Master', 'event', `Iniziativa: ${list.map(i => `${i.name} ${i.roll}`).join(', ')}.`);
}
async function resetMoves() { for (const c of store.characters) { const m = hexesFor(c.speed); if (c.move_left !== m) await update(store, 'characters', c.id, { move_left: m }); } }
async function nextTurn() {
  const st = store.campaign.state || {}; const init = st.init || [];
  if (!init.length) return toast('Tira prima l\'iniziativa.', 'err');
  let turn = (st.turn || 0) + 1, round = st.round || 1;
  if (turn >= init.length) { turn = 0; round++; await resetMoves(); say(store, 'Master', 'event', `Inizia il round ${round}.`); }
  await setCampaignState(store, { turn, round });
}
async function hpDialog(title) {
  return ask({ title, ok: 'Applica', fields: [{ name: 'n', label: 'Quantità', type: 'number', value: 1, min: 0, required: true }, { name: 'k', label: 'Effetto', type: 'select', value: 'dmg', options: [{ v: 'dmg', l: 'Danni' }, { v: 'heal', l: 'Cura' }] }] });
}

/* ---------- azioni (click) ---------- */
const selEnt = () => (S.sel?.kind === 'entity' ? store.entities.find(e => e.id === S.sel.id) : null);
const selChar = () => (S.sel?.kind === 'char' ? store.characters.find(c => c.id === S.sel.id) : null);

const acts = {
  'copy-code': () => copyText(store.campaign.code),
  leave: () => { localStorage.removeItem('dnd.master'); location.href = 'index.html'; },
  tab: d => { S.tab = d.t; render(); },
  tool: d => { S.tool = { t: d.t, v: d.v }; S.moving = false; render(); },
  'zoom-in': () => board.zoom(0.8), 'zoom-out': () => board.zoom(1.25), fit: () => board.fit(),
  'sel-clear': () => { S.sel = null; S.moving = false; render(); },

  'room-open': d => { S.roomId = d.id; S.sel = null; render(); },
  'room-new': async () => {
    const v = await roomDialog(); if (!v) return;
    const cols = v.cols ?? 14, rows = v.rows ?? 10;
    const r = await insert(store, 'rooms', { campaign_id: cid, name: v.name.trim(), notes: v.notes, cols, rows, fog: v.fog, cells: v.walls ? frame(cols, rows) : {}, meta: { start: { col: 1, row: 1 } }, sort: Math.max(0, ...store.rooms.map(x => x.sort)) + 1 });
    S.roomId = r.id; render();
  },
  'room-edit': async () => {
    const r = room(); const v = await roomDialog(r); if (!v) return;
    const cols = v.cols ?? r.cols, rows = v.rows ?? r.rows;
    const cells = Object.fromEntries(Object.entries(r.cells).filter(([k]) => { const [c, y] = k.split(',').map(Number); return c < cols && y < rows; }));
    await update(store, 'rooms', r.id, { name: v.name.trim(), notes: v.notes, cols, rows, fog: v.fog, cells });
  },
  'room-gen': async () => { const r = room(); await createGenerated(1, r && r.meta?.start ? (await confirmBox('Collegare la nuova stanza a «' + r.name + '» con una porta?', 'Sì, collega')) ? r : null : null); },
  'room-dungeon': async () => {
    const v = await ask({ title: 'Dungeon casuale', ok: 'Genera', intro: 'Crea una catena di stanze collegate da porte, con mostri, tesori, trappole e quest.', fields: [{ name: 'n', label: 'Numero di stanze', type: 'number', value: 4, min: 2, max: 8 }] });
    if (v) await createGenerated(v.n ?? 4, null);
  },
  'room-fill': () => fillRoom(room()),
  'room-clear': async () => { const r = room(); if (await confirmBox('Eliminare tutti i mostri, tesori, trappole e porte di questa stanza?', 'Svuota')) { for (const e of entsIn(r)) await remove(store, 'entities', e.id); S.sel = null; } },
  'room-del': async () => {
    const r = room(); if (!(await confirmBox(`Eliminare la stanza «${r.name}»?`, 'Elimina'))) return;
    store.characters.forEach(c => { if (c.room_id === r.id) c.room_id = null; }); store.entities = store.entities.filter(e => e.room_id !== r.id);
    await remove(store, 'rooms', r.id); S.roomId = null; S.sel = null; render();
  },
  'party-here': async () => {
    const r = room(); const start = r.meta?.start || { col: 1, row: 1 };
    const spots = [start, ...hexRing(r, start)].filter(h => !entsIn(r).some(e => e.kind === 'monster' && !e.data.dead && e.col === h.col && e.row === h.row));
    let i = 0; for (const c of store.characters) { const h = spots[i++] || start; await update(store, 'characters', c.id, { room_id: r.id, col: h.col, row: h.row, move_left: hexesFor(c.speed) }); }
    toast('Gruppo spostato in «' + r.name + '»');
  },

  'place-monster': () => { const p = BESTIARY.find(x => x.id === S.pick.monster); placeFrom(p.nome, monsterFromPreset(p)); },
  'custom-monster': async () => { const t = await monsterDialog(); if (t) placeFrom(t.name, t); },
  'random-monster': () => setPlace('mostro casuale', () => randomMonster(partyLevel())),
  'custom-treasure': async () => { const t = await treasureDialog(); if (t) placeFrom(t.name, t); },
  'random-treasure': () => setPlace('tesoro casuale', () => randomTreasure(partyLevel())),
  'place-trap': () => { const p = TRAPS.find(x => x.id === S.pick.trap); setPlace(p.nome, () => trapFromPreset(p, partyLevel())); },
  'custom-trap': async () => { const t = await trapDialog(); if (t) placeFrom(t.name, t); },
  'random-trap': () => setPlace('trappola casuale', () => randomTrap(partyLevel())),
  'custom-door': async () => { const t = await doorDialog(); if (t) placeFrom(t.name, t); },

  'quest-new': async () => { const q = await questDialog(); if (q) await insert(store, 'quests', { campaign_id: cid, ...q }); },
  'quest-gen': async () => { const q = randomQuest(partyLevel()); await insert(store, 'quests', { campaign_id: cid, title: q.title, kind: q.kind, data: q.data }); toast('Quest creata: assegnala a una porta' + (q.needsKey ? ' e metti da qualche parte una «Chiave di ferro» in un tesoro' : '')); },
  'quest-edit': async d => { const q = store.quests.find(x => x.id === d.id); const v = await questDialog(q); if (v) await update(store, 'quests', q.id, v); },
  'quest-del': async d => { if (await confirmBox('Eliminare questa quest?', 'Elimina')) { for (const e of store.entities.filter(x => x.kind === 'door' && x.data.quest_id === d.id)) await update(store, 'entities', e.id, { data: { ...e.data, quest_id: null } }); await remove(store, 'quests', d.id); } },

  'ent-edit': async () => {
    const e = selEnt(); if (!e) return;
    const t = await ({ monster: monsterDialog, treasure: treasureDialog, trap: trapDialog, door: doorDialog }[e.kind])(e); if (!t) return;
    await update(store, 'entities', e.id, { name: t.name, hidden: t.hidden, data: t.data });
  },
  'ent-reveal': () => { const e = selEnt(); return update(store, 'entities', e.id, { hidden: !e.hidden }); },
  'ent-move': () => { S.moving = true; render(); },
  'ent-del': async () => { const e = selEnt(); if (e && await confirmBox(`Eliminare «${e.name}»?`, 'Elimina')) { S.sel = null; await remove(store, 'entities', e.id); } },
  'trap-arm': () => { const e = selEnt(); return update(store, 'entities', e.id, { data: { ...e.data, armed: e.data.armed === false } }); },
  'door-lock': () => { const e = selEnt(); return update(store, 'entities', e.id, { data: { ...e.data, locked: !e.data.locked } }); },
  'mon-hp': async () => {
    const e = selEnt(); const v = await hpDialog(`${e.name}: danni o cura`); if (!v) return;
    if (v.k === 'dmg') { const r = await damageEntity(store, e, v.n); say(store, 'Master', 'combat', `${e.name} subisce ${v.n} danni${r.dead ? ' ed è sconfitto' : ''}.`); }
    else await update(store, 'entities', e.id, { data: { ...e.data, hp: Math.min(e.data.maxHp, e.data.hp + v.n), dead: false } });
  },
  'mon-turn': () => monsterAutoTurn(store, room(), selEnt()),
  'mon-atk': async () => { const c = store.characters.find(x => x.id === $('#insp-target')?.value); if (c) await monsterAttack(store, selEnt(), c); },

  'char-sel': d => { S.sel = { kind: 'char', id: d.id }; const c = store.characters.find(x => x.id === d.id); if (c?.room_id) S.roomId = c.room_id; render(); },
  'char-hp': async () => {
    const c = selChar(); const v = await hpDialog(`${c.name}: danni o cura`); if (!v) return;
    if (v.k === 'dmg') { const r = await damageChar(store, c, v.n); say(store, 'Master', 'combat', `${c.name} subisce ${v.n} danni${r.down ? ' ed è a terra' : ''}.`); }
    else { await healChar(store, c, v.n); say(store, 'Master', 'event', `${c.name} recupera ${v.n} PF.`); }
  },
  'char-edit': async () => {
    const c = selChar();
    const v = await ask({ title: `Modifica ${c.name}`, wide: true, fields: [
      { name: 'name', label: 'Nome', value: c.name, required: true }, { name: 'level', label: 'Livello', type: 'number', value: c.level, min: 1, max: 20 },
      { name: 'hp', label: 'PF attuali', type: 'number', value: c.hp, min: 0 }, { name: 'max_hp', label: 'PF massimi', type: 'number', value: c.max_hp, min: 1 },
      { name: 'ac', label: 'Classe armatura', type: 'number', value: c.ac }, { name: 'speed', label: 'Velocità (ft)', type: 'number', value: c.speed, min: 0, hint: '5 ft = 1 esagono' },
      ...STATS.map(([k, l]) => ({ name: 's_' + k, label: l, type: 'number', value: c.stats[k], min: 1, max: 30 })),
    ] });
    if (!v) return;
    const stats = Object.fromEntries(STATS.map(([k]) => [k, v['s_' + k] ?? c.stats[k]]));
    await update(store, 'characters', c.id, { name: v.name.trim(), level: v.level ?? c.level, hp: Math.min(v.hp ?? c.hp, v.max_hp ?? c.max_hp), max_hp: v.max_hp ?? c.max_hp, ac: v.ac ?? c.ac, speed: v.speed ?? c.speed, move_left: hexesFor(v.speed ?? c.speed), stats });
  },
  'char-reset': () => { const c = selChar(); return update(store, 'characters', c.id, { move_left: hexesFor(c.speed) }); },
  'char-here': () => { const c = selChar(); const r = room(); const s = r.meta?.start || { col: 1, row: 1 }; return update(store, 'characters', c.id, { room_id: r.id, col: s.col, row: s.row }); },
  'char-del': async () => { const c = selChar(); if (c && await confirmBox(`Rimuovere ${c.name} dalla campagna?`, 'Rimuovi')) { S.sel = null; await remove(store, 'characters', c.id); } },

  'init-roll': rollInit, 'init-next': nextTurn,
  'round-reset': async () => { await resetMoves(); toast('Movimento ripristinato per tutti'); },
  'init-clear': () => setCampaignState(store, { init: [], turn: 0, round: 1 }),
};

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = acts[b.dataset.act]; if (!fn) return;
  try { await fn(b.dataset, e); } catch (x) { err(x); }
});
document.addEventListener('change', e => { const p = e.target.dataset?.pick; if (p) S.pick[p] = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { S.tool = { t: 'select' }; S.moving = false; S.sel = null; render(); }
});

mountDiceTray($('#dice-tray'), { who: () => 'Master', say: (kind, text) => say(store, 'Master', kind, text), canSecret: true });
render();
