// Creazione del personaggio: si scelgono solo nome, razza e classe; poi si tirano i dadi e si vede subito la scheda (caratteristiche con i bonus, armi, magie, abilità, tratti).
import { RACES, CLASSES, STATS, STAT_NAME, hexesFor, maxMana, spellCost, fmtMod, mod, prof } from './rules.js';
import { roll } from './dice.js';
import { PRIORITY, buildSheet } from './companions.js';
import { RACE_TRAITS, CLASS_FEATURES, SKILLS, defaultSkills, racialBonus } from './skills.js';
import { powerFor } from './powers.js';
import { defenseList } from './status.js';
import { portrait, GENERI, GENERE_ICONA } from './portrait.js';
import { play } from './sound.js';
import { esc } from './ui.js';

const MAX_ROLLS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Perché una classe vuole certe caratteristiche alte. */
const WHY = {
  barbaro: 'Forza per colpire forte, Costituzione per incassare.', bardo: 'Carisma per magie e persuasione, Destrezza per muoverti.', chierico: 'Saggezza per le magie divine, Costituzione per resistere.',
  druido: 'Saggezza per le magie, Costituzione e Destrezza per la difesa.', guerriero: 'Forza per attaccare, Costituzione per resistere.', ladro: 'Destrezza per colpire e nasconderti, Intelligenza per le abilità.',
  monaco: 'Destrezza e Saggezza: il monaco combatte senza armatura.', mago: 'Intelligenza per magie e mana, Costituzione per non cadere subito.', paladino: 'Forza per le armi, Carisma per i poteri sacri.',
  ranger: 'Destrezza per l\'arco, Saggezza per orientarti e per le abilità.', stregone: 'Carisma per magie e mana, Costituzione per resistere.', warlock: 'Carisma per magie e mana, Costituzione per resistere.',
};
const ROLE = ['main', 'high', 'mid']; const ROLE_TXT = { main: '★ principale', high: '● importante', mid: '○ utile' };
const roleOf = (classId, k) => ROLE[PRIORITY[classId].indexOf(k)] || '';
/** Sei tiri di 4d6 (si scarta il più basso), dal più alto al più basso. */
const rollSet = () => Array.from({ length: 6 }, () => Math.max(8, roll('4d6kh3').total)).sort((a, b) => b - a); // mai sotto 8: nessuna caratteristica con malus pesante

/** Apre la finestra. Restituisce { player, name, raceId, classId, base, level } oppure null. */
export function characterDialog({ saved = '', level = 1 } = {}) {
  return new Promise(resolve => {
    const S = { raceId: 'umano', classId: 'guerriero', genere: 'n', rolls: [], pick: -1, rolling: false };
    const dlg = document.createElement('dialog'); dlg.className = 'dlg wide cc'; document.body.appendChild(dlg);
    let result = null;
    const race = () => RACES.find(r => r.id === S.raceId), cls = () => CLASSES.find(c => c.id === S.classId);
    const baseOf = () => { if (S.pick < 0) return null; const vals = S.rolls[S.pick]; const b = {}; PRIORITY[S.classId].forEach((k, i) => { b[k] = vals[i]; }); return b; };

    const raceNote = () => { const r = race(); return `<b>${esc(r.nome)}</b>: ${esc(r.nota)}. Velocità ${r.speed} ft (${hexesFor(r.speed)} esagoni). Bonus: ${Object.entries(r.bonus).map(([k, n]) => `<span class="bonus">${STAT_NAME[k]} +${n}</span>`).join(' ')} <span class="muted">— nessun malus.</span>`; };

    const preview = () => {
      const base = baseOf(); const r = race(), c = cls();
      const por = `<div class="cc-por">${portrait({ raceId: S.raceId, classId: S.classId, genere: S.genere, seed: S.name || '' })}</div>`;
      if (!base) return `<div class="cc-need"><div class="cc-top">${por}<p><b>${esc(r.nome)} ${esc(c.nome)}</b> (${GENERE_ICONA[S.genere]} ${GENERI[S.genere]}) — ${esc(WHY[S.classId])}</p></div><div class="cc-stats">${PRIORITY[S.classId].map(k => `<div class="cc-st r-${roleOf(S.classId, k) || 'none'} ${racialBonus(S.raceId, k) ? 'has-bonus' : ''}"><span>${STAT_NAME[k].slice(0, 3).toUpperCase()}</span><b>?</b><em>${ROLE_TXT[roleOf(S.classId, k)] || ''}</em><i>${racialBonus(S.raceId, k) ? `razza <u>+${racialBonus(S.raceId, k)}</u>` : ''}</i></div>`).join('')}</div><p class="muted">Tira i dadi: i numeri più alti andranno alle caratteristiche che servono alla tua classe, e i bonus della razza si sommano. Poi vedrai armi, magie, abilità e talenti.</p></div>`;
      const sh = buildSheet({ name: 'x', raceId: S.raceId, classId: S.classId, level, base });
      const tiles = STATS.map(([k, l]) => { const b = racialBonus(S.raceId, k); const tot = sh.stats[k]; const role = roleOf(S.classId, k); return `<div class="cc-st ${b ? 'has-bonus' : ''} r-${role || 'none'}" title="${l}: tiro ${base[k]}${b ? ` + razza ${b}` : ''}"><span>${l.slice(0, 3).toUpperCase()}</span><b>${tot}</b><small>${fmtMod(mod(tot))}</small><em>${ROLE_TXT[role] || ''}</em><i>${base[k]}${b ? ` <u>+${b}</u>` : ''}</i></div>`; }).join('');
      const abil = defaultSkills(S.raceId, S.classId); const raceSk = new Set(defaultSkills(S.raceId, 'x'));
      const chip = id => { const s = SKILLS.find(x => x.id === id); const bonus = mod(sh.stats[s.stat]) + prof(level); return `<span class="cc-chip ${raceSk.has(id) ? 'race' : 'cls'}" title="${raceSk.has(id) ? 'Dalla razza' : 'Dalla classe'}">${esc(s.nome)} ${fmtMod(bonus)}</span>`; };
      const traits = [...(RACE_TRAITS[S.raceId] || []).map(t => ['race', ...t]), ...(CLASS_FEATURES[S.classId] || []).map(t => ['cls', ...t])];
      return `<div class="cc-top">${por}<p class="cc-why"><b>${esc(S.name || 'Il tuo eroe')}</b>, ${esc(r.nome)} ${esc(c.nome)} (${GENERE_ICONA[S.genere]} ${GENERI[S.genere]})<br><b>${esc(c.nome)}</b>: ${esc(WHY[S.classId])} Le caselle evidenziate sono quelle che contano di più.</p></div><div class="cc-stats">${tiles}</div>
        <div class="cc-vit"><span><b>${sh.max_hp}</b> PF</span><span><b>${sh.ac}</b> CA</span><span><b>${hexesFor(sh.speed)}</b> esagoni</span><span><b>${fmtMod(prof(level))}</b> competenza</span>${maxMana(sh) ? `<span class="mn"><b>${maxMana(sh)}</b> mana</span>` : ''}</div>
        <div class="cc-cols"><div><h4>Armi</h4><ul>${sh.data.armi.map(w => `<li><b>${esc(w.nome)}</b> <span class="muted">${esc(w.dado)}${w.gittata > 5 ? `, gittata ${w.gittata} ft` : ''}</span></li>`).join('') || '<li class="muted">nessuna</li>'}</ul></div>
          <div><h4>${sh.data.magie.length ? 'Magie' : 'Magie'}</h4><ul>${sh.data.magie.map(m => `<li><b>${esc(m.nome)}</b> <span class="muted">${m.livello ? 'livello ' + m.livello : 'trucchetto'} · ${spellCost(m)} mana</span></li>`).join('') || '<li class="muted">la tua classe non lancia incantesimi: punta sulle armi e sulle abilità</li>'}</ul></div></div>
        <h4>Abilità</h4><p class="muted cc-legend">Bonus già calcolati. Colore: <span class="cc-chip race">dalla razza</span> <span class="cc-chip cls">dalla classe</span></p><div class="cc-chips">${abil.map(chip).join('')}</div>
        ${(() => { const pw = powerFor({ stats: sh.stats, level, data: { raceId: S.raceId, classId: S.classId } }); return pw ? `<h4>Potere unico</h4><div class="cc-power"><b>⚡ ${esc(pw.nome)}</b><p>${esc(pw.riassunto)}</p><p class="muted">Si usa come azione bonus, una volta per scontro. Nome ed elemento vengono dalla razza, l'effetto dalla classe, la forza dalle tue statistiche.</p></div>` : ''; })()}
        ${(() => { const df = defenseList({ stats: sh.stats, level, data: { raceId: S.raceId, classId: S.classId, oggetti: [] } }); return df.length ? `<h4>Difese</h4><div class="cc-chips">${df.map(x => `<span class="cc-chip cls">${x.icona} ${esc(x.testo)} <small>(${esc(x.da)})</small></span>`).join('')}</div>` : ''; })()}
        <h4>Talenti</h4><ul class="cc-traits">${traits.map(([w, n, d]) => `<li class="${w}"><b>${esc(n)}</b> <span class="muted">${esc(d)}</span></li>`).join('')}</ul>
        ${level > 1 ? `<p class="muted">Entri nel gruppo al <b>livello ${level}</b> (come i tuoi compagni): i punti caratteristica dei livelli sono già assegnati.</p>` : ''}`;
    };

    function render() {
      const canRoll = S.rolls.length < MAX_ROLLS && !S.rolling;
      dlg.innerHTML = `<form method="dialog" class="dlg-form"><h2>Nuovo personaggio</h2>
        <div class="cc-grid"><div class="fld"><label for="cc-player">Il tuo nome</label><input id="cc-player" value="${esc(S.player ?? saved)}"></div>
          <div class="fld"><label for="cc-name">Nome del personaggio</label><input id="cc-name" required value="${esc(S.name || '')}" placeholder="Come si chiama il tuo eroe?"></div>
          <div class="fld"><label for="cc-race">Razza</label><select id="cc-race">${RACES.map(r => `<option value="${r.id}" ${r.id === S.raceId ? 'selected' : ''}>${esc(r.nome)} (${r.speed} ft)</option>`).join('')}</select></div>
          <div class="fld"><label for="cc-cls">Classe</label><select id="cc-cls">${CLASSES.map(c => `<option value="${c.id}" ${c.id === S.classId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div></div>
        <div class="fld"><label>Genere</label><div class="seg" role="group" aria-label="Genere">${Object.entries(GENERI).map(([k, l]) => `<button type="button" class="seg-b ${S.genere === k ? 'on' : ''}" data-gen="${k}" aria-pressed="${S.genere === k}">${GENERE_ICONA[k]} ${l}</button>`).join('')}</div><small class="muted">Cambia solo l'aspetto del ritratto: maschi, femmine e neutri sono alla pari, senza bonus né malus.</small></div>
        <p class="cc-note">${raceNote()}</p>
        <div class="cc-rollrow"><button type="button" class="btn primary" data-roll ${canRoll ? '' : 'disabled'}>${S.rolls.length ? (S.rolls.length >= MAX_ROLLS ? 'Tentativi finiti' : `Tira ancora (${MAX_ROLLS - S.rolls.length} ${MAX_ROLLS - S.rolls.length === 1 ? 'tentativo rimasto' : 'tentativi rimasti'})`) : `Tira i dadi (${MAX_ROLLS} tentativi)`}</button>${S.rolls.length >= MAX_ROLLS ? '<span class="muted">scegli il tiro che preferisci:</span>' : ''}
          ${S.rolls.map((v, i) => `<button type="button" class="cc-chip pickable ${i === S.pick ? 'on' : ''}" data-pick="${i}" title="${v.join(', ')}">Tiro ${i + 1} · somma ${v.reduce((a, b) => a + b, 0)}</button>`).join('')}</div>
        <div class="cc-sheet ${S.rolling ? 'rolling' : ''}">${S.rolling ? `<div class="cc-rolling"><p class="muted">Tiro ${S.rolls.length + 1} di ${MAX_ROLLS}: 4d6, si scarta il dado più basso…</p><div class="cc-dice6">${PRIORITY[S.classId].map(k => `<div class="cc-dtile r-${roleOf(S.classId, k) || 'none'}"><span>${STAT_NAME[k].slice(0, 3).toUpperCase()}</span><div class="cc-die"><b>?</b></div><em>${ROLE_TXT[roleOf(S.classId, k)] || ''}</em></div>`).join('')}</div></div>` : preview()}</div>
        <div class="dlg-actions"><button type="button" class="btn ghost" data-cancel>Annulla</button><span class="grow"></span><button type="button" class="btn primary" data-ok ${S.pick < 0 ? 'disabled' : ''}>Crea e gioca</button></div></form>`;
    }
    const keepInputs = () => { S.player = dlg.querySelector('#cc-player')?.value ?? S.player; S.name = dlg.querySelector('#cc-name')?.value ?? S.name; };

    dlg.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; keepInputs();
      if (b.dataset.cancel !== undefined) return dlg.close();
      if (b.dataset.gen) { S.genere = b.dataset.gen; return render(); }
      if (b.dataset.pick !== undefined) { S.pick = +b.dataset.pick; return render(); }
      if (b.dataset.roll !== undefined) {
        const vals = rollSet(); S.rolling = true; render(); play('dice');
        const tiles = [...dlg.querySelectorAll('.cc-dtile')]; const numbers = tiles.map(t => t.querySelector('b'));
        const flick = setInterval(() => numbers.forEach(n => { if (!n.dataset.done) n.textContent = 3 + Math.floor(Math.random() * 16); }), 70);
        await sleep(700);
        for (let i = 0; i < 6; i++) { numbers[i].textContent = vals[i]; numbers[i].dataset.done = '1'; tiles[i].classList.add('landed'); play('land'); await sleep(260); }
        clearInterval(flick); await sleep(450);
        S.rolls.push(vals); S.pick = S.rolls.length - 1; S.rolling = false; render(); return;
      }
      if (b.dataset.ok !== undefined) {
        const name = (S.name || '').trim(); if (!name) { dlg.querySelector('#cc-name').focus(); return dlg.querySelector('#cc-name').reportValidity?.(); }
        result = { player: (S.player || '').trim(), name, genere: S.genere, raceId: S.raceId, classId: S.classId, base: baseOf(), level }; dlg.close();
      }
    });
    dlg.addEventListener('change', e => { keepInputs(); if (e.target.id === 'cc-race') S.raceId = e.target.value; else if (e.target.id === 'cc-cls') S.classId = e.target.value; else return; render(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    render(); dlg.showModal();
  });
}
