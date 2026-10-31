-- Client-bound RLS for the two test apps. Apply only after both base schemas,
-- the Phase 2 registry, and MyHabits' shared habit-timer migration exist.
-- After applying, register exact OAuth client IDs in auth_platform.oauth_clients.
-- OAuth tokens fail closed until their client row is active.
begin;

create table if not exists auth_platform.oauth_clients (
  client_id text primary key,
  app_id text not null references auth_platform.applications(app_id) on delete cascade,
  environment text not null check (environment in ('test', 'staging', 'production')),
  redirect_uri text not null unique check (redirect_uri ~ '^https://[a-z0-9.-]+(:[0-9]+)?/auth/sso/callback$'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table auth_platform.oauth_clients enable row level security;
revoke all on auth_platform.oauth_clients from public, anon, authenticated;

create or replace function public.can_access_myhabits()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth_platform.applications a
    join auth_platform.app_memberships m on m.app_id = a.app_id
    where a.app_id = 'myhabits' and a.active
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and ((select auth.jwt()->>'client_id') is null
        or exists (select 1 from auth_platform.oauth_clients c
          where c.app_id = a.app_id and c.client_id = (select auth.jwt()->>'client_id') and c.active))
  );
$$;
revoke all on function public.can_access_myhabits() from public, anon;
grant execute on function public.can_access_myhabits() to authenticated;

create or replace function public.can_access_time_entry(p_habit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth_platform.applications a
    join auth_platform.app_memberships m on m.app_id = a.app_id
    where a.active and m.user_id = (select auth.uid()) and m.status = 'active'
      and (
        (a.app_id = 'timelogger' and ((select auth.jwt()->>'client_id') is null
          or exists (select 1 from auth_platform.oauth_clients c
            where c.app_id = a.app_id and c.client_id = (select auth.jwt()->>'client_id') and c.active)))
        or (a.app_id = 'myhabits' and p_habit_id is not null
          and exists (select 1 from auth_platform.oauth_clients c
            where c.app_id = a.app_id and c.client_id = (select auth.jwt()->>'client_id') and c.active))
      )
  );
$$;
revoke all on function public.can_access_time_entry(uuid) from public, anon;
grant execute on function public.can_access_time_entry(uuid) to authenticated;

create or replace function public.require_myhabits_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_myhabits() then raise exception 'MyHabits access denied' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.require_myhabits_access() from public, anon;
grant execute on function public.require_myhabits_access() to authenticated;

create or replace function public.require_timelogger_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_time_entry(null) then raise exception 'Time Logger access denied' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.require_timelogger_access() from public, anon;
grant execute on function public.require_timelogger_access() to authenticated;

drop policy if exists timelogger_read_own_entries on public.timelogger_time_entries;
drop policy if exists timelogger_insert_own_entries on public.timelogger_time_entries;
create policy timelogger_sso_read on public.timelogger_time_entries for select to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_time_entry(tracker_habit_id)));
create policy timelogger_sso_insert on public.timelogger_time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_access_time_entry(tracker_habit_id)));

drop policy if exists profiles_own on public.tracker_profiles;
create policy profiles_sso on public.tracker_profiles for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists areas_own on public.tracker_areas;
create policy areas_sso on public.tracker_areas for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists habits_own on public.tracker_habits;
create policy habits_sso on public.tracker_habits for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists logs_own on public.tracker_habit_logs;
create policy logs_sso on public.tracker_habit_logs for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists notes_own on public.tracker_habit_notes;
create policy notes_sso on public.tracker_habit_notes for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists reminders_own on public.tracker_habit_reminders;
create policy reminders_sso on public.tracker_habit_reminders for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists schedule_versions_own on public.tracker_habit_schedule_versions;
create policy schedule_versions_sso on public.tracker_habit_schedule_versions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists pauses_own on public.tracker_habit_pauses;
create policy pauses_sso on public.tracker_habit_pauses for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists relationships_own on public.tracker_habit_relationships;
create policy relationships_sso on public.tracker_habit_relationships for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists routines_own on public.tracker_routines;
create policy routines_sso on public.tracker_routines for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists routine_pauses_own on public.tracker_routine_pauses;
create policy routine_pauses_sso on public.tracker_routine_pauses for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists routine_items_own on public.tracker_routine_items;
create policy routine_items_sso on public.tracker_routine_items for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists routine_occurrences_own on public.tracker_routine_occurrences;
create policy routine_occurrences_sso on public.tracker_routine_occurrences for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));
drop policy if exists routine_item_occurrences_own on public.tracker_routine_item_occurrences;
create policy routine_item_occurrences_sso on public.tracker_routine_item_occurrences for all to authenticated
  using (user_id = (select auth.uid()) and (select public.can_access_myhabits()))
  with check (user_id = (select auth.uid()) and (select public.can_access_myhabits()));

-- The callable SECURITY DEFINER routines are replaced below with an access
-- check at entry. Table RLS does not protect their owner-privileged queries.
-- Keep the live function bodies intact while adding a mandatory guard at
-- their first PL/pgSQL BEGIN. The compact hashes are from the checked-in
-- pre-pilot definitions (whitespace removed). Any semantic drift aborts the
-- transaction before any policy or function changes are committed.
do $$
declare
  item record;
  actual_hash text;
  definition text;
begin
  for item in select * from (values
    ('public.timelogger_transition_timer(text)', '8c8c5da1b9ae85f1dd6845975738bd9e', 'require_timelogger_access'),
    ('public.tracker_close_routine_occurrences()', '2764fd626dad03f2d47ba0dccb458d13', 'require_myhabits_access'),
    ('public.tracker_edit_routine_item(uuid,text,text,boolean,text)', '2d0da5782fb2d385572abcb6aa37bd08', 'require_myhabits_access'),
    ('public.tracker_import_v2(jsonb,text)', 'a52664c818b91d48a8b80dee3f19f7d4', 'require_myhabits_access'),
    ('public.tracker_materialize_routine(uuid,date,jsonb)', 'de86e9398847bf16f9ce1d4fa32a4c92', 'require_myhabits_access'),
    ('public.tracker_reorder_habits(uuid[])', '32e956f3563b3d4e9d0c607776af3921', 'require_myhabits_access'),
    ('public.tracker_routine_action(uuid,text,date,text)', '4264f2f41b57bdc93d6ab3dc67a1269f', 'require_myhabits_access'),
    ('public.tracker_routine_lifecycle(uuid,text)', '7ec263cfb420c00d4f8922c6ba744ebd', 'require_myhabits_access'),
    ('public.tracker_save_routine(uuid,jsonb,jsonb)', '435f0753408f2036f8685c618ccebfa1', 'require_myhabits_access'),
    ('public.tracker_set_routine_item(uuid,text,numeric)', '3989675378ef6d3d33b25e8eff9c2fa4', 'require_myhabits_access'),
    ('public.tracker_transition_habit_timer(uuid,text)', '90334059245c2de6dbb37e0ebea22a0c', 'require_myhabits_access')
  ) as guarded(signature, expected_hash, guard_name)
  loop
    select md5(regexp_replace(p.prosrc, '\s+', '', 'g'))
      into actual_hash from pg_proc p where p.oid = to_regprocedure(item.signature);
    if actual_hash is distinct from item.expected_hash then
      raise exception 'Unexpected definition for %', item.signature using errcode = '55000';
    end if;
    definition := pg_get_functiondef(to_regprocedure(item.signature));
    definition := regexp_replace(definition, '\mbegin\M',
      format(E'begin\n  perform public.%I();', item.guard_name), 'i');
    if position('perform public.' || item.guard_name || '();' in definition) = 0 then
      raise exception 'Could not guard %', item.signature using errcode = '55000';
    end if;
    execute definition;
  end loop;
end;
$$;

commit;
