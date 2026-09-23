-- Apply after 000000_init.sql. Preserves existing records.
begin;
create table public.event_state (
  id boolean primary key default true check (id),
  state jsonb not null default '{"phase":"READY","currentPrizeId":null,"winnerId":null,"targetWinnerId":null,"countdownValue":3}'::jsonb
);
insert into public.event_state(id) values (true);
create function public.event_role() returns text language sql stable
set search_path = '' as $$ select auth.jwt()->'app_metadata'->>'lucky_draw_role' $$;
alter table public.participants enable row level security;
alter table public.prizes enable row level security;
alter table public.draw_logs enable row level security;
alter table public.event_state enable row level security;
revoke all on public.participants, public.prizes, public.draw_logs, public.event_state from public, anon, authenticated;
grant select on public.participants, public.prizes, public.draw_logs, public.event_state to authenticated;
create policy event_read_participants on public.participants for select to authenticated using (public.event_role() in ('admin','display'));
create policy event_read_prizes on public.prizes for select to authenticated using (public.event_role() in ('admin','display'));
create policy event_read_history on public.draw_logs for select to authenticated using (public.event_role() = 'admin');
create policy event_read_state on public.event_state for select to authenticated using (public.event_role() in ('admin','display'));
-- Restrictive guards also apply if the project previously had permissive policies.
create policy event_guard_participants on public.participants as restrictive for select to authenticated using (public.event_role() in ('admin','display'));
create policy event_guard_prizes on public.prizes as restrictive for select to authenticated using (public.event_role() in ('admin','display'));
create policy event_guard_history on public.draw_logs as restrictive for select to authenticated using (public.event_role()='admin');
create policy event_guard_state on public.event_state as restrictive for select to authenticated using (public.event_role() in ('admin','display'));
-- Awarded records cannot be deleted accidentally by deleting their parent.
alter table public.draw_logs drop constraint draw_logs_prize_id_fkey;
alter table public.draw_logs add constraint draw_logs_prize_id_fkey foreign key (prize_id) references public.prizes(id) on delete restrict;
alter table public.draw_logs drop constraint draw_logs_participant_id_fkey;
alter table public.draw_logs add constraint draw_logs_participant_id_fkey foreign key (participant_id) references public.participants(id) on delete restrict;
alter table public.draw_logs add column participant_name text;
alter table public.draw_logs add column participant_department text;
alter table public.draw_logs add column prize_name text;
update public.draw_logs l set participant_name=p.name, participant_department=p.department from public.participants p where p.id=l.participant_id;
update public.draw_logs l set prize_name=p.name from public.prizes p where p.id=l.prize_id;
create index draw_logs_drawn_at_id_idx on public.draw_logs(drawn_at,id);
create index participants_status_idx on public.participants(status);
create function public.get_event_state() returns jsonb language sql stable security invoker
set search_path = '' as $$
 select state || jsonb_build_object('serverNow',clock_timestamp()) from public.event_state where id=true;
$$;
-- Every mutation locks the same row; concurrent admins cannot award twice.
create function public.manage_event(action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 s jsonb; p public.prizes%rowtype; w public.participants%rowtype;
 row_data jsonb; count_active integer; log_id uuid; prize_id uuid; amount integer;
begin
 if coalesce(public.event_role(),'') <> 'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 select state into s from public.event_state where id=true for update;
 if s->>'phase'='SHUFFLE' and clock_timestamp() < (s->>'startedAt')::timestamptz + interval '10.6 seconds' then
  raise exception 'A draw is running. Wait for the winner before making changes.';
 end if;
 if action='begin_draw' then
  if s->>'phase' <> 'READY' then raise exception 'Reset the screen before the next draw.'; end if;
  prize_id := (payload->>'prizeId')::uuid;
  select * into p from public.prizes where id=prize_id for update;
  if not found or p.drawn_amount >= p.total_amount then raise exception 'Prize is unavailable or fully drawn.'; end if;
  select count(*) into count_active from public.participants where status='Active';
  select * into w from public.participants where status='Active' order by random() limit 1 for update;
  if not found then raise exception 'No active participants remain.'; end if;
  update public.participants set status='Winner' where id=w.id;
  update public.prizes set drawn_amount=drawn_amount+1, status=case when drawn_amount+1 >= total_amount then 'Completed' else 'Ready' end where id=p.id;
  insert into public.draw_logs(prize_id,participant_id,operator,participant_name,participant_department,prize_name)
   values(p.id,w.id,auth.uid()::text,w.name,w.department,p.name) returning id into log_id;
  s := jsonb_build_object('phase','SHUFFLE','drawId',log_id,'currentPrizeId',p.id,'currentPrizeName',p.name,
   'targetWinnerId',w.id,'targetWinnerName',w.name,'winnerId',w.id,'countdownValue',3,
   'startedAt',clock_timestamp(),'spinDurationMs',7000,'poolCount',count_active);
 elsif action='ready' then
  s := jsonb_build_object('phase','READY','currentPrizeId',coalesce(payload->'prizeId',s->'currentPrizeId'),'winnerId',null,'targetWinnerId',null,'countdownValue',3);
 elsif action='import_participants' then
  if jsonb_typeof(payload->'rows') is distinct from 'array' or jsonb_array_length(payload->'rows') > 10000 then raise exception 'Invalid import (maximum 10000 participants).'; end if;
  for row_data in select value from jsonb_array_elements(payload->'rows') loop
   if coalesce(trim(row_data->>'id'),'')='' or coalesce(trim(row_data->>'name'),'')='' then raise exception 'Participant ID and name are required.'; end if;
   insert into public.participants(id,name,department) values(trim(row_data->>'id'),trim(row_data->>'name'),coalesce(row_data->>'department',''))
    on conflict(id) do update set name=excluded.name,department=excluded.department;
  end loop;
 elsif action='add_prize' then
  amount := (payload->>'total_amount')::integer;
  if coalesce(amount,0)<1 or coalesce(trim(payload->>'name'),'')='' then raise exception 'Prize name and positive amount required.'; end if;
  insert into public.prizes(name,description,total_amount,draw_order)
   values(trim(payload->>'name'),coalesce(payload->>'description',''),amount,(select coalesce(max(draw_order),0)+1 from public.prizes));
 elsif action='prize_amount' then
  amount := (payload->>'amount')::integer;
  select * into p from public.prizes where id=(payload->>'id')::uuid for update;
  if not found or amount is null or amount<p.drawn_amount or amount<1 then raise exception 'Amount must be at least 1 and cannot be below the number already drawn.'; end if;
  update public.prizes set total_amount=amount,status=case when drawn_amount>=amount then 'Completed' else 'Ready' end where id=p.id;
 elsif action='delete_prize' then
  delete from public.prizes where id=(payload->>'id')::uuid;
  if s->>'currentPrizeId'=payload->>'id' then s := '{"phase":"READY","countdownValue":3}'::jsonb; end if;
 elsif action='clear_prizes' then
  delete from public.prizes;
  s := '{"phase":"READY","countdownValue":3}'::jsonb;
 elsif action='clear_participants' then
  delete from public.participants;
  s := '{"phase":"READY","countdownValue":3}'::jsonb;
 elsif action='reset_event' then
  delete from public.draw_logs;
  update public.participants set status='Active';
  update public.prizes set drawn_amount=0,status='Ready';
  s := '{"phase":"READY","countdownValue":3}'::jsonb;
 else raise exception 'Unknown event action';
 end if;
 update public.event_state set state=s where id=true;
 return s || jsonb_build_object('serverNow',clock_timestamp());
end;
$$;
revoke all on function public.event_role(),public.get_event_state(),public.manage_event(text,jsonb) from public,anon;
grant execute on function public.event_role(),public.get_event_state(),public.manage_event(text,jsonb) to authenticated;
commit;
