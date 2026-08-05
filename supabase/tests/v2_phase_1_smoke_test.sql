-- Run in Supabase SQL Editor after V2 Phase 1 migrations:
--   20260805180000_v2_role_values.sql
--   20260805180050_v2_normalize_role_columns.sql
--   20260805180100_v2_database_foundation.sql
--
-- This file only reads metadata and does not modify user data.

select
  enumlabel as role
from pg_enum
join pg_type
  on pg_type.oid = pg_enum.enumtypid
where pg_type.typnamespace = 'public'::regnamespace
  and pg_type.typname = 'app_role'
order by enumsortorder;

select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'audit_logs',
    'entitlements',
    'role_entitlements',
    'user_entitlements',
    'ai_threads',
    'ai_messages',
    'automation_rules',
    'reminder_schedules',
    'scheduled_jobs',
    'notification_preferences',
    'notifications',
    'client_statuses',
    'client_tags',
    'client_notes',
    'support_tickets',
    'support_messages',
    'product_feedback',
    'subscription_plans',
    'subscriptions',
    'billing_events'
  )
order by tablename;

select
  key,
  name,
  value_type,
  default_value
from public.entitlements
order by key;

select
  code,
  name,
  billing_interval,
  price_amount,
  currency,
  active
from public.subscription_plans
order by code;

select
  p.proname as function_name
from pg_proc as p
join pg_namespace as n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'has_entitlement',
    'write_audit_log',
    'current_app_role',
    'is_admin',
    'is_staff',
    'is_assigned_coach'
  )
order by p.proname;
