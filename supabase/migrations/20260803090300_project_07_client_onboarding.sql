-- Muscle Fitness — Project 07: Complete client onboarding
-- Incremental migration. Keep the Project 06 foundation migration unchanged.

-- Add Lean Bulk as a distinct goal while keeping all existing values.
alter type public.fitness_goal add value if not exists 'lean_bulk';

begin;

-- =========================================================
-- 1. EXTEND EXISTING FOUNDATION TABLES
-- =========================================================

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

alter table public.fitness_profiles
  add column if not exists training_location text,
  add column if not exists physical_limitations text,
  add column if not exists sleep_hours numeric(4, 1),
  add column if not exists daily_steps integer,
  add column if not exists school_work_schedule text,
  add column if not exists stress_level smallint,
  add column if not exists bmr integer,
  add column if not exists tdee integer,
  add column if not exists calculation_version text;

alter table public.user_preferences
  add column if not exists weekly_food_budget numeric(10, 2),
  add column if not exists budget_currency text not null default 'SGD',
  add column if not exists cooking_ability text,
  add column if not exists meal_prep_frequency text;

-- Add defensive database constraints only when they do not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_training_location_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_training_location_check
      check (
        training_location is null
        or training_location in ('gym', 'home', 'hybrid')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_sleep_hours_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_sleep_hours_check
      check (
        sleep_hours is null
        or sleep_hours between 0 and 24
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_daily_steps_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_daily_steps_check
      check (
        daily_steps is null
        or daily_steps between 0 and 100000
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_stress_level_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_stress_level_check
      check (
        stress_level is null
        or stress_level between 1 and 10
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_budget_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_budget_check
      check (
        weekly_food_budget is null
        or weekly_food_budget between 0 and 1000000
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_cooking_ability_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_cooking_ability_check
      check (
        cooking_ability is null
        or cooking_ability in (
          'beginner',
          'intermediate',
          'advanced'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_meal_prep_frequency_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_meal_prep_frequency_check
      check (
        meal_prep_frequency is null
        or meal_prep_frequency in (
          'daily',
          'twice_weekly',
          'weekly',
          'rarely'
        )
      );
  end if;
end;
$$;

-- =========================================================
-- 2. DRAFT STORAGE
-- One draft per authenticated user.
-- =========================================================

create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_step smallint not null default 1,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint onboarding_drafts_step_check
    check (current_step between 1 and 6),

  constraint onboarding_drafts_data_object_check
    check (jsonb_typeof(data) = 'object')
);

create index if not exists onboarding_drafts_updated_at_idx
  on public.onboarding_drafts (updated_at desc);

drop trigger if exists onboarding_drafts_set_updated_at
  on public.onboarding_drafts;

create trigger onboarding_drafts_set_updated_at
before update on public.onboarding_drafts
for each row execute function public.set_updated_at();

-- =========================================================
-- 3. PRIVILEGES + RLS FOR DRAFTS
-- =========================================================

revoke all on table public.onboarding_drafts
  from anon, authenticated;

grant select, insert, update, delete
  on table public.onboarding_drafts
  to authenticated;

alter table public.onboarding_drafts enable row level security;

drop policy if exists onboarding_drafts_select_own
  on public.onboarding_drafts;

drop policy if exists onboarding_drafts_insert_own
  on public.onboarding_drafts;

drop policy if exists onboarding_drafts_update_own
  on public.onboarding_drafts;

drop policy if exists onboarding_drafts_delete_own
  on public.onboarding_drafts;

create policy onboarding_drafts_select_own
on public.onboarding_drafts
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy onboarding_drafts_insert_own
on public.onboarding_drafts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

create policy onboarding_drafts_update_own
on public.onboarding_drafts
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy onboarding_drafts_delete_own
on public.onboarding_drafts
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

-- =========================================================
-- 4. ATOMIC COMPLETE ONBOARDING RPC
-- =========================================================

create or replace function public.complete_client_onboarding(
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text;
  v_date_of_birth date;
  v_timezone text;
  v_gender public.gender_type;
  v_goal public.fitness_goal;
  v_activity_level public.activity_level;
  v_training_experience public.training_experience;
  v_preferred_training_time public.training_time;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid onboarding payload'
      using errcode = '22023';
  end if;

  v_full_name :=
    nullif(btrim(p_data ->> 'fullName'), '');

  v_date_of_birth :=
    (p_data ->> 'dateOfBirth')::date;

  v_timezone :=
    p_data ->> 'timezone';

  v_gender :=
    (p_data ->> 'gender')::public.gender_type;

  v_goal :=
    (p_data ->> 'goal')::public.fitness_goal;

  v_activity_level :=
    (p_data ->> 'activityLevel')::public.activity_level;

  v_training_experience :=
    (p_data ->> 'trainingExperience')::public.training_experience;

  v_preferred_training_time :=
    (p_data ->> 'preferredTrainingTime')::public.training_time;

  if v_full_name is null then
    raise exception 'Full name is required'
      using errcode = '22023';
  end if;

  if v_date_of_birth is null
    or v_date_of_birth > current_date
  then
    raise exception 'Date of birth is invalid'
      using errcode = '22023';
  end if;

  if v_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_timezone
  ) then
    raise exception 'Timezone is invalid'
      using errcode = '22023';
  end if;

  update public.profiles
  set
    full_name = v_full_name,
    date_of_birth = v_date_of_birth,
    gender = v_gender,
    timezone = v_timezone,
    onboarding_completed = true,
    onboarding_completed_at = now()
  where user_id = v_user_id;

  if not found then
    raise exception
      'Profile does not exist for the authenticated user'
      using errcode = '23503';
  end if;

  insert into public.fitness_profiles (
    user_id,
    height_cm,
    current_weight_kg,
    target_weight_kg,
    goal,
    activity_level,
    training_experience,
    training_days,
    session_duration_minutes,
    training_location,
    physical_limitations,
    sleep_hours,
    daily_steps,
    school_work_schedule,
    stress_level,
    bmr,
    tdee,
    calorie_target,
    protein_target_g,
    carb_target_g,
    fat_target_g,
    calculation_version
  )
  values (
    v_user_id,
    (p_data ->> 'heightCm')::numeric,
    (p_data ->> 'currentWeightKg')::numeric,
    (p_data ->> 'targetWeightKg')::numeric,
    v_goal,
    v_activity_level,
    v_training_experience,
    (p_data ->> 'trainingDays')::smallint,
    (p_data ->> 'sessionDurationMinutes')::smallint,
    p_data ->> 'trainingLocation',
    nullif(
      btrim(
        coalesce(
          p_data ->> 'physicalLimitations',
          ''
        )
      ),
      ''
    ),
    (p_data ->> 'sleepHours')::numeric,
    (p_data ->> 'dailySteps')::integer,
    nullif(
      btrim(
        coalesce(
          p_data ->> 'schoolWorkSchedule',
          ''
        )
      ),
      ''
    ),
    (p_data ->> 'stressLevel')::smallint,
    (p_data ->> 'bmr')::integer,
    (p_data ->> 'tdee')::integer,
    (p_data ->> 'calorieTarget')::integer,
    (p_data ->> 'proteinTargetG')::numeric,
    (p_data ->> 'carbTargetG')::numeric,
    (p_data ->> 'fatTargetG')::numeric,
    p_data ->> 'calculationVersion'
  )
  on conflict (user_id) do update
  set
    height_cm = excluded.height_cm,
    current_weight_kg = excluded.current_weight_kg,
    target_weight_kg = excluded.target_weight_kg,
    goal = excluded.goal,
    activity_level = excluded.activity_level,
    training_experience = excluded.training_experience,
    training_days = excluded.training_days,
    session_duration_minutes =
      excluded.session_duration_minutes,
    training_location = excluded.training_location,
    physical_limitations =
      excluded.physical_limitations,
    sleep_hours = excluded.sleep_hours,
    daily_steps = excluded.daily_steps,
    school_work_schedule =
      excluded.school_work_schedule,
    stress_level = excluded.stress_level,
    bmr = excluded.bmr,
    tdee = excluded.tdee,
    calorie_target = excluded.calorie_target,
    protein_target_g = excluded.protein_target_g,
    carb_target_g = excluded.carb_target_g,
    fat_target_g = excluded.fat_target_g,
    calculation_version =
      excluded.calculation_version;

  insert into public.user_preferences (
    user_id,
    preferred_foods,
    excluded_foods,
    allergies,
    available_equipment,
    priority_muscles,
    preferred_training_time,
    meals_per_day,
    weekly_food_budget,
    budget_currency,
    cooking_ability,
    meal_prep_frequency
  )
  values (
    v_user_id,

    coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          coalesce(
            p_data -> 'preferredFoods',
            '[]'::jsonb
          )
        ) as item(value)
      ),
      array[]::text[]
    ),

    coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          coalesce(
            p_data -> 'excludedFoods',
            '[]'::jsonb
          )
        ) as item(value)
      ),
      array[]::text[]
    ),

    coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          coalesce(
            p_data -> 'allergies',
            '[]'::jsonb
          )
        ) as item(value)
      ),
      array[]::text[]
    ),

    coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          coalesce(
            p_data -> 'availableEquipment',
            '[]'::jsonb
          )
        ) as item(value)
      ),
      array[]::text[]
    ),

    coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          coalesce(
            p_data -> 'priorityMuscles',
            '[]'::jsonb
          )
        ) as item(value)
      ),
      array[]::text[]
    ),

    v_preferred_training_time,
    (p_data ->> 'mealsPerDay')::smallint,
    (p_data ->> 'weeklyFoodBudget')::numeric,

    coalesce(
      nullif(
        p_data ->> 'budgetCurrency',
        ''
      ),
      'SGD'
    ),

    p_data ->> 'cookingAbility',
    p_data ->> 'mealPrepFrequency'
  )
  on conflict (user_id) do update
  set
    preferred_foods = excluded.preferred_foods,
    excluded_foods = excluded.excluded_foods,
    allergies = excluded.allergies,
    available_equipment =
      excluded.available_equipment,
    priority_muscles =
      excluded.priority_muscles,
    preferred_training_time =
      excluded.preferred_training_time,
    meals_per_day = excluded.meals_per_day,
    weekly_food_budget =
      excluded.weekly_food_budget,
    budget_currency =
      excluded.budget_currency,
    cooking_ability =
      excluded.cooking_ability,
    meal_prep_frequency =
      excluded.meal_prep_frequency;

  delete from public.onboarding_drafts
  where user_id = v_user_id;

  return jsonb_build_object(
    'calorieTarget',
    (p_data ->> 'calorieTarget')::integer,

    'proteinTargetG',
    (p_data ->> 'proteinTargetG')::numeric,

    'carbTargetG',
    (p_data ->> 'carbTargetG')::numeric,

    'fatTargetG',
    (p_data ->> 'fatTargetG')::numeric,

    'onboardingCompleted',
    true
  );
end;
$$;

revoke all
on function public.complete_client_onboarding(jsonb)
from public;

grant execute
on function public.complete_client_onboarding(jsonb)
to authenticated;

commit;