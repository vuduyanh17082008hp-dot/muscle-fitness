-- VER3-02: built-in exercise identity.
--
-- The app's built-in exercises (lib/workouts/exercise-library.ts) carry fixed
-- UUIDs 10000000-0000-4000-8000-0000000000NN. Plans reference exercises through
-- workout_exercises.exercise_id -> exercise_library(id), so every built-in id MUST
-- exist in exercise_library or saving a plan containing one fails the FK.
--
-- Canonical model: built-ins ARE exercise_library entities with deterministic ids.
-- This migration reconciles them, idempotently:
--   * id already present                    -> nothing to do
--   * public row with the same slug, other id -> re-key it to the built-in id
--                                              (every FK referencing it is repointed)
--   * otherwise                              -> insert
-- Re-running is a no-op. Keep this list in sync with LOCAL_EXERCISE_LIBRARY;
-- lib/workouts/__tests__/builtin-exercise-identity.test.ts fails on drift.

do $$
declare
  b record;
  v_old uuid;
  fk record;
begin
  for b in
    select * from (values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'barbell-bench-press', 'Barbell Bench Press', 'Compound horizontal press for building chest, shoulder and triceps strength.', 'chest', array['front_delts', 'triceps']::text[], 'barbell', 'horizontal_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'incline-dumbbell-press', 'Incline Dumbbell Press', 'Incline pressing movement that places greater emphasis on the upper chest.', 'upper_chest', array['front_delts', 'triceps']::text[], 'dumbbell', 'incline_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'machine-chest-press', 'Machine Chest Press', 'Stable machine press that allows controlled chest training with reduced balance demands.', 'chest', array['front_delts', 'triceps']::text[], 'machine', 'horizontal_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'cable-fly', 'Cable Fly', 'Cable isolation movement for training the chest through horizontal adduction.', 'chest', array['front_delts']::text[], 'cable', 'horizontal_adduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'barbell-overhead-press', 'Barbell Overhead Press', 'Vertical compound press for developing shoulder and triceps strength.', 'shoulders', array['triceps', 'upper_chest', 'core']::text[], 'barbell', 'vertical_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'cable-lateral-raise', 'Cable Lateral Raise', 'Isolation exercise for building the side deltoids with continuous cable tension.', 'side_delts', array['upper_trapezius']::text[], 'cable', 'shoulder_abduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000007'::uuid, 'reverse-pec-deck', 'Reverse Pec Deck', 'Machine isolation movement for the rear deltoids and upper back.', 'rear_delts', array['rhomboids', 'middle_trapezius']::text[], 'machine', 'horizontal_abduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000008'::uuid, 'lat-pulldown', 'Lat Pulldown', 'Vertical pulling exercise for developing the lats, upper back and biceps.', 'lats', array['biceps', 'rear_delts', 'upper_back']::text[], 'cable', 'vertical_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000009'::uuid, 'chest-supported-row', 'Chest-Supported Row', 'Supported horizontal row for building the upper back without lower-back fatigue.', 'upper_back', array['lats', 'rear_delts', 'biceps']::text[], 'dumbbell', 'horizontal_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000010'::uuid, 'seated-cable-row', 'Seated Cable Row', 'Cable horizontal pull for training the lats, upper back and elbow flexors.', 'upper_back', array['lats', 'biceps', 'rear_delts']::text[], 'cable', 'horizontal_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000011'::uuid, 'barbell-back-squat', 'Barbell Back Squat', 'Compound lower-body movement for developing the quadriceps, glutes and trunk.', 'quadriceps', array['glutes', 'hamstrings', 'core']::text[], 'barbell', 'squat', 'intermediate'),
    ('10000000-0000-4000-8000-000000000012'::uuid, 'leg-press', 'Leg Press', 'Machine-based compound exercise for lower-body hypertrophy.', 'quadriceps', array['glutes', 'hamstrings']::text[], 'machine', 'squat', 'beginner'),
    ('10000000-0000-4000-8000-000000000013'::uuid, 'romanian-deadlift', 'Romanian Deadlift', 'Hip-hinge exercise for the hamstrings, glutes and posterior chain.', 'hamstrings', array['glutes', 'erector_spinae', 'forearms']::text[], 'barbell', 'hip_hinge', 'intermediate'),
    ('10000000-0000-4000-8000-000000000014'::uuid, 'seated-leg-curl', 'Seated Leg Curl', 'Knee-flexion isolation exercise for developing the hamstrings.', 'hamstrings', array['gastrocnemius']::text[], 'machine', 'knee_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000015'::uuid, 'bulgarian-split-squat', 'Bulgarian Split Squat', 'Single-leg squat variation for building quadriceps, glutes and stability.', 'quadriceps', array['glutes', 'hamstrings', 'core']::text[], 'dumbbell', 'single_leg_squat', 'intermediate'),
    ('10000000-0000-4000-8000-000000000016'::uuid, 'standing-calf-raise', 'Standing Calf Raise', 'Ankle plantar-flexion exercise for developing the calves.', 'calves', array[]::text[], 'machine', 'plantar_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000017'::uuid, 'ez-bar-curl', 'EZ-Bar Curl', 'Elbow-flexion exercise for building the biceps and brachialis.', 'biceps', array['brachialis', 'forearms']::text[], 'ez_bar', 'elbow_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000018'::uuid, 'incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Biceps curl variation that trains the elbow flexors from a lengthened position.', 'biceps', array['brachialis', 'forearms']::text[], 'dumbbell', 'elbow_flexion', 'intermediate'),
    ('10000000-0000-4000-8000-000000000019'::uuid, 'cable-triceps-pushdown', 'Cable Triceps Pushdown', 'Cable isolation exercise for building the triceps.', 'triceps', array[]::text[], 'cable', 'elbow_extension', 'beginner'),
    ('10000000-0000-4000-8000-000000000020'::uuid, 'overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'Overhead elbow-extension movement that emphasises the long head of the triceps.', 'triceps', array[]::text[], 'cable', 'elbow_extension', 'intermediate'),
    ('10000000-0000-4000-8000-000000000021'::uuid, 'cable-crunch', 'Cable Crunch', 'Weighted spinal-flexion exercise for developing the abdominal muscles.', 'abs', array['obliques']::text[], 'cable', 'spinal_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000022'::uuid, 'hanging-knee-raise', 'Hanging Knee Raise', 'Core exercise combining hip flexion with controlled pelvic movement.', 'abs', array['hip_flexors', 'forearms']::text[], 'pull_up_bar', 'hip_flexion', 'intermediate'),
    ('10000000-0000-4000-8000-000000000023'::uuid, 'push-up', 'Push-Up', 'Bodyweight horizontal pressing exercise for the chest, shoulders and triceps.', 'chest', array['front_delts', 'triceps', 'abs']::text[], 'bodyweight', 'horizontal_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000024'::uuid, 'plank', 'Plank', 'Isometric core-stability hold maintaining a straight line from head to heels.', 'abs', array['lower_back', 'glutes']::text[], 'bodyweight', 'isometric_hold', 'beginner')
    ) as t(id, slug, name, description, primary_muscle, secondary_muscles, equipment, movement_pattern, difficulty)
  loop
    if exists (select 1 from public.exercise_library where id = b.id) then
      continue;
    end if;

    select id into v_old
    from public.exercise_library
    where owner_id is null and slug = b.slug;

    if v_old is null then
      insert into public.exercise_library (
        id, owner_id, slug, name, description, primary_muscle, secondary_muscles,
        equipment, movement_pattern, difficulty, is_verified, is_active
      ) values (
        b.id, null, b.slug, b.name, b.description, b.primary_muscle, b.secondary_muscles,
        b.equipment, b.movement_pattern, b.difficulty, true, true
      );
    else
      -- Clone under a temporary slug (slug is unique), repoint every FK, drop the old row.
      insert into public.exercise_library (
        id, owner_id, slug, name, description, primary_muscle, secondary_muscles,
        equipment, movement_pattern, difficulty, instructions, cues, limitations,
        media_url, is_verified, is_active, created_at
      )
      select b.id, owner_id, '__rekey_' || b.slug, name, description, primary_muscle,
        secondary_muscles, equipment, movement_pattern, difficulty, instructions, cues,
        limitations, media_url, is_verified, is_active, created_at
      from public.exercise_library where id = v_old;

      for fk in
        select c.conrelid::regclass as tbl, a.attname as col
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.confrelid = 'public.exercise_library'::regclass
          and c.contype = 'f'
          and array_length(c.conkey, 1) = 1
      loop
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
          using b.id, v_old;
      end loop;

      delete from public.exercise_library where id = v_old;
      update public.exercise_library set slug = b.slug where id = b.id;
    end if;
  end loop;
end
$$;
