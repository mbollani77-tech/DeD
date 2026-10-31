// Temi grafici delle stanze e arredi decorativi (disegnati in SVG, o in 3D da board3d.js).

export const THEMES = {
  cripta: { nome: 'Cripta di pietra', wallStyle: 'stone', bg: '#161c22', hatch: '#39444d', floor: ['#c8cec8', '#c0c7c1', '#cdd2cb'], edge: '#00000022', stain: '#5d6b5a', wall: '#3d4953', wallTop: '#5f6c76', diff: '#aa9f7c', water: '#6c9db4', sky: 0x10161b },
  caverna: { nome: 'Caverna', wallStyle: 'rock', bg: '#231b13', hatch: '#4a3a2a', floor: ['#b7a487', '#ae9b7e', '#bfac8f'], edge: '#3a2a1a1f', stain: '#6a5334', wall: '#4d3a28', wallTop: '#6e5439', diff: '#97875f', water: '#5b8ba0', sky: 0x1b140d },
  foresta: { nome: 'Radura nel bosco', wallStyle: 'bush', bg: '#13211a', hatch: '#2a4630', floor: ['#8dab76', '#84a26d', '#96b47f'], edge: '#1d3a1c22', stain: '#4a6a3a', wall: '#2c4a33', wallTop: '#3f6b49', diff: '#7a8a54', water: '#5a9ab0', sky: 0x0f1d16 },
  tempio: { nome: 'Tempio antico', wallStyle: 'stone', bg: '#241d13', hatch: '#58482e', floor: ['#d6cbae', '#cfc3a4', '#dcd1b6'], edge: '#5a481f22', stain: '#8d7a4a', wall: '#6a573a', wallTop: '#8a7350', diff: '#bcab80', water: '#78a6b8', sky: 0x1d170e },
  ghiaccio: { nome: 'Grotta di ghiaccio', wallStyle: 'stone', bg: '#101b24', hatch: '#2d4859', floor: ['#d4e4ec', '#cde0ea', '#dcebf2'], edge: '#2a5a7a22', stain: '#8fb4c8', wall: '#4a6679', wallTop: '#7392a6', diff: '#b6cbd7', water: '#4a8cb4', sky: 0x0c161e },
};
export const THEME_LIST = Object.entries(THEMES).map(([v, t]) => ({ v, l: t.nome }));
export const LUCI = [{ v: 'piena', l: 'Luminosa' }, { v: 'fioca', l: 'Fioca (torce e lanterne)' }, { v: 'buia', l: 'Buia (solo lanterne e fuochi)' }];

// luce = raggio illuminato in esagoni; blocca = impedisce il passaggio; sumuro = si piazza sui muri
export const PROPS = {
  torcia: { nome: 'Torcia a muro', blocca: false, luce: 5, sumuro: true },
  fuoco: { nome: 'Falò', blocca: false, luce: 5 },
  fungo: { nome: 'Funghi luminosi', blocca: false, luce: 3 },
  colonna: { nome: 'Colonna', blocca: true },
  statua: { nome: 'Statua', blocca: true },
  sarcofago: { nome: 'Sarcofago', blocca: true },
  altare: { nome: 'Altare', blocca: true },
  tavolo: { nome: 'Tavolo', blocca: true },
  pozzo: { nome: 'Pozzo', blocca: true },
  albero: { nome: 'Albero', blocca: true },
  stalagmite: { nome: 'Stalagmite', blocca: true },
  botte: { nome: 'Botte', blocca: true },
  casse: { nome: 'Casse', blocca: true },
  macerie: { nome: 'Macerie', blocca: false },
  cespuglio: { nome: 'Cespuglio', blocca: false },
  ossa: { nome: 'Ossa', blocca: false },
  tappeto: { nome: 'Tappeto', blocca: false },
  ragnatela: { nome: 'Ragnatela', blocca: false },
};
export const PROP_LIST = Object.entries(PROPS).map(([v, p]) => ({ v, l: p.nome }));
export const THEME_PROPS = {
  cripta: ['sarcofago', 'statua', 'colonna', 'ossa', 'ragnatela', 'botte', 'macerie', 'altare', 'casse'],
  caverna: ['stalagmite', 'stalagmite', 'macerie', 'ossa', 'fungo', 'fuoco', 'ragnatela'],
  foresta: ['albero', 'albero', 'cespuglio', 'cespuglio', 'macerie', 'fuoco', 'fungo', 'ossa'],
  tempio: ['colonna', 'statua', 'altare', 'tappeto', 'tavolo', 'pozzo', 'botte'],
  ghiaccio: ['stalagmite', 'macerie', 'ossa', 'statua', 'fuoco', 'casse'],
};

/** Numero pseudo-casuale stabile in [0,1) per un esagono: lo stesso esagono ha sempre lo stesso aspetto. */
export function hash(c, r, k = 0) {
  let h = (Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663) ^ Math.imul(k + 7, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const propBlocks = (room) => new Set((room.meta?.props || []).filter(p => PROPS[p.t]?.blocca).map(p => p.c + ',' + p.r));

/** Disegno 2D di un arredo, centrato sull'origine (il raggio dell'esagono è 24). */
export function propSvg(type, c, r) {
  const rot = Math.floor(hash(c, r, 1) * 6) * 60, flip = hash(c, r, 2) > 0.5 ? -1 : 1;
  const sh = (rx, ry, dx = 2, dy = 4) => `<ellipse cx="${dx}" cy="${dy}" rx="${rx}" ry="${ry}" fill="#0000003a"/>`;
  switch (type) {
    case 'colonna': return `${sh(10, 8)}<circle r="10" fill="#aeb4af" stroke="#4d5650" stroke-width="1.5"/><circle r="6.5" fill="#d3d8d2" stroke="#8b938c"/><circle cx="-2" cy="-2" r="2.4" fill="#ffffff88"/>`;
    case 'statua': return `${sh(11, 8)}<rect x="-8" y="-4" width="16" height="12" rx="2" fill="#98a09a" stroke="#4d5650"/><path d="M-5 -4 L-4 -12 L4 -12 L5 -4 Z" fill="#b9c0ba" stroke="#5d665f"/><circle cy="-15" r="4.2" fill="#c7cdc7" stroke="#5d665f"/>`;
    case 'sarcofago': return `<g transform="rotate(${rot % 180})">${sh(15, 8)}<rect x="-15" y="-8" width="30" height="16" rx="5" fill="#9aa09b" stroke="#40484a" stroke-width="1.5"/><rect x="-11" y="-5" width="22" height="10" rx="3.5" fill="#b8beb9" stroke="#6b746d"/><path d="M-6 0 H6 M0 -3 V3" stroke="#6b746d" stroke-width="1.5"/></g>`;
    case 'altare': return `${sh(13, 8)}<rect x="-13" y="-8" width="26" height="16" rx="2" fill="#a8a196" stroke="#4a4438" stroke-width="1.5"/><rect x="-10" y="-5" width="20" height="10" fill="#8c2f39" stroke="#d6b45a" stroke-width="1"/><circle cx="-6" cy="-1" r="1.8" fill="#ffd46a"/><circle cx="6" cy="-1" r="1.8" fill="#ffd46a"/>`;
    case 'tavolo': return `<g transform="rotate(${(rot % 120)})">${sh(15, 9)}<rect x="-15" y="-8" width="30" height="16" rx="3" fill="#8a6a42" stroke="#46331c" stroke-width="1.5"/><path d="M-15 -2.5 H15 M-15 3 H15" stroke="#6c502d"/><circle cx="-8" cy="-13" r="3.6" fill="#7a5c37" stroke="#46331c"/><circle cx="8" cy="13" r="3.6" fill="#7a5c37" stroke="#46331c"/></g>`;
    case 'botte': return `${sh(9, 7)}<circle r="9" fill="#8a5f34" stroke="#3c2812" stroke-width="1.5"/><circle r="6" fill="#a87843" stroke="#5b3d1c"/><path d="M-6 0 H6 M0 -6 V6" stroke="#5b3d1c" stroke-width=".8" opacity=".7"/>`;
    case 'casse': return `<g transform="rotate(${rot % 90})">${sh(13, 8)}<rect x="-12" y="-9" width="14" height="14" fill="#9b7443" stroke="#46301a" stroke-width="1.4"/><path d="M-12 -9 L2 5 M2 -9 L-12 5" stroke="#6e4f2b"/><rect x="2" y="-1" width="11" height="11" fill="#8d6a3c" stroke="#46301a" stroke-width="1.4" transform="rotate(14 7 4)"/></g>`;
    case 'macerie': return `<polygon points="-12,4 -7,-6 -1,-3 -3,5" fill="#8d918d" stroke="#454a46"/><polygon points="2,6 6,-2 13,1 11,8" fill="#a1a5a0" stroke="#454a46"/><polygon points="-3,-9 3,-12 7,-6 1,-5" fill="#7b807b" stroke="#454a46"/><circle cx="-8" cy="9" r="2.2" fill="#8d918d"/>`;
    case 'tappeto': return `<g transform="rotate(${rot % 180})"><rect x="-17" y="-11" width="34" height="22" rx="2" fill="#86303b" stroke="#d6b45a" stroke-width="1.6"/><rect x="-12" y="-6.5" width="24" height="13" fill="none" stroke="#d6b45a" stroke-width=".9" stroke-dasharray="3 2"/><circle r="3" fill="#d6b45a" opacity=".85"/></g>`;
    case 'ossa': return `<g transform="rotate(${rot})"><path d="M-10 6 L9 -4 M-8 -4 L10 7" stroke="#e6e0cf" stroke-width="2.6" stroke-linecap="round"/><circle cx="-10" cy="6" r="2" fill="#e6e0cf"/><circle cx="9" cy="-4" r="2" fill="#e6e0cf"/></g><circle cx="${-3 * flip}" cy="-6" r="5" fill="#efe9d8" stroke="#8c8672"/><circle cx="${-5 * flip}" cy="-7" r="1.2" fill="#3d3a30"/><circle cx="${-1 * flip}" cy="-7" r="1.2" fill="#3d3a30"/>`;
    case 'ragnatela': return `<g stroke="#f2f4f2" stroke-width=".8" fill="none" opacity=".75" transform="translate(${-8 * flip},-8) scale(${flip},1)"><path d="M0 0 L22 0 M0 0 L20 14 M0 0 L8 22 M0 0 L0 24"/><path d="M8 0 Q8 8 0 8 M15 0 Q15 15 0 15 M22 0 Q22 22 0 22"/></g>`;
    case 'pozzo': return `${sh(13, 9)}<circle r="13" fill="#9b9d96" stroke="#43463f" stroke-width="1.8"/><circle r="8.5" fill="#22495f"/><circle r="8.5" fill="none" stroke="#6b7c86" stroke-width="1"/><path d="M-4 -1 Q0 -4 4 -1" stroke="#7fb3cc" fill="none"/>`;
    case 'albero': return `<ellipse cx="4" cy="8" rx="17" ry="12" fill="#0000003a"/><circle cx="-6" cy="-3" r="11" fill="#2f6b3a" stroke="#183a20"/><circle cx="7" cy="-5" r="10" fill="#3a7d45" stroke="#183a20"/><circle cx="1" cy="6" r="10" fill="#2c6236" stroke="#183a20"/><circle cx="-2" cy="-4" r="4" fill="#58a064" opacity=".7"/>`;
    case 'cespuglio': return `<circle cx="-5" cy="2" r="6.5" fill="#3d7a47" stroke="#1c3f24"/><circle cx="5" cy="1" r="7" fill="#4a8c54" stroke="#1c3f24"/><circle cx="0" cy="-4" r="6" fill="#56a062" stroke="#1c3f24"/><circle cx="3" cy="-6" r="1.4" fill="#e8c24a"/>`;
    case 'stalagmite': return `${sh(10, 6)}<polygon points="-9,8 -2,-13 3,8" fill="#8a7a62" stroke="#3d3222"/><polygon points="-2,-13 3,8 9,8 5,-4" fill="#a39378" stroke="#3d3222"/><polygon points="3,8 9,8 7,2" fill="#6d5f4a"/>`;
    case 'fungo': return `<g><rect x="-6" y="-2" width="3" height="9" fill="#d9e8e3"/><ellipse cx="-4.5" cy="-3" rx="6" ry="4" fill="#52d6c4" stroke="#1d7a70"/><rect x="5" y="2" width="2.6" height="7" fill="#d9e8e3"/><ellipse cx="6.3" cy="1" rx="4.5" ry="3.2" fill="#7ee6d6" stroke="#1d7a70"/><circle cx="-6" cy="-4" r="1" fill="#fff"/></g>`;
    case 'fuoco': return `<circle r="10" fill="#0000003a"/><g fill="#7c7f7a" stroke="#3c3f3b"><circle cx="-9" cy="0" r="3.4"/><circle cx="9" cy="1" r="3.4"/><circle cx="0" cy="-9" r="3.4"/><circle cx="0" cy="9" r="3.4"/><circle cx="-6.4" cy="-6.4" r="3"/><circle cx="6.4" cy="6.4" r="3"/></g><g class="flame"><path d="M0 -10 Q8 -2 5 5 Q0 9 -5 5 Q-8 -2 0 -10Z" fill="#ff8a1f"/><path d="M0 -5 Q4 0 2.5 4 Q0 6 -2.5 4 Q-4 0 0 -5Z" fill="#ffd45a"/></g>`;
    case 'torcia': return `<g class="flame"><circle cy="-2" r="9" fill="#ffb347" opacity=".35"/><path d="M0 -11 Q6 -4 4 2 Q0 5 -4 2 Q-6 -4 0 -11Z" fill="#ff8a1f"/><path d="M0 -6 Q3 -2 2 1 Q0 3 -2 1 Q-3 -2 0 -6Z" fill="#ffe27a"/></g><rect x="-1.6" y="2" width="3.2" height="9" fill="#5a3f22"/><rect x="-5" y="1" width="10" height="2.6" rx="1" fill="#2e2a26"/>`;
    default: return `<circle r="6" fill="#888"/>`;
  }
}
