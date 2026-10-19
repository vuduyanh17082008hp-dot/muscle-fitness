-- VER3-03b: finish_workout computed duration_minutes = greatest(1, elapsed minutes),
-- but workout_sessions_duration_check only allows 5..480 (or null), so finishing a
-- session within 5 minutes (or after 8h) failed with a check violation and the
-- session could never reach 'completed'. Clamp into the table's own valid range;
-- the constraint is unchanged. Body otherwise identical to the deployed function.

CREATE OR REPLACE FUNCTION public.finish_workout(p_session_id uuid, p_notes text DEFAULT NULL::text, p_session_rpe numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());

  v_started_at timestamptz;
  v_duration integer;

  v_total_volume numeric(14,2);
  v_completed_sets integer;
  v_completed_exercises integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select started_at
  into v_started_at
  from public.workout_sessions
  where id = p_session_id
    and user_id = v_user_id
    and session_state = 'in_progress';

  if not found then
    raise exception 'Active workout session not found'
      using errcode = 'P0002';
  end if;

  select
    coalesce(sum(es.volume_kg), 0),
    count(*) filter (where es.completed = true),
    count(distinct wse.id)
      filter (
        where es.completed = true
        and wse.is_skipped = false
      )
  into
    v_total_volume,
    v_completed_sets,
    v_completed_exercises
  from public.workout_session_exercises as wse
  left join public.exercise_sets as es
    on es.session_exercise_id = wse.id
  where wse.workout_session_id = p_session_id;

  if v_completed_sets = 0 then
    raise exception 'Complete at least one set before finishing'
      using errcode = '22023';
  end if;

  v_duration := least(
    480,
    greatest(
      5,
      floor(
        extract(
          epoch from (
            now() - coalesce(v_started_at, now())
          )
        ) / 60
      )::integer
    )
  );

  update public.workout_sessions
  set
    status = 'completed',
    session_state = 'completed',
    completed_at = now(),
    duration_minutes = v_duration,
    total_volume_kg = v_total_volume,
    total_sets = v_completed_sets,
    session_rpe = p_session_rpe,
    notes = nullif(btrim(p_notes), '')
  where id = p_session_id
    and user_id = v_user_id;

  insert into public.workout_logs (
    workout_session_id,
    user_id,
    duration_minutes,
    total_volume_kg,
    completed_sets,
    completed_exercises,
    session_rpe,
    notes,
    completed_at
  )
  values (
    p_session_id,
    v_user_id,
    v_duration,
    v_total_volume,
    v_completed_sets,
    v_completed_exercises,
    p_session_rpe,
    nullif(btrim(p_notes), ''),
    now()
  )
  on conflict (workout_session_id)
  do update
  set
    duration_minutes = excluded.duration_minutes,
    total_volume_kg = excluded.total_volume_kg,
    completed_sets = excluded.completed_sets,
    completed_exercises = excluded.completed_exercises,
    session_rpe = excluded.session_rpe,
    notes = excluded.notes,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'durationMinutes', v_duration,
    'totalVolumeKg', v_total_volume,
    'completedSets', v_completed_sets,
    'completedExercises', v_completed_exercises
  );
end;
$function$

;

revoke all on function public.finish_workout(uuid, text, numeric) from public;
grant execute on function public.finish_workout(uuid, text, numeric) to authenticated;
