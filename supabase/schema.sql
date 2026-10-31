-- ALVEARE · schema per Supabase
-- Incolla tutto nello SQL Editor di Supabase e premi "Run".

create extension if not exists pgcrypto;

-- Campagne e chiave del Master (la chiave NON è leggibile dal browser)
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  state jsonb not null default '{}'::jsonb,      -- iniziativa, round
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_secrets (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  master_key text not null
);

-- Stanze: ogni stanza è una griglia a esagoni (cells = terreno non standard)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  notes text not null default '',
  cols int not null default 14,
  rows int not null default 10,
  cells jsonb not null default '{}'::jsonb,       -- {"c,r":"w|d|a"}
  meta jsonb not null default '{}'::jsonb,        -- {start:{col,row}}
  fog boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- Mostri, tesori, trappole, porte
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind text not null check (kind in ('monster','treasure','trap','door')),
  name text not null,
  col int not null,
  row int not null,
  hidden boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Personaggi dei giocatori
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  player text not null default '',
  name text not null,
  race text not null,
  class text not null,
  level int not null default 1,
  stats jsonb not null,
  hp int not null,
  max_hp int not null,
  ac int not null default 10,
  speed int not null default 30,                  -- in piedi (1 esagono = 5 ft)
  move_left int not null default 6,               -- esagoni rimasti nel round
  room_id uuid references public.rooms(id) on delete set null,
  col int not null default 1,
  row int not null default 1,
  data jsonb not null default '{}'::jsonb,        -- armi, magie, zaino, oro, note
  created_at timestamptz not null default now()
);

-- Quest che aprono le porte
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('riddle','check','key')),
  data jsonb not null default '{}'::jsonb,
  solved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Registro condiviso (dadi, combattimento, eventi)
create table if not exists public.log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  who text not null default '',
  kind text not null default 'roll',
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists rooms_c on public.rooms(campaign_id);
create index if not exists entities_c on public.entities(campaign_id, room_id);
create index if not exists characters_c on public.characters(campaign_id);
create index if not exists quests_c on public.quests(campaign_id);
create index if not exists log_c on public.log(campaign_id, id desc);

-- Accesso: gioco tra amici, quindi lettura/scrittura aperta a chi ha la chiave anon.
-- Le chiavi del Master restano private (nessuna policy su campaign_secrets).
do $$
declare t text;
begin
  foreach t in array array['campaigns','rooms','entities','characters','quests','log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "alveare_open" on public.%I', t);
    execute format('create policy "alveare_open" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
alter table public.campaign_secrets enable row level security;

-- Funzioni (security definer) per creare una campagna e verificare il Master
create or replace function public.create_campaign(p_name text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_code text; v_key text;
begin
  v_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  v_key  := encode(gen_random_bytes(12), 'hex');
  insert into campaigns(name, code) values (left(p_name, 80), v_code) returning id into v_id;
  insert into campaign_secrets(campaign_id, master_key) values (v_id, v_key);
  return json_build_object('id', v_id, 'code', v_code, 'master_key', v_key);
end $$;

create or replace function public.verify_master(p_code text, p_key text)
returns uuid language sql security definer set search_path = public as $$
  select c.id from campaigns c join campaign_secrets s on s.campaign_id = c.id
  where c.code = upper(p_code) and s.master_key = p_key;
$$;

create or replace function public.find_campaign(p_code text)
returns uuid language sql security definer set search_path = public as $$
  select id from campaigns where code = upper(p_code);
$$;

grant execute on function public.create_campaign(text) to anon, authenticated;
grant execute on function public.verify_master(text, text) to anon, authenticated;
grant execute on function public.find_campaign(text) to anon, authenticated;

-- Aggiornamenti in tempo reale
do $$
declare t text;
begin
  foreach t in array array['campaigns','rooms','entities','characters','quests','log'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
