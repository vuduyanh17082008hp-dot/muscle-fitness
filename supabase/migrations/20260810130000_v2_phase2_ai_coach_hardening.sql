-- Muscle Fitness V2 Phase 2 — AI Coach hardening (additive only)
-- - Prefer Phase 1 ai_daily_limit for usage caps
-- - Allow tool-log confirmation lifecycle updates
-- - Expose get_entitlement_value for integer/text entitlements

-- =========================================================
-- 1. Tool log status + update grants (confirmation flow)
-- =========================================================

alter table public.ai_tool_logs
  drop constraint if exists ai_tool_logs_status_check;

alter table public.ai_tool_logs
  add constraint ai_tool_logs_status_check
  check (
    status in (
      'success',
      'error',
      'confirmation_required',
      'awaiting_confirmation',
      'succeeded',
      'failed',
      'cancelled'
    )
  );

drop policy if exists ai_tool_logs_update_own
  on public.ai_tool_logs;

create policy ai_tool_logs_update_own
on public.ai_tool_logs
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

grant select, insert, update
  on table public.ai_tool_logs
  to authenticated;

-- =========================================================
-- 2. Entitlement value resolver
-- =========================================================

create or replace function public.get_entitlement_value(
  p_key text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_user_value text;
  v_role_value text;
  v_default text;
begin
  if v_user_id is null then
    return null;
  end if;

  if p_key is null or btrim(p_key) = '' then
    return null;
  end if;

  v_role := private.current_app_role();

  select ue.value
  into v_user_value
  from public.user_entitlements as ue
  where ue.user_id = v_user_id
    and ue.entitlement_key = btrim(p_key)
    and (ue.ends_at is null or ue.ends_at > timezone('utc', now()))
    and (ue.starts_at is null or ue.starts_at <= timezone('utc', now()))
  limit 1;

  select re.value
  into v_role_value
  from public.role_entitlements as re
  where re.role = v_role
    and re.entitlement_key = btrim(p_key)
  limit 1;

  select e.default_value
  into v_default
  from public.entitlements as e
  where e.key = btrim(p_key)
  limit 1;

  return coalesce(v_user_value, v_role_value, v_default);
end;
$$;

revoke all on function public.get_entitlement_value(text) from public;
grant execute on function public.get_entitlement_value(text) to authenticated;

-- =========================================================
-- 3. consume_ai_usage — ai_daily_limit is authoritative
-- =========================================================

create or replace function public.consume_ai_usage(
  p_thread_id uuid default null
)
returns table (
  allowed boolean,
  usage_date date,
  plan_code text,
  messages_used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_usage_date date;
  v_plan_code text;
  v_daily_limit integer;
  v_phase1_limit integer;
  v_messages_used integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_thread_id is not null
    and not exists (
      select 1
      from public.ai_threads as thread_row
      where
        thread_row.id = p_thread_id
        and thread_row.user_id = v_user_id
    )
  then
    raise exception 'Thread not found';
  end if;

  v_usage_date := public.ai_usage_date_for(v_user_id);

  select
    entitlement_row.plan_code,
    entitlement_row.daily_message_limit
  into
    v_plan_code,
    v_daily_limit
  from public.ai_entitlements as entitlement_row
  where
    entitlement_row.user_id = v_user_id
    and entitlement_row.active = true
    and (
      entitlement_row.starts_at is null
      or entitlement_row.starts_at <= now()
    )
    and (
      entitlement_row.ends_at is null
      or entitlement_row.ends_at > now()
    )
  order by
    entitlement_row.updated_at desc
  limit 1;

  v_plan_code := coalesce(v_plan_code, 'free');

  begin
    v_phase1_limit := nullif(
      btrim(public.get_entitlement_value('ai_daily_limit')),
      ''
    )::integer;
  exception
    when others then
      v_phase1_limit := null;
  end;

  -- Phase 1 role/user entitlement is authoritative when present.
  v_daily_limit := greatest(
    coalesce(v_phase1_limit, v_daily_limit, 5),
    0
  );

  insert into public.ai_usage_daily (
    user_id,
    usage_date,
    plan_code,
    messages_used,
    request_limit,
    input_tokens,
    output_tokens,
    total_tokens
  )
  values (
    v_user_id,
    v_usage_date,
    v_plan_code,
    0,
    v_daily_limit,
    0,
    0,
    0
  )
  on conflict do nothing;

  update public.ai_usage_daily as usage_row
  set
    plan_code = v_plan_code,
    request_limit = v_daily_limit,
    updated_at = now()
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date;

  update public.ai_usage_daily as usage_row
  set
    messages_used = usage_row.messages_used + 1,
    updated_at = now()
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date
    and usage_row.messages_used < v_daily_limit
  returning usage_row.messages_used
  into v_messages_used;

  if found then
    return query
    select
      true,
      v_usage_date,
      v_plan_code,
      v_messages_used,
      v_daily_limit,
      greatest(v_daily_limit - v_messages_used, 0);

    return;
  end if;

  select usage_row.messages_used
  into v_messages_used
  from public.ai_usage_daily as usage_row
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date
  limit 1;

  v_messages_used := coalesce(v_messages_used, 0);

  return query
  select
    false,
    v_usage_date,
    v_plan_code,
    v_messages_used,
    v_daily_limit,
    0;
end;
$function$;

-- Keep snapshot consistent with Phase 1 limit
create or replace function public.get_ai_usage_snapshot()
returns table (
  usage_date date,
  plan_code text,
  messages_used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_usage_date date;
  v_plan_code text;
  v_daily_limit integer;
  v_phase1_limit integer;
  v_messages_used integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_usage_date := public.ai_usage_date_for(v_user_id);

  select
    entitlement_row.plan_code,
    entitlement_row.daily_message_limit
  into
    v_plan_code,
    v_daily_limit
  from public.ai_entitlements as entitlement_row
  where
    entitlement_row.user_id = v_user_id
    and entitlement_row.active = true
    and (
      entitlement_row.starts_at is null
      or entitlement_row.starts_at <= now()
    )
    and (
      entitlement_row.ends_at is null
      or entitlement_row.ends_at > now()
    )
  order by entitlement_row.updated_at desc
  limit 1;

  v_plan_code := coalesce(v_plan_code, 'free');

  begin
    v_phase1_limit := nullif(
      btrim(public.get_entitlement_value('ai_daily_limit')),
      ''
    )::integer;
  exception
    when others then
      v_phase1_limit := null;
  end;

  v_daily_limit := greatest(
    coalesce(v_phase1_limit, v_daily_limit, 5),
    0
  );

  select coalesce(usage_row.messages_used, 0)
  into v_messages_used
  from public.ai_usage_daily as usage_row
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date;

  v_messages_used := coalesce(v_messages_used, 0);

  return query
  select
    v_usage_date,
    v_plan_code,
    v_messages_used,
    v_daily_limit,
    greatest(v_daily_limit - v_messages_used, 0);
end;
$function$;
