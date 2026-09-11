-- =========================================================
-- TRAINING INTELLIGENCE: EXERCISE -> MUSCLE CONTRIBUTION MAP
--
-- Centralized, versioned mapping used by the Fractional Effective
-- Volume Engine (lib/training/volume-engine.ts). Coefficients are
-- MODELING ESTIMATES, not exact physiology measurements. Values for
-- the verified system exercises below are taken directly from the
-- Muscle Fitness training-intelligence specification.
--
-- Existing exercise_library.primary_muscle / secondary_muscles
-- remain authoritative for exercise identity; this table only adds
-- fractional contribution weights per canonical muscle.
-- =========================================================

begin;

create table if not exists public.exercise_muscle_contributions (
  id uuid primary key default gen_random_uuid(),

  exercise_id uuid not null
    references public.exercise_library(id)
    on delete cascade,

  muscle text not null,

  role text not null default 'secondary',

  contribution numeric(3,2) not null,

  mapping_version smallint not null default 1,

  source text not null default 'system',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_muscle_contributions_role_check
    check (role in ('primary', 'secondary', 'stabilizer')),

  constraint exercise_muscle_contributions_contribution_check
    check (contribution >= 0 and contribution <= 1),

  constraint exercise_muscle_contributions_source_check
    check (source in ('system', 'user')),

  unique (exercise_id, muscle, mapping_version)
);

create index if not exists exercise_muscle_contributions_exercise_idx
  on public.exercise_muscle_contributions(exercise_id, mapping_version);

alter table public.exercise_muscle_contributions
  enable row level security;

drop policy if exists exercise_muscle_contributions_select_policy
  on public.exercise_muscle_contributions;

create policy exercise_muscle_contributions_select_policy
on public.exercise_muscle_contributions
for select
to authenticated
using (true);

drop policy if exists exercise_muscle_contributions_insert_policy
  on public.exercise_muscle_contributions;

create policy exercise_muscle_contributions_insert_policy
on public.exercise_muscle_contributions
for insert
to authenticated
with check (
  public.is_admin()
  or (
    source = 'user'
    and exists (
      select 1
      from public.exercise_library el
      where el.id = exercise_id
        and el.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists exercise_muscle_contributions_update_policy
  on public.exercise_muscle_contributions;

create policy exercise_muscle_contributions_update_policy
on public.exercise_muscle_contributions
for update
to authenticated
using (
  public.is_admin()
  or (
    source = 'user'
    and exists (
      select 1
      from public.exercise_library el
      where el.id = exercise_id
        and el.owner_id = (select auth.uid())
    )
  )
)
with check (
  public.is_admin()
  or (
    source = 'user'
    and exists (
      select 1
      from public.exercise_library el
      where el.id = exercise_id
        and el.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists exercise_muscle_contributions_delete_policy
  on public.exercise_muscle_contributions;

create policy exercise_muscle_contributions_delete_policy
on public.exercise_muscle_contributions
for delete
to authenticated
using (
  public.is_admin()
  or (
    source = 'user'
    and exists (
      select 1
      from public.exercise_library el
      where el.id = exercise_id
        and el.owner_id = (select auth.uid())
    )
  )
);

-- =========================================================
-- SEED: verified system exercises (mapping_version 1)
--
-- Looked up by slug so this migration is safe to run against any
-- environment that already ran the project_09 workout-system seed.
-- =========================================================

insert into public.exercise_muscle_contributions
  (exercise_id, muscle, role, contribution, mapping_version, source)
select el.id, v.muscle, v.role, v.contribution, 1, 'system'
from public.exercise_library el
join (
  values
    ('barbell-bench-press', 'chest', 'primary', 1.00),
    ('barbell-bench-press', 'triceps', 'secondary', 0.50),
    ('barbell-bench-press', 'anterior_deltoid', 'secondary', 0.50),

    ('incline-dumbbell-press', 'upper_chest', 'primary', 1.00),
    ('incline-dumbbell-press', 'chest', 'secondary', 0.50),
    ('incline-dumbbell-press', 'triceps', 'secondary', 0.50),
    ('incline-dumbbell-press', 'anterior_deltoid', 'secondary', 0.50),

    ('cable-fly', 'chest', 'primary', 1.00),
    ('cable-fly', 'anterior_deltoid', 'secondary', 0.25),

    ('overhead-press', 'anterior_deltoid', 'primary', 1.00),
    ('overhead-press', 'triceps', 'secondary', 0.50),
    ('overhead-press', 'lateral_deltoid', 'secondary', 0.25),

    ('dumbbell-lateral-raise', 'lateral_deltoid', 'primary', 1.00),
    ('cable-lateral-raise', 'lateral_deltoid', 'primary', 1.00),

    ('face-pull', 'rear_deltoid', 'primary', 1.00),
    ('face-pull', 'upper_back', 'secondary', 0.25),

    ('pull-up', 'latissimus_dorsi', 'primary', 1.00),
    ('pull-up', 'biceps', 'secondary', 0.50),
    ('pull-up', 'upper_back', 'secondary', 0.25),

    ('lat-pulldown', 'latissimus_dorsi', 'primary', 1.00),
    ('lat-pulldown', 'biceps', 'secondary', 0.50),

    ('chest-supported-row', 'upper_back', 'primary', 1.00),
    ('chest-supported-row', 'latissimus_dorsi', 'secondary', 0.50),
    ('chest-supported-row', 'biceps', 'secondary', 0.50),
    ('chest-supported-row', 'rear_deltoid', 'secondary', 0.50),

    ('seated-cable-row', 'upper_back', 'primary', 1.00),
    ('seated-cable-row', 'latissimus_dorsi', 'secondary', 0.50),
    ('seated-cable-row', 'biceps', 'secondary', 0.50),
    ('seated-cable-row', 'rear_deltoid', 'secondary', 0.50),

    ('barbell-curl', 'biceps', 'primary', 1.00),

    ('rope-triceps-pushdown', 'triceps', 'primary', 1.00),

    ('back-squat', 'quadriceps', 'primary', 1.00),
    ('back-squat', 'glutes', 'secondary', 0.50),

    ('leg-press', 'quadriceps', 'primary', 1.00),
    ('leg-press', 'glutes', 'secondary', 0.50),

    ('romanian-deadlift', 'hamstrings', 'primary', 1.00),
    ('romanian-deadlift', 'glutes', 'secondary', 0.50),

    ('seated-leg-curl', 'hamstrings', 'primary', 1.00),

    ('leg-extension', 'quadriceps', 'primary', 1.00),

    ('standing-calf-raise', 'calves', 'primary', 1.00)
) as v(slug, muscle, role, contribution)
  on el.slug = v.slug
on conflict (exercise_id, muscle, mapping_version) do nothing;

commit;
