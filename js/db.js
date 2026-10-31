import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('TUO-PROGETTO') && !SUPABASE_ANON_KEY.includes('LA-TUA');
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 20 } } });

const TABLES = ['rooms', 'entities', 'characters', 'quests', 'log'];
const fail = e => { const err = new Error(e.message || 'Errore database'); err.cause = e; return err; };

export async function createCampaign(name) {
  const { data, error } = await sb.rpc('create_campaign', { p_name: name });
  if (error) throw fail(error); return data;
}
export async function verifyMaster(code, key) {
  const { data, error } = await sb.rpc('verify_master', { p_code: code, p_key: key });
  if (error) throw fail(error); return data;
}
export async function findCampaign(code) {
  const { data, error } = await sb.rpc('find_campaign', { p_code: code });
  if (error) throw fail(error); return data;
}

/** Carica la campagna e la tiene aggiornata in tempo reale. */
export async function openCampaign(id, onChange) {
  const store = { campaign: null, rooms: [], entities: [], characters: [], quests: [], log: [], status: 'connecting' };
  const pending = new Set(); let queued = false;
  const notify = t => {
    pending.add(t); if (queued) return; queued = true;
    setTimeout(() => { queued = false; const s = new Set(pending); pending.clear(); onChange(s); }, 30);
  };
  store._notify = notify;

  async function load() {
    const q = (t, o) => sb.from(t).select('*').eq('campaign_id', id).order(o, { ascending: true });
    const [c, ...rest] = await Promise.all([
      sb.from('campaigns').select('*').eq('id', id).single(),
      sb.from('rooms').select('*').eq('campaign_id', id).order('sort').order('created_at'),
      q('entities', 'created_at'), q('characters', 'created_at'), q('quests', 'created_at'),
      sb.from('log').select('*').eq('campaign_id', id).order('id', { ascending: false }).limit(200),
    ]);
    if (c.error) throw fail(c.error);
    store.campaign = c.data;
    TABLES.forEach((t, i) => { if (rest[i].error) throw fail(rest[i].error); store[t] = rest[i].data; });
    store.log.reverse();
  }
  await load();

  const apply = (t, p) => {
    const list = store[t];
    if (p.eventType === 'DELETE') { const i = list.findIndex(r => r.id === p.old.id); if (i >= 0) list.splice(i, 1); else return; }
    else { const i = list.findIndex(r => r.id === p.new.id); if (i >= 0) Object.assign(list[i], p.new); else list.push(p.new); }
    if (t === 'log' && list.length > 300) list.splice(0, list.length - 300);
    notify(t);
  };
  const ch = sb.channel('camp-' + id);
  TABLES.forEach(t => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `campaign_id=eq.${id}` }, p => apply(t, p));
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, p => apply(t, p)); // i DELETE non supportano filtri
  });
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` }, p => { Object.assign(store.campaign, p.new); notify('campaigns'); });
  ch.subscribe(s => { store.status = s; notify('status'); });

  // Rete di sicurezza: se un evento realtime si perde, ricarica tutto ogni tanto.
  const resync = async () => { if (document.visibilityState === 'visible') { try { await load(); notify('all'); } catch { /* riprova al prossimo giro */ } } };
  const timer = setInterval(resync, 45000);
  document.addEventListener('visibilitychange', resync);
  store.close = () => { clearInterval(timer); sb.removeChannel(ch); };
  return store;
}

function upsertLocal(store, table, row) {
  // Si aggiorna l'oggetto esistente "sul posto" così i riferimenti già in mano al codice restano validi.
  if (table === 'campaigns') { Object.assign(store.campaign, row); store._notify('campaigns'); return; }
  const list = store[table]; const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) Object.assign(list[i], row); else list.push(row);
  store._notify(table);
}

export async function insert(store, table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw fail(error);
  upsertLocal(store, table, data); return data;
}
export async function insertMany(store, table, rows) {
  if (!rows.length) return [];
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) throw fail(error);
  data.forEach(r => upsertLocal(store, table, r)); return data;
}
/** Aggiorna subito in locale (la mappa risponde al volo) e poi sul database. */
export async function update(store, table, id, patch) {
  const row = table === 'campaigns' ? store.campaign : store[table].find(r => r.id === id);
  if (row) { Object.assign(row, patch); store._notify(table); }
  const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
  if (error) throw fail(error);
  upsertLocal(store, table, data); return data;
}
export const patchData = (store, table, row, dataPatch) => update(store, table, row.id, { data: { ...row.data, ...dataPatch } });
export async function remove(store, table, id) {
  const list = store[table]; const i = list.findIndex(r => r.id === id); if (i >= 0) { list.splice(i, 1); store._notify(table); }
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw fail(error);
}
export const say = (store, who, kind, text) => insert(store, 'log', { campaign_id: store.campaign.id, who, kind, text }).catch(() => {});
export const setCampaignState = (store, patch) => update(store, 'campaigns', store.campaign.id, { state: { ...(store.campaign.state || {}), ...patch } });
