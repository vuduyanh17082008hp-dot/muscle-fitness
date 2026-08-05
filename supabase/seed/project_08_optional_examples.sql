-- ============================================================
-- PROJECT 08 — OPTIONAL TEST DATA
-- ============================================================
-- Thay UUID bên dưới bằng User ID thật:
-- Supabase → Authentication → Users → Copy User ID.
-- ============================================================

do $$
declare
  v_user_id uuid :=
    '00000000-0000-0000-0000-000000000000';

  v_timezone text := 'Asia/Singapore';

  v_today date;
begin
  if v_user_id =
    '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception
      'Replace v_user_id with a real auth.users.id first.';
  end if;

  v_today :=
    (
      now()
      at time zone v_timezone
    )::date;

  insert into public.workout_sessions (
    user_id,
    scheduled_date,
    start_time,
    title,
    focus,
    duration_minutes,
    status
  )
  values (
    v_user_id,
    v_today,
    '18:00',
    'Upper Body Strength',
    'Chest, shoulders and upper back',
    75,
    'scheduled'
  );

  insert into public.coach_messages (
    client_user_id,
    sender_role,
    sender_name,
    body
  )
  values (
    v_user_id,
    'system',
    'Muscle Fitness Coach',
    'Keep today simple: complete your planned session, reach your protein target and log your recovery honestly.'
  );
end;
$$;