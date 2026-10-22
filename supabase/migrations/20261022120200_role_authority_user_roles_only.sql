-- user_roles is the only role authority. private.current_app_role() (behind
-- is_admin() / is_staff() / current_app_role()) fell back to profiles.role
-- when a user had no user_roles row, so a profile-level 'admin' could grant
-- admin. 20261022120000 stops clients writing profiles.role; this removes the
-- fallback itself, so a missing user_roles row now always means 'client'.
--
-- Safe because every account gets a user_roles row from the signup trigger
-- (private.handle_new_auth_user) and admins are only provisioned through
-- user_roles (public.admin_set_user_role, service role). profiles.role stays
-- as a display mirror kept in sync by user_roles_sync_profile_role.
-- Hosted: run the read-only preflight (users without user_roles, elevated
-- profiles.role) before applying; any admin that exists only in profiles.role
-- loses admin here by design and must be re-granted through user_roles.

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        case
          when ur.role = 'user'::public.app_role then
            'client'::public.app_role
          else
            ur.role
        end
      from public.user_roles as ur
      where ur.user_id = (select auth.uid())
      limit 1
    ),
    'client'::public.app_role
  );
$$;
