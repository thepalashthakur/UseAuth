-- Bind the public app-access helper to an active registered OAuth client.
-- Legacy user sessions without client_id retain Phase 2 behavior. The
-- service-role-only has_app_access_for_user helper remains unchanged.
begin;

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
      and (
        (select auth.jwt()->>'client_id') is null
        or exists (
          select 1 from auth_platform.oauth_clients c
          where c.app_id = a.app_id
            and c.client_id = (select auth.jwt()->>'client_id')
            and c.active
        )
      )
  );
$$;
revoke all on function public.has_app_access(text) from public, anon;
grant execute on function public.has_app_access(text) to authenticated;

notify pgrst, 'reload schema';
commit;
