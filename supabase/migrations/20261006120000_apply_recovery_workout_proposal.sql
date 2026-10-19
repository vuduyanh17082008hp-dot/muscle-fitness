-- Atomic Recovery apply. HMAC stays in Next.js. Browser JWT cannot
-- execute this RPC — only service_role. p_actor_user_id must come from
-- supabase.auth.getUser() on the server, never from request JSON.
-- Canonical session-exercise reps are target_rep_min/target_rep_max
-- (20260804190000_project_09_workout_system.sql).

drop function if exists public.apply_recovery_workout_proposal(text);

create or replace function public.apply_recovery_workout_proposal(
  p_proposal_id text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_actor_user_id;
  v_proposal public.recovery_workout_proposals%rowtype;
  v_snapshot jsonb;
  v_session public.workout_sessions%rowtype;
  v_existing public.workout_mutation_records%rowtype;
  v_change jsonb;
  v_after jsonb;
  v_before jsonb;
  v_action text;
  v_exercise_id uuid;
  v_row public.workout_session_exercises%rowtype;
  v_change_refs text[] := '{}';
  v_mutating int := 0;
  v_all_after boolean := true;
  v_now timestamptz := now();
  v_mutation_id uuid;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED'
      using errcode = '28000';
  end if;

  select *
  into v_proposal
  from public.recovery_workout_proposals
  where proposal_id = p_proposal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'PROPOSAL_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_snapshot := v_proposal.snapshot;

  if coalesce(v_snapshot->>'subjectRef', '') is distinct from v_user_id::text
     or coalesce(v_snapshot->>'proposalId', '') is distinct from p_proposal_id
     or coalesce(v_snapshot->>'workoutRef', '') is distinct from v_proposal.workout_ref then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;

  if v_proposal.expires_at < v_now then
    raise exception 'EXPIRED'
      using errcode = '22023';
  end if;

  select *
  into v_existing
  from public.workout_mutation_records
  where proposal_id = p_proposal_id
  for update;

  if found then
    if v_existing.user_id is distinct from v_user_id then
      raise exception 'FORBIDDEN'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'alreadyApplied', true,
      'mutationId', v_existing.id,
      'subjectRef', v_existing.user_id,
      'proposalRef', v_existing.proposal_id,
      'workoutBeforeRef', v_existing.workout_before_ref,
      'workoutAfterRef', v_existing.workout_after_ref,
      'previousPlanVersionRef', v_existing.previous_plan_version_ref,
      'newPlanVersionRef', v_existing.new_plan_version_ref,
      'appliedAt', v_existing.applied_at,
      'appliedBy', v_existing.applied_by,
      'changeRefs', to_jsonb(v_existing.change_refs)
    );
  end if;

  begin
    select *
    into v_session
    from public.workout_sessions
    where id = v_proposal.workout_ref::uuid
      and user_id = v_user_id
    for update;
  exception
    when invalid_text_representation then
      raise exception 'NOT_FOUND'
        using errcode = 'P0002';
  end;

  if not found then
    raise exception 'NOT_FOUND'
      using errcode = 'P0002';
  end if;

  for v_change in
    select value
    from jsonb_array_elements(coalesce(v_snapshot->'changes', '[]'::jsonb))
  loop
    v_action := coalesce(v_change->>'action', 'KEEP');
    if v_action = 'KEEP' then
      continue;
    end if;
    if coalesce(v_change->>'sessionExerciseId', '') = '' or v_change->'after' is null then
      continue;
    end if;

    v_mutating := v_mutating + 1;
    v_change_refs := array_append(v_change_refs, v_change->>'changeId');
    v_after := v_change->'after';
    v_before := v_change->'before';

    begin
      v_exercise_id := (v_change->>'sessionExerciseId')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'INVALID_PATCH'
          using errcode = '22023';
    end;

    select *
    into v_row
    from public.workout_session_exercises
    where id = v_exercise_id
      and workout_session_id = v_session.id
    for update;

    if not found then
      raise exception 'INVALID_PATCH'
        using errcode = '22023';
    end if;

    if
      v_row.target_sets is not distinct from nullif(v_after->>'targetSets', 'null')::integer
      and v_row.target_rep_min is not distinct from nullif(v_after->>'repMin', 'null')::integer
      and v_row.target_rep_max is not distinct from nullif(v_after->>'repMax', 'null')::integer
      and v_row.is_skipped is not distinct from coalesce((v_after->>'isSkipped')::boolean, false)
    then
      continue;
    end if;

    v_all_after := false;

    if v_before is null
       or v_row.target_sets is distinct from nullif(v_before->>'targetSets', 'null')::integer
       or v_row.target_rep_min is distinct from nullif(v_before->>'repMin', 'null')::integer
       or v_row.target_rep_max is distinct from nullif(v_before->>'repMax', 'null')::integer
       or v_row.is_skipped is distinct from coalesce((v_before->>'isSkipped')::boolean, false)
    then
      raise exception 'STALE_PLAN'
        using errcode = '22023';
    end if;

    update public.workout_session_exercises
    set
      target_sets = case
        when v_after->>'targetSets' is null or v_after->>'targetSets' = 'null' then target_sets
        else (v_after->>'targetSets')::integer
      end,
      target_rep_min = case
        when v_after->>'repMin' is null or v_after->>'repMin' = 'null' then target_rep_min
        else (v_after->>'repMin')::integer
      end,
      target_rep_max = case
        when v_after->>'repMax' is null or v_after->>'repMax' = 'null' then target_rep_max
        else (v_after->>'repMax')::integer
      end,
      is_skipped = coalesce((v_after->>'isSkipped')::boolean, false),
      updated_at = v_now
    where id = v_exercise_id
      and workout_session_id = v_session.id;

    if not found then
      raise exception 'INVALID_PATCH'
        using errcode = '22023';
    end if;
  end loop;

  if v_mutating = 0 then
    raise exception 'NO_MUTATION'
      using errcode = '22023';
  end if;

  update public.workout_sessions
  set updated_at = v_now
  where id = v_session.id
    and user_id = v_user_id;

  insert into public.workout_mutation_records (
    user_id,
    proposal_id,
    workout_before_ref,
    workout_after_ref,
    previous_plan_version_ref,
    new_plan_version_ref,
    applied_at,
    applied_by,
    change_refs
  )
  values (
    v_user_id,
    p_proposal_id,
    v_proposal.workout_ref,
    v_proposal.workout_ref,
    v_proposal.plan_version_ref,
    v_proposal.plan_version_ref,
    v_now,
    'USER_CONFIRMED_DANTE_PROPOSAL',
    v_change_refs
  )
  returning id into v_mutation_id;

  return jsonb_build_object(
    'alreadyApplied', v_all_after,
    'mutationId', v_mutation_id,
    'subjectRef', v_user_id,
    'proposalRef', p_proposal_id,
    'workoutBeforeRef', v_proposal.workout_ref,
    'workoutAfterRef', v_proposal.workout_ref,
    'previousPlanVersionRef', v_proposal.plan_version_ref,
    'newPlanVersionRef', v_proposal.plan_version_ref,
    'appliedAt', v_now,
    'appliedBy', 'USER_CONFIRMED_DANTE_PROPOSAL',
    'changeRefs', to_jsonb(v_change_refs)
  );
exception
  when unique_violation then
    select *
    into v_existing
    from public.workout_mutation_records
    where proposal_id = p_proposal_id;

    if not found or v_existing.user_id is distinct from v_user_id then
      raise exception 'PROPOSAL_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'alreadyApplied', true,
      'mutationId', v_existing.id,
      'subjectRef', v_existing.user_id,
      'proposalRef', v_existing.proposal_id,
      'workoutBeforeRef', v_existing.workout_before_ref,
      'workoutAfterRef', v_existing.workout_after_ref,
      'previousPlanVersionRef', v_existing.previous_plan_version_ref,
      'newPlanVersionRef', v_existing.new_plan_version_ref,
      'appliedAt', v_existing.applied_at,
      'appliedBy', v_existing.applied_by,
      'changeRefs', to_jsonb(v_existing.change_refs)
    );
end;
$$;

revoke all on function public.apply_recovery_workout_proposal(text, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_recovery_workout_proposal(text, uuid)
  to service_role;
