// Abilità, tratti di razza e capacità di classe. Le competenze danno il bonus di competenza ai tiri di abilità (percezione, persuasione, scasso...).
import { RACES, mod, prof } from './rules.js';
import { statusMalus } from './status.js';

export const SKILLS = [
  { id: 'acrobazia', nome: 'Acrobazia', stat: 'des' }, { id: 'animali', nome: 'Addestrare animali', stat: 'sag' }, { id: 'arcano', nome: 'Arcano', stat: 'int' },
  { id: 'atletica', nome: 'Atletica', stat: 'for' }, { id: 'furtivita', nome: 'Furtività', stat: 'des' }, { id: 'indagare', nome: 'Indagare', stat: 'int' },
  { id: 'inganno', nome: 'Inganno', stat: 'car' }, { id: 'intimidire', nome: 'Intimidire', stat: 'car' }, { id: 'intrattenere', nome: 'Intrattenere', stat: 'car' },
  { id: 'intuizione', nome: 'Intuizione', stat: 'sag' }, { id: 'medicina', nome: 'Medicina', stat: 'sag' }, { id: 'natura', nome: 'Natura', stat: 'int' },
  { id: 'percezione', nome: 'Percezione', stat: 'sag' }, { id: 'persuasione', nome: 'Persuasione', stat: 'car' }, { id: 'rapidita', nome: 'Rapidità di mano', stat: 'des' },
  { id: 'religione', nome: 'Religione', stat: 'int' }, { id: 'sopravvivenza', nome: 'Sopravvivenza', stat: 'sag' }, { id: 'storia', nome: 'Storia', stat: 'int' },
];
const SK = Object.fromEntries(SKILLS.map(s => [s.id, s]));

const CLASS_SKILLS = {
  barbaro: ['atletica', 'sopravvivenza', 'intimidire'], bardo: ['persuasione', 'intrattenere', 'inganno'], chierico: ['intuizione', 'religione', 'medicina'], druido: ['natura', 'sopravvivenza', 'medicina'],
  guerriero: ['atletica', 'percezione', 'intimidire'], ladro: ['furtivita', 'rapidita', 'percezione', 'inganno'], monaco: ['acrobazia', 'furtivita', 'intuizione'], paladino: ['atletica', 'persuasione', 'religione'],
  ranger: ['furtivita', 'percezione', 'sopravvivenza'], mago: ['arcano', 'storia', 'indagare'], stregone: ['persuasione', 'arcano', 'inganno'], warlock: ['arcano', 'intimidire', 'indagare'],
};
const RACE_SKILLS = { 'elfo-alto': ['percezione'], 'elfo-bosco': ['percezione'], nano: ['storia'], mezzelfo: ['persuasione', 'intuizione'], mezzorco: ['intimidire'] };

/** Competenze di una combinazione razza + classe (senza doppioni). */
export const defaultSkills = (raceId, classId) => [...new Set([...(RACE_SKILLS[raceId] || []), ...(CLASS_SKILLS[classId] || [])])];

export const RACE_TRAITS = {
  umano: [['Versatile', '+1 a tutte le caratteristiche.']],
  'elfo-alto': [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Sensi acuti', 'Competenza in Percezione.'], ['Trance', 'Ti riposi in fretta.']],
  'elfo-bosco': [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Sensi acuti', 'Competenza in Percezione.'], ['Piede veloce', 'Velocità di 35 ft.']],
  nano: [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Robustezza nanica', 'Resisti bene ai veleni.'], ['Conoscenza della pietra', 'Competenza in Storia.']],
  halfling: [['Fortunato', 'Hai la fortuna dalla tua parte.'], ['Coraggioso', 'Non ti lasci spaventare facilmente.'], ['Agilità', 'Ti muovi tra i più grandi di te.']],
  gnomo: [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Astuzia gnomesca', 'Mente salda contro le magie.']],
  mezzelfo: [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Versatilità', 'Competenza in Persuasione e Intuizione.'], ['Retaggio fatato', 'Difficile da incantare.']],
  mezzorco: [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Minaccioso', 'Competenza in Intimidire.'], ['Resistenza implacabile', 'Hai la pellaccia dura.']],
  dragonide: [['Discendenza del drago', 'Il sangue dei draghi scorre in te.'], ['Soffio', 'Spirito indomito di un drago.']],
  tiefling: [['Scurovisione', 'Vedi nella penombra come in piena luce.'], ['Resistenza infernale', 'Il fuoco ti fa meno male.'], ['Retaggio infernale', 'Sangue di un altro mondo.']],
};
export const CLASS_FEATURES = {
  barbaro: [['Ira', 'Una furia che ti rende più forte in battaglia.'], ['Difesa senza armatura', 'La tua pelle vale un\'armatura.']], bardo: [['Ispirazione bardica', 'Incoraggi gli alleati con la voce.'], ['Magia', 'Lanci incantesimi con il Carisma.']],
  chierico: [['Magia divina', 'Lanci incantesimi con la Saggezza.'], ['Dominio', 'Il tuo dio ti dona un potere speciale.']], druido: [['Linguaggio druidico', 'Parli la lingua segreta dei druidi.'], ['Magia', 'Lanci incantesimi con la Saggezza.']],
  guerriero: [['Stile di combattimento', 'Sei addestrato a un modo di combattere.'], ['Recuperare energie', 'Ti rimetti in sesto anche in battaglia.'], ['Attacco extra', 'Dal 5° livello attacchi due volte.']],
  ladro: [['Attacco furtivo', 'Colpisci i punti deboli con danni extra.'], ['Maestria', 'Doppio bonus in alcune abilità.'], ['Azione scaltra', 'Scatti o ti disimpegni come azione bonus.']],
  monaco: [['Arti marziali', 'I tuoi pugni sono armi: colpo bonus dopo un attacco.'], ['Difesa senza armatura', 'Agilità e saggezza ti proteggono.']],
  paladino: [['Percepire il divino', 'Avverti il male e il bene.'], ['Imposizione delle mani', 'Guarisci con il tocco.'], ['Attacco extra', 'Dal 5° livello attacchi due volte.']],
  ranger: [['Nemico prescelto', 'Conosci a fondo un tipo di nemici.'], ['Esploratore', 'Ti orienti ovunque.'], ['Attacco extra', 'Dal 5° livello attacchi due volte.']],
  mago: [['Magia arcana', 'Lanci incantesimi con l\'Intelligenza.'], ['Recupero arcano', 'Recuperi un po\' di energia magica.']], stregone: [['Magia innata', 'Il potere magico è nel tuo sangue.'], ['Lanci con il Carisma', 'Incantesimi potenziati dal tuo fascino.']],
  warlock: [['Patto ultraterreno', 'Un patto con un essere potente ti dona magia.'], ['Lanci con il Carisma', 'Incantesimi dalle fonti del patto.']],
};

export const racialBonus = (raceId, stat) => RACES.find(r => r.id === raceId)?.bonus?.[stat] || 0;
export const skillsOfChar = ch => ch.data?.abilita ?? defaultSkills(ch.data?.raceId, ch.data?.classId);
/** Bonus di un'abilità: modificatore della caratteristica + competenza (se ce l'ha). */
export const skillBonus = (ch, id) => mod(ch.stats?.[SK[id].stat] ?? 10) + (skillsOfChar(ch).includes(id) ? prof(ch.level || 1) : 0) + statusMalus(ch);
export const hasSkill = (ch, id) => skillsOfChar(ch).includes(id);
/** Lista completa per la scheda: prima le competenze. */
export const skillList = ch => SKILLS.map(s => ({ ...s, bonus: skillBonus(ch, s.id), prof: hasSkill(ch, s.id) })).sort((a, b) => Number(b.prof) - Number(a.prof) || a.nome.localeCompare(b.nome));
/** Bonus per una prova di caratteristica generica (porte, forzieri): usa l'abilità più adatta. */
const STAT_SKILL = { for: 'atletica', des: 'rapidita', int: 'arcano', sag: 'percezione', car: 'persuasione' };
export const checkBonus = (ch, stat) => (STAT_SKILL[stat] ? skillBonus(ch, STAT_SKILL[stat]) : mod(ch.stats?.[stat] ?? 10));
