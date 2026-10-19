-- AI-R1E.1: durable store for shared-intelligence coach signals (lib/intelligence/coordination.ts CoachSignal).
-- Structured fields only: no raw chat, no chain-of-thought, no Athlete State snapshot.
--
-- Access model
--   * authenticated users: SELECT own rows only (RLS). No INSERT/UPDATE/DELETE/TRUNCATE privilege at all.
--   * service_role (server only): SELECT/INSERT/UPDATE through persist_coach_signal() or direct writes. No DELETE:
--     history is kept; lifecycle moves ACTIVE -> SUPERSEDED / EXPIRED / WITHDRAWN (or CONSUMED) instead.
--   * user_id never comes from a client payload; the server derives it from the authenticated session.
-- Expiry is read-time (lifecycle = 'ACTIVE' and valid_until > now()); rows are not eagerly rewritten.
-- Reading a signal never changes its lifecycle. Do not apply to hosted without review.

create table if not exists public.coach_signals (
  id uuid primary key default gen_random_uuid(),
  signal_id text not null check (signal_id ~ '^[A-Za-z0-9:_.-]{1,128}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_.-]{1,128}$'),
  producer text not null check (producer in ('DANTE', 'GEMMA')),
  source_domain text not null check (source_domain in ('TRAINING', 'RECOVERY', 'NUTRITION', 'PERFORMANCE', 'GLOBAL')),
  target_domains text[] not null
    check (cardinality(target_domains) > 0
      and target_domains <@ array['TRAINING', 'RECOVERY', 'NUTRITION', 'PERFORMANCE', 'GLOBAL']::text[]),
  signal_type text not null check (signal_type ~ '^[A-Za-z0-9:_.-]{1,128}$'),
  status text not null check (status in ('CROSS_COACH_VERIFIED', 'SUPPORTED_HYPOTHESIS', 'INFERENCE', 'HEURISTIC')),
  lifecycle text not null default 'ACTIVE'
    check (lifecycle in ('ACTIVE', 'SUPERSEDED', 'EXPIRED', 'WITHDRAWN', 'CONSUMED')),
  uncertainty text not null check (uncertainty in ('HIGH_SUPPORT', 'MODERATE_SUPPORT', 'WEAK_SUPPORT', 'UNRESOLVED')),
  identifiability text not null check (length(identifiability) between 1 and 64),
  privacy_class text not null check (privacy_class in ('NORMAL', 'SENSITIVE', 'MEDICAL')),
  risk_flag text check (risk_flag in ('MEDICAL_RISK', 'SAFETY_BLOCK')),
  evidence_refs text[] not null check (cardinality(evidence_refs) > 0),
  provenance text[] not null check (cardinality(provenance) > 0),
  implications jsonb not null default '[]'::jsonb check (jsonb_typeof(implications) = 'array'),
  supersedes text[] not null default '{}',
  superseded_by text,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_signals_validity_window check (valid_until > valid_from),
  constraint coach_signals_user_idempotency_key unique (user_id, idempotency_key),
  constraint coach_signals_user_signal_id unique (user_id, signal_id)
);

create index if not exists coach_signals_active_read_idx
  on public.coach_signals (user_id, valid_until desc)
  where lifecycle = 'ACTIVE';

-- Privilege model: browser JWTs can read their own rows and nothing else.
revoke all on table public.coach_signals from public, anon, authenticated, service_role;
grant select on table public.coach_signals to authenticated;
grant select, insert, update on table public.coach_signals to service_role;

alter table public.coach_signals enable row level security;

drop policy if exists "coach_signals_select_own" on public.coach_signals;
create policy "coach_signals_select_own" on public.coach_signals
  for select to authenticated using (auth.uid() = user_id);

-- Explicit rank (never compare privacy_class lexically): NORMAL=0 < SENSITIVE=1 < MEDICAL=2.
create or replace function public.coach_privacy_rank(p text) returns integer
language sql immutable
set search_path = public
as $$
  select case p when 'NORMAL' then 0 when 'SENSITIVE' then 1 when 'MEDICAL' then 2 end;
$$;

-- Immutable meaning + monotonic privacy + one-way lifecycle, enforced even for service_role.
create or replace function public.coach_signals_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.user_id, new.signal_id, new.idempotency_key, new.producer, new.source_domain, new.target_domains,
      new.signal_type, new.status, new.evidence_refs, new.provenance, new.valid_from, new.valid_until,
      new.created_at, new.schema_version)
     is distinct from
     (old.user_id, old.signal_id, old.idempotency_key, old.producer, old.source_domain, old.target_domains,
      old.signal_type, old.status, old.evidence_refs, old.provenance, old.valid_from, old.valid_until,
      old.created_at, old.schema_version) then
    raise exception 'coach_signals: signal meaning is immutable' using errcode = '23514';
  end if;
  if public.coach_privacy_rank(new.privacy_class) < public.coach_privacy_rank(old.privacy_class) then
    raise exception 'coach_signals: privacy_class may not be downgraded' using errcode = '23514';
  end if;
  if old.lifecycle <> 'ACTIVE' and new.lifecycle <> old.lifecycle then
    raise exception 'coach_signals: lifecycle % is terminal', old.lifecycle using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coach_signals_guard on public.coach_signals;
create trigger coach_signals_guard before update on public.coach_signals
  for each row execute function public.coach_signals_guard();

-- Atomic publish: first publication wins (unique user_id + idempotency_key), then in the SAME transaction every
-- still-ACTIVE signal named in `supersedes` (same user, same producer) is marked SUPERSEDED. Nothing is deleted.
-- A duplicate publication changes nothing. A signal_id clash under a different idempotency key raises 23505.
create or replace function public.persist_coach_signal(p_user_id uuid, p_signal jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_sid text := p_signal->>'signal_id';
  v_producer text := p_signal->>'producer';
  v_supersedes text[] := array(select jsonb_array_elements_text(coalesce(p_signal->'supersedes', '[]'::jsonb)));
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'coach_signals: user_id required' using errcode = '22004';
  end if;

  insert into public.coach_signals (
    signal_id, user_id, schema_version, idempotency_key, producer, source_domain, target_domains, signal_type,
    status, lifecycle, uncertainty, identifiability, privacy_class, risk_flag, evidence_refs, provenance,
    implications, supersedes, valid_from, valid_until
  ) values (
    v_sid, p_user_id, coalesce((p_signal->>'schema_version')::integer, 1), p_signal->>'idempotency_key',
    v_producer, p_signal->>'source_domain',
    array(select jsonb_array_elements_text(coalesce(p_signal->'target_domains', '[]'::jsonb))),
    p_signal->>'signal_type', p_signal->>'status', 'ACTIVE', p_signal->>'uncertainty', p_signal->>'identifiability',
    p_signal->>'privacy_class', p_signal->>'risk_flag',
    array(select jsonb_array_elements_text(coalesce(p_signal->'evidence_refs', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_signal->'provenance', '[]'::jsonb))),
    coalesce(p_signal->'implications', '[]'::jsonb), v_supersedes,
    (p_signal->>'valid_from')::timestamptz, (p_signal->>'valid_until')::timestamptz
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('status', 'DUPLICATE', 'superseded', 0);
  end if;

  if cardinality(v_supersedes) > 0 then
    update public.coach_signals
       set lifecycle = 'SUPERSEDED', superseded_by = v_sid
     where user_id = p_user_id
       and producer = v_producer
       and lifecycle = 'ACTIVE'
       and signal_id = any (v_supersedes)
       and signal_id <> v_sid;
    get diagnostics v_count = row_count;
  end if;

  return jsonb_build_object('status', 'INSERTED', 'superseded', v_count);
end;
$$;

revoke all on function public.persist_coach_signal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_coach_signal(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
