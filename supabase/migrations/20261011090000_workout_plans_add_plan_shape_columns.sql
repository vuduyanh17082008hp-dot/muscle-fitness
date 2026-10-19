-- WF-01: upgrade existing public.workout_plans.
--
-- 20260804190000_project_09_workout_system.sql creates workout_plans without
-- weeks / days_per_week / session_duration_minutes. 20260805090000_workout_system.sql
-- declares them but only via CREATE TABLE IF NOT EXISTS, which is a no-op on the
-- already-existing table. This additive migration adds them with the same
-- definitions the later migration declares.
--
-- Safety: ADD COLUMN ... NOT NULL DEFAULT backfills existing rows with the
-- default (no row rewrite loss, no coercion). IF NOT EXISTS skips a column that
-- already exists (its definition is NOT verified or altered here).
-- Rollback (manual, destructive, not part of this migration):
--   alter table public.workout_plans drop column weeks, drop column days_per_week,
--     drop column session_duration_minutes;

alter table public.workout_plans
  add column if not exists weeks integer not null default 4
    constraint workout_plans_weeks_check check (weeks between 1 and 52),
  add column if not exists days_per_week integer not null default 3
    constraint workout_plans_days_per_week_check check (days_per_week between 1 and 7),
  add column if not exists session_duration_minutes integer not null default 60
    constraint workout_plans_session_duration_minutes_check
      check (session_duration_minutes between 15 and 300);

-- PostgREST schema cache reload so the new columns are visible immediately.
notify pgrst, 'reload schema';
