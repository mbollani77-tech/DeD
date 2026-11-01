// Creazione guidata del dungeon: il Master sceglie tra esempi e configurazioni, nessuno disegna stanze da zero.
import { esc } from './ui.js';
import { BESTIARY } from './rules.js';
import { DENSITY, DIFFICULTY, generateRoom, bossFromPreset } from './random.js';
import { generateWorld } from './world.js';
import { roomThumb } from './board.js';

export const TEMPLATES = [
  { id: 'cripta', icon: '☠️', nome: 'Cripta dei non morti', desc: 'Scheletri, zombi e ghoul tra tombe e ossari. Atmosfera cupa e silenziosa.',
    themes: ['cripta'], pool: ['scheletro', 'zombi', 'ghoul', 'ratto'], boss: 'ghoul', def: { n: 6, size: 'medie', diff: 'normale', monsters: 'normali', treasure: 'normali', traps: 'normali', locks: 'normali' } },
  { id: 'goblin', icon: '🗡️', nome: 'Tana dei goblin', desc: 'Una caverna piena di goblin, coboldi e lupi, con un bugbear a comandare. Adatta a chi comincia.',
    themes: ['caverna'], pool: ['goblin', 'goblin-arciere', 'coboldo', 'lupo', 'ratto'], boss: 'bugbear', def: { n: 5, size: 'piccole', diff: 'facile', monsters: 'molti', treasure: 'normali', traps: 'poche', locks: 'rare' } },
  { id: 'tempio', icon: '🏛️', nome: 'Tempio perduto', desc: 'Sale antiche con trappole, porte sigillate, tesori e qualche mimic traditore.',
    themes: ['tempio', 'cripta'], pool: ['scheletro', 'gnoll', 'mimic', 'zombi'], boss: 'ogre', def: { n: 8, size: 'medie', diff: 'normale', monsters: 'normali', treasure: 'ricchi', traps: 'molte', locks: 'frequenti' } },
  { id: 'orchi', icon: '🪓', nome: 'Fortezza degli orchi', desc: 'Orchi, bugbear e ogre in grandi sale. Pochi scontri, ma duri.',
    themes: ['cripta', 'tempio'], pool: ['orco', 'bugbear', 'gnoll', 'ogre'], boss: 'troll', def: { n: 10, size: 'grandi', diff: 'difficile', monsters: 'normali', treasure: 'normali', traps: 'normali', locks: 'normali' } },
  { id: 'ghiaccio', icon: '❄️', nome: 'Grotta di ghiaccio', desc: 'Lupi, non morti congelati e un segugio infernale in una grotta gelida.',
    themes: ['ghiaccio'], pool: ['lupo', 'zombi', 'scheletro', 'segugio'], boss: 'ogre', def: { n: 6, size: 'medie', diff: 'normale', monsters: 'normali', treasure: 'normali', traps: 'poche', locks: 'normali' } },
  { id: 'bosco', icon: '🌲', nome: 'Bosco dei lupi', desc: 'Una radura maledetta: lupi, gnoll e coboldi, con un segugio infernale come capobranco.',
    themes: ['foresta'], pool: ['lupo', 'gnoll', 'coboldo', 'goblin-arciere', 'ratto'], boss: 'segugio', def: { n: 5, size: 'grandi', diff: 'normale', monsters: 'molti', treasure: 'scarsi', traps: 'poche', locks: 'rare' } },
  { id: 'misto', icon: '🎲', nome: 'Dungeon misto', desc: 'Stanze e mostri di ogni tipo, scelti a caso. Per sorprendere anche il Master.',
    themes: null, pool: null, boss: 'casuale', def: { n: 6, size: 'medie', diff: 'normale', monsters: 'normali', treasure: 'normali', traps: 'normali', locks: 'normali' } },
];

const LENGTHS = [[4, 'Breve', 'Una serata'], [8, 'Media', 'Due serate'], [15, 'Lunga', 'Una piccola campagna'], [30, 'Campagna', 'Molte sessioni'], [50, 'Epica', 'Il massimo']];
const SIZES = { piccole: ['Piccole', 'Circa 10–13 × 8–10 esagoni. Scontri ravvicinati.'], medie: ['Medie', 'Circa 12–17 × 9–12 esagoni. Il giusto equilibrio.'], grandi: ['Grandi', 'Circa 16–22 × 11–15 esagoni. Spazio per muoversi e per i tiratori.'] };
const DIFFS = { facile: ['Facile', 'Mostri più deboli (−20% PF). Per chi comincia o per gruppi piccoli.'], normale: ['Normale', 'Pensata per il livello del gruppo.'], difficile: ['Difficile', 'Mostri più forti (+25% PF, +1 al colpire) e uno in più per stanza.'], mortale: ['Mortale', '+50% PF, +2 al colpire, due in più per stanza. Solo per gruppi esperti.'] };
const DENS = { pochi: ['Pochi', '1–2 per stanza'], normali: ['Normali', '2–4 per stanza'], molti: ['Molti', '4–6 per stanza'], orda: ['Orda', '6–9 per stanza'] };
const TREAS = { scarsi: ['Scarsi', 'Una stanza su due ha un tesoro'], normali: ['Normali', 'Quasi sempre un tesoro'], ricchi: ['Ricchi', 'Due o tre tesori per stanza'] };
const TRAPS = { poche: ['Poche', '0–1 per stanza'], normali: ['Normali', '0–2 per stanza'], molte: ['Molte', '2–4 per stanza'] };
const LOCKS = { rare: ['Rare', 'Circa 1 porta su 4 è sigillata'], normali: ['Normali', 'Circa 6 porte su 10'], frequenti: ['Frequenti', 'Quasi tutte: servono enigmi, prove o chiavi'] };

const WSIZES = { piccolo: ['Piccolo', '32 × 22 esagoni, 2 paesi. Viaggi brevi.', 32, 22, 2, 1], medio: ['Medio', '40 × 28 esagoni, 3 paesi. Il giusto equilibrio.', 40, 28, 3, 2], grande: ['Grande', '56 × 38 esagoni, 5 paesi. Un vero viaggio.', 56, 38, 5, 4] };
const FREQS = { rare: ['Rari', 'Circa 1 tappa su 10 nel bosco, mai sulle strade'], normali: ['Normali', 'Circa 1 tappa su 7 nel bosco, 1 su 20 sulle strade'], frequenti: ['Frequenti', 'Circa 1 tappa su 5 nel bosco e 1 su 10 sulle strade'] };
const stepsOf = S => (S.mode === 'mondo' ? ['Struttura', 'Percorso', 'Mostri', 'Il mondo', 'Regole di gioco', 'Riepilogo'] : ['Struttura', 'Tema', 'Lunghezza', 'Mostri', 'Boss', 'Tesori e trappole', 'Regole di gioco', 'Riepilogo']);

/** Apre la procedura guidata. Restituisce la configurazione scelta, oppure null se annullata. */
export function dungeonWizard({ level = 1, party = 3 } = {}) {
  return new Promise(resolve => {
    const S = { step: 0, mode: 'singolo', tplId: 'cripta', auto: true, autoLoot: true, fog: false, bossOn: true, bossPick: 'tema', preview: null, levels: ['cripta', 'goblin', 'tempio', 'orchi', 'ghiaccio', 'bosco'], perLevel: 5, bossEach: true, wsize: 'medio', towns: 3, oases: 2, trees: 4, encounters: 'normali', world: null };
    const tpl = () => TEMPLATES.find(t => t.id === S.tplId);
    const applyTpl = t => { Object.assign(S, t.def); S.bossPick = 'tema'; S.preview = null; };
    applyTpl(tpl());

    const dlg = document.createElement('dialog'); dlg.className = 'dlg wide wz'; document.body.appendChild(dlg);
    let result = null;

    const bossId = () => (S.bossPick === 'tema' ? tpl().boss : S.bossPick);
    const bossPreset = () => BESTIARY.find(b => b.id === bossId());
    const card = (field, value, title, sub, icon = '') => `<button type="button" class="wz-card ${S[field] === value ? 'on' : ''}" data-set="${field}" data-val="${value}" aria-pressed="${S[field] === value}">${icon ? `<span class="wz-ico">${icon}</span>` : ''}<strong>${esc(title)}</strong><small>${esc(sub)}</small></button>`;
    const group = (field, map) => `<div class="wz-grid">${Object.entries(map).map(([k, [t, d]]) => card(field, k, t, d)).join('')}</div>`;
    const estimate = () => { const [lo, hi] = DENSITY[S.monsters]; const dd = DIFFICULTY[S.diff]; return Math.round(S.n * Math.max(1, (lo + hi) / 2 + dd.n + 0.5 + (party >= 4 && S.monsters !== 'pochi' ? 1 : 0))); };

    const body = () => {
      const t = tpl();
      switch (stepsOf(S)[S.step]) {
        case 'Struttura': return `<p class="muted">Come vuoi giocare? Nessuno disegna le stanze: scegli tra esempi e impostazioni, e il resto lo genero io.</p>
          <div class="wz-grid two">${card('mode', 'singolo', 'Un dungeon', 'Una catena di stanze collegate da porte, con mostri, tesori, trappole e un boss finale. Ideale per una serata.')}${card('mode', 'mondo', 'Campagna con mappa del mondo', 'Una mappa a esagoni con strade, boschi, fiumi e paesi (locanda, negozio, incarichi) e più dungeon da affrontare a livelli. Lungo il viaggio si incontrano mostri.')}</div>`;
        case 'Tema': return `<p class="muted">Parti da un esempio: sceglie lui i mostri, le ambientazioni e le impostazioni consigliate. Potrai cambiare tutto nei prossimi passi.</p>
          <div class="wz-grid big">${TEMPLATES.map(x => card('tplId', x.id, x.nome, x.desc, x.icon)).join('')}</div>`;
        case 'Lunghezza': return `<h3>Quante stanze?</h3><div class="wz-grid">${LENGTHS.map(([n, nome, d]) => `<button type="button" class="wz-card ${S.n === n ? 'on' : ''}" data-n="${n}"><strong>${nome} · ${n} stanze</strong><small>${d} (circa ${Math.max(1, Math.round(n * 20 / 60 * 10) / 10)} h)</small></button>`).join('')}</div>
          <div class="fld wz-num"><label for="wz-n">Oppure scegli il numero esatto (2–50)</label><input id="wz-n" type="number" min="2" max="50" value="${S.n}"></div>
          <h3>Quanto sono grandi le stanze?</h3>${group('size', SIZES)}`;
        case 'Mostri': return `<h3>Difficoltà</h3>${group('diff', DIFFS)}<h3>Quanti mostri per stanza?</h3>${group('monsters', DENS)}
          <p class="wz-note">In tutto circa <b>${estimate()}</b> mostri${t.pool ? `, scelti tra: ${t.pool.map(id => BESTIARY.find(b => b.id === id)?.nome).filter(Boolean).join(', ')}` : ', di ogni tipo'}. Il numero cresce un po' man mano che si scende.</p>`;
        case 'Boss': {
          const p = bossPreset(); const dd = DIFFICULTY[S.diff];
          const stats = p ? bossFromPreset(p, level, dd).data : null;
          return `<div class="wz-grid two">${card2('bossOn', true, 'Sì, un boss finale', 'Nell\'ultima stanza, con la sua scorta e un bottino ricco.')}${card2('bossOn', false, 'Nessun boss', 'L\'ultima stanza è come le altre, senza porta d\'uscita.')}</div>
          ${S.bossOn ? `<h3>Chi è il boss?</h3><div class="wz-grid">${t.boss !== 'casuale' ? card('bossPick', 'tema', `${BESTIARY.find(b => b.id === t.boss)?.nome} (consigliato)`, 'Adatto a questo tema') : ''}${card('bossPick', 'casuale', 'Casuale', 'Scelto in base al livello del gruppo')}</div>
          <div class="fld"><label for="wz-boss">Oppure scegli tu</label><select id="wz-boss"><option value="">— scegli un mostro —</option>${BESTIARY.filter(b => b.cr >= 0.5).map(b => `<option value="${b.id}" ${S.bossPick === b.id ? 'selected' : ''}>${b.nome} (GS ${b.cr})</option>`).join('')}</select></div>
          ${stats ? `<p class="wz-note">Il boss sarà <b>${esc(p.nome)} (Boss)</b>: circa <b>${stats.hp} PF</b>, CA ${stats.ac}, attacco +${stats.atk}, danni ${stats.dado}. Lascia un bottino ricco e un tesoro tutto suo.</p>` : '<p class="wz-note">Il boss verrà scelto a caso in base al livello del gruppo.</p>'}` : ''}`; }
        case 'Tesori e trappole': return `<h3>Tesori</h3>${group('treasure', TREAS)}<h3>Trappole nascoste</h3>${group('traps', TRAPS)}<h3>Porte sigillate (enigmi, prove o chiavi)</h3>${group('locks', LOCKS)}`;
        case 'Regole di gioco': return `<div class="wz-grid two">${card2('auto', true, 'Mostri automatici', 'Al loro turno si muovono e attaccano da soli, tirando i dadi per te. Puoi cambiare idea in qualsiasi momento.')}${card2('auto', false, 'Mostri manuali', 'Li muovi e li fai attaccare tu, tirando i loro dadi.')}</div>
          <div class="wz-grid two">${card2('autoLoot', true, 'Bottino automatico', 'Quando un mostro muore, oro ed esperienza vanno a chi l\'ha colpito in proporzione ai danni; gli oggetti a chi dà il colpo finale.')}${card2('autoLoot', false, 'Bottino a mano', 'I giocatori devono saccheggiare i mostri sconfitti.')}</div>
          <div class="wz-grid two">${card2('fog', true, 'Con nebbia', 'I giocatori vedono solo vicino ai loro personaggi.')}${card2('fog', false, 'Senza nebbia', 'Vedono tutta la stanza appena entrano.')}</div>`;
        case 'Percorso': {
          const names = TEMPLATES.filter(x => x.id !== 'misto');
          return `<p class="muted">Il gruppo affronterà questi dungeon uno dopo l'altro, dal più vicino al più lontano. Togli quelli che non vuoi e cambia l'ordine.</p>
          <ol class="wz-levels">${S.levels.map((id, i) => { const x = TEMPLATES.find(t => t.id === id); return `<li><span class="n">${i + 1}</span><span class="ico">${x.icon}</span><span class="t"><strong>${esc(x.nome)}</strong><small>${esc(x.desc)}</small></span><span class="ctl"><button type="button" class="btn sm" data-lv="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">↑</button><button type="button" class="btn sm" data-lv="down" data-i="${i}" ${i === S.levels.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">↓</button><button type="button" class="btn sm danger" data-lv="del" data-i="${i}" ${S.levels.length <= 1 ? 'disabled' : ''} aria-label="Togli">✕</button></span></li>`; }).join('')}</ol>
          ${names.some(x => !S.levels.includes(x.id)) ? `<div class="fld"><label for="wz-addlv">Aggiungi un dungeon</label><select id="wz-addlv"><option value="">— scegli —</option>${names.filter(x => !S.levels.includes(x.id)).map(x => `<option value="${x.id}">${x.icon} ${esc(x.nome)}</option>`).join('')}</select></div>` : ''}
          <div class="fld wz-num"><label for="wz-per">Stanze per ogni dungeon (3–12)</label><input id="wz-per" type="number" min="3" max="12" value="${S.perLevel}"></div>
          <div class="wz-grid two">${card2('bossEach', true, 'Un boss in ogni dungeon', 'In fondo a ognuno, con la sua scorta e un bottino ricco.')}${card2('bossEach', false, 'Nessun boss', 'Solo stanze con mostri comuni.')}</div>`; }
        case 'Il mondo': return `<h3>Quanto è grande?</h3><div class="wz-grid">${Object.entries(WSIZES).map(([k, [t, d]]) => card('wsize', k, t, d)).join('')}</div>
          <div class="fld wz-num"><label for="wz-towns">Quanti paesi? (2–8)</label><input id="wz-towns" type="number" min="2" max="8" value="${S.towns}"></div>
          <div class="fld wz-num"><label for="wz-oases">Oasi (0–8): entrandoci si tira un d20 — riposo, forzieri con quest, agguati o un viandante da arruolare</label><input id="wz-oases" type="number" min="0" max="8" value="${S.oases}"></div>
          <div class="fld wz-num"><label for="wz-trees">Alberi con frutti (0–12): ognuno dà frutti curativi, che ricrescono dopo ogni dungeon</label><input id="wz-trees" type="number" min="0" max="12" value="${S.trees}"></div>
          <h3>Incontri durante il viaggio</h3>${group('encounters', FREQS)}
          <p class="wz-note">A ogni tappa si tira un dado: nei boschi e nelle paludi si rischia di più, sulle strade meno, vicino ai paesi per niente. Se esce un incontro, il gruppo si trova subito in una piccola stanza di scontro.</p>
          <div class="wz-prev"><div class="wz-prev-h"><strong>Anteprima del mondo</strong><button type="button" class="btn sm" data-regen>Un altro mondo</button></div>${S.world ? `<svg viewBox="${S.world.viewBox}" role="img" aria-label="Anteprima della mappa del mondo">${S.world.svg}</svg>` : ''}</div>`;
        default: {
          const p = S.bossOn ? bossPreset() : null;
          if (S.mode === 'mondo') return `<ul class="wz-sum"><li><span>Struttura</span><b>Campagna con mappa del mondo</b></li><li><span>Mondo</span><b>${WSIZES[S.wsize][0]}, ${S.towns} paesi, ${S.oases} oasi, ${S.trees} alberi con frutti</b></li>
            <li><span>Percorso</span><b>${S.levels.map(id => TEMPLATES.find(t => t.id === id).nome).join(' → ')}</b></li><li><span>Dungeon</span><b>${S.perLevel} stanze ciascuno${S.bossEach ? ', con boss' : ''}</b></li>
            <li><span>Mostri</span><b>${DIFFS[S.diff][0]}, ${DENS[S.monsters][0].toLowerCase()} (la difficoltà sale ogni 2 dungeon)</b></li><li><span>Incontri di viaggio</span><b>${FREQS[S.encounters][0]}</b></li>
            <li><span>Regole</span><b>Mostri ${S.auto ? 'automatici' : 'manuali'}, bottino ${S.autoLoot ? 'automatico' : 'a mano'}, ${S.fog ? 'con' : 'senza'} nebbia nei dungeon</b></li></ul>
            <p class="wz-note">Il gruppo parte dal primo paese. I dungeon più lontani sono nascosti: si scoprono avvicinandosi oppure dalle voci degli abitanti, che danno anche incarichi con ricompensa.</p>`;
          return `<ul class="wz-sum"><li><span>Tema</span><b>${esc(t.nome)}</b></li><li><span>Stanze</span><b>${S.n} (${SIZES[S.size][0].toLowerCase()})</b></li><li><span>Mostri</span><b>${DIFFS[S.diff][0]}, ${DENS[S.monsters][0].toLowerCase()} · circa ${estimate()} in tutto</b></li>
            <li><span>Boss</span><b>${S.bossOn ? esc(p ? `${p.nome} (Boss)` : 'casuale') : 'nessuno'}</b></li><li><span>Tesori / trappole / porte</span><b>${TREAS[S.treasure][0]} / ${TRAPS[S.traps][0]} / ${LOCKS[S.locks][0]}</b></li>
            <li><span>Regole</span><b>Mostri ${S.auto ? 'automatici' : 'manuali'}, ${S.fog ? 'con' : 'senza'} nebbia</b></li></ul>
            <div class="wz-prev"><div class="wz-prev-h"><strong>Esempio di stanza</strong><button type="button" class="btn sm" data-regen>Un'altra</button></div>${S.preview ? `<svg viewBox="${S.preview.viewBox}" role="img" aria-label="Anteprima di una stanza">${S.preview.svg}</svg>` : ''}</div>`; }
      }
    };
    function card2(field, value, title, sub) { return `<button type="button" class="wz-card ${S[field] === value ? 'on' : ''}" data-set="${field}" data-val="${value}" data-bool="1" aria-pressed="${S[field] === value}"><strong>${esc(title)}</strong><small>${esc(sub)}</small></button>`; }

    const sampleWorld = () => {
      const sz = WSIZES[S.wsize]; const w = generateWorld({ cols: sz[2], rows: sz[3], towns: S.towns, dungeons: S.levels.length, oases: S.oases, trees: S.trees });
      S.world = roomThumb({ cols: w.cols, rows: w.rows, cells: w.cells, meta: w.meta, fog: false }, { tokens: w.places.map(p => ({ col: p.col, row: p.row, color: p.tipo === 'paese' ? '#e0a526' : p.tipo === 'oasi' ? '#3d9ad1' : p.tipo === 'albero' ? '#4f9a3d' : '#ae3f3a' })) });
    };
    const sample = () => {
      const t = tpl(); const sz = { piccole: [[10, 13], [8, 10]], medie: [[12, 17], [9, 12]], grandi: [[16, 22], [11, 15]] }[S.size];
      const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const g = generateRoom({ level, party, cols: r(...sz[0]), rows: r(...sz[1]), monsters: S.monsters, diff: S.diff, themes: t.themes, pool: t.pool, treasure: S.treasure, traps: S.traps, progress: 0.4 });
      S.preview = roomThumb({ cols: g.cols, rows: g.rows, cells: g.cells, meta: g.meta, fog: false }, { tokens: [] });
    };

    function render() {
      const STEPS = stepsOf(S); const name = STEPS[S.step];
      if (name === 'Riepilogo' && S.mode === 'singolo' && !S.preview) sample();
      if (name === 'Il mondo' && !S.world) sampleWorld();
      const last = S.step === STEPS.length - 1;
      dlg.innerHTML = `<form method="dialog" class="dlg-form"><h2>${S.mode === 'mondo' ? 'Nuova campagna' : 'Nuovo dungeon'}</h2>
        <ol class="wz-steps" aria-label="Passi">${STEPS.map((s, i) => `<li class="${i === S.step ? 'now' : i < S.step ? 'done' : ''}"><span>${i + 1}</span><em>${s}</em></li>`).join('')}</ol>
        <h3 class="wz-title">${S.step + 1}. ${STEPS[S.step]}</h3><div class="wz-body">${body()}</div>
        <div class="dlg-actions"><button type="button" class="btn ghost" data-cancel>Annulla</button><span class="grow"></span>${S.step > 0 ? '<button type="button" class="btn" data-back>Indietro</button>' : ''}<button type="button" class="btn primary" data-next>${last ? 'Genera il dungeon' : 'Avanti'}</button></div></form>`;
      dlg.querySelector('.wz-body')?.scrollTo?.(0, 0);
    }

    dlg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cancel !== undefined) return dlg.close();
      if (b.dataset.back !== undefined) { S.step--; return render(); }
      if (b.dataset.regen !== undefined) { if (stepsOf(S)[S.step] === 'Il mondo') sampleWorld(); else sample(); return render(); }
      if (b.dataset.lv) { const i = +b.dataset.i, L = S.levels; if (b.dataset.lv === 'up' && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]]; if (b.dataset.lv === 'down' && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]]; if (b.dataset.lv === 'del' && L.length > 1) L.splice(i, 1); S.world = null; return render(); }
      if (b.dataset.n) { S.n = +b.dataset.n; return render(); }
      if (b.dataset.set) {
        const f = b.dataset.set; const v = b.dataset.bool ? b.dataset.val === 'true' : b.dataset.val;
        if (f === 'tplId') { S.tplId = v; applyTpl(tpl()); } else { S[f] = v; S.preview = null; if (f === 'wsize') { S.towns = WSIZES[v][4]; S.oases = WSIZES[v][5]; S.trees = WSIZES[v][5] * 2; S.world = null; } if (f === 'mode') S.step = 0; }
        return render();
      }
      if (b.dataset.next !== undefined) {
        if (S.step < stepsOf(S).length - 1) { S.step++; return render(); }
        if (S.mode === 'mondo') {
          const sz = WSIZES[S.wsize];
          result = { mode: 'mondo', levels: [...S.levels], perLevel: Math.max(3, Math.min(12, S.perLevel)), bossEach: S.bossEach, diff: S.diff, monsters: S.monsters, cols: sz[2], rows: sz[3], towns: Math.max(2, Math.min(8, S.towns)), oases: Math.max(0, Math.min(8, S.oases)), trees: Math.max(0, Math.min(12, S.trees)), encounters: S.encounters, auto: S.auto, autoLoot: S.autoLoot, fog: S.fog };
          return dlg.close();
        }
        const t = tpl();
        result = { mode: 'singolo', tpl: t.id, n: Math.max(2, Math.min(50, S.n)), size: S.size, diff: S.diff, monsters: S.monsters, boss: S.bossOn ? bossId() : null,
          treasure: S.treasure, traps: S.traps, locks: S.locks, auto: S.auto, autoLoot: S.autoLoot, fog: S.fog, themes: t.themes, pool: t.pool };
        dlg.close();
      }
    });
    dlg.addEventListener('input', e => {
      if (e.target.id === 'wz-n') { const v = Math.round(+e.target.value); if (v >= 2 && v <= 50) S.n = v; }
      if (e.target.id === 'wz-per') { const v = Math.round(+e.target.value); if (v >= 3 && v <= 12) S.perLevel = v; }
      if (e.target.id === 'wz-trees') { const v = Math.round(+e.target.value); if (v >= 0 && v <= 12) { S.trees = v; S.world = null; } }
      if (e.target.id === 'wz-oases') { const v = Math.round(+e.target.value); if (v >= 0 && v <= 8) { S.oases = v; S.world = null; } }
      if (e.target.id === 'wz-towns') { const v = Math.round(+e.target.value); if (v >= 2 && v <= 8) { S.towns = v; S.world = null; } }
    });
    dlg.addEventListener('change', e => {
      if (e.target.id === 'wz-boss' && e.target.value) { S.bossPick = e.target.value; render(); }
      if (e.target.id === 'wz-addlv' && e.target.value) { S.levels.push(e.target.value); S.world = null; render(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    render(); dlg.showModal();
  });
}
