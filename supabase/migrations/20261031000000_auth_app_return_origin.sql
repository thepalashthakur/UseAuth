-- Expose only the active app's public origin to the auth service.
create or replace function public.auth_app_return_origin(app_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.app_origin
  from auth_platform.applications a
  where a.app_id = app_key
    and a.active
    and a.app_origin ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'
  limit 1;
$$;
revoke all on function public.auth_app_return_origin(text) from public;
grant execute on function public.auth_app_return_origin(text) to anon, authenticated;

insert into auth_platform.applications
  (app_id, display_name, environment, app_origin, active, enrollment)
values
  ('timelogger_sso_preview', 'Time Logger SSO preview', 'test', 'https://timelogger-git-feat-sso-pilot-palashs-projects-9c44f3e0.vercel.app', true, 'automatic'),
  ('myhabits_sso_preview', 'MyHabits SSO preview', 'test', 'https://myhabits-git-feat-sso-pilot-palashs-projects-9c44f3e0.vercel.app', true, 'automatic')
on conflict (app_id) do update set
  display_name = excluded.display_name,
  app_origin = excluded.app_origin,
  active = true;
