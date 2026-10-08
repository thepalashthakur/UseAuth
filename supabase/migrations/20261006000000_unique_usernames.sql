-- Usernames are optional, but every non-empty username is reserved once.
create table if not exists public.usernames (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  constraint username_format check (username ~ '^[a-z0-9_]{3,30}$')
);

alter table public.usernames enable row level security;
revoke all on public.usernames from anon, authenticated;

create or replace function public.sync_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if normalized is null or normalized = '' then
    delete from public.usernames where user_id = new.id;
  else
    if normalized !~ '^[a-z0-9_]{3,30}$' then
      raise exception 'Invalid username.' using errcode = '22023';
    end if;
    insert into public.usernames (user_id, username)
    values (new.id, normalized)
    on conflict (user_id) do update set username = excluded.username;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_username() from public;

drop trigger if exists sync_auth_username on auth.users;
create trigger sync_auth_username
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_username();

-- Preserve any usernames already stored by other Supabase clients.
insert into public.usernames (user_id, username)
select id, lower(btrim(raw_user_meta_data ->> 'username'))
from auth.users
where lower(btrim(raw_user_meta_data ->> 'username')) ~ '^[a-z0-9_]{3,30}$'
on conflict (user_id) do update set username = excluded.username;

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.usernames
    where username = lower(btrim(candidate))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

notify pgrst, 'reload schema';
