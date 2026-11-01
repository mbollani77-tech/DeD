// Gestisce la vista 2D (SVG) e quella 3D (three.js, caricata solo quando serve) con la stessa interfaccia.
import { createBoard } from './board.js';
import { toast } from './ui.js';

export function createView({ svg, host3d, handlers }) {
  let b3 = null, mode = '2d', last = null, loading = false, shown = true;
  const cur = () => (mode === '3d' && b3 ? b3 : b2);
  const b2 = createBoard(svg, { ...handlers, onMinimap: (x, y) => cur().panToXY(x, y) });
  const layout = () => { svg.style.display = shown && mode === '2d' ? '' : 'none'; host3d.hidden = !(shown && mode === '3d'); };

  async function set(m) {
    if (m === mode) return mode;
    if (m === '3d') {
      if (loading) return mode; loading = true;
      try { if (!b3) { const mod = await import('./board3d.js'); b3 = mod.createBoard3D(host3d, handlers); } }
      catch (e) { console.error(e); toast('La vista 3D non è disponibile su questo dispositivo o browser.', 'err'); return mode; }
      finally { loading = false; }
    }
    mode = m; localStorage.setItem('dnd.view', m); layout();
    if (last) { cur().render(last); if (m === '3d') b2.render(last, { miniOnly: true }); }
    return mode;
  }
  return {
    get mode() { return mode; },
    set,
    show(v) { shown = v; layout(); },
    render(data) { last = data; if (mode === '3d' && b3) { b3.render(data); b2.render(data, { miniOnly: true }); } else b2.render(data); },
    zoom: f => cur().zoom(f), fit: () => cur().fit(), panToXY: (x, y) => cur().panToXY(x, y), focus: (c, r) => cur().focus(c, r),
    get miniOn() { return b2.miniOn; }, toggleMini() { return b2.setMini(!b2.miniOn); },
    paintCell: (...a) => b2.paintCell(...a),
  };
}
