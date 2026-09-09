create extension if not exists pgcrypto;


-- =====================================================
-- ORGANIZATIONS
-- =====================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now()
);


-- =====================================================
-- ORGANIZATION USERS
-- =====================================================

create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role text not null
    default 'staff'
    check (
      role in (
        'staff',
        'manager',
        'admin'
      )
    ),

  created_at timestamptz
    not null
    default now(),

  unique (
    organization_id,
    user_id
  )
);


-- =====================================================
-- GYM MEMBERS
-- =====================================================

create table if not exists public.gym_members (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  user_id uuid
    references auth.users(id)
    on delete set null,

  name text not null,

  email text,

  membership_plan text,

  goal text,

  status text
    not null
    default 'active'
    check (
      status in (
        'active',
        'inactive',
        'paused',
        'cancelled'
      )
    ),

  join_date date
    default current_date,

  last_visit_at timestamptz,

  sessions_30d integer
    not null
    default 0
    check (sessions_30d >= 0),

  sessions_previous_30d integer
    not null
    default 0
    check (
      sessions_previous_30d >= 0
    ),

  workout_adherence numeric(5,2)
    not null
    default 0
    check (
      workout_adherence >= 0
      and workout_adherence <= 100
    ),

  engagement_score numeric(5,2)
    not null
    default 0
    check (
      engagement_score >= 0
      and engagement_score <= 100
    ),

  progress_signal numeric(5,2)
    not null
    default 50
    check (
      progress_signal >= 0
      and progress_signal <= 100
    ),

  monthly_value numeric(10,2)
    not null
    default 0
    check (
      monthly_value >= 0
    ),

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  unique (
    organization_id,
    email
  )
);


-- =====================================================
-- ATTENDANCE EVENTS
-- =====================================================

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  member_id uuid not null
    references public.gym_members(id)
    on delete cascade,

  checked_in_at timestamptz
    not null
    default now()
);


-- =====================================================
-- CHURN ASSESSMENTS
-- =====================================================

create table if not exists public.churn_assessments (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  member_id uuid not null
    references public.gym_members(id)
    on delete cascade,

  risk_score integer not null
    check (
      risk_score >= 0
      and risk_score <= 100
    ),

  risk_level text not null
    check (
      risk_level in (
        'low',
        'moderate',
        'high'
      )
    ),

  factors jsonb
    not null
    default '[]'::jsonb,

  ai_explanation text,

  recommended_actions jsonb
    not null
    default '[]'::jsonb,

  confidence numeric(5,2)
    check (
      confidence is null
      or (
        confidence >= 0
        and confidence <= 100
      )
    ),

  provider text,

  model_name text,

  created_at timestamptz
    not null
    default now()
);


-- =====================================================
-- AI INSIGHTS
-- =====================================================

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  category text not null,

  severity text
    not null
    default 'info'
    check (
      severity in (
        'info',
        'opportunity',
        'warning',
        'critical'
      )
    ),

  title text not null,

  summary text not null,

  evidence jsonb
    not null
    default '{}'::jsonb,

  recommendation text,

  confidence numeric(5,2)
    check (
      confidence is null
      or (
        confidence >= 0
        and confidence <= 100
      )
    ),

  provider text,

  model_name text,

  created_at timestamptz
    not null
    default now()
);


-- =====================================================
-- CAMPAIGNS
-- =====================================================

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  name text not null,

  objective text,

  segment_key text,

  status text
    not null
    default 'draft'
    check (
      status in (
        'draft',
        'approved',
        'sent',
        'completed'
      )
    ),

  strategy text,

  email_subject text,

  email_body text,

  push_text text,

  call_to_action text,

  social_caption text,

  visual_prompt text,

  ai_generated boolean
    not null
    default true,

  provider text,

  model_name text,

  approved_by uuid
    references auth.users(id)
    on delete set null,

  approved_at timestamptz,

  metrics jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now()
);


-- =====================================================
-- FACILITY USAGE
-- =====================================================

create table if not exists public.facility_usage (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  recorded_at timestamptz
    not null,

  zone text
    not null,

  utilisation numeric(5,2)
    not null
    check (
      utilisation >= 0
      and utilisation <= 100
    ),

  footfall integer
    not null
    default 0
    check (
      footfall >= 0
    ),

  estimated_energy_kwh numeric(10,2)
    check (
      estimated_energy_kwh is null
      or estimated_energy_kwh >= 0
    )
);


-- =====================================================
-- AI AUDIT LOG
-- =====================================================

create table if not exists public.ai_audit_logs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  user_id uuid
    references auth.users(id)
    on delete set null,

  feature text not null,

  provider text
    not null
    default 'groq',

  model_name text,

  action text not null,

  human_approved boolean
    not null
    default false,

  metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now()
);


-- =====================================================
-- INDEXES
-- =====================================================

create index if not exists
  idx_organizations_owner
on public.organizations(owner_id);


create index if not exists
  idx_organization_users_org
on public.organization_users(
  organization_id
);


create index if not exists
  idx_organization_users_user
on public.organization_users(
  user_id
);


create index if not exists
  idx_gym_members_org
on public.gym_members(
  organization_id
);


create index if not exists
  idx_gym_members_status
on public.gym_members(
  organization_id,
  status
);


create index if not exists
  idx_gym_members_last_visit
on public.gym_members(
  organization_id,
  last_visit_at
);


create index if not exists
  idx_attendance_member
on public.attendance_events(
  member_id,
  checked_in_at desc
);


create index if not exists
  idx_churn_member
on public.churn_assessments(
  member_id,
  created_at desc
);


create index if not exists
  idx_churn_org
on public.churn_assessments(
  organization_id,
  risk_level
);


create index if not exists
  idx_ai_insights_org
on public.ai_insights(
  organization_id,
  created_at desc
);


create index if not exists
  idx_campaign_org
on public.campaigns(
  organization_id,
  status
);


create index if not exists
  idx_facility_usage_org
on public.facility_usage(
  organization_id,
  recorded_at
);


create index if not exists
  idx_ai_audit_org
on public.ai_audit_logs(
  organization_id,
  created_at desc
);


-- =====================================================
-- RLS
-- =====================================================

alter table public.organizations
enable row level security;

alter table public.organization_users
enable row level security;

alter table public.gym_members
enable row level security;

alter table public.attendance_events
enable row level security;

alter table public.churn_assessments
enable row level security;

alter table public.ai_insights
enable row level security;

alter table public.campaigns
enable row level security;

alter table public.facility_usage
enable row level security;

alter table public.ai_audit_logs
enable row level security;


-- =====================================================
-- SECURITY DEFINER HELPERS
-- Prevent recursive RLS checks.
-- =====================================================

create or replace function
public.is_organization_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.organizations o
      where
        o.id = target_organization_id
        and o.owner_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.organization_users ou
      where
        ou.organization_id =
          target_organization_id
        and ou.user_id = auth.uid()
    );
$$;


create or replace function
public.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.organizations o
      where
        o.id = target_organization_id
        and o.owner_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.organization_users ou
      where
        ou.organization_id =
          target_organization_id
        and ou.user_id = auth.uid()
        and ou.role = any(allowed_roles)
    );
$$;


revoke all
on function
public.is_organization_member(uuid)
from public;

revoke all
on function
public.has_organization_role(
  uuid,
  text[]
)
from public;


grant execute
on function
public.is_organization_member(uuid)
to authenticated;

grant execute
on function
public.has_organization_role(
  uuid,
  text[]
)
to authenticated;


-- =====================================================
-- ORGANIZATIONS POLICIES
-- =====================================================

drop policy if exists
"organization_select"
on public.organizations;

create policy
"organization_select"
on public.organizations
for select
to authenticated
using (
  public.is_organization_member(id)
);


drop policy if exists
"organization_insert"
on public.organizations;

create policy
"organization_insert"
on public.organizations
for insert
to authenticated
with check (
  owner_id = auth.uid()
);


drop policy if exists
"organization_update"
on public.organizations;

create policy
"organization_update"
on public.organizations
for update
to authenticated
using (
  owner_id = auth.uid()
  or public.has_organization_role(
    id,
    array['admin']
  )
)
with check (
  owner_id = auth.uid()
  or public.has_organization_role(
    id,
    array['admin']
  )
);


drop policy if exists
"organization_delete"
on public.organizations;

create policy
"organization_delete"
on public.organizations
for delete
to authenticated
using (
  owner_id = auth.uid()
);


-- =====================================================
-- ORGANIZATION USERS POLICIES
-- =====================================================

drop policy if exists
"organization_users_select"
on public.organization_users;

create policy
"organization_users_select"
on public.organization_users
for select
to authenticated
using (
  public.is_organization_member(
    organization_id
  )
);


drop policy if exists
"organization_users_insert"
on public.organization_users;

create policy
"organization_users_insert"
on public.organization_users
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array['admin']
  )
);


drop policy if exists
"organization_users_update"
on public.organization_users;

create policy
"organization_users_update"
on public.organization_users
for update
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['admin']
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['admin']
  )
);


drop policy if exists
"organization_users_delete"
on public.organization_users;

create policy
"organization_users_delete"
on public.organization_users
for delete
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['admin']
  )
);


-- =====================================================
-- GYM MEMBERS POLICIES
-- =====================================================

drop policy if exists
"gym_members_select"
on public.gym_members;

create policy
"gym_members_select"
on public.gym_members
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"gym_members_insert"
on public.gym_members;

create policy
"gym_members_insert"
on public.gym_members
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"gym_members_update"
on public.gym_members;

create policy
"gym_members_update"
on public.gym_members
for update
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"gym_members_delete"
on public.gym_members;

create policy
"gym_members_delete"
on public.gym_members
for delete
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['admin']
  )
);


-- =====================================================
-- ATTENDANCE POLICIES
-- =====================================================

drop policy if exists
"attendance_select"
on public.attendance_events;

create policy
"attendance_select"
on public.attendance_events
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"attendance_insert"
on public.attendance_events;

create policy
"attendance_insert"
on public.attendance_events
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


-- =====================================================
-- CHURN ASSESSMENTS
-- =====================================================

drop policy if exists
"churn_select"
on public.churn_assessments;

create policy
"churn_select"
on public.churn_assessments
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"churn_write"
on public.churn_assessments;

create policy
"churn_write"
on public.churn_assessments
for all
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


-- =====================================================
-- AI INSIGHTS
-- =====================================================

drop policy if exists
"ai_insights_select"
on public.ai_insights;

create policy
"ai_insights_select"
on public.ai_insights
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"ai_insights_write"
on public.ai_insights;

create policy
"ai_insights_write"
on public.ai_insights
for all
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


-- =====================================================
-- CAMPAIGNS
-- =====================================================

drop policy if exists
"campaign_select"
on public.campaigns;

create policy
"campaign_select"
on public.campaigns
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"campaign_write"
on public.campaigns;

create policy
"campaign_write"
on public.campaigns
for all
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


-- =====================================================
-- FACILITY USAGE
-- =====================================================

drop policy if exists
"facility_select"
on public.facility_usage;

create policy
"facility_select"
on public.facility_usage
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'staff',
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"facility_write"
on public.facility_usage;

create policy
"facility_write"
on public.facility_usage
for all
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


-- =====================================================
-- AI AUDIT LOG
-- =====================================================

drop policy if exists
"audit_select"
on public.ai_audit_logs;

create policy
"audit_select"
on public.ai_audit_logs
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);


drop policy if exists
"audit_insert"
on public.ai_audit_logs;

create policy
"audit_insert"
on public.ai_audit_logs
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array[
      'manager',
      'admin'
    ]
  )
);