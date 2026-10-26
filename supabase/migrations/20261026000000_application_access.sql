-- Phase 2 application access registry. This schema is not exposed through PostgREST.
begin;
create schema if not exists auth_platform;
revoke all on schema auth_platform from public, anon, authenticated;

create table if not exists auth_platform.applications (
  app_id text primary key check (app_id ~ '^[a-z][a-z0-9_-]{2,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  environment text not null check (environment in ('test', 'staging', 'production')),
  app_origin text not null check (app_origin ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'),
  oauth_redirect_uri text,
  oauth_client_id text unique,
  active boolean not null default false,
  enrollment text not null default 'automatic' check (enrollment in ('manual', 'automatic')),
  created_at timestamptz not null default now(),
  constraint redirect_owned_by_app check (
    oauth_redirect_uri is null or left(oauth_redirect_uri, length(app_origin) + 1) = app_origin || '/'
  )
);

create table if not exists auth_platform.app_memberships (
  app_id text not null references auth_platform.applications (app_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  grant_source text not null check (grant_source in ('automatic', 'admin')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);
create index if not exists app_memberships_user_id_idx on auth_platform.app_memberships (user_id);

alter table auth_platform.applications enable row level security;
alter table auth_platform.app_memberships enable row level security;
revoke all on auth_platform.applications, auth_platform.app_memberships from public, anon, authenticated;

-- The caller can ask only about their own JWT identity. No table rows are exposed.
create or replace function public.has_app_access(app_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth_platform.applications a
    join auth_platform.app_memberships m on m.app_id = a.app_id
    where a.app_id = app_key
      and a.active
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;
revoke all on function public.has_app_access(text) from public, anon;
grant execute on function public.has_app_access(text) to authenticated;

-- Time Logger's existing personal API tokens have no user JWT. Only its
-- server-held service-role key may check their owner against the same policy.
create or replace function public.has_app_access_for_user(app_key text, subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth_platform.applications a
    join auth_platform.app_memberships m on m.app_id = a.app_id
    where a.app_id = app_key
      and a.active
      and m.user_id = subject_user_id
      and m.status = 'active'
  );
$$;
revoke all on function public.has_app_access_for_user(text, uuid) from public, anon, authenticated;
grant execute on function public.has_app_access_for_user(text, uuid) to service_role;

create or replace function auth_platform.auto_grant_active_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth_platform.app_memberships (app_id, user_id, grant_source)
  select app_id, new.id, 'automatic'
  from auth_platform.applications
  where active and enrollment = 'automatic'
  on conflict (app_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function auth_platform.auto_grant_active_apps() from public, anon, authenticated;

drop trigger if exists auto_grant_active_apps on auth.users;
create trigger auto_grant_active_apps
after insert on auth.users
for each row execute function auth_platform.auto_grant_active_apps();

-- A newly activated automatic app grants existing users access as well.
-- Revoked memberships remain revoked because conflicts are left untouched.
create or replace function auth_platform.auto_grant_new_app()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active and new.enrollment = 'automatic' then
    insert into auth_platform.app_memberships (app_id, user_id, grant_source)
    select new.app_id, id, 'automatic' from auth.users
    on conflict (app_id, user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function auth_platform.auto_grant_new_app() from public, anon, authenticated;

drop trigger if exists auto_grant_new_app on auth_platform.applications;
create trigger auto_grant_new_app
after insert or update of active, enrollment on auth_platform.applications
for each row execute function auth_platform.auto_grant_new_app();

insert into auth_platform.applications (app_id, display_name, environment, app_origin, active, enrollment)
values
  ('timelogger', 'Time Logger', 'test', 'https://timelogger-gilt.vercel.app', true, 'automatic'),
  ('myhabits', 'MyHabits', 'test', 'https://myhabits-dun.vercel.app', true, 'automatic')
on conflict (app_id) do nothing;

-- Existing automatic apps are backfilled idempotently if this migration is
-- applied to an existing test project.
insert into auth_platform.app_memberships (app_id, user_id, grant_source)
select a.app_id, u.id, 'automatic'
from auth_platform.applications a
cross join auth.users u
where a.active and a.enrollment = 'automatic'
on conflict (app_id, user_id) do nothing;

notify pgrst, 'reload schema';
commit;
