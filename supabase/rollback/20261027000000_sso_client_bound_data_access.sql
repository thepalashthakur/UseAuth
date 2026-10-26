-- Emergency rollback for the test project's client-bound RLS migration.
-- Disable Supabase OAuth Server and deactivate its clients FIRST. Restoring
-- owner-only policies while OAuth tokens remain valid widens data access.
-- This script keeps the private oauth_clients metadata and does not delete rows.
begin;

update auth_platform.oauth_clients set active = false;

drop policy if exists timelogger_sso_read on public.timelogger_time_entries;
drop policy if exists timelogger_sso_insert on public.timelogger_time_entries;
create policy timelogger_read_own_entries on public.timelogger_time_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy timelogger_insert_own_entries on public.timelogger_time_entries for insert to authenticated
  with check (user_id = (select auth.uid()));

do $$
declare item record;
begin
  for item in select * from (values
    ('tracker_profiles', 'profiles_own', 'profiles_sso'),
    ('tracker_areas', 'areas_own', 'areas_sso'),
    ('tracker_habits', 'habits_own', 'habits_sso'),
    ('tracker_habit_logs', 'logs_own', 'logs_sso'),
    ('tracker_habit_notes', 'notes_own', 'notes_sso'),
    ('tracker_habit_reminders', 'reminders_own', 'reminders_sso'),
    ('tracker_habit_pauses', 'pauses_own', 'pauses_sso'),
    ('tracker_habit_relationships', 'relationships_own', 'relationships_sso'),
    ('tracker_routines', 'routines_own', 'routines_sso'),
    ('tracker_routine_pauses', 'routine_pauses_own', 'routine_pauses_sso'),
    ('tracker_routine_items', 'routine_items_own', 'routine_items_sso'),
    ('tracker_routine_occurrences', 'routine_occurrences_own', 'routine_occurrences_sso'),
    ('tracker_routine_item_occurrences', 'routine_item_occurrences_own', 'routine_item_occurrences_sso')
  ) as policies(table_name, original_name, pilot_name)
  loop
    execute format('drop policy if exists %I on public.%I', item.pilot_name, item.table_name);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', item.original_name, item.table_name);
  end loop;
end;
$$;
drop policy if exists schedule_versions_sso on public.tracker_habit_schedule_versions;
create policy schedule_versions_own on public.tracker_habit_schedule_versions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Restore the exact pre-pilot callable SECURITY DEFINER function bodies below.

create or replace function public.tracker_reorder_habits(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); group_name text; provided_count integer;
begin
  provided_count := cardinality(p_ids);
  if owner_id is null or provided_count < 1 or provided_count > 500 then
    raise exception 'Invalid habit order' using errcode = '22023';
  end if;
  select time_of_day into group_name from public.tracker_habits
    where id = p_ids[1] and user_id = owner_id and not is_archived;
  if group_name is null
     or (select count(distinct selected.id) from unnest(p_ids) as selected(id)) <> provided_count
     or (select count(*) from public.tracker_habits where user_id = owner_id and not is_archived and time_of_day = group_name) <> provided_count
     or (select count(*) from public.tracker_habits where user_id = owner_id and not is_archived and time_of_day = group_name and id = any(p_ids)) <> provided_count then
    raise exception 'Habit order must include exactly one active time-of-day group' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text || group_name));
  update public.tracker_habits h set position = ordered.ordinality::integer - 1, updated_at = now()
  from unnest(p_ids) with ordinality as ordered(id, ordinality)
  where h.id = ordered.id and h.user_id = owner_id;
end $$;

create or replace function public.tracker_import_v2(p_data jsonb, p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid(); item jsonb; old_id text; new_id uuid; mapped_id uuid;
  area_map jsonb := '{}'::jsonb; habit_map jsonb := '{}'::jsonb; versioned jsonb := '{}'::jsonb;
  existing_id uuid; inserted_habits integer := 0; skipped_habits integer := 0; inserted_areas integer := 0;
begin
  if owner_id is null or p_mode is null or p_mode not in ('skip', 'copy') or p_data->>'format' is distinct from 'myhabits-v2' or p_data->>'version' is distinct from '2'
     or jsonb_typeof(p_data->'areas') is distinct from 'array' or jsonb_typeof(p_data->'habits') is distinct from 'array'
     or jsonb_typeof(p_data->'logs') is distinct from 'array' or jsonb_typeof(p_data->'notes') is distinct from 'array'
     or jsonb_typeof(p_data->'reminders') is distinct from 'array' or jsonb_typeof(p_data->'pauses') is distinct from 'array'
     or jsonb_typeof(p_data->'relationships') is distinct from 'array' or jsonb_typeof(p_data->'versions') is distinct from 'array'
     or jsonb_array_length(p_data->'areas') > 1000 or jsonb_array_length(p_data->'habits') > 5000
     or jsonb_array_length(p_data->'logs') > 100000 or jsonb_array_length(p_data->'notes') > 50000
     or jsonb_array_length(p_data->'reminders') > 5000 or jsonb_array_length(p_data->'pauses') > 10000
     or jsonb_array_length(p_data->'relationships') > 10000 or jsonb_array_length(p_data->'versions') > 50000 then
    raise exception 'Invalid MyHabits import' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text));
  for item in select * from jsonb_array_elements(p_data->'areas') loop
    old_id := item->>'id';
    existing_id := null;
    select id into existing_id from public.tracker_areas where user_id = owner_id and lower(name) = lower(item->>'name') limit 1;
    if existing_id is not null and p_mode = 'skip' then
      area_map := jsonb_set(area_map, array[old_id], to_jsonb(existing_id::text));
      continue;
    end if;
    insert into public.tracker_areas(user_id,name,color,icon,position)
      values(owner_id,item->>'name',item->>'color',item->>'icon',coalesce((item->>'position')::integer,0)) returning id into new_id;
    area_map := jsonb_set(area_map, array[old_id], to_jsonb(new_id::text));
    inserted_areas := inserted_areas + 1;
  end loop;
  for item in select * from jsonb_array_elements(p_data->'habits') loop
    old_id := item->>'id';
    existing_id := null;
    select id into existing_id from public.tracker_habits where user_id = owner_id and lower(name) = lower(item->>'name') limit 1;
    if existing_id is not null and p_mode = 'skip' then
      skipped_habits := skipped_habits + 1;
      continue;
    end if;
    mapped_id := nullif(area_map->>(item->>'area_id'), '')::uuid;
    insert into public.tracker_habits(user_id,area_id,name,description,type,tracking_type,goal_value,unit,schedule_type,schedule_config,start_date,end_date,color,icon,position,is_archived,archived_at,archived_date,time_of_day,priority,difficulty,quick_increments,minimum_goal_value,stretch_goal_value)
      values(owner_id,mapped_id,item->>'name',item->>'description',item->>'type',item->>'tracking_type',nullif(item->>'goal_value','')::numeric,item->>'unit',item->>'schedule_type',item->'schedule_config',(item->>'start_date')::date,nullif(item->>'end_date','')::date,item->>'color',item->>'icon',coalesce((item->>'position')::integer,0),coalesce((item->>'is_archived')::boolean,false),case when coalesce((item->>'is_archived')::boolean,false) then now() else null end,nullif(item->>'archived_date','')::date,coalesce(item->>'time_of_day','ANYTIME'),coalesce(item->>'priority','NORMAL'),item->>'difficulty',case when jsonb_typeof(item->'quick_increments') = 'array' then array(select jsonb_array_elements_text(item->'quick_increments')::numeric) else null end,nullif(item->>'minimum_goal_value','')::numeric,nullif(item->>'stretch_goal_value','')::numeric)
      returning id into new_id;
    habit_map := jsonb_set(habit_map, array[old_id], to_jsonb(new_id::text));
    inserted_habits := inserted_habits + 1;
  end loop;
  for item in select * from jsonb_array_elements(p_data->'versions') order by value->>'effective_date' loop
    old_id := item->>'habit_id';
    mapped_id := nullif(habit_map->>old_id,'')::uuid;
    if mapped_id is null then continue; end if;
    if not versioned ? old_id then
      delete from public.tracker_habit_schedule_versions where habit_id = mapped_id and user_id = owner_id;
      versioned := jsonb_set(versioned, array[old_id], 'true'::jsonb);
    end if;
    insert into public.tracker_habit_schedule_versions(habit_id,user_id,effective_date,name,area_id,type,tracking_type,goal_value,unit,schedule_type,schedule_config,start_date,end_date,is_archived,time_of_day,priority,difficulty,minimum_goal_value,stretch_goal_value)
      values(mapped_id,owner_id,(item->>'effective_date')::date,item->>'name',nullif(area_map->>(item->>'area_id'),'')::uuid,item->>'type',item->>'tracking_type',nullif(item->>'goal_value','')::numeric,item->>'unit',item->>'schedule_type',item->'schedule_config',(item->>'start_date')::date,nullif(item->>'end_date','')::date,(item->>'is_archived')::boolean,coalesce(item->>'time_of_day','ANYTIME'),coalesce(item->>'priority','NORMAL'),item->>'difficulty',nullif(item->>'minimum_goal_value','')::numeric,nullif(item->>'stretch_goal_value','')::numeric);
  end loop;
  for item in select * from jsonb_array_elements(p_data->'logs') loop
    mapped_id := nullif(habit_map->>(item->>'habit_id'),'')::uuid;
    if mapped_id is null then continue; end if;
    insert into public.tracker_habit_logs(habit_id,user_id,date,status,value,reason)
      values(mapped_id,owner_id,(item->>'date')::date,item->>'status',nullif(item->>'value','')::numeric,item->>'reason');
  end loop;
  for item in select * from jsonb_array_elements(p_data->'notes') loop
    mapped_id := nullif(habit_map->>(item->>'habit_id'),'')::uuid;
    if mapped_id is null then continue; end if;
    insert into public.tracker_habit_notes(habit_id,user_id,date,content)
      values(mapped_id,owner_id,nullif(item->>'date','')::date,item->>'content');
  end loop;
  for item in select * from jsonb_array_elements(p_data->'reminders') loop
    mapped_id := nullif(habit_map->>(item->>'habit_id'),'')::uuid;
    if mapped_id is null then continue; end if;
    insert into public.tracker_habit_reminders(habit_id,user_id,time,timezone,enabled)
      values(mapped_id,owner_id,(item->>'time')::time,item->>'timezone',(item->>'enabled')::boolean);
  end loop;
  for item in select * from jsonb_array_elements(p_data->'pauses') loop
    mapped_id := nullif(habit_map->>(item->>'habit_id'),'')::uuid;
    if mapped_id is null then continue; end if;
    insert into public.tracker_habit_pauses(habit_id,user_id,start_date,end_date,reason,note)
      values(mapped_id,owner_id,(item->>'start_date')::date,nullif(item->>'end_date','')::date,item->>'reason',item->>'note');
  end loop;
  for item in select * from jsonb_array_elements(p_data->'relationships') loop
    mapped_id := nullif(habit_map->>(item->>'source_habit_id'),'')::uuid;
    new_id := nullif(habit_map->>(item->>'target_habit_id'),'')::uuid;
    if mapped_id is null or new_id is null then continue; end if;
    insert into public.tracker_habit_relationships(user_id,source_habit_id,target_habit_id,type)
      values(owner_id,mapped_id,new_id,'AFTER');
  end loop;
  return jsonb_build_object('areasCreated',inserted_areas,'habitsCreated',inserted_habits,'habitsSkipped',skipped_habits);
end $$;

create or replace function public.tracker_materialize_routine(p_routine_id uuid, p_date date, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); r public.tracker_routines%rowtype; occurrence_id uuid; created boolean := false;
  item jsonb; item_id uuid; parent_occurrence_id uuid; item_map jsonb := '{}'::jsonb;
begin
  if owner_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid routine occurrence' using errcode = '22023';
  end if;
  select * into r from public.tracker_routines where id = p_routine_id and user_id = owner_id for share;
  if not found or r.is_archived or not public.tracker_routine_rule_matches(r.rule,p_date,r.start_date)
    or (r.end_date is not null and p_date > r.end_date)
    or (r.is_paused and p_date + r.planned_offset_days >= r.paused_from)
    or exists (select 1 from public.tracker_routine_pauses where routine_id = r.id and user_id = owner_id and start_date <= p_date + r.planned_offset_days and (end_date is null or end_date >= p_date + r.planned_offset_days)) then
    raise exception 'Routine is not scheduled for this date' using errcode = '22023';
  end if;
  insert into public.tracker_routine_occurrences(routine_id,user_id,scheduled_date,planned_date,planned_time,timezone)
    values(r.id,owner_id,p_date,p_date + r.planned_offset_days,r.preferred_start_time,r.timezone)
    on conflict (routine_id,scheduled_date) do nothing returning id into occurrence_id;
  created := occurrence_id is not null;
  if not created then
    select id into occurrence_id from public.tracker_routine_occurrences where routine_id = r.id and scheduled_date = p_date and user_id = owner_id;
    return occurrence_id;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.tracker_routine_items where id = (item->>'id')::uuid and routine_id = r.id and user_id = owner_id) then
      raise exception 'Routine item does not belong to routine' using errcode = '22023';
    end if;
    parent_occurrence_id := nullif(item_map->>(item->>'parent_id'),'')::uuid;
    if item->>'parent_id' is not null and parent_occurrence_id is null then
      raise exception 'Routine item parent is missing' using errcode = '22023';
    end if;
    insert into public.tracker_routine_item_occurrences(occurrence_id,user_id,source_item_id,parent_item_occurrence_id,position,type,title,instructions,estimated_minutes,required,reference_provider,reference_id,reference_key,habit_tracking_type,habit_goal_value)
      select occurrence_id,owner_id,i.id,parent_occurrence_id,i.position,i.type,i.title,i.instructions,i.estimated_minutes,i.required,i.reference_provider,i.reference_id,
        i.reference_key,
        case when v.habit_id is not null then v.tracking_type else h.tracking_type end,
        case when v.habit_id is not null then v.goal_value else h.goal_value end
      from public.tracker_routine_items i
      left join public.tracker_habits h on h.id = i.reference_id and h.user_id = owner_id
      left join lateral (select habit_id,tracking_type,goal_value from public.tracker_habit_schedule_versions where habit_id = h.id and user_id = owner_id and effective_date <= (p_date + r.planned_offset_days) order by effective_date desc limit 1) v on true
      where i.id = (item->>'id')::uuid and i.routine_id = r.id and i.user_id = owner_id
      returning id into item_id;
    item_map := jsonb_set(item_map,array[item->>'id'],to_jsonb(item_id::text));
  end loop;
  return occurrence_id;
end $$;

create or replace function public.tracker_save_routine(p_id uuid, p_routine jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); r public.tracker_routines%rowtype; item jsonb; local_today date;
begin
  if owner_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid routine' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text || p_id::text));
  select * into r from public.tracker_routines where id = p_id and user_id = owner_id for update;
  if found then
    update public.tracker_routines set name = p_routine->>'name', description = p_routine->>'description',
      timezone = p_routine->>'timezone', rule = p_routine->'rule', preferred_start_time = nullif(p_routine->>'preferred_start_time','')::time,
      start_date = (p_routine->>'start_date')::date, end_date = nullif(p_routine->>'end_date','')::date,
      is_paused = (p_routine->>'is_paused')::boolean, paused_from = nullif(p_routine->>'paused_from','')::date,
      is_archived = (p_routine->>'is_archived')::boolean, updated_at = now()
      where id = p_id and user_id = owner_id;
  else
    insert into public.tracker_routines(id,user_id,name,description,timezone,rule,preferred_start_time,start_date,end_date,is_paused,paused_from,is_archived)
      values(p_id,owner_id,p_routine->>'name',p_routine->>'description',p_routine->>'timezone',p_routine->'rule',nullif(p_routine->>'preferred_start_time','')::time,(p_routine->>'start_date')::date,nullif(p_routine->>'end_date','')::date,(p_routine->>'is_paused')::boolean,nullif(p_routine->>'paused_from','')::date,(p_routine->>'is_archived')::boolean);
  end if;
  local_today := (now() at time zone (p_routine->>'timezone'))::date;
  delete from public.tracker_routine_occurrences where routine_id = p_id and user_id = owner_id
    and planned_date >= local_today and planned_date = scheduled_date + (select planned_offset_days from public.tracker_routines where id = p_id) and started_at is null and status = 'SCHEDULED';
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.tracker_routine_items(id,routine_id,user_id,parent_id,position,type,title,instructions,estimated_minutes,required,frequency_rule,reference_provider,reference_id,reference_key)
      values((item->>'id')::uuid,p_id,owner_id,nullif(item->>'parent_id','')::uuid,(item->>'position')::integer,item->>'type',item->>'title',item->>'instructions',nullif(item->>'estimated_minutes','')::integer,(item->>'required')::boolean,item->'frequency_rule',item->>'reference_provider',nullif(item->>'reference_id','')::uuid,item->>'reference_id')
      on conflict (id) do update set parent_id = excluded.parent_id, position = excluded.position,
        type = excluded.type, title = excluded.title, instructions = excluded.instructions,
        estimated_minutes = excluded.estimated_minutes, required = excluded.required,
        frequency_rule = excluded.frequency_rule, reference_provider = excluded.reference_provider,
        reference_id = excluded.reference_id, reference_key = excluded.reference_key, updated_at = now()
      where public.tracker_routine_items.routine_id = p_id and public.tracker_routine_items.user_id = owner_id;
    if not found then raise exception 'Routine item belongs to another routine' using errcode = '22023'; end if;
  end loop;
  delete from public.tracker_routine_items where routine_id = p_id and user_id = owner_id
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_items));
  return p_id;
end $$;

create or replace function public.tracker_routine_lifecycle(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); r public.tracker_routines%rowtype; local_today date;
begin
  select * into r from public.tracker_routines where id = p_id and user_id = owner_id for update;
  if not found then raise exception 'Routine not found' using errcode = '22023'; end if;
  local_today := (now() at time zone r.timezone)::date;
  if p_action = 'PAUSE' and not r.is_paused then
    insert into public.tracker_routine_pauses(routine_id,user_id,start_date) values(p_id,owner_id,local_today);
    update public.tracker_routines set is_paused = true, paused_from = local_today, updated_at = now() where id = p_id;
    delete from public.tracker_routine_occurrences where routine_id = p_id and user_id = owner_id and planned_date >= local_today and started_at is null and status = 'SCHEDULED';
  elsif p_action = 'RESUME' and r.is_paused then
    if r.paused_from = local_today then
      delete from public.tracker_routine_pauses where routine_id = p_id and user_id = owner_id and start_date = local_today and end_date is null;
    else
      update public.tracker_routine_pauses set end_date = local_today - 1 where routine_id = p_id and user_id = owner_id and end_date is null;
    end if;
    update public.tracker_routines set is_paused = false, paused_from = null, updated_at = now() where id = p_id;
  elsif p_action = 'ARCHIVE' then
    update public.tracker_routines set is_archived = true, updated_at = now() where id = p_id;
    delete from public.tracker_routine_occurrences where routine_id = p_id and user_id = owner_id and planned_date >= local_today and started_at is null and status = 'SCHEDULED';
  elsif p_action = 'RESTORE' then
    update public.tracker_routines set is_archived = false, updated_at = now() where id = p_id;
  elsif p_action not in ('PAUSE','RESUME','ARCHIVE','RESTORE') then
    raise exception 'Unknown routine action' using errcode = '22023';
  end if;
  return (select to_jsonb(x) from public.tracker_routines x where id = p_id);
end $$;

create or replace function public.tracker_routine_action(p_id uuid, p_action text, p_date date default null, p_scope text default 'THIS') returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); occurrence public.tracker_routine_occurrences%rowtype; offset_days integer; required_count integer;
begin
  select * into occurrence from public.tracker_routine_occurrences where id = p_id and user_id = owner_id for update;
  if not found then raise exception 'Routine occurrence not found' using errcode = '22023'; end if;
  if p_action = 'START' then
    if occurrence.status = 'SKIPPED' then raise exception 'Undo skip before starting' using errcode = '22023'; end if;
    if occurrence.planned_date < (now() at time zone occurrence.timezone)::date then
      raise exception 'The routine window has closed' using errcode = '22023';
    end if;
    select count(*) into required_count from public.tracker_routine_item_occurrences where occurrence_id = p_id and user_id = owner_id and type <> 'GROUP' and required;
    update public.tracker_routine_occurrences set started_at = coalesce(started_at,now()),
      status = case when required_count = 0 then 'COMPLETED' else 'IN_PROGRESS' end,
      ended_at = case when required_count = 0 then now() else null end, updated_at = now()
      where id = p_id and started_at is null;
  elsif p_action = 'SKIP' then
    if occurrence.started_at is not null then raise exception 'Started occurrences cannot be skipped' using errcode = '22023'; end if;
    if occurrence.planned_date < (now() at time zone occurrence.timezone)::date then
      raise exception 'The routine window has closed' using errcode = '22023';
    end if;
    update public.tracker_routine_occurrences set status = 'SKIPPED', ended_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'UNDO_SKIP' then
    if occurrence.status <> 'SKIPPED' then raise exception 'Occurrence is not skipped' using errcode = '22023'; end if;
    update public.tracker_routine_occurrences set status = 'SCHEDULED', ended_at = null, updated_at = now() where id = p_id;
  elsif p_action = 'RESCHEDULE' then
    if p_date is null or p_scope not in ('THIS','FUTURE') or occurrence.started_at is not null or occurrence.status = 'SKIPPED' then
      raise exception 'Only an unstarted occurrence can be rescheduled' using errcode = '22023';
    end if;
    if exists (select 1 from public.tracker_routine_occurrences where routine_id = occurrence.routine_id and user_id = owner_id and planned_date = p_date and id <> p_id) then
      raise exception 'Another occurrence is already planned on this date' using errcode = '23505';
    end if;
    if p_scope = 'THIS' then
      update public.tracker_routine_occurrences set planned_date = p_date, status = 'SCHEDULED', updated_at = now() where id = p_id;
    else
      offset_days := p_date - occurrence.scheduled_date;
      if offset_days not between -365 and 365 then raise exception 'Future schedule shift is too large' using errcode = '22023'; end if;
      if exists (
        select 1 from public.tracker_routine_occurrences moving
        join public.tracker_routine_occurrences fixed on fixed.routine_id = moving.routine_id
          and fixed.user_id = owner_id and fixed.id <> moving.id and fixed.planned_date = moving.scheduled_date + offset_days
        where moving.routine_id = occurrence.routine_id and moving.user_id = owner_id
          and moving.scheduled_date >= occurrence.scheduled_date and moving.started_at is null and moving.status = 'SCHEDULED'
          and not (fixed.scheduled_date >= occurrence.scheduled_date and fixed.started_at is null and fixed.status = 'SCHEDULED')
      ) then raise exception 'Future occurrences would collide with an existing date' using errcode = '23505'; end if;
      update public.tracker_routines set planned_offset_days = offset_days, updated_at = now() where id = occurrence.routine_id and user_id = owner_id;
      update public.tracker_routine_occurrences set planned_date = scheduled_date + offset_days, updated_at = now()
        where routine_id = occurrence.routine_id and user_id = owner_id and scheduled_date >= occurrence.scheduled_date
          and started_at is null and status = 'SCHEDULED';
    end if;
  else
    raise exception 'Unknown routine action' using errcode = '22023';
  end if;
  return (select to_jsonb(o) from public.tracker_routine_occurrences o where o.id = p_id);
end $$;

create or replace function public.tracker_set_routine_item(p_item_id uuid, p_status text, p_value numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); step public.tracker_routine_item_occurrences%rowtype;
  occurrence public.tracker_routine_occurrences%rowtype; habit public.tracker_habits%rowtype;
  current_log public.tracker_habit_logs%rowtype; target_value numeric; required_count integer; done_count integer;
begin
  select * into step from public.tracker_routine_item_occurrences where id = p_item_id and user_id = owner_id for update;
  if not found or step.type = 'GROUP' or p_status not in ('DONE','SKIPPED','PENDING') then
    raise exception 'Invalid routine step' using errcode = '22023';
  end if;
  select * into occurrence from public.tracker_routine_occurrences where id = step.occurrence_id and user_id = owner_id for update;
  if occurrence.status = 'SKIPPED' then raise exception 'Undo the routine skip first' using errcode = '22023'; end if;
  if p_status <> 'PENDING' and occurrence.planned_date < (now() at time zone occurrence.timezone)::date then
    raise exception 'The routine window has closed' using errcode = '22023';
  end if;
  if step.status = p_status then
    return jsonb_build_object('item',to_jsonb(step),'occurrence',to_jsonb(occurrence));
  end if;
  if step.status = 'DONE' and p_status = 'SKIPPED' then
    raise exception 'Undo completion before skipping a step' using errcode = '22023';
  end if;
  if p_status = 'DONE' and step.status <> 'DONE' and step.type = 'HABIT_REF' then
    if not public.tracker_habit_allowed_for_routine(step.reference_id,owner_id,occurrence.planned_date) then
      raise exception 'Habit is not scheduled for this occurrence date' using errcode = '22023';
    end if;
    select * into habit from public.tracker_habits where id = step.reference_id and user_id = owner_id;
    target_value := case when step.habit_tracking_type = 'MEASURABLE' then step.habit_goal_value else null end;
    perform pg_advisory_xact_lock(hashtext(habit.id::text || occurrence.planned_date::text));
    select * into current_log from public.tracker_habit_logs where habit_id = habit.id and user_id = owner_id and date = occurrence.planned_date for update;
    if not found then
      if target_value is not null and (p_value is null or p_value < target_value) then raise exception 'Enter a value that reaches the habit target' using errcode = '22023'; end if;
      insert into public.tracker_habit_logs(habit_id,user_id,date,status,value,origin_routine_item_occurrence_id)
        values(habit.id,owner_id,occurrence.planned_date,'COMPLETED',p_value,p_item_id) returning * into current_log;
      update public.tracker_routine_item_occurrences set created_habit_log = true, applied_habit_value = p_value, applied_habit_updated_at = current_log.updated_at where id = p_item_id;
    elsif current_log.status <> 'COMPLETED' or (target_value is not null and coalesce(current_log.value,0) < target_value) then
      if target_value is not null and (p_value is null or p_value < target_value) then raise exception 'Enter a value that reaches the habit target' using errcode = '22023'; end if;
      update public.tracker_routine_item_occurrences set previous_habit_status = current_log.status,
        previous_habit_value = current_log.value, previous_habit_reason = current_log.reason, applied_habit_value = p_value, applied_habit_updated_at = now() where id = p_item_id;
      update public.tracker_habit_logs set status = 'COMPLETED', value = p_value, reason = null, updated_at = now()
        where id = current_log.id;
    end if;
    update public.tracker_routine_item_occurrences set habit_log_id = current_log.id where id = p_item_id;
  elsif p_status = 'PENDING' and step.status = 'DONE' and step.habit_log_id is not null then
    if not exists (select 1 from public.tracker_routine_item_occurrences where habit_log_id = step.habit_log_id and id <> p_item_id and status = 'DONE') then
      if step.created_habit_log and exists (select 1 from public.tracker_habit_logs where id = step.habit_log_id and origin_routine_item_occurrence_id = p_item_id and status = 'COMPLETED' and value is not distinct from step.applied_habit_value and updated_at = step.applied_habit_updated_at) then
        delete from public.tracker_habit_logs where id = step.habit_log_id;
      elsif step.previous_habit_status is not null then
        update public.tracker_habit_logs set status = step.previous_habit_status, value = step.previous_habit_value,
          reason = step.previous_habit_reason, updated_at = now() where id = step.habit_log_id and user_id = owner_id and status = 'COMPLETED' and value is not distinct from step.applied_habit_value and updated_at = step.applied_habit_updated_at;
      elsif exists (select 1 from public.tracker_habit_logs where id = step.habit_log_id and origin_routine_item_occurrence_id is not null and status = 'COMPLETED' and updated_at = created_at) then
        delete from public.tracker_habit_logs where id = step.habit_log_id;
      end if;
      if step.created_habit_log then
        update public.tracker_habit_logs set origin_routine_item_occurrence_id = null where id = step.habit_log_id and origin_routine_item_occurrence_id = p_item_id;
      end if;
    end if;
  end if;
  update public.tracker_routine_item_occurrences set status = p_status,
    completed_at = case when p_status = 'DONE' then coalesce(completed_at,now()) else null end,
    skipped_at = case when p_status = 'SKIPPED' then now() else null end,
    habit_log_id = case when p_status = 'DONE' then habit_log_id else null end,
    created_habit_log = case when p_status = 'DONE' then created_habit_log else false end,
    previous_habit_status = case when p_status = 'DONE' then previous_habit_status else null end,
    previous_habit_value = case when p_status = 'DONE' then previous_habit_value else null end,
    previous_habit_reason = case when p_status = 'DONE' then previous_habit_reason else null end,
    applied_habit_value = case when p_status = 'DONE' then applied_habit_value else null end,
    applied_habit_updated_at = case when p_status = 'DONE' then applied_habit_updated_at else null end,
    updated_at = now() where id = p_item_id;
  if p_status <> 'PENDING' then
    update public.tracker_routine_occurrences set started_at = coalesce(started_at,now()) where id = occurrence.id;
  end if;
  select count(*), count(*) filter (where status = 'DONE') into required_count, done_count
    from public.tracker_routine_item_occurrences where occurrence_id = occurrence.id and user_id = owner_id and type <> 'GROUP' and required;
  update public.tracker_routine_occurrences set
    status = case when done_count = required_count and started_at is not null then 'COMPLETED'
      when planned_date < (now() at time zone timezone)::date then case when started_at is null then 'MISSED' else 'PARTIAL' end
      else 'IN_PROGRESS' end,
    ended_at = case when done_count = required_count and started_at is not null then coalesce(ended_at,now())
      when planned_date < (now() at time zone timezone)::date then coalesce(ended_at,now()) else null end,
    updated_at = now() where id = occurrence.id;
  return jsonb_build_object('item',(select to_jsonb(i) from public.tracker_routine_item_occurrences i where i.id = p_item_id),
    'occurrence',(select to_jsonb(o) from public.tracker_routine_occurrences o where o.id = occurrence.id));
end $$;

create or replace function public.tracker_edit_routine_item(p_item_id uuid, p_title text, p_instructions text, p_required boolean, p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); step public.tracker_routine_item_occurrences%rowtype;
  occurrence public.tracker_routine_occurrences%rowtype; required_count integer; done_count integer;
begin
  if p_scope not in ('THIS','FUTURE') or length(trim(p_title)) not between 1 and 120 or length(coalesce(p_instructions,'')) > 2000 or p_required is null then
    raise exception 'Invalid routine step edit' using errcode = '22023';
  end if;
  select * into step from public.tracker_routine_item_occurrences where id = p_item_id and user_id = owner_id for update;
  if not found then raise exception 'Routine step not found' using errcode = '22023'; end if;
  select * into occurrence from public.tracker_routine_occurrences where id = step.occurrence_id and user_id = owner_id for update;
  if p_scope = 'THIS' then
    update public.tracker_routine_item_occurrences set title = trim(p_title), instructions = p_instructions,
      required = p_required, updated_at = now() where id = p_item_id;
  else
    if step.source_item_id is null then raise exception 'This step no longer has a template item' using errcode = '22023'; end if;
    update public.tracker_routine_items set title = trim(p_title), instructions = p_instructions,
      required = p_required, updated_at = now() where id = step.source_item_id and user_id = owner_id;
    update public.tracker_routine_item_occurrences i set title = trim(p_title), instructions = p_instructions,
      required = p_required, updated_at = now()
      from public.tracker_routine_occurrences o where i.source_item_id = step.source_item_id and i.occurrence_id = o.id
        and i.user_id = owner_id and o.user_id = owner_id and o.routine_id = occurrence.routine_id
        and o.scheduled_date >= occurrence.scheduled_date and o.started_at is null and o.status = 'SCHEDULED';
  end if;
  select count(*), count(*) filter (where status = 'DONE') into required_count,done_count
    from public.tracker_routine_item_occurrences where occurrence_id = occurrence.id and user_id = owner_id and type <> 'GROUP' and required;
  if occurrence.started_at is not null and p_scope = 'THIS' then
    update public.tracker_routine_occurrences set status = case when done_count = required_count then 'COMPLETED' else 'IN_PROGRESS' end,
      ended_at = case when done_count = required_count then coalesce(ended_at,now()) else null end,
      updated_at = now() where id = occurrence.id and status <> 'SKIPPED';
  end if;
  return jsonb_build_object('item',(select to_jsonb(i) from public.tracker_routine_item_occurrences i where i.id = p_item_id),
    'appliedToCurrent',p_scope = 'THIS' or occurrence.started_at is null);
end $$;

create or replace function public.tracker_close_routine_occurrences() returns integer
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.tracker_routine_occurrences set
    status = case when started_at is null then 'MISSED' else 'PARTIAL' end,
    ended_at = coalesce(ended_at,now()), updated_at = now()
    where user_id = auth.uid() and status in ('SCHEDULED','IN_PROGRESS')
      and planned_date < (now() at time zone timezone)::date;
  get diagnostics changed = row_count;
  return changed;
end $$;

create or replace function public.tracker_transition_habit_timer(p_habit_id uuid, p_action text)
returns public.timelogger_time_entries
language plpgsql security definer set search_path = ''
as $$
declare result public.timelogger_time_entries;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if p_action not in ('pause', 'resume', 'stop') then raise exception 'Invalid timer action'; end if;
  select * into result from public.timelogger_time_entries
    where user_id = auth.uid() and tracker_habit_id = p_habit_id
      and status in ('running', 'paused') for update;
  if not found then raise exception 'No active timer for this habit'; end if;
  if p_action = 'pause' then
    if result.status <> 'running' then raise exception 'Timer is not running'; end if;
    update public.timelogger_time_entries set
      elapsed_seconds = elapsed_seconds + greatest(0, floor(extract(epoch from clock_timestamp() - last_resumed_at))::bigint),
      last_resumed_at = null, status = 'paused'
    where id = result.id returning * into result;
  elsif p_action = 'resume' then
    if result.status <> 'paused' then raise exception 'Timer is not paused'; end if;
    update public.timelogger_time_entries set last_resumed_at = clock_timestamp(), status = 'running'
    where id = result.id returning * into result;
  else
    update public.timelogger_time_entries set
      elapsed_seconds = elapsed_seconds + case when status = 'running' then greatest(0, floor(extract(epoch from clock_timestamp() - last_resumed_at))::bigint) else 0 end,
      last_resumed_at = null, end_at = clock_timestamp(), status = 'stopped'
    where id = result.id returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.timelogger_transition_timer(p_action text)
returns public.timelogger_time_entries
language plpgsql security definer set search_path = ''
as $$
declare result public.timelogger_time_entries;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if p_action not in ('pause', 'resume', 'stop') then raise exception 'Invalid timer action'; end if;
  select * into result from public.timelogger_time_entries
    where user_id = auth.uid() and status in ('running', 'paused') for update;
  if not found then raise exception 'No active timer'; end if;
  if p_action = 'pause' then
    if result.status <> 'running' then raise exception 'Timer is not running'; end if;
    update public.timelogger_time_entries set
      elapsed_seconds = elapsed_seconds + greatest(0, floor(extract(epoch from clock_timestamp() - last_resumed_at))::bigint),
      last_resumed_at = null, status = 'paused'
    where id = result.id returning * into result;
  elsif p_action = 'resume' then
    if result.status <> 'paused' then raise exception 'Timer is not paused'; end if;
    update public.timelogger_time_entries set last_resumed_at = clock_timestamp(), status = 'running'
    where id = result.id returning * into result;
  else
    update public.timelogger_time_entries set
      elapsed_seconds = elapsed_seconds + case when status = 'running' then greatest(0, floor(extract(epoch from clock_timestamp() - last_resumed_at))::bigint) else 0 end,
      last_resumed_at = null, end_at = clock_timestamp(), status = 'stopped'
    where id = result.id returning * into result;
  end if;
  return result;
end;
$$;

commit;
