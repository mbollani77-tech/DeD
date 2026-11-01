// Ritratti: disegnati dal gioco in SVG, quindi cambiano con razza, classe e genere (nessuna immagine da caricare).
export const GENERI = { m: 'Maschio', f: 'Femmina', n: 'Neutro' };
export const GENERE_ICONA = { m: '♂', f: '♀', n: '⚧' };

const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pick = (arr, h, k = 0) => arr[(h >>> (k * 3)) % arr.length];
let counter = 0;

const SKIN = { umano: ['#f1c9a5', '#d9a679', '#a8744f', '#7a4f35'], 'elfo-alto': ['#f3dcc4', '#ecd3b8'], 'elfo-bosco': ['#d9b68a', '#c9a074'], nano: ['#e0a68a', '#c98668'], halfling: ['#efc29a', '#e0ab7f'],
  gnomo: ['#f0b8a0', '#e8a58c'], mezzelfo: ['#e6c19c', '#d1a57c'], mezzorco: ['#8fae7a', '#7f9c6c'], dragonide: ['#c24b3a', '#3a7ac2', '#4e9a47', '#c9a43a'], tiefling: ['#c0504d', '#8e5aa8', '#5a6cc0', '#b04a70'] };
const HAIR = { umano: ['#2b1b12', '#6b4423', '#c8a050', '#b5651d', '#222'], 'elfo-alto': ['#e8e2c8', '#d8c070', '#c9d6e8'], 'elfo-bosco': ['#6b4a2a', '#3a5a2a', '#2b2b2b'], nano: ['#8a3b1a', '#555', '#c9b27a'],
  halfling: ['#5a3a1a', '#3a2a1a', '#8a5a2a'], gnomo: ['#e8e0d0', '#b0b0b8', '#d49a6a'], mezzelfo: ['#4a3020', '#8a6a40'], mezzorco: ['#111', '#2a2a2a'], tiefling: ['#14121a', '#e8e8f0', '#2a1a40'], dragonide: ['#000'] };
const EYES = ['#3a6ea5', '#4a7a3a', '#7a4a2a', '#b07a20', '#6a6a7a'];
const CLASS_COLORS = { guerriero: ['#7b8794', '#b03a3a'], barbaro: ['#7a4a2a', '#c0803a'], bardo: ['#7a3a9a', '#e0b03a'], chierico: ['#eef0f4', '#e0b03a'], druido: ['#4a7a3a', '#8a5a2a'], ladro: ['#3a3f4a', '#6a6f7a'],
  mago: ['#2e4a9a', '#e0c03a'], monaco: ['#e08a2a', '#7a3a1a'], paladino: ['#c9d2de', '#2e5aa8'], ranger: ['#3f6a3a', '#6a4a2a'], stregone: ['#a02a4a', '#7a2a9a'], warlock: ['#26203a', '#7a3ac0'] };
const BG = { guerriero: ['#59606a', '#2a2f36'], barbaro: ['#8a5a2a', '#3a2412'], bardo: ['#7a4a9a', '#2a1a3a'], chierico: ['#e8d9a0', '#7a6a2a'], druido: ['#5a9a4a', '#1f3a1a'], ladro: ['#4a4f5a', '#14161a'],
  mago: ['#4a6ac0', '#141a3a'], monaco: ['#e0a050', '#5a3010'], paladino: ['#8aa8d8', '#1a2a4a'], ranger: ['#6a9a5a', '#1a2a14'], stregone: ['#c04a6a', '#3a1020'], warlock: ['#5a3a8a', '#0e0a1a'] };

const darker = (hex, f = 0.82) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
const mirror = p => `<g transform="translate(120,0) scale(-1,1)">${p}</g>`;
const both = p => p + mirror(p);

function ears(raceId, skin) {
  const dk = darker(skin, 0.9);
  if (raceId === 'elfo-alto') return both(`<path d="M39 52 L16 38 L38 64 Z" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
  if (raceId === 'elfo-bosco') return both(`<path d="M39 54 L20 44 L38 66 Z" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
  if (raceId === 'mezzelfo') return both(`<path d="M39 54 L26 46 L38 65 Z" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
  if (raceId === 'gnomo' || raceId === 'tiefling') return both(`<path d="M39 54 L28 47 L38 65 Z" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
  if (raceId === 'mezzorco' || raceId === 'halfling') return both(`<path d="M39 56 L31 51 L38 65 Z" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
  if (raceId === 'dragonide') return '';
  return both(`<ellipse cx="38.5" cy="58" rx="3.4" ry="5.5" fill="${skin}" stroke="${dk}" stroke-width="1"/>`);
}
function hairBack(g, c) {
  if (g === 'f') return both(`<path d="M37 48 Q27 78 34 112 L50 102 L48 60 Z" fill="${c}"/>`);
  if (g === 'n') return both(`<path d="M37 50 Q33 70 38 84 L48 70 L47 56 Z" fill="${c}"/>`);
  return '';
}
function hairFront(g, c) {
  const cap = `<path d="M37 52 Q34 27 60 26 Q86 27 83 52 Q77 38 60 37 Q43 38 37 52 Z" fill="${c}"/>`;
  if (g === 'f') return cap + `<path d="M60 31 Q48 33 41 54 Q50 41 60 39 Z" fill="${c}"/>`;
  if (g === 'n') return cap + `<path d="M62 30 Q82 30 84 54 Q74 44 66 40 Z" fill="${c}"/>`;
  return cap;
}
function beard(raceId, g, c) {
  if (raceId !== 'nano') return '';
  if (g === 'f') return both(`<g><rect x="40" y="76" width="5" height="22" rx="2.5" fill="${c}"/><circle cx="42.5" cy="99" r="3" fill="#c9a74a"/></g>`);
  if (g === 'n') return `<path d="M41 66 Q44 86 60 88 Q76 86 79 66 Q70 76 60 76 Q50 76 41 66Z" fill="${c}"/>`;
  return `<path d="M39 62 Q40 96 60 104 Q80 96 81 62 Q72 82 60 82 Q48 82 39 62Z" fill="${c}"/>`;
}

function headgear(cls, hair, bright) {
  const [c1, c2] = CLASS_COLORS[cls] || ['#777', '#999'];
  switch (cls) {
    case 'guerriero': return `<path d="M36 52 Q35 24 60 22 Q85 24 84 52 L78 52 Q76 36 60 34 Q44 36 42 52 Z" fill="#9aa5b1" stroke="#5a636d" stroke-width="1"/><rect x="57.5" y="30" width="5" height="26" fill="#9aa5b1" stroke="#5a636d" stroke-width=".8"/>`;
    case 'barbaro': return `<path d="M42 48 L50 52 M70 52 L78 48" stroke="#b03a3a" stroke-width="2.5" stroke-linecap="round"/><path d="M45 61 L52 63 M75 61 L68 63" stroke="#b03a3a" stroke-width="2" stroke-linecap="round"/>`;
    case 'bardo': return `<path d="M36 44 Q60 22 84 44 Q60 34 36 44Z" fill="${c1}" stroke="#4a1a5a" stroke-width="1"/><path d="M80 38 Q104 18 100 6 Q92 22 78 34Z" fill="#e0443a"/>`;
    case 'chierico': return `<path d="M38 46 Q60 30 82 46" fill="none" stroke="${c2}" stroke-width="3"/><circle cx="60" cy="34" r="4" fill="#fff6c8" stroke="${c2}" stroke-width="1.5"/>`;
    case 'druido': return `<g fill="#5aa04a" stroke="#2f6a2a" stroke-width=".8"><ellipse cx="44" cy="34" rx="7" ry="3.5" transform="rotate(-30 44 34)"/><ellipse cx="60" cy="28" rx="7" ry="3.5"/><ellipse cx="76" cy="34" rx="7" ry="3.5" transform="rotate(30 76 34)"/></g><circle cx="52" cy="31" r="2" fill="#e0443a"/><circle cx="68" cy="31" r="2" fill="#e0443a"/>`;
    case 'ladro': return `<path d="M35 56 Q32 22 60 20 Q88 22 85 56 L80 54 Q78 34 60 32 Q42 34 40 54 Z" fill="#2a2d36"/><path d="M42 68 Q60 86 78 68 L78 80 Q60 92 42 80 Z" fill="#2a2d36"/>`;
    case 'mago': return `<path d="M30 40 Q60 36 90 40 Q82 30 66 6 Q54 28 30 40Z" fill="${c1}" stroke="#1a2a6a" stroke-width="1.2"/><path d="M34 40 Q60 46 86 40" fill="none" stroke="${c2}" stroke-width="2.5"/><path d="M64 20 l1.8 3.6 3.8.6-2.8 2.7.7 3.8-3.5-1.8-3.5 1.8.7-3.8-2.8-2.7 3.8-.6z" fill="#ffe27a"/>`;
    case 'monaco': return `<path d="M37 42 Q60 34 83 42 L83 47 Q60 40 37 47Z" fill="${c1}"/><path d="M83 44 l8 6 -6 2z" fill="${c1}"/>`;
    case 'paladino': return `<circle cx="60" cy="52" r="40" fill="none" stroke="#ffe9a0" stroke-width="2" opacity=".7"/><path d="M38 46 Q60 30 82 46" fill="none" stroke="#e0b03a" stroke-width="3"/>`;
    case 'ranger': return `<path d="M34 58 Q30 20 60 18 Q90 20 86 58 L80 54 Q80 34 60 31 Q40 34 40 54 Z" fill="${c1}"/><path d="M34 58 Q42 96 60 100 Q40 90 34 58Z" fill="${c1}" opacity=".9"/>`;
    case 'stregone': return `<g fill="#ffe27a"><path d="M24 30 l2 4 4 1 -4 1 -2 4 -2 -4 -4 -1 4 -1z"/><path d="M96 24 l2 4 4 1 -4 1 -2 4 -2 -4 -4 -1 4 -1z"/><circle cx="20" cy="62" r="1.8"/><circle cx="102" cy="58" r="1.8"/></g>`;
    case 'warlock': return `<path d="M33 60 Q28 18 60 16 Q92 18 87 60 L81 56 Q82 32 60 29 Q38 32 39 56 Z" fill="#1b1730"/><path d="M52 40 q8 -7 16 0 q-8 7 -16 0z" fill="#b48cff"/><circle cx="60" cy="40" r="2.4" fill="#2a0a5a"/>`;
    default: return '';
  }
}
function behind(cls) {
  switch (cls) {
    case 'guerriero': return `<rect x="88" y="64" width="5" height="46" rx="2" fill="#aab3be" transform="rotate(20 90 90)"/><rect x="84" y="94" width="14" height="4" rx="2" fill="#6a4a2a" transform="rotate(20 90 96)"/>`;
    case 'barbaro': return `<rect x="90" y="58" width="4" height="60" fill="#6a4a2a" transform="rotate(18 92 90)"/><path d="M88 58 Q104 52 102 76 Q94 70 88 74Z" fill="#aab3be" transform="rotate(18 92 90)"/>`;
    case 'mago': return `<rect x="98" y="30" width="4" height="100" rx="2" fill="#7a5a30"/><circle cx="100" cy="28" r="8" fill="#8ad0ff" stroke="#3a7ac0" stroke-width="1.5"/>`;
    case 'druido': return `<rect x="98" y="32" width="4" height="100" rx="2" fill="#6a4a2a"/><ellipse cx="100" cy="30" rx="8" ry="6" fill="#5aa04a"/>`;
    case 'ranger': return `<path d="M96 36 Q112 70 96 106" fill="none" stroke="#6a4a2a" stroke-width="3"/><path d="M96 36 L96 106" stroke="#ddd" stroke-width="1"/>`;
    case 'bardo': return `<ellipse cx="98" cy="108" rx="11" ry="14" fill="#b8742a" stroke="#6a3a10" stroke-width="1.5" transform="rotate(20 98 108)"/><rect x="98" y="62" width="4" height="40" fill="#6a3a10" transform="rotate(20 100 82)"/>`;
    case 'paladino': return `<path d="M12 96 L30 96 L30 128 Q21 138 12 128 Z" fill="#2e5aa8" stroke="#e0b03a" stroke-width="2"/>`;
    case 'stregone': return `<circle cx="60" cy="56" r="46" fill="#ff7aa8" opacity=".15"/>`;
    case 'warlock': return `<circle cx="60" cy="56" r="46" fill="#9a5aff" opacity=".18"/>`;
    default: return '';
  }
}
function outfit(cls, race) {
  const [c1, c2] = CLASS_COLORS[cls] || ['#777', '#999'];
  const body = `<path d="M16 140 L22 108 Q32 96 60 94 Q88 96 98 108 L104 140 Z" fill="${c1}" stroke="${darker(c1, 0.7)}" stroke-width="1.4"/>`;
  const extra = {
    guerriero: `<path d="M22 108 Q40 98 60 118 Q80 98 98 108 L96 116 Q60 106 24 116Z" fill="#aab3be" stroke="#5a636d" stroke-width="1"/><path d="M52 118 L68 118 L64 140 L56 140Z" fill="${c2}"/>`,
    barbaro: `<path d="M18 112 Q40 98 60 108 Q80 98 102 112 L100 124 Q60 112 20 124Z" fill="#a8743a"/><g stroke="#8a5a2a" stroke-width="2" stroke-linecap="round"><path d="M28 112 l-2 8"/><path d="M40 108 l-1 9"/><path d="M80 108 l1 9"/><path d="M92 112 l2 8"/></g>`,
    bardo: `<path d="M44 100 L60 126 L76 100" fill="none" stroke="${c2}" stroke-width="3"/><g fill="${c2}"><circle cx="60" cy="118" r="2"/><circle cx="60" cy="128" r="2"/></g>`,
    chierico: `<path d="M48 98 L60 122 L72 98" fill="${c2}" opacity=".9"/><path d="M60 108 v18 M53 116 h14" stroke="#fff" stroke-width="2.5"/>`,
    druido: `<path d="M24 114 Q60 104 96 114 L94 126 Q60 116 26 126Z" fill="${c2}"/><circle cx="60" cy="116" r="3" fill="#5aa04a"/>`,
    ladro: `<path d="M44 98 L60 112 L76 98" fill="#1d2027"/><rect x="40" y="124" width="40" height="5" fill="#8a5a2a"/>`,
    mago: `<path d="M54 98 L60 140 L66 98Z" fill="${c2}"/><g fill="#ffe27a"><circle cx="34" cy="120" r="1.5"/><circle cx="84" cy="124" r="1.5"/><circle cx="46" cy="132" r="1.5"/></g>`,
    monaco: `<path d="M44 100 L60 128 L76 100" fill="#e8c6a0"/><rect x="38" y="124" width="44" height="6" fill="${c2}"/>`,
    paladino: `<path d="M24 108 Q42 100 60 112 Q78 100 96 108 L94 118 Q60 108 26 118Z" fill="#e8eef6" stroke="#8a97a8" stroke-width="1"/><path d="M60 112 v26 M50 122 h20" stroke="#e0b03a" stroke-width="3"/>`,
    ranger: `<path d="M26 110 Q60 98 94 110 L98 140 L22 140Z" fill="${c2}" opacity=".85"/><path d="M52 98 L60 108 L68 98" fill="#2a4a26"/>`,
    stregone: `<path d="M44 98 L60 120 L76 98" fill="${c2}"/><circle cx="60" cy="122" r="4" fill="#ffd0e0"/>`,
    warlock: `<path d="M46 98 L60 126 L74 98" fill="${c2}"/><path d="M56 118 q4 -5 8 0 q-4 5 -8 0z" fill="#d0b0ff"/>`,
  }[cls] || '';
  return body + extra;
}

/** Ritratto in SVG (viewBox 120×140). genere: 'm' | 'f' | 'n'. seed: di solito il nome, per variare colori e dettagli. */
export function portrait({ raceId = 'umano', classId = 'guerriero', genere = 'n', seed = '' } = {}) {
  const h = hash(`${seed}|${raceId}|${classId}|${genere}`); const id = `pg${++counter}`;
  const skin = pick(SKIN[raceId] || SKIN.umano, h, 1); const dk = darker(skin, 0.86); const hair = pick(HAIR[raceId] || HAIR.umano, h, 2); const eye = pick(EYES, h, 3);
  const [bg1, bg2] = BG[classId] || ['#667', '#223']; const rich = raceId === 'dragonide'; const orc = raceId === 'mezzorco'; const tief = raceId === 'tiefling';
  const horns = tief ? both(`<path d="M44 34 Q28 20 34 6 Q44 22 54 32Z" fill="#3a2a2a" stroke="#1a1010" stroke-width="1"/>`) : '';
  const crest = rich ? `<g fill="${darker(skin, 0.75)}"><path d="M48 32 L52 14 L57 31Z"/><path d="M58 30 L62 10 L66 30Z"/><path d="M68 31 L73 14 L77 33Z"/></g>${both(`<path d="M42 38 Q30 28 32 14 Q42 24 48 34Z" fill="#e8dcc0" stroke="#a89a78" stroke-width="1"/>`)}` : '';
  const eyes = rich ? `<g><ellipse cx="51" cy="52" rx="4.4" ry="3.2" fill="#ffd54a"/><ellipse cx="69" cy="52" rx="4.4" ry="3.2" fill="#ffd54a"/><rect x="50.4" y="49.4" width="1.3" height="5.2" fill="#2a1a00"/><rect x="68.4" y="49.4" width="1.3" height="5.2" fill="#2a1a00"/></g>`
    : tief ? `<g><ellipse cx="51" cy="54" rx="4.2" ry="3.2" fill="#ffd54a"/><ellipse cx="69" cy="54" rx="4.2" ry="3.2" fill="#ffd54a"/></g>`
      : `<g><ellipse cx="51" cy="54" rx="4.4" ry="3.3" fill="#fff"/><ellipse cx="69" cy="54" rx="4.4" ry="3.3" fill="#fff"/><circle cx="51.5" cy="54.3" r="2.3" fill="${eye}"/><circle cx="68.5" cy="54.3" r="2.3" fill="${eye}"/><circle cx="51.8" cy="54.4" r="1" fill="#111"/><circle cx="68.2" cy="54.4" r="1" fill="#111"/></g>`;
  const brows = `<path d="M45 47 Q51 44 57 47 M63 47 Q69 44 75 47" stroke="${rich ? dk : darker(hair === '#000' ? '#333' : hair, 0.9)}" stroke-width="${genere === 'f' ? 1.2 : 2}" fill="none" stroke-linecap="round"/>`;
  const snout = rich ? `<ellipse cx="60" cy="68" rx="15" ry="11" fill="${darker(skin, 1.12 > 1 ? 0.95 : 1)}" stroke="${dk}" stroke-width="1"/><circle cx="55.5" cy="64" r="1.2" fill="${dk}"/><circle cx="64.5" cy="64" r="1.2" fill="${dk}"/><path d="M52 73 Q60 77 68 73" stroke="${dk}" stroke-width="1.4" fill="none"/>` : '';
  const mouth = rich ? '' : `<path d="M54 71 Q60 75 66 71" stroke="#7a3b2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  const nose = rich ? '' : `<path d="M60 56 L58 65 Q60 66.5 62 65" stroke="${dk}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const tusks = orc ? both(`<path d="M54 72 L52 64 L57 70Z" fill="#f4f0e0" stroke="#bdb89a" stroke-width=".6"/>`) : '';
  const lash = genere === 'f' && !rich ? `<path d="M46.5 52 l-2.4 -1.6 M73.5 52 l2.4 -1.6" stroke="#222" stroke-width="1.2" stroke-linecap="round"/>` : '';
  const cheeks = genere === 'f' ? `<ellipse cx="46" cy="64" rx="4" ry="2.4" fill="#ff8aa0" opacity=".28"/><ellipse cx="74" cy="64" rx="4" ry="2.4" fill="#ff8aa0" opacity=".28"/>` : '';
  const hairBackSvg = rich ? '' : hairBack(genere, hair); const hairFrontSvg = rich ? '' : hairFront(genere, hair);
  const hoodedFront = classId === 'ladro' || classId === 'ranger' || classId === 'warlock';
  return `<svg class="portrait" viewBox="0 0 120 140" role="img" aria-label="Ritratto: ${raceId}, ${classId}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient><clipPath id="${id}c"><rect width="120" height="140" rx="12"/></clipPath></defs>
  <g clip-path="url(#${id}c)"><rect width="120" height="140" fill="url(#${id}b)"/>${behind(classId)}${hairBackSvg}${outfit(classId, raceId)}
  <rect x="52" y="76" width="16" height="22" fill="${dk}"/>${ears(raceId, skin)}${horns}${crest}
  <ellipse cx="60" cy="56" rx="22" ry="26" fill="${skin}" stroke="${dk}" stroke-width="1.2"/>${orc ? `<ellipse cx="60" cy="70" rx="21" ry="14" fill="${skin}"/>` : ''}${snout}
  ${cheeks}${eyes}${lash}${brows}${nose}${mouth}${tusks}${beard(raceId, genere, hair)}${hoodedFront ? '' : hairFrontSvg}${headgear(classId, hair)}${hoodedFront ? '' : ''}</g></svg>`;
}

export const portraitOf = ch => portrait({ raceId: ch?.data?.raceId, classId: ch?.data?.classId, genere: ch?.data?.genere || 'n', seed: ch?.name || '' });
