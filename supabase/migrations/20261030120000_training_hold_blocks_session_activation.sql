-- QA-01 residual: the training hold (today's check-in pain_illness = 'yes', the same rule as
-- athleteState.recovery.painFlag -> buildDailyDecision -> trainingHold) was enforced only in Next.js
-- (startWorkoutAction, Dante schedule_workout). start_workout is directly callable over PostgREST by any
-- authenticated user, and RLS lets the owner insert/update workout_sessions directly, so either path could
-- activate a session under the hold. The invariant now lives on the table: no row may BECOME in progress
-- while the owner's check-in for their own local today flags pain/illness. Covers start_workout (both the
-- begin-planned and clone paths), the server action, Dante and direct REST writes alike.
-- Not blocked: returning/keeping an already in-progress session, finishing it, edits to other columns,
-- planned rows, adjustments. Raising aborts the whole statement/RPC, so nothing is half-created.
-- Do not apply to hosted without review.

create or replace function private.training_hold_active(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recovery_checkins as c
    where c.user_id = p_user_id
      and c.pain_illness = 'yes'
      and c.checkin_date = (
        now() at time zone coalesce(
          (select nullif(p.timezone, '') from public.profiles as p where p.user_id = p_user_id),
          'UTC'
        )
      )::date
  );
$$;

revoke all on function private.training_hold_active(uuid) from public, anon, authenticated;

create or replace function private.guard_workout_session_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.session_state = 'in_progress' or new.status = 'in_progress')
     and (
       tg_op = 'INSERT'
       or not (old.session_state is not distinct from 'in_progress' or old.status is not distinct from 'in_progress')
     )
     and private.training_hold_active(new.user_id) then
    raise exception 'Training is on hold today: your check-in flagged pain or illness. No session was started.'
      using errcode = '42501', hint = 'training_hold';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_workout_session_activation() from public, anon, authenticated;

drop trigger if exists workout_sessions_training_hold on public.workout_sessions;

create trigger workout_sessions_training_hold
before insert or update of session_state, status on public.workout_sessions
for each row
execute function private.guard_workout_session_activation();

-- start_workout raises for a null auth.uid() anyway; anon never needs it (Supabase default privileges granted it).
revoke execute on function public.start_workout(uuid) from anon;
