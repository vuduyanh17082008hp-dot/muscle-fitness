-- Local-only N-of-1 durability validation against muscle-fitness-nof1-local.
-- Does NOT touch production. Safe to re-run (cleans its own fixtures).

begin;

create extension if not exists pgcrypto;

-- Cleanup prior fixture users/rows
delete from public.dante_nof1_experiments
where user_id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
);
delete from auth.users
where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
);

-- Minimal auth users (local only)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'nof1-a@local.test',
  crypt('local-test-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated', 'nof1-b@local.test',
  crypt('local-test-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
);

commit;

-- Helpers
create or replace function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end;
$$;

do $$
declare
  v_id uuid;
  v_status text;
  v_confounders jsonb;
  v_conclusion jsonb;
  v_count int;
  v_other int;
begin
  -- Table exists
  if to_regclass('public.dante_nof1_experiments') is null then
    raise exception 'FAIL: dante_nof1_experiments missing';
  end if;

  -- RLS enabled
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'dante_nof1_experiments' and c.relrowsecurity
  ) then
    raise exception 'FAIL: RLS not enabled';
  end if;

  -- Own-user INSERT as ACTIVE (Confirm → persist)
  perform pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  insert into public.dante_nof1_experiments (
    user_id, hypothesis, rationale, controlled_variables, variable_under_test,
    primary_outcome, secondary_outcomes, experiment_window, confounders,
    status, user_confirmed
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'More sleep improves comparable-session performance.',
    'Sleep and volume changed together.',
    '["training volume"]'::jsonb,
    'sleep duration',
    'RPE / comparable performance',
    '[]'::jsonb,
    '{"start":"2026-09-18T00:00:00.000Z","end":"2026-09-25T00:00:00.000Z","durationDays":7}'::jsonb,
    '[]'::jsonb,
    'ACTIVE',
    true
  ) returning id into v_id;

  if v_id is null then
    raise exception 'FAIL: own-user INSERT did not return id';
  end if;

  -- Own-user SELECT (fresh-session restore shape)
  select status into v_status
  from public.dante_nof1_experiments
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    and status in ('ACTIVE', 'ACCEPTED', 'CONFOUNDED')
  order by created_at desc
  limit 1;

  if v_status is distinct from 'ACTIVE' then
    raise exception 'FAIL: fresh-session restore expected ACTIVE, got %', v_status;
  end if;

  -- Cross-user isolation: user B cannot see user A
  perform pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
  select count(*) into v_other from public.dante_nof1_experiments where id = v_id;
  if v_other <> 0 then
    raise exception 'FAIL: cross-user SELECT leaked row';
  end if;

  -- User B cannot update user A
  update public.dante_nof1_experiments
  set status = 'CANCELLED'
  where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL: cross-user UPDATE succeeded';
  end if;

  -- Confounder persistence + CONFOUNDED as owner
  perform pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  update public.dante_nof1_experiments
  set status = 'CONFOUNDED',
      confounders = '["alcohol","calorie_change"]'::jsonb,
      protocol_adherence = 'POOR',
      completed_at = now()
  where id = v_id
  returning confounders, status into v_confounders, v_status;

  if v_status is distinct from 'CONFOUNDED' then
    raise exception 'FAIL: confounder status update failed';
  end if;
  if v_confounders::text not like '%alcohol%' then
    raise exception 'FAIL: confounders not persisted';
  end if;

  -- INCONCLUSIVE conclusion persistence (no fabricated SUPPORTS)
  update public.dante_nof1_experiments
  set status = 'COMPLETED',
      conclusion = '{"result":"INCONCLUSIVE","confidence":"INSUFFICIENT_EVIDENCE","reasons":["Material confounders"]}'::jsonb
  where id = v_id
  returning conclusion into v_conclusion;

  if v_conclusion->>'result' is distinct from 'INCONCLUSIVE' then
    raise exception 'FAIL: expected INCONCLUSIVE conclusion';
  end if;

  raise notice 'PASS: table, RLS, own INSERT/SELECT/UPDATE, isolation, confounders, INCONCLUSIVE';
end;
$$;
