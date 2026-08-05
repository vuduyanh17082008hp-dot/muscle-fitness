-- =========================================================
-- MUSCLE FITNESS V2 — PHASE 1 DATABASE FOUNDATION
-- =========================================================
-- Additive only. Safe for existing production data.
-- Depends on:
--   20260805180000_v2_role_values.sql
--   20260805180050_v2_normalize_role_columns.sql
-- =========================================================

begin;

create schema if not exists private;

-- =========================================================
-- 1. ROLE HELPERS (admin + super_admin, public wrappers)
-- =========================================================

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        case
          when ur.role = 'user'::public.app_role then
            'client'::public.app_role
          else
            ur.role
        end
      from public.user_roles as ur
      where ur.user_id = (select auth.uid())
      limit 1
    ),
    (
      select
        case
          when p.role = 'user'::public.app_role then
            'client'::public.app_role
          else
            p.role
        end
      from public.profiles as p
      where p.user_id = (select auth.uid())
      limit 1
    ),
    'client'::public.app_role
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() in (
    'admin'::public.app_role,
    'super_admin'::public.app_role
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() in (
    'coach'::public.app_role,
    'support'::public.app_role,
    'admin'::public.app_role,
    'super_admin'::public.app_role
  );
$$;

create or replace function private.is_assigned_coach(
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = (select auth.uid())
      and cc.client_id = p_client_id
  )
  and private.current_app_role() in (
    'coach'::public.app_role,
    'admin'::public.app_role,
    'super_admin'::public.app_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff();
$$;

create or replace function public.is_assigned_coach(
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_assigned_coach(p_client_id);
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role();
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.is_assigned_coach(uuid) from public;

grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_assigned_coach(uuid) to authenticated;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_assigned_coach(uuid) from public;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_assigned_coach(uuid) to authenticated;

-- =========================================================
-- 2. ADDITIVE PROFILE COLUMNS (preserve user_id PK)
-- =========================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists username text,
  add column if not exists phone text,
  add column if not exists provider text,
  add column if not exists last_login_at timestamptz;

-- =========================================================
-- 3. ENTITLEMENTS
-- =========================================================

create table if not exists public.entitlements (
  key text primary key
    check (char_length(key) between 2 and 80),

  name text not null
    check (char_length(name) between 2 and 120),

  description text,

  value_type text not null default 'boolean'
    check (value_type in ('boolean', 'integer', 'string')),

  default_value text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.role_entitlements (
  role public.app_role not null,
  entitlement_key text not null
    references public.entitlements (key)
    on delete cascade,

  value text not null default 'true',
  created_at timestamptz not null default timezone('utc', now()),

  primary key (role, entitlement_key)
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  entitlement_key text not null
    references public.entitlements (key)
    on delete cascade,

  value text not null,
  source text not null default 'manual'
    check (source in ('manual', 'plan', 'trial', 'promo', 'system')),

  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (user_id, entitlement_key)
);

create index if not exists user_entitlements_user_id_idx
  on public.user_entitlements (user_id);

create index if not exists user_entitlements_key_idx
  on public.user_entitlements (entitlement_key);

insert into public.entitlements (key, name, description, value_type, default_value)
values
  ('ai_daily_limit', 'AI daily limit', 'Maximum AI Coach messages per day', 'integer', '5'),
  ('calendar_sync', 'Google Calendar sync', 'Allow calendar synchronization', 'boolean', 'false'),
  ('advanced_analytics', 'Advanced analytics', 'Unlock advanced progress analytics', 'boolean', 'false'),
  ('coach_messaging', 'Coach messaging', 'Direct coach messaging', 'boolean', 'false'),
  ('priority_support', 'Priority support', 'Priority support queue', 'boolean', 'false'),
  ('custom_plan', 'Custom plan', 'Coach-managed custom training plan', 'boolean', 'false')
on conflict (key) do nothing;

insert into public.role_entitlements (role, entitlement_key, value)
values
  ('client', 'ai_daily_limit', '5'),
  ('client', 'calendar_sync', 'false'),
  ('client', 'advanced_analytics', 'false'),
  ('client', 'coach_messaging', 'false'),
  ('client', 'priority_support', 'false'),
  ('client', 'custom_plan', 'false'),
  ('coach', 'ai_daily_limit', '50'),
  ('coach', 'calendar_sync', 'true'),
  ('coach', 'advanced_analytics', 'true'),
  ('coach', 'coach_messaging', 'true'),
  ('coach', 'priority_support', 'true'),
  ('coach', 'custom_plan', 'true'),
  ('support', 'ai_daily_limit', '20'),
  ('support', 'priority_support', 'true'),
  ('admin', 'ai_daily_limit', '200'),
  ('admin', 'calendar_sync', 'true'),
  ('admin', 'advanced_analytics', 'true'),
  ('admin', 'coach_messaging', 'true'),
  ('admin', 'priority_support', 'true'),
  ('admin', 'custom_plan', 'true'),
  ('super_admin', 'ai_daily_limit', '1000'),
  ('super_admin', 'calendar_sync', 'true'),
  ('super_admin', 'advanced_analytics', 'true'),
  ('super_admin', 'coach_messaging', 'true'),
  ('super_admin', 'priority_support', 'true'),
  ('super_admin', 'custom_plan', 'true')
on conflict (role, entitlement_key) do nothing;

create or replace function public.has_entitlement(
  p_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_user_value text;
  v_role_value text;
  v_default text;
  v_type text;
  v_resolved text;
begin
  if v_user_id is null then
    return false;
  end if;

  if p_key is null or btrim(p_key) = '' then
    return false;
  end if;

  select e.value_type, e.default_value
  into v_type, v_default
  from public.entitlements as e
  where e.key = btrim(p_key);

  if not found then
    return false;
  end if;

  select ue.value
  into v_user_value
  from public.user_entitlements as ue
  where ue.user_id = v_user_id
    and ue.entitlement_key = btrim(p_key)
    and (ue.starts_at is null or ue.starts_at <= timezone('utc', now()))
    and (ue.ends_at is null or ue.ends_at > timezone('utc', now()))
  order by ue.updated_at desc
  limit 1;

  v_role := private.current_app_role();

  select re.value
  into v_role_value
  from public.role_entitlements as re
  where re.role = v_role
    and re.entitlement_key = btrim(p_key)
  limit 1;

  v_resolved := coalesce(v_user_value, v_role_value, v_default, 'false');

  if v_type = 'boolean' then
    return lower(v_resolved) in ('true', '1', 'yes');
  end if;

  if v_type = 'integer' then
    return coalesce(nullif(v_resolved, '')::integer, 0) > 0;
  end if;

  return coalesce(btrim(v_resolved), '') <> '';
end;
$$;

revoke all on function public.has_entitlement(text) from public;
grant execute on function public.has_entitlement(text) to authenticated;

-- =========================================================
-- 4. AUDIT LOGS (append-only for authenticated)
-- =========================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),

  actor_id uuid references auth.users (id) on delete set null,
  action text not null
    check (char_length(action) between 2 and 120),

  entity_type text not null
    check (char_length(entity_type) between 2 and 80),

  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    (select auth.uid()),
    btrim(p_action),
    btrim(p_entity_type),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_audit_log(text, text, text, jsonb)
  from public;

grant execute on function public.write_audit_log(text, text, text, jsonb)
  to authenticated;

-- =========================================================
-- 5. PHASE 1 SKELETON TABLES (RLS on; product APIs later)
-- =========================================================

create table if not exists public.subscription_plans (
  code text primary key
    check (char_length(code) between 2 and 40),
  name text not null,
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year', 'one_time')),
  price_amount integer not null default 0 check (price_amount >= 0),
  currency text not null default 'usd',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.subscription_plans (
  code, name, billing_interval, price_amount, currency, active
)
values
  ('free', 'Free', 'month', 0, 'usd', true),
  ('pro', 'Pro', 'month', 2900, 'usd', true),
  ('coaching', 'Coaching', 'month', 9900, 'usd', true)
on conflict (code) do nothing;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.subscription_plans (code),
  status text not null default 'inactive'
    check (status in (
      'trialing', 'active', 'past_due', 'canceled', 'inactive'
    )),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_threads_user_id_idx
  on public.ai_threads (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.ai_threads (id)
    on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_messages_thread_id_idx
  on public.ai_messages (thread_id, created_at);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_key text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists reminder_schedules_user_scheduled_idx
  on public.reminder_schedules (user_id, scheduled_for);

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  run_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  workout_reminders boolean not null default true,
  billing_reminders boolean not null default true,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  category text not null default 'general',
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.client_statuses (
  client_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'lead'
    check (status in (
      'lead', 'trial', 'active', 'paused', 'at_risk', 'cancelled', 'archived'
    )),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.client_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  visibility text not null default 'private'
    check (visibility in ('private', 'client_visible')),
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists client_notes_client_id_idx
  on public.client_notes (client_id, created_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default 'other',
  status text not null default 'open'
    check (status in (
      'open', 'in_progress', 'waiting_for_client', 'resolved', 'closed'
    )),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null
    references public.support_tickets (id)
    on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  rating integer check (rating between 1 and 5),
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- =========================================================
-- 6. RLS
-- =========================================================

alter table public.entitlements enable row level security;
alter table public.role_entitlements enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.automation_rules enable row level security;
alter table public.reminder_schedules enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.client_statuses enable row level security;
alter table public.client_tags enable row level security;
alter table public.client_notes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.product_feedback enable row level security;

-- Entitlements catalog: readable by authenticated
drop policy if exists entitlements_select_authenticated on public.entitlements;
create policy entitlements_select_authenticated
on public.entitlements
for select
to authenticated
using (true);

drop policy if exists role_entitlements_select_authenticated on public.role_entitlements;
create policy role_entitlements_select_authenticated
on public.role_entitlements
for select
to authenticated
using (true);

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
on public.user_entitlements
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
);

-- Only admins manage entitlement overrides via table (prefer RPC later)
drop policy if exists user_entitlements_admin_write on public.user_entitlements;
create policy user_entitlements_admin_write
on public.user_entitlements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Audit logs: admins read; inserts via write_audit_log only
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select
on public.audit_logs
for select
to authenticated
using (public.is_admin());

-- Plans readable
drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select
on public.subscription_plans
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists billing_events_admin_select on public.billing_events;
create policy billing_events_admin_select
on public.billing_events
for select
to authenticated
using (public.is_admin());

drop policy if exists ai_threads_own on public.ai_threads;
create policy ai_threads_own
on public.ai_threads
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists ai_messages_own on public.ai_messages;
create policy ai_messages_own
on public.ai_messages
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists automation_rules_admin on public.automation_rules;
create policy automation_rules_admin
on public.automation_rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists reminder_schedules_own on public.reminder_schedules;
create policy reminder_schedules_own
on public.reminder_schedules
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists scheduled_jobs_admin on public.scheduled_jobs;
create policy scheduled_jobs_admin
on public.scheduled_jobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
on public.notification_preferences
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own
on public.notifications
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists client_statuses_staff on public.client_statuses;
create policy client_statuses_staff
on public.client_statuses
for all
to authenticated
using (
  client_id = (select auth.uid())
  or public.is_assigned_coach(client_id)
  or public.is_admin()
)
with check (
  public.is_assigned_coach(client_id)
  or public.is_admin()
);

drop policy if exists client_tags_staff_read on public.client_tags;
create policy client_tags_staff_read
on public.client_tags
for select
to authenticated
using (public.is_staff());

drop policy if exists client_tags_admin_write on public.client_tags;
create policy client_tags_admin_write
on public.client_tags
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists client_notes_access on public.client_notes;
create policy client_notes_access
on public.client_notes
for select
to authenticated
using (
  (
    visibility = 'client_visible'
    and client_id = (select auth.uid())
  )
  or public.is_assigned_coach(client_id)
  or public.is_admin()
);

drop policy if exists client_notes_staff_write on public.client_notes;
create policy client_notes_staff_write
on public.client_notes
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (
    public.is_assigned_coach(client_id)
    or public.is_admin()
  )
);

drop policy if exists support_tickets_own on public.support_tickets;
create policy support_tickets_own
on public.support_tickets
for all
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_staff()
)
with check (
  user_id = (select auth.uid())
  or public.is_staff()
);

drop policy if exists support_messages_access on public.support_messages;
create policy support_messages_access
on public.support_messages
for all
to authenticated
using (
  exists (
    select 1
    from public.support_tickets as st
    where st.id = ticket_id
      and (
        st.user_id = (select auth.uid())
        or public.is_staff()
      )
  )
)
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.support_tickets as st
    where st.id = ticket_id
      and (
        st.user_id = (select auth.uid())
        or public.is_staff()
      )
  )
);

drop policy if exists product_feedback_insert_own on public.product_feedback;
create policy product_feedback_insert_own
on public.product_feedback
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or user_id is null
);

drop policy if exists product_feedback_select on public.product_feedback;
create policy product_feedback_select
on public.product_feedback
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_staff()
);

commit;
