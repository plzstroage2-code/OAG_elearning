-- Apply once in Supabase SQL editor. No secrets or participant data in public schema.
begin;
create schema if not exists draw_private;
revoke all on schema draw_private from public, anon, authenticated;
create table if not exists draw_private.events (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  check (document ->> 'schemaVersion' = '1')
);
alter table draw_private.events enable row level security;
revoke all on draw_private.events from public, anon, authenticated;
create table if not exists public.stage_signals (
  event_id text primary key,
  revision bigint not null check(revision >= 1)
);
alter table public.stage_signals enable row level security;
revoke all on public.stage_signals from anon, authenticated;
grant select on public.stage_signals to anon, authenticated;
drop policy if exists "Read event revision only" on public.stage_signals;
create policy "Read event revision only" on public.stage_signals for select to anon, authenticated using (true);
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stage_signals') then
    alter publication supabase_realtime add table public.stage_signals;
  end if;
end $$;
commit;
