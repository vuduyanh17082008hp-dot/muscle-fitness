-- =========================================================
-- MUSCLE FITNESS
-- WORKOUT_SESSIONS — TRAINING LOAD COLUMNS (forward-only repair)
--
-- Schema-drift repair: `20260804190000_project_09_workout_system.sql`
-- was extended, after it had already been applied to the remote
-- database, to add several `alter table public.workout_sessions add
-- column if not exists ...` statements (session_rpe, total_volume_kg,
-- name, scheduled_for, total_sets) plus a `finish_workout` RPC. Since
-- that migration's version was already recorded as applied, none of
-- those later additions ever reached the live database — editing an
-- already-applied historical migration file is exactly the unsafe
-- pattern this repair avoids repeating (never modify
-- 20260804190000_project_09_workout_system.sql itself).
--
-- This migration adds ONLY the two columns actually required by the
-- live Prompt 2 code path that is broken today:
-- lib/recovery/load-recovery-context.ts selects
-- `completed_at, session_rpe, total_volume_kg` from workout_sessions
-- to build training-load context for the recovery/readiness flow.
--
-- `name`, `scheduled_for`, `total_sets`, and the `finish_workout` RPC
-- are also still missing remotely (same root cause) but are not read
-- by any currently-broken Prompt 2 path, so are deliberately left for
-- a separate, scoped repair rather than bundled in here.
-- =========================================================

alter table public.workout_sessions
  add column if not exists session_rpe numeric(3,1);

alter table public.workout_sessions
  add column if not exists total_volume_kg numeric(14,2)
    not null default 0;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_session_rpe_check;

alter table public.workout_sessions
  add constraint workout_sessions_session_rpe_check
    check (session_rpe is null or session_rpe between 1 and 10);
