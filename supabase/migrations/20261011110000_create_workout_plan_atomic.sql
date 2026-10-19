-- WF-03A + WF-03: atomic, idempotent workout-plan creation.
--
-- One function = one transaction: plan + days + exercises commit together or not at all.
-- Any error (check/unique/FK violation, bad payload) aborts the whole statement.
-- SECURITY INVOKER: RLS and can_manage_workout_client still apply to every insert;
-- the actor is auth.uid(), never a client-supplied owner id.
--
-- Idempotency: the key lives on the plan row, scoped per actor (created_by), so it is
-- inherently bound to this action and cannot be replayed across users. request_hash
-- (md5 of the canonical jsonb payload) detects same-key/different-payload. The key
-- never expires: it is only a column on the plan, so nothing can delete the plan.
-- Concurrent same-key calls serialize on the partial unique index.

alter table public.workout_plans
  add column if not exists idempotency_key uuid,
  add column if not exists request_hash text;

create unique index if not exists workout_plans_actor_idempotency_key_uidx
  on public.workout_plans (created_by, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_workout_plan(p_payload jsonb, p_idempotency_key uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan jsonb := p_payload -> 'plan';
  v_client uuid;
  v_hash text := md5(p_payload::text);
  v_plan_id uuid;
  v_existing public.workout_plans%rowtype;
  v_day jsonb;
  v_ex jsonb;
  v_day_id uuid;
begin
  if v_user is null then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  if v_plan is null or jsonb_typeof(p_payload -> 'days') is distinct from 'array' then
    raise exception 'INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_client := coalesce((v_plan ->> 'client_id')::uuid, v_user);

  if not public.can_manage_workout_client(v_client) then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.workout_plans (
    client_id, created_by, name, description, goal, weeks, days_per_week,
    session_duration_minutes, status, idempotency_key, request_hash
  ) values (
    v_client, v_user, v_plan ->> 'name', v_plan ->> 'description', v_plan ->> 'goal',
    (v_plan ->> 'weeks')::integer, (v_plan ->> 'days_per_week')::integer,
    (v_plan ->> 'session_duration_minutes')::integer, 'draft',
    p_idempotency_key, v_hash
  )
  on conflict (created_by, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_plan_id;

  if v_plan_id is null then
    select * into v_existing
      from public.workout_plans
     where created_by = v_user and idempotency_key = p_idempotency_key;

    if v_existing.request_hash is distinct from v_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object('plan_id', v_existing.id, 'replayed', true);
  end if;

  for v_day in select * from jsonb_array_elements(p_payload -> 'days') loop
    insert into public.workout_days (workout_plan_id, day_order, name, focus, notes, rest_day)
    values (
      v_plan_id, (v_day ->> 'day_number')::smallint, v_day ->> 'name', v_day ->> 'focus',
      v_day ->> 'notes', coalesce((v_day ->> 'rest_day')::boolean, false)
    )
    returning id into v_day_id;

    for v_ex in select * from jsonb_array_elements(coalesce(v_day -> 'exercises', '[]'::jsonb)) loop
      insert into public.workout_exercises (
        workout_day_id, exercise_id, exercise_name, exercise_order, target_sets,
        rep_min, rep_max, rest_seconds, tempo, rir, target_rir, notes
      ) values (
        v_day_id, (v_ex ->> 'exercise_id')::uuid, v_ex ->> 'exercise_name',
        (v_ex ->> 'exercise_order')::smallint, (v_ex ->> 'target_sets')::smallint,
        (v_ex ->> 'rep_min')::smallint, (v_ex ->> 'rep_max')::smallint,
        (v_ex ->> 'rest_seconds')::integer, v_ex ->> 'tempo', (v_ex ->> 'rir')::integer,
        coalesce((v_ex ->> 'rir')::numeric, 2), v_ex ->> 'notes'
      );
    end loop;
  end loop;

  return jsonb_build_object('plan_id', v_plan_id, 'replayed', false);
end;
$$;

revoke all on function public.create_workout_plan(jsonb, uuid) from public, anon;
grant execute on function public.create_workout_plan(jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
