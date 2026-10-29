-- Reverts only the public helper to its Phase 2 membership-only behavior.
-- Use only after deactivating OAuth clients; otherwise it would allow a
-- client-bound token to claim membership in another app.
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
  );
$$;
revoke all on function public.has_app_access(text) from public, anon;
grant execute on function public.has_app_access(text) to authenticated;

notify pgrst, 'reload schema';
commit;
