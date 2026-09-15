-- Adds the two data-quality demo scenarios (partial_data, stale_data)
-- introduced alongside the four existing physiological-deviation
-- scenarios in lib/demo/scenarios.ts. Widens the existing CHECK
-- constraint from 20260923090000_user_demo_settings.sql rather than
-- replacing the table — same RLS, same ownership model, no new
-- source of truth.

alter table public.user_demo_settings
  drop constraint if exists user_demo_settings_scenario_check;

alter table public.user_demo_settings
  add constraint user_demo_settings_scenario_check check (
    scenario in (
      'recovered_athlete',
      'sleep_deprived_athlete',
      'high_training_load',
      'recovery_warning',
      'partial_data',
      'stale_data'
    )
  );
