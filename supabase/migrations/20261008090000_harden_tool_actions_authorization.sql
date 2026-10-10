-- Authorization hardening for Dante tool actions (forward migration).
--
-- Bug: dante_tool_actions had owner INSERT/UPDATE RLS policies and
-- finalize_food_log_action(uuid, jsonb) was executable by `authenticated`, so
-- an ordinary browser user could forge an owned row (arbitrary args/context,
-- status='confirmed') and call the RPC directly with an arbitrary p_row.
--
-- Fix: executable actions are server-issued only. Authenticated users keep
-- SELECT on their own rows; every lifecycle write (propose / confirm / cancel /
-- finalize) goes through the service role from the authenticated server routes,
-- which derive the user id from the session (never from the request body).

-- 1. dante_tool_actions: owner SELECT only.
drop policy if exists "dante_tool_actions_insert_own" on public.dante_tool_actions;
drop policy if exists "dante_tool_actions_update_own" on public.dante_tool_actions;

revoke insert, update, delete, truncate, references, trigger
  on public.dante_tool_actions from anon, authenticated, public;
revoke select on public.dante_tool_actions from anon;
grant select on public.dante_tool_actions to authenticated;

-- 2. Replace the vulnerable RPC signature. SECURITY INVOKER is sufficient:
--    service_role bypasses RLS, so no privilege escalation (DEFINER) is needed.
drop function if exists public.finalize_food_log_action(uuid, jsonb);

create or replace function public.finalize_food_log_action(p_action_id uuid, p_user_id uuid, p_row jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action public.dante_tool_actions%rowtype;
  v_log public.food_logs%rowtype;
  v_name text;
  v_meal text;
begin
  if p_user_id is null or p_row is null then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_action
    from public.dante_tool_actions
   where id = p_action_id and user_id = p_user_id
     for update;

  if not found then
    raise exception 'ACTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_action.tool_name not in ('log_food', 'log_meal_draft') then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  if v_action.status not in ('confirmed', 'executed') then
    raise exception 'ACTION_NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  -- The row is built by trusted server code from the stored args; bind its
  -- identity fields to the immutable approved action so it cannot be swapped.
  if v_action.tool_name = 'log_meal_draft' then
    v_name := v_action.args->>'name';
  else
    v_name := v_action.args->>'foodName';
  end if;
  v_meal := v_action.args->>'mealType';

  if p_row->>'food_name' is distinct from v_name
     or p_row->>'meal_type' is distinct from v_meal
     or (v_action.tool_name = 'log_food'
         and (p_row->>'quantity_grams')::numeric is distinct from (v_action.args->>'quantityGrams')::numeric) then
    raise exception 'ACTION_PAYLOAD_MISMATCH' using errcode = '42501';
  end if;

  select * into v_log
    from public.food_logs
   where user_id = p_user_id and idempotency_key = p_action_id;

  if not found then
    insert into public.food_logs (
      user_id, log_date, meal_type, food_name, brand, source, source_id, barcode,
      quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g,
      fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason,
      estimated_from, idempotency_key
    ) values (
      p_user_id,
      (p_row->>'log_date')::date,
      p_row->>'meal_type',
      p_row->>'food_name',
      p_row->>'brand',
      p_row->>'source',
      p_row->>'source_id',
      p_row->>'barcode',
      (p_row->>'quantity_grams')::numeric,
      p_row->>'serving_name',
      (p_row->>'servings_consumed')::numeric,
      (p_row->>'calories')::numeric,
      (p_row->>'protein_g')::numeric,
      (p_row->>'carbs_g')::numeric,
      (p_row->>'fat_g')::numeric,
      (p_row->>'fiber_g')::numeric,
      coalesce((p_row->>'is_estimated')::boolean, false),
      p_row->>'estimation_confidence',
      p_row->>'estimation_reason',
      p_row->>'estimated_from',
      p_action_id
    )
    returning * into v_log;
  end if;

  if v_action.status <> 'executed' then
    update public.dante_tool_actions
       set status = 'executed',
           executed_at = now(),
           result = jsonb_build_object('foodLogId', v_log.id, 'calories', v_log.calories, 'protein', v_log.protein_g)
     where id = p_action_id;
  end if;

  return to_jsonb(v_log);
end;
$$;

revoke all on function public.finalize_food_log_action(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_food_log_action(uuid, uuid, jsonb) to service_role;
