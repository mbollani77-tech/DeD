import { openCampaign, insert, update, remove, say, setCampaignState } from './db.js';
import { $, esc, toast, ask, confirmBox } from './ui.js';
import { createView } from './view.js';
import { openDungeonMap } from './dungeonmap.js';
import { mountDiceTray, roll, rollDie } from './dice.js';
import { STATS, STAT_NAME, RACES, CLASSES, WEAPONS, SPELLS, mod, prof, fmtMod, hexesFor, weaponCheck, spellCheck, maxMana, manaOf, spellCost } from './rules.js';
import { weaponAttack, castSpell, opportunityAttack, doAction, moveCharacter, passDoor, lootEntity, useItem, disarmTrap, attemptQuest, blockedSet, liveMonsters, markVisited, moveBudget } from './combat.js';
import { getEco, weaponSlot, spellSlot, isRogue } from './economia.js';
import { mountDicebar } from './dicebar.js';
import { setMood, onLog, moodFor, play, soundDialog, soundOn } from './sound.js';
import { talkTo, questsHtml, learnSpell } from './town.js';
import { enterOasi } from './oasi.js';
import { raccogli } from './alberi.js';
import { spendPoints } from './levelup.js';
import { runAutoMonsters, endTurn, skipTurn, partyLevel, startWatchdog, kickMonsters } from './engine.js';
import { startAdventure } from './adventure.js';
import { companionsOf, dismissCompanion, buildSheet, MAX_COMPANIONS } from './companions.js';
import { characterDialog } from './charcreate.js';
import { portraitOf, GENERI, GENERE_ICONA } from './portrait.js';
import { powerFor, powerBlocked, usePower } from './powers.js';
import { STATI, TIPI, statiOf, defenseList } from './status.js';
import { skillList, RACE_TRAITS, CLASS_FEATURES, racialBonus, checkBonus } from './skills.js';
import { dungeonWizard } from './wizard.js';
import { xpToNext } from './combat.js';
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
      play('step'); return busy(() => moveCharacter(store, ch, r, { col, row }, cost));
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
    S.reach = reachable(r, from, moveBudget(store, ch), blockedSet(store, r, { exceptChar: ch.id }));
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
  setTimeout(() => runAutoMonsters(store).catch(() => {}), 0); // se tocca a un mostro, gioca da solo (con il gioco cooperativo o i mostri automatici)
  const ch = me();
  if (S.meId && !ch) { S.meId = null; localStorage.removeItem('dnd.char.' + cid); }
  $('#chooser').hidden = !!ch;
  if (!ch) return renderChooser();
  const r = roomOf(ch);
  if (r && !(store.campaign.state?.visited || []).includes(r.id) && !asked.has(r.id)) { asked.add(r.id); markVisited(store, r.id); }
  // a ogni nuovo turno si riparte da «Muovi»: l'arma scelta nel turno prima non resta selezionata
  { const st = store.campaign.state || {}; const cur = (st.init || [])[st.turn || 0]; const tk = cur && cur.id === ch.id ? `${st.round || 1}:${st.turn || 0}:${cur.id}` : null; if (tk && S.modeTurn !== tk) { S.mode = { t: 'move' }; dicebar.cancel?.(); } if (tk) S.modeTurn = tk; }
  computeHL(ch, r);
  renderTop(ch); renderToolbar(r); renderInit(ch); renderBoard(ch, r); renderActionbar(ch); renderStatus(ch, r);
  if (!(document.activeElement?.tagName === 'SELECT' && $('#panel').contains(document.activeElement))) renderPanel(ch);
  renderLog();
  setMood(moodFor(store, r)); onLog(store.log); $('[data-act="sound"]')?.classList.toggle('on', soundOn());
}

function renderChooser() {
  const list = store.characters.filter(c => !c.data?.companion);
  $('#chooser').innerHTML = `<div class="panelbox"><h2>Chi giochi stasera?</h2><p class="muted">Campagna «${esc(store.campaign.name)}»</p>
    <ul class="list">${list.map(c => `<li><button class="row" data-act="pick-char" data-id="${c.id}"><strong><span class="mini-por">${portraitOf(c)}</span>${esc(c.name)}</strong><span class="muted">${esc(c.race)} ${esc(c.class)} di livello ${c.level}${c.player ? ', ' + esc(c.player) : ''}</span><span class="chip">${c.hp}/${c.max_hp} PF</span></button></li>`).join('') || '<li class="muted">Nessun personaggio ancora.</li>'}</ul>
    <p></p><button class="btn primary" data-act="new-char">Crea un nuovo personaggio</button> <a class="btn ghost" href="index.html">Esci</a></div>`;
}

function renderTop(ch) {
  const coop = !!store.campaign.state?.coop;
  $('#top').innerHTML = `<h1>${esc(store.campaign.name)}</h1><span class="top-por">${portraitOf(ch)}</span><span>${esc(ch.name)}</span><span class="sp"></span>${coop ? `<button class="btn sm" data-act="copy-code" title="Copia il codice da dare agli amici">Codice ${esc(store.campaign.code)}</button>` : ''}<span class="live ${store.status === 'SUBSCRIBED' ? 'ok' : ''}" title="${store.status === 'SUBSCRIBED' ? 'Collegato in tempo reale' : 'Connessione in corso'}"></span><button class="btn sm" data-act="switch-char">Cambia personaggio</button>`;
}
function renderToolbar(r) { const t = $('#toolbar'); t.innerHTML = r ? `<strong style="color:#e8efec">${esc(r.name)}</strong>` : ''; t.hidden = !r; }
function renderInit(ch) {
  const st = store.campaign.state || {}; const list = st.init || []; const el = $('#init'); el.hidden = false;
  if (!list.length) { el.innerHTML = '<span class="turn idle"><i></i><span>Nessuno scontro in corso</span></span><span class="rd">Muoviti e agisci liberamente: il Master tira l\'iniziativa quando inizia il combattimento.</span>'; S.lastTurn = null; return; }
  const cur = list[st.turn || 0]; const mine = cur?.id === ch.id; const mon = cur?.k === 'e';
  el.innerHTML = `<span class="turn ${mine ? 'mine' : mon ? 'mon' : 'pc'}"><i></i><span>${mine ? '<b>Tocca a te!</b>' : `Tocca a <b>${esc(cur?.name || '')}</b> <small>${mon ? 'mostro' : 'giocatore'}</small>`}</span></span><b class="rd">Round ${st.round || 1}</b>${mon ? '<button class="btn sm kick" data-act="kick" title="Se il mostro sembra fermo, fallo agire">⏩ Fai agire il mostro</button>' : ''}`
    + list.map((i, n) => `<span class="it ${n === (st.turn || 0) ? 'now' : ''} ${i.k === 'e' ? 'm' : ''}">${esc(i.name)} ${i.roll}${i.id === ch.id ? ' (tu)' : ''}</span>`).join('');
  const tk = `${st.round || 1}:${st.turn || 0}:${cur?.id}`; if (mine && S.lastTurn !== tk) toast('Tocca a te!'); S.lastTurn = tk;
}
function renderBoard(ch, r) {
  const empty = $('#empty'); empty.hidden = !!r; board.show(!!r);
  const vb = $('[data-act="view"]'); if (vb) vb.textContent = board.mode === '2d' ? '3D' : '2D';
  $('[data-act="mini"]')?.classList.toggle('on', board.miniOn);
  if (!r) { empty.innerHTML = store.campaign.state?.coop ? (store.rooms.length ? '<div class="fail-box"><h2>Un attimo…</h2><p>Il tuo personaggio sta per entrare nell\'avventura.</p><p class="muted">Se questa schermata non cambia entro un minuto, la creazione si è interrotta a metà: puoi cancellare le stanze e ricominciare da capo.</p><button class="btn" data-act="adv-reset">Cancella e ricomincia</button></div>' : '<div><h2>Inizia l\'avventura</h2><p>Scegli come sarà: il gioco crea mappa, mostri e tesori. Prima crea il tuo personaggio (e gli amici possono unirsi col codice in alto).</p><button class="btn primary" data-act="adv-start">Crea l\'avventura</button></div>') : '<div><h2>Aspetta il Master</h2><p>Il tuo personaggio non è ancora in nessuna stanza.</p></div>'; return; }
  board.render({ room: r, role: 'player', meId: ch.id, entities: store.entities.filter(e => e.room_id === r.id && !e.hidden), characters: store.characters.filter(c => c.room_id === r.id), hl: S.hl, turnId: (store.campaign.state?.init || [])[store.campaign.state?.turn || 0]?.id, visible: visibleSet(r) });
}
/** Tutto ciò con cui si può interagire qui vicino: tesori, bottini, abitanti, alberi, oasi, porte, trappole. Entro 8 esagoni; più lontano non compare. */
function interactions(ch, r) {
  if (!r || ch.hp <= 0) return [];
  const from = { col: ch.col, row: ch.row }; const out = []; let reach = null;
  const near = e => { if (dist(ch, e) <= 1) return 0; reach ||= reachable(r, from, moveBudget(store, ch), blockedSet(store, r, { exceptChar: ch.id })); let best = null; for (const [k, cost] of reach) { const [col, row] = k.split(',').map(Number); if (dist({ col, row }, e) <= 1 && (best === null || cost < best)) best = cost; } return best; };
  for (const e of store.entities.filter(x => x.room_id === r.id && !x.hidden && dist(ch, x) <= 8)) {
    const d = e.data || {}; const dd = dist(ch, e); let it = null;
    if (e.kind === 'treasure' && !d.looted) it = d.locked ? { icon: '🔒', title: e.name, sub: 'chiuso: tenta di aprirlo', act: 'door' } : { icon: '📦', title: `Apri ${e.name}`, sub: 'tesoro', act: 'loot' };
    else if (e.kind === 'monster' && d.dead && d.loot && !d.looted) it = { icon: '💀', title: `Saccheggia ${e.name}`, sub: 'bottino', act: 'loot' };
    else if (e.kind === 'trap' && d.armed !== false && dd <= 1) it = { icon: '🪤', title: `Disarma ${e.name}`, sub: `CD ${d.disarm}`, act: 'disarm' };
    else if (e.kind === 'npc') it = { icon: '💬', title: `Parla con ${e.name}`, sub: ({ locanda: 'locanda e ingaggi', negozio: 'negozio', voci: 'voci e incarichi', prigioniero: 'prigioniero', viandante: 'viandante' })[d.role] || 'abitante', act: 'talk', primary: true };
    else if (e.kind === 'door' && d.place === 'albero') it = { icon: d.icon || '🍎', title: 'Raccogli i frutti', sub: e.name, act: 'raccogli', primary: true };
    else if (e.kind === 'door' && d.place === 'oasi') it = { icon: d.icon || '⛲', title: "Entra nell'oasi", sub: `${e.name} · tira il d20`, act: 'enter-oasi', primary: true };
    else if (e.kind === 'door') {
      if (d.waiting) it = { icon: '🔒', title: e.name, sub: 'sigillata fino al prossimo dungeon finito', act: null };
      else if (d.locked) it = { icon: '🚪', title: e.name, sub: d.quest_id ? 'bloccata: tenta di aprirla' : 'bloccata (decide il Master)', act: d.quest_id ? 'door' : null };
      else if (d.target_room && dd <= 3) it = { icon: d.icon || '🚪', title: `Attraversa ${e.name}`, sub: 'porta', act: 'pass', primary: true };
    }
    if (!it) continue;
    const cost = it.act ? near(e) : null; out.push({ ...it, e, d: dd, cost, off: !it.act || cost === null });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, 6);
}
const interHtml = (ch, r) => {
  const list = interactions(ch, r); if (!list.length) return '';
  return `<div class="grp"><h4>Interazioni</h4>${list.map(i => { const far = i.d > 1; return `<button class="btn inter ${i.primary ? 'primary' : ''}" data-act="${far ? 'go-do' : i.act}" data-id="${i.e.id}" ${far ? `data-do="${i.act}"` : ''} ${i.off ? 'disabled' : ''} title="${esc(i.title + ' — ' + i.sub)}"><span class="ic">${i.icon}</span><span class="tx"><b>${esc(i.title)}</b><small>${esc(i.sub)}${far ? (i.off ? ` · a ${i.d} esagoni, troppo lontano` : ` · a ${i.d} esagoni: ti avvicini e lo fai`) : ''}</small></span></button>`; }).join('')}</div>`;
};

function renderActionbar(ch) {
  const el = $('#actionbar'); el.hidden = false;
  const m = S.mode; const e = getEco(ch);
  const slotTag = s => ({ extra: 'attacco extra', bonus: 'azione bonus' }[s] || '');
  const mode = (cls, on, attrs, label, sub = '', off = false) => `<button class="btn ${cls} ${on ? 'on' : ''}" data-act="mode" ${attrs} ${off ? 'disabled' : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  const act = (w, label, off, title) => `<button class="btn" data-act="act" data-w="${w}" ${off ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
  const pip = (name, used, what) => `<div class="pip ${used ? 'used' : ''}" title="${esc(what || 'libera')}"><b>${name}</b>${used ? 'usata' : 'libera'}</div>`;
  const armi = (ch.data.armi || []).map((w, i) => { const sl = weaponSlot(ch, w, i); const wc = weaponCheck(ch, w); return mode('weapon', m.t === 'weapon' && m.i === i, `data-t="weapon" data-i="${i}"`, esc(w.nome), wc.ok ? `${esc(w.dado)}${slotTag(sl) ? ' · ' + slotTag(sl) : ''}${wc.prof ? '' : ' · non competente'}` : esc(wc.why), !sl || !wc.ok); }).join('');
  const magie = (ch.data.magie || []).map((s, i) => { const sl = spellSlot(ch, s); const sc = spellCheck(ch, s); const cost = spellCost(s); const lowMana = manaOf(ch) < cost; return mode('spell', m.t === 'spell' && m.i === i, `data-t="spell" data-i="${i}"`, esc(s.nome), sc.ok ? (lowMana ? `mana insufficiente (${cost})` : `${s.livello ? 'liv. ' + s.livello : 'trucchetto'} · ${cost} mana${sl === 'bonus' ? ' · bonus' : ''}`) : esc(sc.why), !sl || !sc.ok || lowMana); }).join('');
  const stati = [e.atk > 0 ? `<span class="chip gold">+${e.atk} attacchi</span>` : '', e.schiva ? '<span class="chip">Schivata</span>' : '', e.disimp ? '<span class="chip">Disimpegno</span>' : '', e.aiuto ? '<span class="chip gold">Aiutato</span>' : ''].join('');
  const mx = maxMana(ch); const mn = manaOf(ch);
  const manaBar = mx ? `<div class="manabar" title="Mana: ${mn} su ${mx}"><span>Mana</span><div><i style="width:${Math.round(mn / mx * 100)}%"></i></div><b>${mn}/${mx}</b></div>` : '';
  const st = store.campaign.state || {}; const fight = (st.init || []).length > 0; const curT = fight ? st.init[st.turn || 0] : null;
  const turnGrp = fight && curT ? (curT.id === ch.id ? '<div class="grp"><h4>Turno</h4><button class="btn primary big" data-act="end-turn">Fine turno ▶</button></div>' : `<div class="grp"><h4>Turno</h4><p class="muted small">Tocca a <b>${esc(curT.name)}</b></p>${st.coop && curT.k === 'c' ? '<button class="btn sm" data-act="skip-turn">Salta il suo turno</button>' : ''}</div>`) : '';
  el.innerHTML = `${turnGrp}<div class="grp"><h4>Round</h4><div class="pips">${pip('Azione', e.az, e.az)}${pip('Bonus', e.bo, e.bo)}${pip('Reaz.', e.re, e.re)}</div>${manaBar}${stati ? `<div class="states">${stati}</div>` : ''}</div>`
    + `<div class="grp"><h4>Movimento</h4>${mode('', m.t === 'move', 'data-t="move"', 'Muovi', `${moveBudget(store, ch)} / ${hexesFor(ch.speed)} esagoni`)}</div>`
    + interHtml(ch, roomOf(ch))
    + (armi ? `<div class="grp"><h4>Armi</h4>${armi}</div>` : '')
    + (magie ? `<div class="grp"><h4>Magie</h4>${magie}</div>` : '')
    + `<div class="grp"><h4>Azioni</h4><div class="two">${act('scatto', 'Scatta', e.az, 'Azione: raddoppia il movimento del round')}${act('schiva', 'Schiva', e.az, 'Azione: svantaggio a chi ti attacca, vantaggio ai tiri salvezza di Destrezza')}${act('disimp', 'Disimpegnati', e.az, 'Azione: ti muovi senza subire attacchi di opportunità')}${act('aiuto', 'Aiuta', e.az, 'Azione: il prossimo attacco di un compagno ha vantaggio')}</div></div>`
    + (() => { const pw = powerFor(ch); if (!pw) return ''; const why = powerBlocked(store, ch); return `<div class="grp"><h4>Potere unico</h4><button class="btn power" data-act="power" ${why ? 'disabled' : ''} title="${esc(pw.riassunto + (why ? ' — ' + why : ''))}">${esc(pw.nome)}<small>${why ? esc(why) : 'azione bonus · una volta per scontro'}</small></button></div>`; })()
    + (isRogue(ch) ? `<div class="grp"><h4>Azione bonus</h4><div class="two">${act('scaltra-scatto', 'Scatta', e.bo, 'Azione scaltra del Ladro')}${act('scaltra-disimp', 'Disimpegnati', e.bo, 'Azione scaltra del Ladro')}</div></div>` : '')
    + `<div class="grp"><h4>Reazione</h4>${mode('', m.t === 'reaz', 'data-t="reaz"', 'Attacco di opportunità', '', !!e.re)}</div>`
    + `<div class="grp"><h4>Tiro</h4><select data-pick="adv" aria-label="Vantaggio o svantaggio"><option value="" ${!S.adv ? 'selected' : ''}>Tiro normale</option><option value="adv" ${S.adv === 'adv' ? 'selected' : ''}>Vantaggio</option><option value="dis" ${S.adv === 'dis' ? 'selected' : ''}>Svantaggio</option></select></div>`;
}
function renderStatus(ch, r) {
  const a = currentAction(ch); let t;
  if (ch.hp <= 0) t = 'Sei a terra. Il Master o un alleato può aiutarti.';
  else if (S.mode.t === 'reaz') t = 'Reazione: clicca un mostro adiacente per l\'attacco di opportunità (arma da mischia migliore).';
  else if (S.mode.t === 'move') t = `Muovi: ${moveBudget(store, ch)} esagoni disponibili (${moveBudget(store, ch) * 5} ft). Il terreno difficile e l'acqua costano doppio.`;
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
  const ab = ([k, l]) => { const mm = mod(ch.stats[k]); const rb = racialBonus(ch.data.raceId, k); return `<div class="ab ${rb ? 'rb' : ''}" title="${l} ${ch.stats[k]}${rb ? ` (di cui +${rb} dalla razza)` : ''}"><span>${l.slice(0, 3).toUpperCase()}${rb ? `<u>+${rb}</u>` : ''}</span><b class="${mm < 0 ? 'neg' : ''}">${fmtMod(mm)}</b><small>${ch.stats[k]}</small></div>`; };
  return `<div class="sheet"><div class="sheet-head"><div class="sheet-por">${portraitOf(ch)}</div><div><h2>${esc(ch.name)}</h2><p class="muted">${esc(ch.race)} ${esc(ch.class)} · livello ${ch.level}${ch.player ? ` · ${esc(ch.player)}` : ''}</p>${ch.data.genere ? `<p class="muted">${GENERE_ICONA[ch.data.genere]} ${GENERI[ch.data.genere]}</p>` : `<p class="muted">Genere: <span class="seg">${Object.entries(GENERI).map(([k, l]) => `<button type="button" class="seg-b" data-act="set-genere" data-g="${k}">${GENERE_ICONA[k]} ${l}</button>`).join('')}</span></p>`}</div></div>
  <div class="hp"><span>PF</span>${meter(ch.hp, ch.max_hp)}<em>${ch.hp} / ${ch.max_hp}</em></div>
  ${maxMana(ch) ? `<div class="hp mana"><span>Mana</span><div class="manameter"><i style="width:${Math.round(manaOf(ch) / maxMana(ch) * 100)}%"></i></div><em>${manaOf(ch)} / ${maxMana(ch)}</em></div>` : ''}
  ${(() => { const st = statiOf(ch); return st.length ? `<div class="statuses">${st.map(s => { const d = STATI[s.id]; return `<span class="stato" title="${esc(d.desc + (d.cura ? ' Cura: ' + d.cura + '.' : ''))}">${d.icona} ${esc(d.nome)}${s.id === 'resistenza' ? ' al ' + esc((TIPI[s.tipo] || [''])[0].toLowerCase()) : ''}<small>${s.turni >= 99 ? 'finché non guarisci' : s.turni + (s.turni === 1 ? ' turno' : ' turni')}</small></span>`; }).join('')}</div>` : ''; })()}
  <div class="vitals"><div class="vital"><b>${ch.ac}</b><span>CA</span></div><div class="vital"><b>${ch.speed}<small>ft</small></b><span>${hexesFor(ch.speed)} esagoni</span></div><div class="vital"><b>${fmtMod(pb)}</b><span>Competenza</span></div><div class="vital"><b>${fmtMod(mod(ch.stats.des))}</b><span>Iniziativa</span></div></div>
  <div class="abilities">${STATS.map(ab).join('')}</div>
  ${(() => { const sk = skillList(ch); const pr = sk.filter(x => x.prof); return `<details class="skills" open><summary>Abilità <span class="muted">(${pr.length} competenze)</span></summary><div class="sk-prof">${pr.map(x => `<span class="sk on" title="${esc(x.nome)}: ${STAT_NAME[x.stat]} + competenza">${esc(x.nome)} <b>${fmtMod(x.bonus)}</b></span>`).join('')}</div><details class="sk-all"><summary>Tutte le abilità</summary><div class="sk-list">${sk.filter(x => !x.prof).map(x => `<span class="sk">${esc(x.nome)} <b>${fmtMod(x.bonus)}</b></span>`).join('')}</div></details></details>`; })()}
  ${(() => { const pw = powerFor(ch); return pw ? `<div class="card power-card"><strong>⚡ ${esc(pw.nome)}</strong><p>${esc(pw.riassunto)}</p></div>` : ''; })()}
  ${(() => { const t = [...(RACE_TRAITS[ch.data.raceId] || []).map(x => ['race', ...x]), ...(CLASS_FEATURES[ch.data.classId] || []).map(x => ['cls', ...x])]; return t.length ? `<details class="talents"><summary>Talenti di razza e classe</summary><ul>${t.map(([w, n, d]) => `<li class="${w}"><b>${esc(n)}</b> <span class="muted">${esc(d)}</span></li>`).join('')}</ul></details>` : ''; })()}
  ${(() => { const df = defenseList(ch); return df.length ? `<div class="defs">${df.map(x => `<span class="def ${x.k}" title="da: ${esc(x.da)}">${x.icona} ${esc(x.testo)}<small>${esc(x.da)}</small></span>`).join('')}</div>` : ''; })()}
  <p class="castline">Esperienza: ${ch.data.xp || 0} PE${xpToNext(ch.level) ? ` · prossimo livello a ${xpToNext(ch.level)} PE` : ' · livello massimo'}</p>
  ${(() => { const cs = companionsOf(store, ch); return cs.length ? `<div class="card"><strong>Compagni (${cs.length}/${MAX_COMPANIONS})</strong><ul class="comps">${cs.map(c => `<li><span class="mini-por">${portraitOf(c)}</span><span><b>${esc(c.name)}</b> · ${esc(c.class)} liv. ${c.level}<small>PF ${c.hp}/${c.max_hp}${maxMana(c) ? ` · mana ${manaOf(c)}/${maxMana(c)}` : ''}${c.hp <= 0 ? ' · a terra' : ''}</small></span><button class="btn sm danger" data-act="dismiss-comp" data-id="${c.id}">Congeda</button></li>`).join('')}</ul></div>` : ''; })()}
  ${(ch.data.punti || 0) > 0 ? `<div class="card"><strong>${ch.data.punti} ${ch.data.punti === 1 ? 'punto' : 'punti'} caratteristica da spendere</strong><div class="btnrow"><button class="btn sm primary" data-act="spend-points">Distribuisci</button></div></div>` : ''}
  ${cast ? `<p class="castline">Magia: ${STAT_NAME[cast]} · CD ${8 + pb + mod(ch.stats[cast])}</p>` : ''}
  ${ch.data.note ? `<div class="card"><strong>Note</strong><p>${esc(ch.data.note)}</p></div>` : ''}
  </div>`;
}
function tabArmi(ch) {
  const pb = prof(ch.level); const cm = mod(ch.stats[ch.data.cast || 'int']);
  const wstat = w => (w.stat === 'fin' ? (ch.stats.des >= ch.stats.for ? 'des' : 'for') : w.stat);
  const wcOf = w => weaponCheck(ch, w), scOf = s => spellCheck(ch, s);
  return `<div class="stack"><h3>Armi</h3><ul class="list">${(ch.data.armi || []).map((w, i) => `<li><div class="card"><strong>${esc(w.nome)}</strong> ${wcOf(w).ok ? '' : `<span class="chip red">${esc(wcOf(w).why)}</span>`}${wcOf(w).prof ? '' : '<span class="chip">non competente</span>'}<p class="muted">${fmtMod(mod(ch.stats[wstat(w)]) + (wcOf(w).prof ? pb : 0))} per colpire, danni ${esc(w.dado)}${fmtMod(mod(ch.stats[wstat(w)]))}, gittata ${w.gittata} ft (${hexesFor(w.gittata)} esagoni)</p><button class="btn sm danger" data-act="del-weapon" data-i="${i}">Rimuovi</button></div></li>`).join('') || '<li class="muted">Nessuna arma.</li>'}</ul>
  <button class="btn" data-act="add-weapon">Aggiungi arma</button>
  <h3>Magie</h3><ul class="list">${(ch.data.magie || []).map((s, i) => `<li><div class="card"><strong>${esc(s.nome)}</strong> <span class="chip">${s.livello ? 'livello ' + s.livello : 'trucchetto'}</span> <span class="chip gold">${spellCost(s)} mana</span>${scOf(s).ok ? '' : ` <span class="chip red">${esc(scOf(s).why)}</span>`}<p class="muted">${{ attacco: 'Tiro per colpire ' + fmtMod(cm + pb), salvezza: 'Salvezza ' + (STAT_NAME[s.salva || 'des'] || '') + ' CD ' + (8 + pb + cm), auto: 'Colpisce sempre', cura: 'Cura' }[s.tipo]}, ${esc(s.dado)}, gittata ${s.gittata} ft (${hexesFor(s.gittata)} esagoni)${s.area ? `, raggio ${s.area} ft` : ''}</p><button class="btn sm danger" data-act="del-spell" data-i="${i}">Rimuovi</button></div></li>`).join('') || '<li class="muted">Nessuna magia.</li>'}</ul>
  <button class="btn" data-act="add-spell">Aggiungi magia</button></div>`;
}
function tabZaino(ch) {
  const items = ch.data.oggetti || [];
  return `<div class="stack"><div class="card"><strong>Monete d'oro:</strong> ${ch.data.oro || 0}</div>${questsHtml(store)}
  <ul class="list">${items.map((o, i) => `<li><div class="card"><strong>${esc(o.nome)}</strong><p class="muted">${esc(o.desc || '')}</p>${(o.cura || o.rimedio || o.resTemp || o.mana) ? `<button class="btn sm primary" data-act="use-item" data-i="${i}">Usa${o.cura ? ` (${esc(o.cura)})` : ''}</button> ` : ''}${o.magia ? `<button class="btn sm primary" data-act="learn-spell" data-i="${i}">Impara la magia</button> ` : ''}<button class="btn sm danger" data-act="drop-item" data-i="${i}">Getta</button></div></li>`).join('') || '<li class="muted">Lo zaino è vuoto.</li>'}</ul></div>`;
}

const ICON = { combat: '⚔️', event: '✦', roll: '🎲' };
function renderLog() {
  const ul = $('#log'); const rows = [...store.log].filter(l => l.kind !== 'secret').slice(-40);
  const near = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 40; // se si stava leggendo più su, non si salta in fondo
  ul.innerHTML = rows.map(l => `<li class="${esc(l.kind)}"><span class="ic">${ICON[l.kind] || '·'}</span>${esc(l.text)}</li>`).join('') || '<li class="muted">Qui compaiono tiri, attacchi ed eventi.</li>';
  if (near) ul.scrollTop = ul.scrollHeight;
}

/* ---------- creazione e modifica personaggio ---------- */
async function createCharacter() {
  const saved = JSON.parse(localStorage.getItem('dnd.lastPlayer') || '""');
  const others = store.characters.filter(c => !c.data?.companion);
  const level = others.length ? Math.min(10, Math.max(1, Math.round(others.reduce((a, c) => a + c.level, 0) / others.length))) : 1; // chi arriva dopo parte al livello del gruppo
  const v = await characterDialog({ saved, level });
  if (!v) return;
  localStorage.setItem('dnd.lastPlayer', JSON.stringify(v.player || ''));
  const f = buildSheet({ name: v.name, genere: v.genere, raceId: v.raceId, classId: v.classId, level: v.level, base: v.base });
  const first = [...store.rooms].sort((a, b) => a.sort - b.sort)[0] || null;
  const spot = first ? freeSpot(first) : { col: 1, row: 1 };
  const ch = await insert(store, 'characters', { campaign_id: cid, player: v.player, ...f, room_id: first?.id || null, col: spot.col, row: spot.row, data: { ...f.data, oro: 10 + 25 * (v.level - 1) } });
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
    { name: 'dmg', label: 'Tipo di danno', type: 'select', value: 'arcano', options: Object.entries(TIPI).map(([k, [n]]) => ({ v: k, l: n })) },
    { name: 'meta', label: 'Danni dimezzati se il bersaglio supera la salvezza', type: 'checkbox', value: false },
    { name: 'livello', label: 'Livello (0 = trucchetto che cresce col livello)', type: 'number', value: 1, min: 0, max: 9 },
  ] });
  if (!v) return null;
  if (v.preset !== 'custom') return { ...SPELLS.find(s => s.id === v.preset) };
  if (!v.nome.trim()) throw new Error('Dai un nome alla magia.'); roll(v.dado);
  return { nome: v.nome.trim(), dado: v.dado.trim(), tipo: v.tipo, gittata: v.gittata ?? 60, area: v.area || 0, salva: v.salva, meta: v.meta, dmg: v.dmg || 'arcano', livello: v.livello ?? 1, mod: v.tipo === 'cura' };
}

async function questDialog(door) {
  const q = store.quests.find(x => x.id === door.data.quest_id); if (!q) return toast('Questa porta si apre solo con l\'intervento del Master.');
  const ch = me(); const d = q.data;
  const lead = `${d.prompt || ''}`;
  if (q.kind === 'riddle') {
    const v = await ask({ title: q.title, ok: 'Rispondi', intro: esc(lead), fields: [{ name: 'a', label: 'La tua risposta', required: true }] });
    if (v) await attemptQuest(store, ch, door, q, v.a);
  } else if (q.kind === 'check') {
    const v = await ask({ title: q.title, ok: 'Tira il d20', intro: esc(lead) + `<br><br>Prova di <b>${STAT_NAME[d.stat] || ''}</b> (CD ${d.dc}). Il tuo bonus è ${fmtMod(checkBonus(ch, d.stat || 'des'))}.` });
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
  sound: () => soundDialog().then(render),
  'zoom-in': () => board.zoom(0.8), 'zoom-out': () => board.zoom(1.25), fit: () => board.fit(),
  view: async () => { await board.set(board.mode === '2d' ? '3d' : '2d'); render(); },
  dmap: () => openDungeonMap({ store, role: 'player', currentRoomId: me()?.room_id }),
  loot: d => busy(() => lootEntity(store, me(), ent(d.id))),
  talk: d => busy(() => talkTo(store, me(), ent(d.id))),
  'spend-points': () => busy(() => spendPoints(store, me())),
  kick: () => busy(() => kickMonsters(store)),
  'go-do': d => busy(async () => {
    const ch = me(), r = roomOf(ch), e = ent(d.id); if (!e || !r) return;
    const reach = reachable(r, { col: ch.col, row: ch.row }, moveBudget(store, ch), blockedSet(store, r, { exceptChar: ch.id }));
    let best = null; for (const [k, cost] of reach) { const [col, row] = k.split(',').map(Number); if (dist({ col, row }, e) <= 1 && (!best || cost < best.cost)) best = { col, row, cost }; }
    if (!best) throw new Error('Non ci arrivi con il movimento che hai: avvicinati ancora.');
    await moveCharacter(store, ch, r, best, best.cost);
    const c2 = me(); if (!c2 || c2.room_id !== ch.room_id || dist(c2, e) > 1 || c2.hp <= 0) return; // un incontro, una trappola o un passaggio hanno interrotto il percorso
    await acts[d.do]({ id: d.id });
  }),
  chron: () => { const c = $('#chron'); const closed = c.classList.toggle('closed'); localStorage.setItem('dnd.chron', closed ? '0' : '1'); $('[data-act="chron"]').textContent = closed ? 'Cronaca ▸' : 'Cronaca ▾'; $('[data-act="chron"]').setAttribute('aria-expanded', String(!closed)); },
  'adv-reset': () => busy(async () => {
    if (!(await confirmBox('Cancellare tutte le stanze di questa avventura e ricominciare? I personaggi restano.'))) return;
    for (const r of [...store.rooms]) await remove(store, 'rooms', r.id);
    for (const c of store.characters) await update(store, 'characters', c.id, { room_id: null });
    await setCampaignState(store, { dungeons: {}, completed: 0, init: [], config: null }); render();
  }),
  'adv-start': () => busy(async () => {
    if (store.rooms.length) return;
    const cfg = await dungeonWizard({ level: partyLevel(store), party: Math.max(2, store.characters.length || 3) }); if (!cfg || store.rooms.length) return;
    await startAdventure(store, cfg, { toast });
  }),
  power: () => busy(() => usePower(store, me())),
  'end-turn': () => { S.mode = { t: 'move' }; return busy(() => endTurn(store, me())); },
  'skip-turn': () => busy(() => skipTurn(store)),
  'copy-code': () => navigator.clipboard?.writeText(store.campaign.code).then(() => toast('Codice copiato')).catch(() => toast(store.campaign.code)),
  'dismiss-comp': d => busy(async () => { const c = store.characters.find(x => x.id === d.id); if (c && await confirmBox(`Congedare ${c.name}? Se ne va per la sua strada.`, 'Congeda')) await dismissCompanion(store, c); }),
  raccogli: d => busy(() => raccogli(store, me(), ent(d.id))),
  'set-genere': d => busy(() => { const c = me(); return update(store, 'characters', c.id, { data: { ...c.data, genere: d.g } }); }),
  'enter-oasi': d => busy(() => enterOasi(store, me(), ent(d.id))),
  'learn-spell': d => busy(() => learnSpell(store, me(), +d.i)),
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
startWatchdog(store); // i turni dei mostri non restano mai fermi
if (localStorage.getItem('dnd.chron') === '0') { $('#chron').classList.add('closed'); const b = $('[data-act="chron"]'); b.textContent = 'Cronaca ▸'; b.setAttribute('aria-expanded', 'false'); }
