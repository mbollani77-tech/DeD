export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = 'show ' + kind; t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), kind === 'err' ? 10000 : 3200);
}

function fieldHtml(f) {
  const id = 'f_' + f.name; const v = f.value ?? '';
  const hint = f.hint ? `<small class="muted">${esc(f.hint)}</small>` : '';
  if (f.type === 'checkbox')
    return `<label class="fld check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span>${hint}</label>`;
  let input;
  if (f.type === 'select')
    input = `<select id="${id}" name="${f.name}">${f.options.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea')
    input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
  return `<div class="fld"><label for="${id}">${esc(f.label)}</label>${input}${hint}</div>`;
}

function collect(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value;
  }
  return out;
}

/** Finestra con modulo. Restituisce i valori oppure null se annullata. */
export function ask({ title, fields = [], ok = 'Salva', cancel = 'Annulla', intro = '', extra = '', onMount, wide = false }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg' + (wide ? ' wide' : '');
    dlg.innerHTML = `<form method="dialog" class="dlg-form"><h2>${esc(title)}</h2>${intro ? `<p class="muted">${intro}</p>` : ''}<div class="fields">${fields.map(fieldHtml).join('')}</div>${extra}<div class="dlg-actions"><button type="button" class="btn ghost" data-cancel>${esc(cancel)}</button>${ok ? `<button class="btn primary">${esc(ok)}</button>` : ''}</div></form>`;
    document.body.appendChild(dlg);
    let result = null;
    const form = dlg.querySelector('form');
    form.addEventListener('submit', e => { e.preventDefault(); if (!form.reportValidity()) return; result = collect(form, fields); dlg.close(); });
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    onMount?.(form, dlg);
  });
}

export async function confirmBox(msg, ok = 'Conferma') {
  return !!(await ask({ title: msg, ok }));
}

export function copyText(t) {
  navigator.clipboard?.writeText(t).then(() => toast('Copiato negli appunti'), () => toast(t));
}
