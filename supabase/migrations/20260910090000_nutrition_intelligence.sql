-- =========================================================
-- MUSCLE FITNESS
-- NUTRITION INTELLIGENCE — TRAINING MODE / ACTIVITY LEVEL
--
-- Adds the two inputs the adaptive nutrition planner needs
-- that do not already exist on user_preferences:
--
--   training_mode      what kind of athlete the plan should
--                       be built for (strength, running, ...)
--   activity_level      real-world activity level used for the
--                       PAL multiplier, independent from raw
--                       gym training days.
--   nutrition_goal_override
--                       optional override of the 6-value
--                       onboarding goal, collapsed to the
--                       3 nutrition goals the planner uses.
--
-- All columns are nullable. When null, the application falls
-- back to a sensible inferred default and clearly marks the
-- value as an estimate rather than fabricating certainty.
-- =========================================================

alter table public.user_preferences
  add column if not exists training_mode text;

alter table public.user_preferences
  add column if not exists activity_level text;

alter table public.user_preferences
  add column if not exists nutrition_goal_override text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_training_mode_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_training_mode_check
      check (
        training_mode is null
        or training_mode in (
          'general',
          'strength',
          'running',
          'hybrid',
          'hiit',
          'team_sport'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_activity_level_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_activity_level_check
      check (
        activity_level is null
        or activity_level in (
          'sedentary',
          'light',
          'moderate',
          'very_active',
          'super_active'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_nutrition_goal_override_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_nutrition_goal_override_check
      check (
        nutrition_goal_override is null
        or nutrition_goal_override in (
          'fat_loss',
          'maintenance',
          'lean_bulk'
        )
      );
  end if;
end
$$;
