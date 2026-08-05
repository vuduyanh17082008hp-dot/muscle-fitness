-- =========================================================
-- MUSCLE FITNESS V2
-- PHASE 1 — CREATE OR EXTEND APP ROLE ENUM
-- =========================================================
--
-- Migration này hỗ trợ cả hai trường hợp:
--
-- 1. public.app_role chưa tồn tại:
--    Tạo enum hoàn chỉnh.
--
-- 2. public.app_role đã tồn tại:
--    Bổ sung các role còn thiếu.
--
-- Migration tiếp theo phải có timestamp lớn hơn file này
-- để các enum value mới được commit trước khi sử dụng.
-- =========================================================

do $migration$
declare
  v_type_kind "char";
begin
  select t.typtype
  into v_type_kind
  from pg_type as t
  inner join pg_namespace as n
    on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'app_role';

  if not found then
    execute $sql$
      create type public.app_role as enum (
        'user',
        'client',
        'coach',
        'support',
        'admin',
        'super_admin'
      )
    $sql$;

    raise notice 'Created public.app_role enum.';
    return;
  end if;

  if v_type_kind <> 'e' then
    raise exception
      'public.app_role exists but is not an enum type';
  end if;

  execute $sql$
    alter type public.app_role
    add value if not exists 'user'
  $sql$;

  execute $sql$
    alter type public.app_role
    add value if not exists 'client'
  $sql$;

  execute $sql$
    alter type public.app_role
    add value if not exists 'coach'
  $sql$;

  execute $sql$
    alter type public.app_role
    add value if not exists 'support'
  $sql$;

  execute $sql$
    alter type public.app_role
    add value if not exists 'admin'
  $sql$;

  execute $sql$
    alter type public.app_role
    add value if not exists 'super_admin'
  $sql$;

  raise notice 'Extended existing public.app_role enum.';
end;
$migration$;