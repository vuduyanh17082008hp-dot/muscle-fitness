-- Hackathon repair F-04 / F-02: today's session can already exist as a planned `not_started` row (the demo seed writes one,
-- and the recovery "Adjust Today's Plan -> Apply" mutation edits exactly that row's prescription). start_workout used to
-- ignore it and clone a fresh session from the plan template, so:
--   * the dashboard's Start/Resume pointed at a row that could never be started (read-only page), and
--   * an applied adjustment (3 sets -> 2) silently disappeared the moment the user started training.
-- start_workout now BEGINS that planned row: same id, its own (possibly adjusted) prescription, sets generated from its
-- target_sets. Otherwise behaviour is unchanged (resume an in-progress session; else clone from the template).
-- "Today" is the DB date +/- 1 day because session dates are written in the user's local zone (Asia/Singapore in the demo)
-- while current_date is UTC; the nearest planned row wins.
-- Do not apply to hosted without review.

create or replace function public.start_workout(
  p_workout_day_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());

  v_plan_id uuid;
  v_day_name text;

  v_session_id uuid;
  v_existing_session uuid;
  v_planned_session uuid;

  v_session_exercise_id uuid;
  v_exercise record;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select
    wp.id,
    wd.name
  into
    v_plan_id,
    v_day_name
  from public.workout_days as wd
  join public.workout_plans as wp
    on wp.id = wd.workout_plan_id
  where wd.id = p_workout_day_id
    and wp.client_id = v_user_id
    and wp.status = 'active';

  if v_plan_id is null then
    raise exception 'Active workout day not found'
      using errcode = 'P0002';
  end if;

  select id
  into v_existing_session
  from public.workout_sessions
  where user_id = v_user_id
    and workout_day_id = p_workout_day_id
    and session_state = 'in_progress'
  order by created_at desc
  limit 1;

  if v_existing_session is not null then
    return v_existing_session;
  end if;

  -- A planned row for this day around today: begin it, keeping its prescription.
  select id
  into v_planned_session
  from public.workout_sessions
  where user_id = v_user_id
    and workout_day_id = p_workout_day_id
    and session_state = 'not_started'
    and scheduled_date between current_date - 1 and current_date + 1
  order by abs(scheduled_date - current_date), created_at desc
  limit 1
  for update;

  if v_planned_session is not null then
    update public.workout_sessions
       set session_state = 'in_progress',
           status = 'in_progress',
           started_at = now(),
           updated_at = now()
     where id = v_planned_session
       and user_id = v_user_id;

    -- Sets come from the row's own target_sets (an applied adjustment included). Never duplicates existing sets.
    insert into public.exercise_sets (
      session_exercise_id,
      set_number,
      set_type,
      target_reps
    )
    select
      se.id,
      generated_set_number,
      'working',
      se.target_rep_max
    from public.workout_session_exercises as se
    cross join lateral generate_series(1, greatest(coalesce(se.target_sets, 0), 0)) as generated_set_number
    where se.workout_session_id = v_planned_session
      and not exists (
        select 1 from public.exercise_sets as es where es.session_exercise_id = se.id
      );

    return v_planned_session;
  end if;

  insert into public.workout_sessions (
    user_id,
    workout_plan_id,
    workout_day_id,
    title,
    name,
    status,
    session_state,
    scheduled_date,
    scheduled_for,
    started_at
  )
  values (
    v_user_id,
    v_plan_id,
    p_workout_day_id,
    v_day_name,
    v_day_name,
    'in_progress',
    'in_progress',
    current_date,
    now(),
    now()
  )
  returning id into v_session_id;

  for v_exercise in
    select
      we.id as workout_exercise_id,
      we.exercise_id,
      we.exercise_order,
      we.target_sets,
      we.rep_min,
      we.rep_max,
      we.target_rir,
      we.target_rpe,
      we.rest_seconds,
      we.tempo,
      we.notes,
      el.name as exercise_name
    from public.workout_exercises as we
    join public.exercise_library as el
      on el.id = we.exercise_id
    where we.workout_day_id = p_workout_day_id
    order by we.exercise_order
  loop
    insert into public.workout_session_exercises (
      workout_session_id,
      workout_exercise_id,
      exercise_id,
      exercise_order,
      display_name,
      target_sets,
      target_rep_min,
      target_rep_max,
      target_rir,
      target_rpe,
      rest_seconds,
      tempo,
      notes
    )
    values (
      v_session_id,
      v_exercise.workout_exercise_id,
      v_exercise.exercise_id,
      v_exercise.exercise_order,
      v_exercise.exercise_name,
      v_exercise.target_sets,
      v_exercise.rep_min,
      v_exercise.rep_max,
      v_exercise.target_rir,
      v_exercise.target_rpe,
      v_exercise.rest_seconds,
      v_exercise.tempo,
      v_exercise.notes
    )
    returning id into v_session_exercise_id;

    insert into public.exercise_sets (
      session_exercise_id,
      set_number,
      set_type,
      target_reps
    )
    select
      v_session_exercise_id,
      generated_set_number,
      'working',
      v_exercise.rep_max
    from generate_series(
      1,
      v_exercise.target_sets
    ) as generated_set_number;
  end loop;

  return v_session_id;
end;
$$;

revoke all on function public.start_workout(uuid)
  from public;

grant execute on function public.start_workout(uuid)
  to authenticated;
