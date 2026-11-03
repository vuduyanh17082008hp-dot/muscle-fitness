-- profiles.role is an authority column: private.current_app_role() and the
-- app's resolveActorRole() both fall back to it when a user has no
-- user_roles row. 20260803000000_fix_onboarding granted table-wide
-- insert/update on profiles to authenticated, so any signed-in user could
-- write their own role; reproduced locally — a user without a user_roles
-- row became is_admin() and passed requireAdmin().
--
-- A trigger rather than column grants: it survives any later table-wide
-- grant and needs no upkeep when profile columns are added. Server-side
-- writers (service_role, SECURITY DEFINER functions such as the signup
-- trigger, migrations) are unaffected; role changes go through user_roles.

create or replace function private.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.role is distinct from 'client'::public.app_role then
      raise exception 'profiles.role is managed by the server'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'profiles.role is managed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
before insert or update on public.profiles
for each row
execute function private.guard_profile_role();
