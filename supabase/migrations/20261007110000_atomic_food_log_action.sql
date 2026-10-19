-- Atomic confirmation of a food-log pending action.
-- One transaction: verify ownership/tool/status, insert the food log (idempotent
-- on (user_id, idempotency_key = action id)) and move the action to 'executed'.
-- Any failure rolls back BOTH writes, so a food log can never exist for an
-- action that is not 'executed'. SECURITY INVOKER: RLS still applies to every statement.

create or replace function public.finalize_food_log_action(p_action_id uuid, p_row jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_action public.dante_tool_actions%rowtype;
  v_log public.food_logs%rowtype;
begin
  if v_user is null then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_action
    from public.dante_tool_actions
   where id = p_action_id and user_id = v_user
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

  select * into v_log
    from public.food_logs
   where user_id = v_user and idempotency_key = p_action_id;

  if not found then
    insert into public.food_logs (
      user_id, log_date, meal_type, food_name, brand, source, source_id, barcode,
      quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g,
      fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason,
      estimated_from, idempotency_key
    ) values (
      v_user,
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

revoke all on function public.finalize_food_log_action(uuid, jsonb) from public, anon;
grant execute on function public.finalize_food_log_action(uuid, jsonb) to authenticated;
