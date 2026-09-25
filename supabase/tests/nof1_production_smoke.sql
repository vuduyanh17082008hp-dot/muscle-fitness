-- Minimal PRODUCTION smoke with real RLS (SET LOCAL ROLE authenticated).
-- Fixture users cleaned up. Returns one PASS row on success.

create extension if not exists pgcrypto;

do $prep$
declare
  uid_a uuid := 'a1111111-1111-4111-8111-111111111111';
  uid_b uuid := 'b2222222-2222-4222-8222-222222222222';
begin
  delete from public.dante_nof1_experiments where user_id in (uid_a, uid_b);
  delete from auth.users where id in (uid_a, uid_b);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values
  (
    '00000000-0000-0000-0000-000000000000', uid_a,
    'authenticated', 'authenticated', 'nof1-prod-smoke-a@muscle-fitness.local',
    crypt('nof1-prod-smoke-temp', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', uid_b,
    'authenticated', 'authenticated', 'nof1-prod-smoke-b@muscle-fitness.local',
    crypt('nof1-prod-smoke-temp', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );
end;
$prep$;

do $smoke$
declare
  uid_a uuid := 'a1111111-1111-4111-8111-111111111111';
  uid_b uuid := 'b2222222-2222-4222-8222-222222222222';
  v_id uuid;
  v_status text;
  v_confounders jsonb;
  v_conclusion jsonb;
  v_other int;
  v_count int;
begin
  if to_regclass('public.dante_nof1_experiments') is null then
    raise exception 'FAIL: table missing';
  end if;

  -- As user A under authenticated (no BYPASSRLS)
  perform set_config('request.jwt.claim.sub', uid_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  insert into public.dante_nof1_experiments (
    user_id, hypothesis, rationale, controlled_variables, variable_under_test,
    primary_outcome, secondary_outcomes, experiment_window, confounders,
    status, user_confirmed
  ) values (
    uid_a,
    'More sleep improves comparable-session performance.',
    'Production smoke hypothesis.',
    '["training volume"]'::jsonb,
    'sleep duration',
    'RPE / comparable performance',
    '[]'::jsonb,
    '{"start":"2026-09-18T00:00:00.000Z","end":"2026-09-25T00:00:00.000Z","durationDays":7}'::jsonb,
    '[]'::jsonb,
    'ACTIVE',
    true
  ) returning id into v_id;

  select status into v_status
  from public.dante_nof1_experiments
  where user_id = uid_a and status in ('ACTIVE', 'ACCEPTED', 'CONFOUNDED')
  order by created_at desc
  limit 1;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'FAIL: restore expected ACTIVE, got %', v_status;
  end if;

  -- Cross-user isolation as B
  perform set_config('request.jwt.claim.sub', uid_b::text, true);
  select count(*) into v_other from public.dante_nof1_experiments where id = v_id;
  if v_other <> 0 then
    raise exception 'FAIL: cross-user SELECT leaked';
  end if;

  update public.dante_nof1_experiments set status = 'CANCELLED' where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL: cross-user UPDATE succeeded';
  end if;

  -- Owner updates
  perform set_config('request.jwt.claim.sub', uid_a::text, true);
  update public.dante_nof1_experiments
  set status = 'CONFOUNDED',
      confounders = '["alcohol","calorie_change"]'::jsonb,
      protocol_adherence = 'POOR',
      completed_at = now()
  where id = v_id
  returning status, confounders into v_status, v_confounders;
  if v_status is distinct from 'CONFOUNDED' or v_confounders::text not like '%alcohol%' then
    raise exception 'FAIL: confounder persistence';
  end if;

  update public.dante_nof1_experiments
  set status = 'COMPLETED',
      conclusion = '{"result":"INCONCLUSIVE","confidence":"INSUFFICIENT_EVIDENCE","reasons":["smoke"]}'::jsonb
  where id = v_id
  returning conclusion into v_conclusion;
  if v_conclusion->>'result' is distinct from 'INCONCLUSIVE' then
    raise exception 'FAIL: expected INCONCLUSIVE';
  end if;

  reset role;
end;
$smoke$;

-- Cleanup as postgres
delete from public.dante_nof1_experiments
where user_id in (
  'a1111111-1111-4111-8111-111111111111'::uuid,
  'b2222222-2222-4222-8222-222222222222'::uuid
);
delete from auth.users
where id in (
  'a1111111-1111-4111-8111-111111111111'::uuid,
  'b2222222-2222-4222-8222-222222222222'::uuid
);

select 'PASS' as production_nof1_smoke;
