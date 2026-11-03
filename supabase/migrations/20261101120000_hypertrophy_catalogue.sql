-- Muscle Intelligence 2.0 / Adaptive Workouts 2.0: hypertrophy catalogue additions.
--
-- Seeds the new built-in exercises (lib/workouts/exercise-catalogue-additions.ts) with
-- their deterministic ids 10000000-0000-4000-8000-0000000000NN so plans can reference them
-- (workout_exercises.exercise_id -> exercise_library.id).
--
-- ADDITIVE ONLY. Unlike 20261011130000_builtin_exercise_identity.sql this never re-keys:
--   * id already present             -> nothing to do (re-runnable)
--   * public slug taken by another id -> skip with a NOTICE; no existing row or history changes
--   * otherwise                       -> insert
-- lib/workouts/__tests__/builtin-exercise-identity.test.ts fails on drift from the app list.

do $$
declare
  b record;
begin
  for b in
    select * from (values
    ('10000000-0000-4000-8000-000000000025'::uuid, 'smith-incline-press', 'Smith Machine Incline Press', 'Incline press on a fixed bar path, emphasising the upper chest with low balance demand.', 'upper_chest', array['front_delts', 'triceps']::text[], 'smith_machine', 'incline_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000026'::uuid, 'converging-machine-chest-press', 'Converging Machine Chest Press', 'Machine press whose handles move inward as you press, training the chest with a guided path.', 'chest', array['front_delts', 'triceps']::text[], 'machine', 'horizontal_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000027'::uuid, 'seated-cable-fly', 'Seated Cable Fly', 'Chest fly from a seat or bench between two cable stacks — isolation with the torso supported.', 'chest', array['front_delts']::text[], 'cable', 'horizontal_adduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000028'::uuid, 'incline-machine-chest-press', 'Incline Machine Chest Press', 'Guided incline press that emphasises the upper chest with minimal setup.', 'upper_chest', array['front_delts', 'triceps']::text[], 'machine', 'incline_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000029'::uuid, 'flat-dumbbell-press', 'Flat Dumbbell Press', 'Free-weight chest press on a flat bench; each arm works independently.', 'chest', array['front_delts', 'triceps']::text[], 'dumbbell', 'horizontal_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000030'::uuid, 'incline-push-up', 'Incline Push-Up', 'Push-up with the hands on a bench or box — a scalable bodyweight chest press.', 'chest', array['front_delts', 'triceps']::text[], 'bodyweight', 'horizontal_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000031'::uuid, 'neutral-grip-lat-pulldown', 'Neutral-Grip Lat Pulldown', 'Lat pulldown with a parallel (palms-facing) handle — a stable, adjustable vertical pull.', 'lats', array['biceps', 'upper_back', 'rear_delts']::text[], 'cable', 'vertical_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000032'::uuid, 'single-arm-cable-pulldown', 'Single-Arm Cable Pulldown', 'One-arm pulldown that lets the lat work through a long range on each side.', 'lats', array['biceps', 'upper_back']::text[], 'cable', 'vertical_pull', 'intermediate'),
    ('10000000-0000-4000-8000-000000000033'::uuid, 'assisted-pull-up', 'Assisted Pull-Up', 'Pull-up on a counterweight machine, letting you train the movement below full bodyweight.', 'lats', array['biceps', 'upper_back']::text[], 'machine', 'vertical_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000034'::uuid, 'chest-supported-t-bar-row', 'Chest-Supported T-Bar Row', 'Row with the chest on a pad, training the upper back without a lower-back hold.', 'upper_back', array['lats', 'rear_delts', 'biceps']::text[], 'machine', 'horizontal_pull', 'intermediate'),
    ('10000000-0000-4000-8000-000000000035'::uuid, 'chest-supported-machine-row', 'Chest-Supported Machine Row', 'Seated machine row with chest support — low setup demand for upper-back training.', 'upper_back', array['lats', 'rear_delts', 'biceps']::text[], 'machine', 'horizontal_pull', 'beginner'),
    ('10000000-0000-4000-8000-000000000036'::uuid, 'seated-dumbbell-overhead-press', 'Seated Dumbbell Overhead Press', 'Overhead press from a supported seat; trains the front deltoids and triceps.', 'front_delts', array['side_delts', 'triceps', 'upper_chest']::text[], 'dumbbell', 'vertical_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000037'::uuid, 'machine-shoulder-press', 'Machine Shoulder Press', 'Guided overhead press with back support and minimal setup.', 'front_delts', array['side_delts', 'triceps']::text[], 'machine', 'vertical_push', 'beginner'),
    ('10000000-0000-4000-8000-000000000038'::uuid, 'landmine-press', 'Landmine Press', 'Angled single-arm press with a barbell anchored at one end — a shoulder-friendly pressing arc for many lifters.', 'front_delts', array['upper_chest', 'triceps', 'core']::text[], 'barbell', 'angled_push', 'intermediate'),
    ('10000000-0000-4000-8000-000000000039'::uuid, 'machine-lateral-raise', 'Machine Lateral Raise', 'Guided lateral raise that keeps resistance on the side deltoids with little setup or balance demand.', 'side_delts', array['upper_trapezius']::text[], 'machine', 'shoulder_abduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000040'::uuid, 'incline-dumbbell-rear-delt-row', 'Incline Dumbbell Rear Delt Row', 'Chest-supported row with the elbows flared wide, biasing the rear deltoids.', 'rear_delts', array['upper_back', 'middle_trapezius']::text[], 'dumbbell', 'horizontal_pull_wide', 'intermediate'),
    ('10000000-0000-4000-8000-000000000041'::uuid, 'cable-rear-delt-fly', 'Cable Rear Delt Fly', 'Reverse fly between two cables, keeping tension on the rear deltoids through the whole arc.', 'rear_delts', array['upper_back']::text[], 'cable', 'horizontal_abduction', 'intermediate'),
    ('10000000-0000-4000-8000-000000000042'::uuid, 'incline-rear-delt-raise', 'Incline Rear Delt Raise', 'Chest-supported reverse fly with dumbbells — the bench removes the need to hold a hinge.', 'rear_delts', array['upper_back']::text[], 'dumbbell', 'horizontal_abduction', 'beginner'),
    ('10000000-0000-4000-8000-000000000043'::uuid, 'preacher-curl', 'Preacher Curl', 'Curl with the upper arm braced on a preacher pad, training the elbow flexors with the shoulder flexed.', 'biceps', array['brachialis', 'forearms']::text[], 'ez_bar', 'elbow_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000044'::uuid, 'cable-curl', 'Cable Curl', 'Standing curl from a low cable — simple setup and smooth resistance.', 'biceps', array['brachialis', 'forearms']::text[], 'cable', 'elbow_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000045'::uuid, 'single-dumbbell-overhead-extension', 'Single-Dumbbell Overhead Triceps Extension', 'Overhead elbow extension holding one dumbbell — trains the triceps with the arm overhead.', 'triceps', array[]::text[], 'dumbbell', 'elbow_extension', 'beginner'),
    ('10000000-0000-4000-8000-000000000046'::uuid, 'cross-body-cable-pushdown', 'Cross-Body Cable Pushdown', 'Single-arm cable triceps extension across the body from a high pulley.', 'triceps', array[]::text[], 'cable', 'elbow_extension', 'intermediate'),
    ('10000000-0000-4000-8000-000000000047'::uuid, 'hack-squat', 'Hack Squat', 'Machine squat on a fixed sled with back support — knee-dominant quad training without balancing a bar.', 'quadriceps', array['glutes']::text[], 'machine', 'squat', 'beginner'),
    ('10000000-0000-4000-8000-000000000048'::uuid, 'smith-machine-squat', 'Smith Machine Squat', 'Squat on a fixed bar path; foot position changes how much the quads are emphasised.', 'quadriceps', array['glutes', 'hamstrings']::text[], 'smith_machine', 'squat', 'intermediate'),
    ('10000000-0000-4000-8000-000000000049'::uuid, 'supported-split-squat', 'Supported Split Squat', 'Split squat holding a rack or bench for balance, so the working leg can focus on the movement.', 'quadriceps', array['glutes']::text[], 'bodyweight', 'single_leg_squat', 'beginner'),
    ('10000000-0000-4000-8000-000000000050'::uuid, 'dumbbell-step-up', 'Dumbbell Step-Up', 'Step onto a box or bench — single-leg quad and glute work with very little equipment.', 'quadriceps', array['glutes']::text[], 'dumbbell', 'single_leg_squat', 'beginner'),
    ('10000000-0000-4000-8000-000000000051'::uuid, 'dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'Hip hinge with dumbbells — the same hinge pattern as the barbell RDL with easier setup.', 'hamstrings', array['glutes', 'lower_back', 'forearms']::text[], 'dumbbell', 'hip_hinge', 'beginner'),
    ('10000000-0000-4000-8000-000000000052'::uuid, 'cable-pull-through', 'Cable Pull-Through', 'Hip hinge pulling a low cable between the legs — glute-biased, with little spinal load.', 'glutes', array['hamstrings']::text[], 'cable', 'hip_hinge', 'beginner'),
    ('10000000-0000-4000-8000-000000000053'::uuid, 'lying-leg-curl', 'Lying Leg Curl', 'Prone knee-flexion machine for the hamstrings.', 'hamstrings', array['gastrocnemius']::text[], 'machine', 'knee_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000054'::uuid, 'standing-single-leg-curl', 'Standing Single-Leg Curl', 'One-leg knee-flexion machine performed standing.', 'hamstrings', array['gastrocnemius']::text[], 'machine', 'knee_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000055'::uuid, 'barbell-hip-thrust', 'Barbell Hip Thrust', 'Loaded hip extension with the upper back on a bench — glutes work hardest near full hip extension.', 'glutes', array['hamstrings']::text[], 'barbell', 'hip_extension', 'intermediate'),
    ('10000000-0000-4000-8000-000000000056'::uuid, 'glute-bridge', 'Glute Bridge', 'Hip extension from the floor — the simplest version of the hip-thrust pattern.', 'glutes', array['hamstrings']::text[], 'bodyweight', 'hip_extension', 'beginner'),
    ('10000000-0000-4000-8000-000000000057'::uuid, 'single-leg-calf-raise', 'Single-Leg Calf Raise', 'Standing calf raise on one leg off a step — needs only a step and something to hold.', 'calves', array[]::text[], 'bodyweight', 'plantar_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000058'::uuid, 'leg-press-calf-raise', 'Leg-Press Calf Raise', 'Calf raise performed on a leg-press sled with the knees straight.', 'calves', array[]::text[], 'machine', 'plantar_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000059'::uuid, 'weighted-crunch', 'Weighted Crunch', 'Floor crunch holding a plate or dumbbell to add resistance.', 'abs', array['obliques']::text[], 'dumbbell', 'spinal_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000060'::uuid, 'machine-crunch', 'Machine Crunch', 'Seated crunch machine with a guided path and adjustable load.', 'abs', array['obliques']::text[], 'machine', 'spinal_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000061'::uuid, 'hanging-leg-raise', 'Hanging Leg Raise', 'Straight-leg raise from a hang — hip flexion plus posterior pelvic tilt; demands grip and trunk control.', 'abs', array['hip_flexors', 'forearms']::text[], 'pull_up_bar', 'hip_flexion', 'advanced'),
    ('10000000-0000-4000-8000-000000000062'::uuid, 'supported-knee-raise', 'Supported Knee Raise', 'Knee raise on a back-supported station (captain''s chair) — the hanging pattern without the grip demand.', 'abs', array['hip_flexors']::text[], 'machine', 'hip_flexion', 'beginner'),
    ('10000000-0000-4000-8000-000000000063'::uuid, 'reverse-crunch', 'Reverse Crunch', 'Floor exercise curling the pelvis toward the ribs — no equipment needed.', 'abs', array['hip_flexors']::text[], 'bodyweight', 'spinal_flexion', 'beginner')
    ) as t(id, slug, name, description, primary_muscle, secondary_muscles, equipment, movement_pattern, difficulty)
  loop
    if exists (select 1 from public.exercise_library where id = b.id) then
      continue;
    end if;

    if exists (select 1 from public.exercise_library where owner_id is null and slug = b.slug) then
      raise notice 'hypertrophy catalogue: public slug % already exists under another id; left unchanged', b.slug;
      continue;
    end if;

    insert into public.exercise_library (
      id, owner_id, slug, name, description, primary_muscle, secondary_muscles,
      equipment, movement_pattern, difficulty, is_verified, is_active
    ) values (
      b.id, null, b.slug, b.name, b.description, b.primary_muscle, b.secondary_muscles,
      b.equipment, b.movement_pattern, b.difficulty, true, true
    );
  end loop;
end
$$;
