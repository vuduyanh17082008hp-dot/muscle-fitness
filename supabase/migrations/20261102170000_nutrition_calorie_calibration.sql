-- =========================================================
-- MUSCLE FITNESS — NUTRITION CALORIE CALIBRATION
--
-- The daily calorie target stays computed live by
-- lib/nutrition/plan.ts (one source of truth). This adds only
-- what that engine cannot derive: a calorie change the USER
-- ACCEPTED after reviewing their bodyweight trend, and when they
-- last reviewed one (accept / keep current / reset), so the next
-- review waits for fresh weigh-ins.
--
--   calorie_adjustment_kcal          kcal/day added to the estimate;
--                                    0 = pure estimate. Only written
--                                    by an explicit user action.
--   calorie_calibration_reviewed_at  last user review, null = never.
--
-- Additive only: existing rows get 0 / null, so every existing
-- target is unchanged. RLS on user_preferences is untouched (the
-- table's own-row policies already cover the new columns).
--
-- Rollback:
--   alter table public.user_preferences
--     drop constraint if exists user_preferences_calorie_adjustment_range,
--     drop column if exists calorie_calibration_reviewed_at,
--     drop column if exists calorie_adjustment_kcal;
-- (The app falls back to the pre-calibration column set when the
-- columns are missing.)
-- =========================================================

alter table public.user_preferences
  add column if not exists calorie_adjustment_kcal smallint not null default 0;

alter table public.user_preferences
  add column if not exists calorie_calibration_reviewed_at timestamptz;

alter table public.user_preferences
  drop constraint if exists user_preferences_calorie_adjustment_range;

alter table public.user_preferences
  add constraint user_preferences_calorie_adjustment_range
  check (calorie_adjustment_kcal between -1000 and 1000);

notify pgrst, 'reload schema';
