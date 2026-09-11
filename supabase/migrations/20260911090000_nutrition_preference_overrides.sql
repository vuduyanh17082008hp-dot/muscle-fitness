-- =========================================================
-- MUSCLE FITNESS
-- NUTRITION INTELLIGENCE — OVERRIDE FIELDS (CORRECTION)
--
-- The previous migration
-- (20260910090000_nutrition_intelligence.sql) added
-- `training_mode`, `activity_level` and `nutrition_goal_override`
-- to public.user_preferences, but:
--
--   1. It was never applied to the live database (PostgREST's
--      schema cache error confirms the columns do not exist
--      there yet), and
--   2. The naming was inconsistent — two bare fields and one
--      override field, using underscore-separated values that
--      do not match the vocabulary this migration standardises
--      on.
--
-- This migration is additive and corrective. It does not drop
-- or rename any existing column, and it does not touch existing
-- row data. Running it (even after the previous migration was
-- partially applied) is safe because every ADD COLUMN uses
-- IF NOT EXISTS and every CHECK constraint is dropped and
-- re-added by name before being redefined.
--
-- FIELDS
--
--   activity_level / training_mode / nutrition_goal
--     Reserved "resolved" fields for future use (for example,
--     server-computed or business-analytics values). The
--     current application does not write to them — only to the
--     *_override fields below, which represent an explicit user
--     choice and take priority over any inferred value.
--
--   activity_level_override   sedentary | light | moderate | very | super
--   training_mode_override    general | strength | running | hybrid | hiit | team-sport
--   nutrition_goal_override   fat-loss | maintenance | lean-bulk
-- =========================================================

alter table public.user_preferences
  add column if not exists activity_level text;

alter table public.user_preferences
  add column if not exists training_mode text;

alter table public.user_preferences
  add column if not exists nutrition_goal text;

alter table public.user_preferences
  add column if not exists activity_level_override text;

alter table public.user_preferences
  add column if not exists training_mode_override text;

alter table public.user_preferences
  add column if not exists nutrition_goal_override text;

-- ---------------------------------------------------------
-- Drop any constraints from the earlier, inconsistent
-- migration before redefining them with the correct
-- vocabulary.
-- ---------------------------------------------------------

alter table public.user_preferences
  drop constraint if exists user_preferences_training_mode_check;

alter table public.user_preferences
  drop constraint if exists user_preferences_activity_level_check;

alter table public.user_preferences
  drop constraint if exists user_preferences_nutrition_goal_check;

alter table public.user_preferences
  drop constraint if exists user_preferences_nutrition_goal_override_check;

alter table public.user_preferences
  drop constraint if exists user_preferences_activity_level_override_check;

alter table public.user_preferences
  drop constraint if exists user_preferences_training_mode_override_check;

-- ---------------------------------------------------------
-- Resolved fields (currently unused by the application, kept
-- for forward compatibility — same vocabulary as overrides).
-- ---------------------------------------------------------

alter table public.user_preferences
  add constraint user_preferences_activity_level_check
  check (
    activity_level is null
    or activity_level in ('sedentary', 'light', 'moderate', 'very', 'super')
  );

alter table public.user_preferences
  add constraint user_preferences_training_mode_check
  check (
    training_mode is null
    or training_mode in (
      'general', 'strength', 'running', 'hybrid', 'hiit', 'team-sport'
    )
  );

alter table public.user_preferences
  add constraint user_preferences_nutrition_goal_check
  check (
    nutrition_goal is null
    or nutrition_goal in ('fat-loss', 'maintenance', 'lean-bulk')
  );

-- ---------------------------------------------------------
-- Override fields — explicit user selections. These take
-- priority over any inferred/resolved value.
-- ---------------------------------------------------------

alter table public.user_preferences
  add constraint user_preferences_activity_level_override_check
  check (
    activity_level_override is null
    or activity_level_override in ('sedentary', 'light', 'moderate', 'very', 'super')
  );

alter table public.user_preferences
  add constraint user_preferences_training_mode_override_check
  check (
    training_mode_override is null
    or training_mode_override in (
      'general', 'strength', 'running', 'hybrid', 'hiit', 'team-sport'
    )
  );

alter table public.user_preferences
  add constraint user_preferences_nutrition_goal_override_check
  check (
    nutrition_goal_override is null
    or nutrition_goal_override in ('fat-loss', 'maintenance', 'lean-bulk')
  );

-- ---------------------------------------------------------
-- Force PostgREST to pick up the new columns immediately
-- instead of waiting for its next automatic schema refresh.
-- ---------------------------------------------------------

NOTIFY pgrst, 'reload schema';
