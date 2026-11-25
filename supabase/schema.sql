-- LA SMORFIA DI NUFFLE — schema database Supabase
-- Esegui tutto questo file in Supabase → SQL Editor → New query.

create extension if not exists pgcrypto;

create or replace function public.nuffle_six_unique(p_events integer[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(array_length(p_events, 1) = 6 and count(distinct x) = 6, false)
  from unnest(p_events) as x;
$$;

create table if not exists public.nuffle_cards (
  id uuid primary key default gen_random_uuid(),
  card_number integer not null unique check (card_number between 1 and 100),
  events integer[] not null check (
    public.nuffle_six_unique(events)
    and events <@ array[
      1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
      16,17,18,19,20,21,22,23,24,25,26,27,28,29,30
    ]::integer[]
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.nuffle_event_marks (
  event_id integer primary key check (event_id between 1 and 30),
  marked boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.nuffle_cards enable row level security;
alter table public.nuffle_event_marks enable row level security;

-- Tutti possono leggere le cartelle e lo stato degli eventi.
drop policy if exists "Public can read nuffle cards" on public.nuffle_cards;
create policy "Public can read nuffle cards"
on public.nuffle_cards for select to anon, authenticated using (true);

drop policy if exists "Public can read nuffle marks" on public.nuffle_event_marks;
create policy "Public can read nuffle marks"
on public.nuffle_event_marks for select to anon, authenticated using (true);

-- Nessuna policy di scrittura diretta: la modifica delle spunte passa dalla RPC controllata.
revoke insert, update, delete on public.nuffle_cards from anon, authenticated;
revoke insert, update, delete on public.nuffle_event_marks from anon, authenticated;
grant select on public.nuffle_cards to anon, authenticated;
grant select on public.nuffle_event_marks to anon, authenticated;

create or replace function public.toggle_nuffle_event(p_event_id integer)
returns table(event_id integer, marked boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id < 1 or p_event_id > 30 then
    raise exception 'Evento non valido';
  end if;

  return query
  insert into public.nuffle_event_marks as m (event_id, marked, updated_at)
  values (p_event_id, true, now())
  on conflict (event_id) do update
    set marked = not m.marked, updated_at = now()
  returning m.event_id, m.marked, m.updated_at;
end;
$$;

revoke all on function public.toggle_nuffle_event(integer) from public;
grant execute on function public.toggle_nuffle_event(integer) to anon, authenticated;

-- La Edge Function usa service_role e non dipende dalle policy RLS.
-- Realtime per sincronizzare le spunte e la rigenerazione delle cartelle.
do $$
begin
  alter publication supabase_realtime add table public.nuffle_event_marks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nuffle_cards;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
