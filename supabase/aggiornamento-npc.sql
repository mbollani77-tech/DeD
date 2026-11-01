-- Aggiornamento per i database già creati: ammette gli abitanti (paesi, prigionieri, viandanti).
-- Apri Supabase -> SQL Editor, incolla tutto e premi Run. Si può eseguire più volte senza problemi.
alter table public.entities drop constraint if exists entities_kind_check;
alter table public.entities add constraint entities_kind_check check (kind in ('monster','treasure','trap','door','npc'));
