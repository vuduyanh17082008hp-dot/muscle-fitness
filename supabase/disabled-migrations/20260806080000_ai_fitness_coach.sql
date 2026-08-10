begin;

create extension if not exists pgcrypto;

-- =========================================================
-- AI THREADS
-- =========================================================

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  thread_type text not null default 'chat'
    check (thread_type in ('chat', 'reminder')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_threads_user_last_message_idx
  on public.ai_threads (user_id, last_message_at desc);

create index if not exists ai_threads_user_type_idx
  on public.ai_threads (user_id, thread_type);

-- =========================================================
-- AI MESSAGES
-- =========================================================

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  openai_response_id text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_thread_created_idx
  on public.ai_messages (thread_id, created_at);

create index if not exists ai_messages_user_created_idx
  on public.ai_messages (user_id, created_at desc);

create index if not exists ai_messages_metadata_gin_idx
  on public.ai_messages using gin (metadata);

-- =========================================================
-- THREAD SUMMARIES
-- =========================================================

create table if not exists public.ai_thread_summaries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  covered_through_message_id uuid references public.ai_messages(id) on delete set null,
  covered_message_count integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_thread_summaries_user_idx
  on public.ai_thread_summaries (user_id);

-- =========================================================
-- DAILY USAGE
-- =========================================================

create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  plan_code text not null default 'free',
  messages_used integer not null default 0 check (messages_used >= 0),
  request_limit integer not null default 10 check (request_limit >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

create index if not exists ai_usage_daily_user_date_idx
  on public.ai_usage_daily (user_id, usage_date desc);

-- =========================================================
-- ENTITLEMENTS / PAYMENT LIMITS
-- =========================================================

create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'free',
  daily_message_limit integer not null default 10
    check (daily_message_limit >= 0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null default 'system',
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_entitlements_active_idx
  on public.ai_entitlements (active, ends_at);

-- =========================================================
-- USER SETTINGS
-- =========================================================

create table if not exists public.ai_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_tone text not null default 'supportive'
    check (preferred_tone in ('direct', 'supportive', 'analytical')),
  detail_level text not null default 'balanced'
    check (detail_level in ('concise', 'balanced', 'detailed')),
  language text not null default 'vi'
    check (language in ('vi', 'en')),
  timezone text not null default 'Asia/Singapore',
  weekly_summary_enabled boolean not null default true,
  workout_reminders_enabled boolean not null default true,
  protein_reminders_enabled boolean not null default true,
  reminder_hour_local integer not null default 21
    check (reminder_hour_local between 0 and 23),
  allow_conversation_memory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FEEDBACK
-- =========================================================

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  message_id uuid not null references public.ai_messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists ai_feedback_thread_idx
  on public.ai_feedback (thread_id, created_at desc);

-- =========================================================
-- TOOL AUDIT LOGS
-- =========================================================

create table if not exists public.ai_tool_logs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  call_id text,
  arguments jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null
    check (status in ('success', 'error', 'confirmation_required')),
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_tool_logs_user_created_idx
  on public.ai_tool_logs (user_id, created_at desc);

create index if not exists ai_tool_logs_thread_idx
  on public.ai_tool_logs (thread_id, created_at desc);

-- =========================================================
-- CUSTOM WORKOUT REMINDERS
-- =========================================================

create table if not exists public.ai_workout_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  title text not null,
  message text not null,
  remind_at timestamptz not null,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_workout_reminders_due_idx
  on public.ai_workout_reminders (remind_at)
  where delivered_at is null and cancelled_at is null;

-- =========================================================
-- SUPPORT TICKETS
-- =========================================================

create table if not exists public.ai_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  subject text not null,
  category text not null
    check (
      category in (
        'technical',
        'billing',
        'workout',
        'nutrition',
        'account',
        'other'
      )
    ),
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_support_tickets_user_status_idx
  on public.ai_support_tickets (user_id, status, created_at desc);

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_threads_touch_updated_at on public.ai_threads;
create trigger ai_threads_touch_updated_at
before update on public.ai_threads
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_thread_summaries_touch_updated_at
  on public.ai_thread_summaries;
create trigger ai_thread_summaries_touch_updated_at
before update on public.ai_thread_summaries
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_usage_daily_touch_updated_at
  on public.ai_usage_daily;
create trigger ai_usage_daily_touch_updated_at
before update on public.ai_usage_daily
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_entitlements_touch_updated_at
  on public.ai_entitlements;
create trigger ai_entitlements_touch_updated_at
before update on public.ai_entitlements
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_user_settings_touch_updated_at
  on public.ai_user_settings;
create trigger ai_user_settings_touch_updated_at
before update on public.ai_user_settings
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_workout_reminders_touch_updated_at
  on public.ai_workout_reminders;
create trigger ai_workout_reminders_touch_updated_at
before update on public.ai_workout_reminders
for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_support_tickets_touch_updated_at
  on public.ai_support_tickets;
create trigger ai_support_tickets_touch_updated_at
before update on public.ai_support_tickets
for each row execute function public.ai_touch_updated_at();

-- =========================================================
-- ENABLE RLS
-- =========================================================

alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_thread_summaries enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_entitlements enable row level security;
alter table public.ai_user_settings enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_tool_logs enable row level security;
alter table public.ai_workout_reminders enable row level security;
alter table public.ai_support_tickets enable row level security;

-- =========================================================
-- RLS: THREADS
-- =========================================================

drop policy if exists ai_threads_select_own on public.ai_threads;
create policy ai_threads_select_own
on public.ai_threads
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_threads_insert_own on public.ai_threads;
create policy ai_threads_insert_own
on public.ai_threads
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists ai_threads_update_own on public.ai_threads;
create policy ai_threads_update_own
on public.ai_threads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists ai_threads_delete_own on public.ai_threads;
create policy ai_threads_delete_own
on public.ai_threads
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: MESSAGES
-- =========================================================

drop policy if exists ai_messages_select_own on public.ai_messages;
create policy ai_messages_select_own
on public.ai_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_messages_insert_own on public.ai_messages;
create policy ai_messages_insert_own
on public.ai_messages
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.ai_threads t
    where t.id = thread_id
      and t.user_id = (select auth.uid())
  )
);

drop policy if exists ai_messages_delete_own on public.ai_messages;
create policy ai_messages_delete_own
on public.ai_messages
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: SUMMARIES
-- =========================================================

drop policy if exists ai_summaries_select_own
  on public.ai_thread_summaries;
create policy ai_summaries_select_own
on public.ai_thread_summaries
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_summaries_insert_own
  on public.ai_thread_summaries;
create policy ai_summaries_insert_own
on public.ai_thread_summaries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists ai_summaries_update_own
  on public.ai_thread_summaries;
create policy ai_summaries_update_own
on public.ai_thread_summaries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: USAGE / ENTITLEMENTS
-- =========================================================

drop policy if exists ai_usage_select_own on public.ai_usage_daily;
create policy ai_usage_select_own
on public.ai_usage_daily
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_entitlements_select_own
  on public.ai_entitlements;
create policy ai_entitlements_select_own
on public.ai_entitlements
for select
to authenticated
using ((select auth.uid()) = user_id);

-- No authenticated INSERT/UPDATE policy for entitlements.
-- Only the service-role payment webhook can change plans.

-- =========================================================
-- RLS: SETTINGS
-- =========================================================

drop policy if exists ai_settings_select_own
  on public.ai_user_settings;
create policy ai_settings_select_own
on public.ai_user_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_settings_insert_own
  on public.ai_user_settings;
create policy ai_settings_insert_own
on public.ai_user_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists ai_settings_update_own
  on public.ai_user_settings;
create policy ai_settings_update_own
on public.ai_user_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: FEEDBACK
-- =========================================================

drop policy if exists ai_feedback_select_own on public.ai_feedback;
create policy ai_feedback_select_own
on public.ai_feedback
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_feedback_insert_own on public.ai_feedback;
create policy ai_feedback_insert_own
on public.ai_feedback
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.ai_messages m
    where m.id = message_id
      and m.user_id = (select auth.uid())
      and m.role = 'assistant'
  )
);

drop policy if exists ai_feedback_update_own on public.ai_feedback;
create policy ai_feedback_update_own
on public.ai_feedback
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: TOOL LOGS
-- =========================================================

drop policy if exists ai_tool_logs_select_own on public.ai_tool_logs;
create policy ai_tool_logs_select_own
on public.ai_tool_logs
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_tool_logs_insert_own on public.ai_tool_logs;
create policy ai_tool_logs_insert_own
on public.ai_tool_logs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: CUSTOM REMINDERS
-- =========================================================

drop policy if exists ai_reminders_select_own
  on public.ai_workout_reminders;
create policy ai_reminders_select_own
on public.ai_workout_reminders
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_reminders_insert_own
  on public.ai_workout_reminders;
create policy ai_reminders_insert_own
on public.ai_workout_reminders
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists ai_reminders_update_own
  on public.ai_workout_reminders;
create policy ai_reminders_update_own
on public.ai_workout_reminders
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists ai_reminders_delete_own
  on public.ai_workout_reminders;
create policy ai_reminders_delete_own
on public.ai_workout_reminders
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- =========================================================
-- RLS: SUPPORT TICKETS
-- =========================================================

drop policy if exists ai_support_select_own
  on public.ai_support_tickets;
create policy ai_support_select_own
on public.ai_support_tickets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists ai_support_insert_own
  on public.ai_support_tickets;
create policy ai_support_insert_own
on public.ai_support_tickets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- =========================================================
-- ATOMIC USAGE LIMIT
-- =========================================================

create or replace function public.consume_ai_usage(
  p_thread_id uuid default null
)
returns table (
  allowed boolean,
  usage_date date,
  plan_code text,
  messages_used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_timezone text;
  v_usage_date date;
  v_plan_code text;
  v_daily_limit integer;
  v_messages_used integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_thread_id is not null and not exists (
    select 1
    from public.ai_threads t
    where t.id = p_thread_id
      and t.user_id = v_user_id
  ) then
    raise exception 'Thread not found';
  end if;

  select s.timezone
  into v_timezone
  from public.ai_user_settings s
  where s.user_id = v_user_id;

  v_timezone := coalesce(v_timezone, 'Asia/Singapore');

  begin
    perform now() at time zone v_timezone;
  exception when others then
    v_timezone := 'UTC';
  end;

  v_usage_date := (now() at time zone v_timezone)::date;

  select e.plan_code, e.daily_message_limit
  into v_plan_code, v_daily_limit
  from public.ai_entitlements e
  where e.user_id = v_user_id
    and e.active = true
    and (e.starts_at is null or e.starts_at <= now())
    and (e.ends_at is null or e.ends_at > now())
  limit 1;

  v_plan_code := coalesce(v_plan_code, 'free');
  v_daily_limit := coalesce(v_daily_limit, 10);

  insert into public.ai_usage_daily (
    user_id,
    usage_date,
    plan_code,
    messages_used,
    request_limit
  )
  values (
    v_user_id,
    v_usage_date,
    v_plan_code,
    0,
    v_daily_limit
  )
  on conflict (user_id, usage_date)
  do update set
    plan_code = excluded.plan_code,
    request_limit = excluded.request_limit,
    updated_at = now();

  select u.messages_used
  into v_messages_used
  from public.ai_usage_daily u
  where u.user_id = v_user_id
    and u.usage_date = v_usage_date
  for update;

  if v_messages_used >= v_daily_limit then
    allowed := false;
    usage_date := v_usage_date;
    plan_code := v_plan_code;
    messages_used := v_messages_used;
    daily_limit := v_daily_limit;
    remaining := 0;
    return next;
    return;
  end if;

  update public.ai_usage_daily
  set
    messages_used = messages_used + 1,
    updated_at = now()
  where user_id = v_user_id
    and usage_date = v_usage_date
  returning ai_usage_daily.messages_used
  into v_messages_used;

  allowed := true;
  usage_date := v_usage_date;
  plan_code := v_plan_code;
  messages_used := v_messages_used;
  daily_limit := v_daily_limit;
  remaining := greatest(v_daily_limit - v_messages_used, 0);

  return next;
end;
$$;

-- Refund one usage when OpenAI/API execution fails.

create or replace function public.refund_ai_usage()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_timezone text;
  v_usage_date date;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select s.timezone
  into v_timezone
  from public.ai_user_settings s
  where s.user_id = v_user_id;

  v_timezone := coalesce(v_timezone, 'Asia/Singapore');

  begin
    perform now() at time zone v_timezone;
  exception when others then
    v_timezone := 'UTC';
  end;

  v_usage_date := (now() at time zone v_timezone)::date;

  update public.ai_usage_daily
  set
    messages_used = greatest(messages_used - 1, 0),
    updated_at = now()
  where user_id = v_user_id
    and usage_date = v_usage_date;
end;
$$;

-- Add OpenAI token usage without exposing UPDATE rights.

create or replace function public.record_ai_token_usage(
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_timezone text;
  v_usage_date date;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select s.timezone
  into v_timezone
  from public.ai_user_settings s
  where s.user_id = v_user_id;

  v_timezone := coalesce(v_timezone, 'Asia/Singapore');

  begin
    perform now() at time zone v_timezone;
  exception when others then
    v_timezone := 'UTC';
  end;

  v_usage_date := (now() at time zone v_timezone)::date;

  update public.ai_usage_daily
  set
    input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
    total_tokens = total_tokens
      + greatest(coalesce(p_input_tokens, 0), 0)
      + greatest(coalesce(p_output_tokens, 0), 0),
    model = p_model,
    updated_at = now()
  where user_id = v_user_id
    and usage_date = v_usage_date;
end;
$$;

-- Read current plan and usage without consuming a message.

create or replace function public.get_ai_usage_snapshot()
returns table (
  usage_date date,
  plan_code text,
  messages_used integer,
  daily_limit integer,
  remaining integer,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_timezone text;
  v_usage_date date;
  v_plan_code text;
  v_daily_limit integer;
  v_messages_used integer;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_total_tokens bigint;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select s.timezone
  into v_timezone
  from public.ai_user_settings s
  where s.user_id = v_user_id;

  v_timezone := coalesce(v_timezone, 'Asia/Singapore');

  begin
    perform now() at time zone v_timezone;
  exception when others then
    v_timezone := 'UTC';
  end;

  v_usage_date := (now() at time zone v_timezone)::date;

  select e.plan_code, e.daily_message_limit
  into v_plan_code, v_daily_limit
  from public.ai_entitlements e
  where e.user_id = v_user_id
    and e.active = true
    and (e.starts_at is null or e.starts_at <= now())
    and (e.ends_at is null or e.ends_at > now())
  limit 1;

  v_plan_code := coalesce(v_plan_code, 'free');
  v_daily_limit := coalesce(v_daily_limit, 10);

  select
    u.messages_used,
    u.input_tokens,
    u.output_tokens,
    u.total_tokens
  into
    v_messages_used,
    v_input_tokens,
    v_output_tokens,
    v_total_tokens
  from public.ai_usage_daily u
  where u.user_id = v_user_id
    and u.usage_date = v_usage_date;

  usage_date := v_usage_date;
  plan_code := v_plan_code;
  messages_used := coalesce(v_messages_used, 0);
  daily_limit := v_daily_limit;
  remaining := greatest(v_daily_limit - coalesce(v_messages_used, 0), 0);
  input_tokens := coalesce(v_input_tokens, 0);
  output_tokens := coalesce(v_output_tokens, 0);
  total_tokens := coalesce(v_total_tokens, 0);

  return next;
end;
$$;

revoke all on function public.consume_ai_usage(uuid) from public;
revoke all on function public.consume_ai_usage(uuid) from anon;
grant execute on function public.consume_ai_usage(uuid) to authenticated;

revoke all on function public.refund_ai_usage() from public;
revoke all on function public.refund_ai_usage() from anon;
grant execute on function public.refund_ai_usage() to authenticated;

revoke all on function public.record_ai_token_usage(integer, integer, text)
  from public;
revoke all on function public.record_ai_token_usage(integer, integer, text)
  from anon;
grant execute on function public.record_ai_token_usage(integer, integer, text)
  to authenticated;

revoke all on function public.get_ai_usage_snapshot() from public;
revoke all on function public.get_ai_usage_snapshot() from anon;
grant execute on function public.get_ai_usage_snapshot() to authenticated;

commit;