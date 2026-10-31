// Vista 3D (three.js): stesso contratto di board.js (render, fit, zoom, panToXY), caricata solo quando serve.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { center, key } from './hex.js';
import { PROPS, hash } from './props.js';
import { themeOf } from './board.js';

const SIZE_2D = 24;
const HEIGHT = { f: 0.28, d: 0.36, a: 0.12, w: 1.05, void: 0.1 };
const CLASS_COL = { barbaro: 0x8b3a2b, bardo: 0xb0457a, chierico: 0xe6dfc9, druido: 0x4f7a3a, guerriero: 0x5f6e80, ladro: 0x2f3540, mago: 0x4a3f9a, monaco: 0xd9822b, paladino: 0xd8b348, ranger: 0x3f6b45, stregone: 0xa02f47, warlock: 0x4a2a63 };
const SKIN = { umano: 0xe0b48a, 'elfo-alto': 0xeed2b0, 'elfo-bosco': 0xd5a97b, nano: 0xd9a074, halfling: 0xe3b88e, gnomo: 0xe8b99a, mezzelfo: 0xe3bc92, mezzorco: 0x7da05a, dragonide: 0x3f8f8a, tiefling: 0xb8454f };
const RACE_SCALE = { halfling: 0.82, gnomo: 0.82, nano: 0.88, 'elfo-alto': 1.06, 'elfo-bosco': 1.06, dragonide: 1.12, mezzorco: 1.08 };

/* ---------- utilità ---------- */
const matCache = new Map();
const mat = (color, o = {}) => { const k = color + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...o })); return matCache.get(k); };
const glow = (color, i = 1.4) => mat(color, { emissive: color, emissiveIntensity: i, roughness: 0.5 });
const geoCache = new Map();
const geo = (name, make) => { if (!geoCache.has(name)) geoCache.set(name, make()); return geoCache.get(name); };
const cyl = (rt, rb, h, seg = 14) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r, ws = 14, hs = 10) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, seg = 12) => geo(`n${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const ico = (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const tor = (r, t, arc = Math.PI * 2) => geo(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 8, 20, arc));
const lathe = (name, pts) => geo('l' + name, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20));
function mesh(g, m, x = 0, y = 0, z = 0, cast = true) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; }
const add = (grp, ...kids) => { kids.forEach(k => grp.add(k)); return grp; };
const surfaceY = (room, c, r) => HEIGHT[room.cells[key(c, r)] || 'f'] ?? HEIGHT.f;
const hexPos = (c, r) => { const [x, z] = center(c, r, 1); return [x, z]; };

/* ---------- arredi ---------- */
function propMesh(type, c, r, T) {
  const g = new THREE.Group(); const rot = Math.floor(hash(c, r, 1) * 6) * (Math.PI / 3); g.rotation.y = rot;
  const stone = mat(0xaeb4af), dark = mat(0x8a918b), wood = mat(0x8a6a42), woodD = mat(0x6c4f2d);
  switch (type) {
    case 'colonna': add(g, mesh(cyl(0.52, 0.56, 0.22), stone, 0, 0.11), mesh(cyl(0.36, 0.4, 1.7), mat(0xc6cbc5), 0, 1.07), mesh(cyl(0.54, 0.4, 0.24), stone, 0, 2.04)); break;
    case 'statua': add(g, mesh(box(0.85, 0.5, 0.85), dark, 0, 0.25), mesh(cone(0.34, 1.1), stone, 0, 1.05), mesh(sph(0.22), mat(0xc4c9c3), 0, 1.75), mesh(box(0.1, 0.5, 0.1), stone, 0.36, 1.25)); break;
    case 'sarcofago': add(g, mesh(box(1.55, 0.5, 0.8), dark, 0, 0.25), mesh(box(1.4, 0.2, 0.66), stone, 0, 0.6), mesh(box(0.5, 0.06, 0.12), mat(0x6b746d), 0, 0.72)); break;
    case 'altare': add(g, mesh(box(1.4, 0.75, 0.85), mat(0xa8a196), 0, 0.37), mesh(box(1.2, 0.05, 0.7), mat(0x8c2f39), 0, 0.77), mesh(cyl(0.05, 0.05, 0.3, 8), mat(0xeee6c8), -0.4, 0.95), mesh(cyl(0.05, 0.05, 0.3, 8), mat(0xeee6c8), 0.4, 0.95), mesh(cone(0.06, 0.16, 8), glow(0xffb347), -0.4, 1.2, 0, false), mesh(cone(0.06, 0.16, 8), glow(0xffb347), 0.4, 1.2, 0, false)); break;
    case 'tavolo': add(g, mesh(box(1.6, 0.1, 0.85), wood, 0, 0.62), ...[[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]].map(([x, z]) => mesh(box(0.1, 0.6, 0.1), woodD, x, 0.3, z)), mesh(cyl(0.2, 0.2, 0.4), woodD, -0.5, 0.2, 0.8), mesh(cyl(0.2, 0.2, 0.4), woodD, 0.6, 0.2, -0.8), mesh(cyl(0.14, 0.12, 0.12), mat(0xd8c9a0), 0.2, 0.73)); break;
    case 'botte': add(g, mesh(cyl(0.42, 0.42, 0.8), mat(0x8a5f34), 0, 0.4), mesh(tor(0.43, 0.04), mat(0x3a3028), 0, 0.2).rotateX(Math.PI / 2), mesh(tor(0.43, 0.04), mat(0x3a3028), 0, 0.6).rotateX(Math.PI / 2)); break;
    case 'casse': add(g, mesh(box(0.7, 0.7, 0.7), mat(0x9b7443), -0.3, 0.35, -0.1), mesh(box(0.55, 0.55, 0.55), mat(0x8d6a3c), 0.4, 0.28, 0.25).rotateY(0.4), mesh(box(0.4, 0.4, 0.4), mat(0xa57c49), 0.0, 0.9, -0.1).rotateY(0.2)); break;
    case 'macerie': for (let i = 0; i < 5; i++) { const m = mesh(ico(0.18 + hash(c, r, 40 + i) * 0.18), mat(0x8d918d), (hash(c, r, 50 + i) - 0.5) * 1.1, 0.14, (hash(c, r, 60 + i) - 0.5) * 1.1); m.rotation.set(i, i * 2, 0); g.add(m); } break;
    case 'tappeto': add(g, mesh(box(1.7, 0.03, 1.1), mat(0x86303b), 0, 0.02, 0, false), mesh(box(1.5, 0.036, 0.9), mat(0xd6b45a), 0, 0.022, 0, false), mesh(box(1.38, 0.04, 0.78), mat(0x86303b), 0, 0.024, 0, false)); break;
    case 'ossa': add(g, mesh(cyl(0.05, 0.05, 0.8, 6), mat(0xe6e0cf), 0, 0.06).rotateZ(Math.PI / 2), mesh(cyl(0.05, 0.05, 0.7, 6), mat(0xe6e0cf), 0, 0.09).rotateX(Math.PI / 2), mesh(sph(0.2), mat(0xefe9d8), 0.3, 0.2, 0.25), mesh(sph(0.05), mat(0x2a2820), 0.38, 0.24, 0.4), mesh(sph(0.05), mat(0x2a2820), 0.24, 0.24, 0.42)); break;
    case 'pozzo': add(g, mesh(cyl(0.7, 0.75, 0.55, 16), mat(0x9b9d96), 0, 0.27), mesh(cyl(0.5, 0.5, 0.05, 16), mat(0x22495f, { roughness: 0.2 }), 0, 0.52), mesh(box(0.08, 1.2, 0.08), woodD, -0.62, 0.9), mesh(box(0.08, 1.2, 0.08), woodD, 0.62, 0.9), mesh(box(1.4, 0.08, 0.1), woodD, 0, 1.5)); break;
    case 'albero': add(g, mesh(cyl(0.18, 0.3, 1.3, 8), mat(0x5a3f22), 0, 0.65), mesh(ico(0.85, 1), mat(0x2f6b3a, { flatShading: true }), -0.1, 1.7, 0), mesh(ico(0.65, 1), mat(0x3a7d45, { flatShading: true }), 0.35, 2.1, 0.1), mesh(ico(0.6, 1), mat(0x2c6236, { flatShading: true }), -0.3, 2.25, -0.2)); break;
    case 'cespuglio': add(g, mesh(ico(0.34, 1), mat(0x3d7a47, { flatShading: true }), -0.25, 0.28), mesh(ico(0.4, 1), mat(0x4a8c54, { flatShading: true }), 0.25, 0.3), mesh(ico(0.3, 1), mat(0x56a062, { flatShading: true }), 0, 0.5, -0.2)); break;
    case 'stalagmite': add(g, mesh(cone(0.4, 1.7, 7), mat(0x8a7a62, { flatShading: true }), 0, 0.85), mesh(cone(0.25, 1.0, 7), mat(0xa39378, { flatShading: true }), 0.4, 0.5, 0.2)); break;
    case 'fungo': [[-0.3, 0.1, 0.35], [0.25, -0.15, 0.25], [0.1, 0.3, 0.2]].forEach(([x, z, s]) => { const cap = mesh(sph(s, 12, 8), glow(0x52d6c4, 1.1), x, s * 1.6, z, false); cap.scale.y = 0.6; add(g, mesh(cyl(0.05, 0.07, s * 1.6, 8), mat(0xd9e8e3), x, s * 0.8, z), cap); }); break;
    case 'fuoco': for (let i = 0; i < 7; i++) g.add(mesh(ico(0.16), mat(0x7c7f7a), Math.cos(i) * 0.5, 0.12, Math.sin(i) * 0.5)); add(g, mesh(cone(0.28, 0.8, 8), glow(0xff8a1f, 2.2), 0, 0.55, 0, false), mesh(cone(0.15, 0.5, 8), glow(0xffd45a, 2.6), 0, 0.5, 0, false)); g.userData.flame = true; break;
    case 'torcia': add(g, mesh(cyl(0.05, 0.07, 0.7, 6), woodD, 0, 0.35), mesh(cone(0.17, 0.45, 8), glow(0xff8a1f, 2.4), 0, 0.85, 0, false), mesh(cone(0.09, 0.3, 8), glow(0xffe27a, 2.6), 0, 0.83, 0, false)); g.userData.flame = true; break;
    default: break;
  }
  return g;
}

/* ---------- miniature dei personaggi ---------- */
const bodyGeo = () => lathe('body', [[0.001, 0.14], [0.46, 0.14], [0.5, 0.2], [0.4, 0.45], [0.3, 0.85], [0.34, 1.0], [0.26, 1.12], [0.001, 1.12]]);
const sword = (len = 0.95, col = 0xcfd6dc) => { const s = new THREE.Group(); s.add(mesh(box(0.07, len, 0.025), mat(col, { metalness: 0.7, roughness: 0.3 }), 0, len / 2 + 0.1), mesh(box(0.28, 0.06, 0.06), mat(0x6b4a1e), 0, 0.1), mesh(cyl(0.035, 0.035, 0.2, 6), mat(0x4a3216), 0, 0)); return s; };
const helmetGeo = () => geo('helmet', () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, 1.25));
const staff = (len = 1.6, orb = 0x6aa8ff) => { const s = new THREE.Group(); s.add(mesh(cyl(0.04, 0.05, len, 6), mat(0x6b4a1e), 0, len / 2), mesh(sph(0.11), glow(orb, 1.6), 0, len + 0.06, 0, false)); return s; };

export function makePC(ch) {
  const g = new THREE.Group(); const cls = ch.data?.classId || 'guerriero', race = ch.data?.raceId || 'umano';
  const body = CLASS_COL[cls] ?? 0x5f6e80, skin = SKIN[race] ?? SKIN.umano; const inner = new THREE.Group(); inner.scale.setScalar(RACE_SCALE[race] ?? 1);
  inner.add(mesh(bodyGeo(), mat(body)), mesh(sph(0.27, 16, 12), mat(skin), 0, 1.3));
  // sash e dettagli
  inner.add(mesh(tor(0.33, 0.045), mat(0x2b2118), 0, 0.62).rotateX(Math.PI / 2));
  // razza
  if (race.startsWith('elfo') || race === 'mezzelfo') [-1, 1].forEach(s => { const e = mesh(cone(0.07, 0.34, 6), mat(skin), s * 0.3, 1.36, 0); e.rotation.z = -s * 1.2; inner.add(e); });
  if (race === 'nano') inner.add(mesh(cone(0.2, 0.55, 8), mat(0xb4672a), 0, 1.0, 0.18).rotateX(Math.PI));
  if (race === 'gnomo') inner.add(mesh(sph(0.1), mat(skin), 0, 1.28, 0.27));
  if (race === 'tiefling') [-1, 1].forEach(s => { const h = mesh(cone(0.07, 0.38, 6), mat(0x2d1a1a), s * 0.15, 1.6, 0); h.rotation.z = -s * 0.35; inner.add(h); });
  if (race === 'mezzorco') [-1, 1].forEach(s => inner.add(mesh(cone(0.04, 0.14, 6), mat(0xf2ead2), s * 0.1, 1.2, 0.24)));
  if (race === 'dragonide') { inner.add(mesh(box(0.2, 0.15, 0.22), mat(skin), 0, 1.25, 0.26), mesh(cone(0.1, 0.55, 6), mat(skin), 0, 0.35, -0.5).rotateX(-1.9)); }
  // equipaggiamento
  const R = (o, x, y, z, rx = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz; inner.add(o); };
  switch (cls) {
    case 'guerriero': case 'paladino': { R(sword(), 0.5, 0.55, 0.1, 0.2, -0.15); R(mesh(cyl(0.3, 0.3, 0.07, 16), mat(cls === 'paladino' ? 0xe5c76a : 0x8a2f2f)), -0.42, 0.85, 0.15, Math.PI / 2, 0); inner.add(mesh(helmetGeo(), mat(0x9aa4ae, { metalness: 0.6, roughness: 0.4 }), 0, 1.3)); break; }
    case 'mago': { inner.add(mesh(cone(0.36, 0.8, 12), mat(0x3a2f86), 0, 1.78), mesh(cyl(0.5, 0.5, 0.05, 16), mat(0x3a2f86), 0, 1.47)); R(staff(1.7), 0.5, 0, 0.05); break; }
    case 'stregone': { inner.add(mesh(cone(0.18, 0.5, 6), mat(0xa02f47), 0, 1.7)); R(mesh(sph(0.14), glow(0xff5a3c, 1.5), 0, 0, 0, false), 0.5, 0.95, 0.15); break; }
    case 'warlock': { inner.add(mesh(cone(0.34, 0.6, 10), mat(0x2a1838), 0, 1.5)); R(mesh(sph(0.14), glow(0xb066ff, 1.8), 0, 0, 0, false), 0.5, 0.95, 0.15); break; }
    case 'chierico': { R(mesh(cyl(0.04, 0.04, 1.0, 6), mat(0x6b4a1e)), 0.5, 0.55, 0.1); R(mesh(sph(0.15), mat(0xd8b348, { metalness: 0.6 })), 0.5, 1.12, 0.1); inner.add(mesh(tor(0.22, 0.03), glow(0xffe9a0, 0.9), 0, 1.72, 0, false).rotateX(Math.PI / 2)); break; }
    case 'ladro': { inner.add(mesh(cone(0.34, 0.55, 10), mat(0x2f3540), 0, 1.45), mesh(box(0.05, 0.4, 0.02), mat(0xcfd6dc, { metalness: 0.7 }), 0.45, 0.8, 0.15)); break; }
    case 'barbaro': { R(mesh(cyl(0.045, 0.045, 1.3, 6), mat(0x6b4a1e)), 0.5, 0.65, 0.1); R(mesh(box(0.42, 0.34, 0.05), mat(0xb8c0c8, { metalness: 0.6 })), 0.68, 1.25, 0.1); [-1, 1].forEach(s => { const h = mesh(cone(0.07, 0.3, 6), mat(0xe8e0c4), s * 0.27, 1.6, 0); h.rotation.z = -s * 0.9; inner.add(h); }); break; }
    case 'bardo': { inner.add(mesh(cone(0.3, 0.3, 10), mat(0xb0457a), 0, 1.62), mesh(box(0.03, 0.4, 0.03), mat(0xf2e9c8), 0.18, 1.8)); const lute = mesh(sph(0.2, 12, 10), mat(0xb8803c)); lute.scale.z = 0.5; R(lute, 0.4, 0.8, 0.22); break; }
    case 'druido': { inner.add(mesh(cone(0.34, 0.3, 9), mat(0x3f6b2a), 0, 1.6), mesh(cone(0.1, 0.25, 5), mat(0x58a064), 0.2, 1.7)); R(staff(1.5, 0x7bd67b), 0.5, 0, 0.05); break; }
    case 'monaco': { inner.add(mesh(tor(0.3, 0.05), mat(0xd9822b), 0, 0.75).rotateX(Math.PI / 2)); R(mesh(cyl(0.035, 0.035, 1.6, 6), mat(0x6b4a1e)), 0.5, 0.8, 0.1); break; }
    case 'ranger': { inner.add(mesh(cone(0.33, 0.5, 10), mat(0x3f6b45), 0, 1.45)); R(mesh(tor(0.5, 0.035, Math.PI), mat(0x6b4a1e)), 0.46, 0.95, 0, 0, Math.PI / 2); inner.add(mesh(cyl(0.09, 0.09, 0.5, 8), mat(0x5a3f22), -0.2, 0.95, -0.28)); break; }
    default: break;
  }
  g.add(inner); return g;
}

/* ---------- mostri ---------- */
function quad(g, body, head, tail = true, scale = 1, eye = 0xffd54a) {
  const s = new THREE.Group();
  const trunk = mesh(sph(0.42, 14, 10), mat(body), 0, 0.62, 0); trunk.scale.set(1.35, 0.8, 0.8);
  s.add(trunk, mesh(sph(0.26, 12, 10), mat(head), 0.55, 0.82, 0), mesh(cone(0.12, 0.32, 8), mat(head), 0.82, 0.76, 0).rotateZ(-Math.PI / 2));
  [[0.3, 0.25], [0.3, -0.25], [-0.3, 0.25], [-0.3, -0.25]].forEach(([x, z]) => s.add(mesh(cyl(0.07, 0.06, 0.5, 6), mat(body), x, 0.28, z)));
  [-1, 1].forEach(z => { s.add(mesh(cone(0.06, 0.16, 5), mat(head), 0.5, 1.08, z * 0.14), mesh(sph(0.04), glow(eye, 1.2), 0.74, 0.88, z * 0.1, false)); });
  if (tail) s.add(mesh(cone(0.07, 0.6, 6), mat(body), -0.7, 0.8, 0).rotateZ(1.2));
  s.scale.setScalar(scale); g.add(s);
}
function humanoid(g, { skin, cloth = 0x4a3a2a, scale = 1, ears = false, tusks = false, club = null, bow = false, big = false, horns = false, hunched = false }) {
  const b = new THREE.Group(); b.scale.setScalar(scale);
  const body = mesh(bodyGeo(), mat(cloth)); const head = mesh(sph(big ? 0.34 : 0.28, 14, 10), mat(skin), 0, 1.3, hunched ? 0.12 : 0);
  b.add(body, head); if (hunched) body.rotation.x = 0.25;
  [-1, 1].forEach(s => { b.add(mesh(cyl(0.07, 0.09, 0.62, 6), mat(skin), s * 0.34, 0.8, hunched ? 0.28 : 0.05).rotateX(hunched ? -1.2 : 0), mesh(sph(0.045), glow(0xffd54a, 1.2), s * 0.1, 1.34, (big ? 0.31 : 0.25) + (hunched ? 0.12 : 0), false)); if (ears) { const e = mesh(cone(0.09, 0.45, 5), mat(skin), s * 0.34, 1.36, 0); e.rotation.z = -s * 1.3; b.add(e); } if (tusks) b.add(mesh(cone(0.035, 0.16, 5), mat(0xf2ead2), s * 0.11, 1.17, 0.3).rotateX(Math.PI)); if (horns) { const h = mesh(cone(0.07, 0.36, 6), mat(0x3a2a20), s * 0.17, 1.62, 0); h.rotation.z = -s * 0.4; b.add(h); } });
  if (club) { const c = new THREE.Group(); c.add(mesh(cyl(0.05, 0.09, 1.0, 6), mat(0x6b4a1e), 0, 0.5), mesh(sph(0.16), mat(0x5a3f22), 0, 1.0)); c.position.set(0.55, 0.45, 0.2); c.rotation.x = 0.4; b.add(c); }
  if (bow) b.add(mesh(tor(0.45, 0.03, Math.PI), mat(0x6b4a1e), 0.5, 0.95, 0).rotateZ(Math.PI / 2));
  g.add(b);
}
function skeleton(g) {
  const b = new THREE.Group(); const bone = mat(0xe8e2cc);
  b.add(mesh(cyl(0.05, 0.05, 0.9, 6), bone, 0, 0.6), mesh(sph(0.26, 14, 10), bone, 0, 1.3));
  for (let i = 0; i < 4; i++) b.add(mesh(tor(0.28 - i * 0.025, 0.03), bone, 0, 0.62 + i * 0.14, 0).rotateX(Math.PI / 2));
  [-1, 1].forEach(s => { b.add(mesh(sph(0.06), mat(0x1a1712), s * 0.1, 1.32, 0.22, false), mesh(cyl(0.035, 0.035, 0.7, 5), bone, s * 0.4, 0.8, 0.05)); });
  b.add(mesh(box(0.08, 0.9, 0.025), mat(0x9aa4ae, { metalness: 0.6 }), 0.55, 0.9, 0.1)); b.add(mesh(box(0.34, 0.1, 0.2), bone, 0, 0.18)); g.add(b);
}
function monsterBody(ent) {
  const g = new THREE.Group(); const id = ent.data?.preset || ''; const n = ent.name.toLowerCase();
  const is = k => id.includes(k) || n.includes(k);
  if (is('ratto')) quad(g, 0x6b5a48, 0x7a6752, true, 0.7, 0xff5a5a);
  else if (is('lupo')) quad(g, 0x7d838a, 0x8d939a, true, 1.0);
  else if (is('segugio')) quad(g, 0x5a1f1a, 0x7a2a22, true, 1.25, 0xff6a2a);
  else if (is('goblin')) humanoid(g, { skin: 0x6f9a3a, cloth: 0x5a3f22, scale: 0.85, ears: true, club: !is('arcier'), bow: is('arcier') });
  else if (is('coboldo')) humanoid(g, { skin: 0xb5532f, cloth: 0x3f3a30, scale: 0.8, horns: true, club: true });
  else if (is('scheletro')) skeleton(g);
  else if (is('zombi')) humanoid(g, { skin: 0x7d8f6a, cloth: 0x4a4a42, scale: 1.0, hunched: true });
  else if (is('ghoul')) humanoid(g, { skin: 0xa5a8a0, cloth: 0x3a3a3a, scale: 1.0, hunched: true, ears: true });
  else if (is('gnoll')) humanoid(g, { skin: 0xa0804a, cloth: 0x6b4a1e, scale: 1.1, ears: true, club: true });
  else if (is('orco')) humanoid(g, { skin: 0x6f8f4a, cloth: 0x4a3a2a, scale: 1.18, tusks: true, club: true, big: true });
  else if (is('bugbear')) humanoid(g, { skin: 0xa8723a, cloth: 0x4a3a2a, scale: 1.25, ears: true, club: true, big: true });
  else if (is('ogre')) humanoid(g, { skin: 0xc9a85a, cloth: 0x5a4a2a, scale: 1.55, tusks: true, club: true, big: true });
  else if (is('troll')) humanoid(g, { skin: 0x5d8f6a, cloth: 0x3a4a3a, scale: 1.7, tusks: true, big: true, hunched: true });
  else if (is('mimic')) { g.add(mesh(box(1.1, 0.6, 0.8), mat(0x9a6a2f), 0, 0.35), mesh(box(1.1, 0.25, 0.8), mat(0xb98238), 0, 0.85).rotateX(-0.45)); for (let i = -2; i <= 2; i++) g.add(mesh(cone(0.06, 0.16, 5), mat(0xf2ead2), i * 0.2, 0.68, 0.4).rotateX(Math.PI)); g.add(mesh(box(0.8, 0.06, 0.3), mat(0xc0392b), 0, 0.64, 0.25)); }
  else humanoid(g, { skin: 0x8a5a7a, cloth: 0x3a2a40, scale: 1.0, horns: true, ears: false });
  return g;
}

/* ---------- altri oggetti ---------- */
function chestMesh(ent) {
  const looted = ent.data?.looted; const g = new THREE.Group();
  g.add(mesh(box(0.95, 0.5, 0.62), mat(looted ? 0x6e5a3a : 0x9a6a2f), 0, 0.25), mesh(box(0.97, 0.52, 0.04), mat(0xd6b45a, { metalness: 0.5 }), 0.0, 0.25, 0.1), mesh(box(0.97, 0.52, 0.04), mat(0xd6b45a, { metalness: 0.5 }), 0.0, 0.25, -0.1));
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.31);
  const lidG = geo('lid', () => new THREE.CylinderGeometry(0.31, 0.31, 0.95, 12, 1, false, -Math.PI / 2, Math.PI));
  const lidM = mesh(lidG, mat(looted ? 0x7d6844 : 0xb98238), 0, 0, 0.31); lidM.rotation.z = Math.PI / 2; lidM.rotation.y = Math.PI / 2; lid.add(lidM); lid.rotation.x = looted ? -1.3 : 0; g.add(lid);
  if (!looted) g.add(mesh(sph(0.06), mat(0xe5c76a, { metalness: 0.6 }), 0, 0.5, 0.33)); else g.add(mesh(cyl(0.3, 0.3, 0.02, 8), glow(0xe5c76a, 0.3), 0, 0.5, 0, false));
  return g;
}
function doorMesh(ent, room) {
  const g = new THREE.Group(); const open = !ent.data?.locked; const wall = (c, r) => room.cells[key(c, r)] === 'w' || c < 0 || r < 0 || c >= room.cols || r >= room.rows;
  const alongX = wall(ent.col - 1, ent.row) && wall(ent.col + 1, ent.row);
  const frame = mat(0x6b5a46), wood = mat(ent.data?.locked ? 0x6b3a2a : 0x8a5f34);
  add(g, mesh(box(0.22, 1.7, 0.3), frame, -0.75, 0.85), mesh(box(0.22, 1.7, 0.3), frame, 0.75, 0.85), mesh(box(1.72, 0.28, 0.3), frame, 0, 1.78), mesh(tor(0.7, 0.1, Math.PI), frame, 0, 1.5, 0));
  const leaf = mesh(box(1.3, 1.5, 0.1), wood, 0, 0.75); if (open) { leaf.position.set(-0.55, 0.75, 0.55); leaf.rotation.y = -1.2; } g.add(leaf);
  if (!open) g.add(mesh(box(0.22, 0.26, 0.1), mat(0xd9b43f, { metalness: 0.6 }), 0.35, 0.75, 0.1), mesh(tor(0.08, 0.025, Math.PI), mat(0xd9b43f, { metalness: 0.6 }), 0.35, 0.88, 0.1));
  g.rotation.y = alongX ? 0 : Math.PI / 2; return g;
}
function trapMesh(ent) {
  const g = new THREE.Group(); const off = ent.data?.armed === false;
  g.add(mesh(cyl(0.6, 0.6, 0.06, 6), mat(off ? 0x6a6a6a : 0x9c2f2f), 0, 0.03, 0, false));
  if (!off) for (let i = 0; i < 6; i++) g.add(mesh(cone(0.05, 0.28, 5), mat(0xcfd6dc, { metalness: 0.7 }), Math.cos(i * 1.05) * 0.32, 0.18, Math.sin(i * 1.05) * 0.32, false));
  return g;
}

/* ---------- etichette ---------- */
function labelSprite(text, hpRatio = null) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '600 26px system-ui, sans-serif'; x.textAlign = 'center'; x.lineJoin = 'round'; x.lineWidth = 6; x.strokeStyle = '#0b1115'; x.strokeText(text, 128, 28); x.fillStyle = '#fff'; x.fillText(text, 128, 28);
  if (hpRatio != null) { x.fillStyle = '#000a'; x.fillRect(48, 40, 160, 12); x.fillStyle = hpRatio < 0.34 ? '#ef6a62' : hpRatio < 0.67 ? '#e5b84b' : '#5fd4a6'; x.fillRect(50, 42, Math.max(0, 156 * hpRatio), 8); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.set(2.4, 0.6, 1); s.renderOrder = 10; return s;
}

/* ---------- vista ---------- */
export function createBoard3D(container, h = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none'; container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 4; controls.maxDistance = 70; controls.screenSpacePanning = false;
  const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x4a3d30, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);

  let d = null, sig = '', staticGroup = new THREE.Group(), pickables = [], dyn = new THREE.Group(), hlGroup = new THREE.Group(), tokens = new Map(), flames = [], lamps = [], room = null, fitted = null, T = null;
  scene.add(staticGroup, dyn, hlGroup);
  const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();

  function resize() { const w = container.clientWidth, hh = container.clientHeight; if (!w || !hh) return; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(container); resize();

  function clearGroup(grp) { [...grp.children].forEach(o => { grp.remove(o); o.traverse?.(n => { if (n.isInstancedMesh) n.dispose(); }); }); }

  function buildStatic() {
    clearGroup(staticGroup); pickables = []; flames = []; T = themeOf(room);
    const master = d.role === 'master'; const luce = master ? 'piena' : (room.meta?.luce || 'piena');
    scene.background = new THREE.Color(T.sky); scene.fog = new THREE.Fog(T.sky, 38, 95);
    hemi.intensity = luce === 'piena' ? 1.15 : luce === 'fioca' ? 0.42 : 0.14; sun.intensity = luce === 'piena' ? 2.1 : luce === 'fioca' ? 0.65 : 0.2;
    const cx = Math.sqrt(3) * (room.cols + 0.5) / 2, cz = 1.5 * room.rows / 2;
    sun.position.set(cx - 10, 26, cz + 14); sun.target.position.set(cx, 0, cz); const ext = Math.max(room.cols * 1.8, room.rows * 1.6) / 2 + 4; Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 70 }); sun.shadow.camera.updateProjectionMatrix();
    // ground (roccia attorno alla stanza)
    const ground = mesh(new THREE.PlaneGeometry(240, 240), mat(new THREE.Color(T.bg).multiplyScalar(1.4)), cx, -0.02, cz, false); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; staticGroup.add(ground);

    const hexG = geo('hex', () => new THREE.CylinderGeometry(0.975, 0.975, 1, 6));
    const lists = { floor: [], wall: [], water: [] };
    for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) {
      const k = key(c, r); const hide = d.visible && !d.visible.has(k); const t = room.cells[k] || 'f';
      const color = new THREE.Color(hide ? 0x0b1014 : t === 'w' ? T.wall : t === 'a' ? T.water : t === 'd' ? T.diff : T.floor[Math.floor(hash(c, r, 0) * 3)]);
      if (!hide) color.offsetHSL(0, 0, (hash(c, r, 9) - 0.5) * 0.05);
      if (t === 'w' && !hide) color.lerp(new THREE.Color(T.wallTop), hash(c, r, 8) * 0.55);
      const hgt = hide ? HEIGHT.void : t === 'w' ? HEIGHT.w + hash(c, r, 7) * 0.35 : HEIGHT[t] ?? HEIGHT.f;
      (hide ? lists.floor : t === 'w' ? lists.wall : t === 'a' ? lists.water : lists.floor).push({ c, r, color, hgt });
    }
    const build = (items, material) => {
      if (!items.length) return; const im = new THREE.InstancedMesh(hexG, material, items.length); const m = new THREE.Matrix4(); const ids = [];
      items.forEach((it, i) => { const [x, z] = hexPos(it.c, it.r); m.compose(new THREE.Vector3(x, it.hgt / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, it.hgt, 1)); im.setMatrixAt(i, m); im.setColorAt(i, it.color); ids.push({ col: it.c, row: it.r }); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.ids = ids; staticGroup.add(im); pickables.push(im);
    };
    build(lists.floor, mat(0xffffff, { roughness: 0.92 })); build(lists.wall, mat(0xffffff, { roughness: 0.95 })); build(lists.water, mat(0xffffff, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }));

    // rocce nel terreno difficile
    for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) if (room.cells[key(c, r)] === 'd' && !(d.visible && !d.visible.has(key(c, r)))) { const [x, z] = hexPos(c, r); for (let i = 0; i < 3; i++) { const m = mesh(ico(0.14 + hash(c, r, 70 + i) * 0.12), mat(new THREE.Color(T.diff).multiplyScalar(0.65), { flatShading: true }), x + (hash(c, r, 80 + i) - 0.5) * 1.1, HEIGHT.d + 0.05, z + (hash(c, r, 90 + i) - 0.5) * 1.1); m.rotation.set(i, i * 2, 0); staticGroup.add(m); } }

    // arredi e luci
    lamps = [];
    for (const p of room.meta?.props || []) {
      if (d.visible && !d.visible.has(key(p.c, p.r))) continue; const [x, z] = hexPos(p.c, p.r); const y = room.cells[key(p.c, p.r)] === 'w' ? HEIGHT.w + 0.2 : surfaceY(room, p.c, p.r);
      const pm = propMesh(p.t, p.c, p.r, T); pm.position.set(x, y, z); staticGroup.add(pm); if (pm.userData.flame) flames.push(pm);
      if (PROPS[p.t]?.luce) { const L = new THREE.PointLight(p.t === 'fuoco' ? 0xff9a3c : 0xffb25a, luce === 'piena' ? 9 : 26, 12, 1.6); L.position.set(x, y + 1.1, z); L.userData.base = L.intensity; staticGroup.add(L); lamps.push(L); }
    }
  }

  const HL = { move: 0x2fb7a8, atk: 0xe0483d, heal: 0x5fcf72, area: 0x9378e0, int: 0xf0cd7d };
  function buildHighlights() {
    clearGroup(hlGroup); if (!d.hl) return;
    const g = geo('hlhex', () => new THREE.CylinderGeometry(0.92, 0.92, 0.03, 6));
    d.hl.forEach((type, k) => { const [c, r] = k.split(',').map(Number); if (d.visible && !d.visible.has(k)) return; const [x, z] = hexPos(c, r); const m = new THREE.Mesh(g, mat(HL[type] ?? 0xffffff, { transparent: true, opacity: 0.5, emissive: HL[type] ?? 0xffffff, emissiveIntensity: 0.55, depthWrite: false })); m.position.set(x, surfaceY(room, c, r) + 0.03, z); m.renderOrder = 3; hlGroup.add(m); });
  }

  function tokenSpec() {
    const out = []; const master = d.role === 'master'; const luce = room.meta?.luce || 'piena';
    const vis = (c, r) => !d.visible || d.visible.has(key(c, r));
    (d.entities || []).forEach(e => {
      if (!vis(e.col, e.row)) return; const dd = e.data || {};
      const ghost = master && e.hidden;
      out.push({ id: e.id, kind: 'entity', col: e.col, row: e.row, ghost, sel: d.sel?.kind === 'entity' && d.sel.id === e.id,
        sig: [e.kind, e.name, dd.dead, dd.looted, dd.locked, dd.armed, dd.hp, dd.maxHp, ghost, dd.preset].join('|'),
        build: () => {
          const g = new THREE.Group(); let label = null; let top = 1.2;
          if (e.kind === 'monster') { const b = monsterBody(e); g.add(mesh(cyl(0.72, 0.78, 0.14, 24), mat(0x3a1713), 0, 0.07), b); b.position.y = 0.0; if (dd.dead) { b.rotation.z = Math.PI / 2.2; b.position.set(0, 0.35, 0); b.children.forEach(ch => ch.traverse(n => { if (n.isMesh) n.material = mat(0x6b6b66); })); } else { label = labelSprite(e.name.replace(/\s+\d+$/, '') + (/\s(\d+)$/.test(e.name) ? ' ' + e.name.match(/\s(\d+)$/)[1] : ''), dd.hp / (dd.maxHp || 1)); top = 2.2; } }
          else if (e.kind === 'treasure') g.add(chestMesh(e)); else if (e.kind === 'door') { g.add(doorMesh(e, room)); } else g.add(trapMesh(e));
          if (label) { label.position.y = top + 0.5; g.add(label); }
          if (ghost) g.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.transparent = true; n.material.opacity = 0.45; } });
          return g;
        } });
    });
    (d.characters || []).forEach(c => {
      if (!vis(c.col, c.row)) return; const me = d.meId === c.id;
      out.push({ id: c.id, kind: 'pc', col: c.col, row: c.row, me, sel: d.sel?.kind === 'char' && d.sel.id === c.id, sig: ['pc', c.name, c.hp, c.max_hp, c.data?.classId, c.data?.raceId, me].join('|'),
        build: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.74, 0.8, 0.14, 24), mat(me ? 0xc0862a : 0x277a73), 0, 0.07)); const pc = makePC(c); g.add(pc); if (c.hp <= 0) { pc.rotation.z = Math.PI / 2.2; pc.position.set(0, 0.4, 0); } const l = labelSprite(c.name, c.hp / (c.max_hp || 1)); l.position.y = 2.7; g.add(l); return g; } });
    });
    return out;
  }

  function buildTokens() {
    const spec = tokenSpec(); const keep = new Set(spec.map(s => s.id));
    for (const [id, t] of tokens) if (!keep.has(id)) { dyn.remove(t.group); tokens.delete(id); }
    lampsPC.forEach(l => dyn.remove(l)); lampsPC.length = 0;
    for (const s of spec) {
      let t = tokens.get(s.id); const [x, z] = hexPos(s.col, s.row); const y = surfaceY(room, s.col, s.row); const tgt = new THREE.Vector3(x, y, z);
      if (!t || t.sig !== s.sig) { const old = t?.group; const group = s.build(); group.userData.tid = s.id; group.userData.kind = s.kind; if (old) { group.position.copy(old.position); dyn.remove(old); } else group.position.copy(tgt); group.traverse(n => { n.userData.tid = s.id; }); dyn.add(group); t = { group, sig: s.sig, ring: null }; tokens.set(s.id, t); }
      Object.assign(t, { target: tgt, col: s.col, row: s.row, kind: s.kind, sel: s.sel });
      if (t.ring) { t.group.remove(t.ring); t.ring = null; }
      if (s.sel) { t.ring = mesh(new THREE.RingGeometry(0.88, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 0, 0.2, 0, false); t.ring.rotation.x = -Math.PI / 2; t.group.add(t.ring); }
    }
    // lanterne dei personaggi quando la stanza è buia
    const luce = d.role === 'master' ? 'piena' : (room.meta?.luce || 'piena');
    if (luce !== 'piena') (d.characters || []).filter(c => c.hp > 0 && (!d.visible || d.visible.has(key(c.col, c.row)))).forEach(c => { const L = new THREE.PointLight(0xffc678, 20, 10, 1.6); const [x, z] = hexPos(c.col, c.row); L.position.set(x, 2.4, z); dyn.add(L); lampsPC.push(L); });
  }
  const lampsPC = [];

  function render(data, opts = {}) {
    if (opts.miniOnly === true) return;
    d = data; room = d.room;
    const s = [room.id, room.meta?.theme, room.meta?.luce, d.role === 'master', JSON.stringify(room.cells), JSON.stringify(room.meta?.props || []), d.visible ? [...d.visible].join(';') : ''].join('#');
    if (s !== sig) { sig = s; buildStatic(); }
    buildTokens(); buildHighlights();
    if (fitted !== room.id) { fitted = room.id; fit(); }
  }

  function fit() {
    if (!room) return; const cx = Math.sqrt(3) * (room.cols + 0.5) / 2, cz = 1.5 * room.rows / 2; const dist = Math.max(room.cols * 1.75, room.rows * 2.3) * 0.9 + 6;
    controls.target.set(cx, 0, cz); camera.position.set(cx + dist * 0.05, dist * 0.82, cz + dist * 0.62); controls.update();
  }
  function zoom(f) { const off = camera.position.clone().sub(controls.target); const len = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance); off.setLength(len); camera.position.copy(controls.target).add(off); controls.update(); }
  function panToXY(x, y) { const nt = new THREE.Vector3(x / SIZE_2D, 0, y / SIZE_2D); const delta = nt.clone().sub(controls.target); controls.target.add(delta); camera.position.add(delta); controls.update(); }

  /* picking */
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; } down = null;
    const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(mouse, camera);
    let hex = null; const tokHit = raycaster.intersectObjects([...dyn.children], true).find(i => i.object.userData.tid && i.object.type !== 'Sprite');
    if (tokHit) { const t = tokens.get(tokHit.object.userData.tid); if (t) hex = { col: t.col, row: t.row }; }
    if (!hex) { const hit = raycaster.intersectObjects(pickables, false)[0]; if (hit) hex = hit.object.userData.ids[hit.instanceId]; }
    if (!hex) return;
    const stack = [...tokens.entries()].filter(([, t]) => t.col === hex.col && t.row === hex.row).sort((a, b) => ({ pc: 3, entity: 1 }[b[1].kind] - { pc: 3, entity: 1 }[a[1].kind])).map(([id, t]) => ({ kind: t.kind, id }));
    h.onClick?.({ ...hex, stack });
  });

  /* ciclo di animazione */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (document.hidden || !container.offsetParent) return;
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    for (const tk of tokens.values()) { const k = 1 - Math.exp(-dt * 12); tk.group.position.lerp(tk.target, k); if (tk.sel) tk.group.position.y = tk.target.y + Math.abs(Math.sin(t * 3)) * 0.12; }
    flames.forEach((f, i) => { const s = 1 + Math.sin(t * 9 + i * 2) * 0.06; f.scale.set(s, 1 + Math.sin(t * 11 + i) * 0.08, s); });
    lamps.forEach((l, i) => { l.intensity = l.userData.base * (0.92 + Math.sin(t * 8 + i * 3) * 0.06 + Math.sin(t * 13 + i) * 0.03); });
    controls.update(); renderer.render(scene, camera);
  });

  return { render, fit, zoom, panToXY, dispose() { renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); }, canvas: renderer.domElement };
}
