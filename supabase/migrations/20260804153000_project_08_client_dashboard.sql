-- ============================================================
-- MUSCLE FITNESS — PROJECT 08: CLIENT DASHBOARD
-- ============================================================
-- Chạy sau Project 06 Database và Project 07 Onboarding.
--
-- Migration này tạo:
-- 1. Daily client metrics.
-- 2. Body-weight entries.
-- 3. Workout sessions.
-- 4. Coach messages.
-- 5. RLS policies.
-- 6. RPC get_client_dashboard().
-- ============================================================

begin;

-- ============================================================
-- 1. BỔ SUNG TARGET CHO FITNESS PROFILE
-- ============================================================

alter table public.fitness_profiles
  add column if not exists water_target_ml integer not null default 2500,
  add column if not exists step_target integer not null default 8000;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_water_target_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_water_target_check
      check (water_target_ml between 500 and 10000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_step_target_check'
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_step_target_check
      check (step_target between 500 and 100000);
  end if;
end;
$$;

-- ============================================================
-- 2. HÀM UPDATED_AT DÙNG CHUNG
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 3. DAILY CLIENT METRICS
-- Mỗi user có tối đa một row cho mỗi ngày.
-- ============================================================

create table if not exists public.daily_client_metrics (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  metric_date date not null,

  calories_consumed integer not null default 0,
  protein_consumed_g numeric(7, 1) not null default 0,
  water_ml integer not null default 0,
  steps integer not null default 0,

  sleep_hours numeric(4, 1),
  energy_level smallint,
  soreness_level smallint,
  stress_level smallint,

  workout_completed boolean not null default false,

  recovery_score smallint,
  adherence_score smallint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_client_metrics_user_date_key
    unique (user_id, metric_date),

  constraint daily_client_metrics_calories_check
    check (calories_consumed between 0 and 20000),

  constraint daily_client_metrics_protein_check
    check (protein_consumed_g between 0 and 1000),

  constraint daily_client_metrics_water_check
    check (water_ml between 0 and 20000),

  constraint daily_client_metrics_steps_check
    check (steps between 0 and 200000),

  constraint daily_client_metrics_sleep_check
    check (
      sleep_hours is null
      or sleep_hours between 0 and 24
    ),

  constraint daily_client_metrics_energy_check
    check (
      energy_level is null
      or energy_level between 1 and 10
    ),

  constraint daily_client_metrics_soreness_check
    check (
      soreness_level is null
      or soreness_level between 1 and 10
    ),

  constraint daily_client_metrics_stress_check
    check (
      stress_level is null
      or stress_level between 1 and 10
    ),

  constraint daily_client_metrics_recovery_check
    check (
      recovery_score is null
      or recovery_score between 0 and 100
    ),

  constraint daily_client_metrics_adherence_check
    check (
      adherence_score is null
      or adherence_score between 0 and 100
    )
);

create index if not exists daily_client_metrics_user_date_idx
  on public.daily_client_metrics(user_id, metric_date desc);

drop trigger if exists daily_client_metrics_set_updated_at
  on public.daily_client_metrics;

create trigger daily_client_metrics_set_updated_at
before update on public.daily_client_metrics
for each row
execute function public.set_updated_at();

-- ============================================================
-- 4. BODY WEIGHT ENTRIES
-- ============================================================

create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  logged_on date not null,
  weight_kg numeric(6, 2) not null,

  source text not null default 'manual',
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint body_weight_entries_user_date_key
    unique (user_id, logged_on),

  constraint body_weight_entries_weight_check
    check (weight_kg between 20 and 500),

  constraint body_weight_entries_source_check
    check (
      source in (
        'manual',
        'onboarding',
        'check_in',
        'import'
      )
    )
);

create index if not exists body_weight_entries_user_date_idx
  on public.body_weight_entries(user_id, logged_on desc);

drop trigger if exists body_weight_entries_set_updated_at
  on public.body_weight_entries;

create trigger body_weight_entries_set_updated_at
before update on public.body_weight_entries
for each row
execute function public.set_updated_at();

-- Tạo entry cân nặng đầu tiên từ onboarding nếu đã có.
insert into public.body_weight_entries (
  user_id,
  logged_on,
  weight_kg,
  source
)
select
  fp.user_id,
  coalesce(
    p.onboarding_completed_at::date,
    current_date
  ),
  fp.current_weight_kg,
  'onboarding'
from public.fitness_profiles fp
join public.profiles p
  on p.user_id = fp.user_id
where fp.current_weight_kg is not null
on conflict (user_id, logged_on) do nothing;

-- ============================================================
-- 5. WORKOUT SESSIONS
-- Project 09 có thể tiếp tục mở rộng bảng này.
-- ============================================================

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  scheduled_date date not null,
  start_time time,

  title text not null,
  focus text,
  duration_minutes smallint,

  status text not null default 'scheduled',
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_sessions_title_check
    check (
      char_length(btrim(title)) between 1 and 160
    ),

  constraint workout_sessions_duration_check
    check (
      duration_minutes is null
      or duration_minutes between 5 and 480
    ),

  constraint workout_sessions_status_check
    check (
      status in (
        'scheduled',
        'in_progress',
        'completed',
        'skipped'
      )
    )
);

create index if not exists workout_sessions_user_schedule_idx
  on public.workout_sessions(
    user_id,
    scheduled_date desc,
    start_time
  );

drop trigger if exists workout_sessions_set_updated_at
  on public.workout_sessions;

create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

-- ============================================================
-- 6. COACH MESSAGES
-- Project Messages có thể mở rộng bảng này sau.
-- ============================================================

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),

  client_user_id uuid not null
    references auth.users(id)
    on delete cascade,

  sender_user_id uuid
    references auth.users(id)
    on delete set null,

  sender_role text not null,
  sender_name text,

  body text not null,
  read_at timestamptz,

  created_at timestamptz not null default now(),

  constraint coach_messages_sender_role_check
    check (
      sender_role in (
        'client',
        'coach',
        'system'
      )
    ),

  constraint coach_messages_body_check
    check (
      char_length(btrim(body)) between 1 and 5000
    )
);

create index if not exists coach_messages_client_created_idx
  on public.coach_messages(
    client_user_id,
    created_at desc
  );

-- ============================================================
-- 7. QUYỀN VÀ RLS
-- ============================================================

revoke all
on table public.daily_client_metrics
from anon, authenticated;

revoke all
on table public.body_weight_entries
from anon, authenticated;

revoke all
on table public.workout_sessions
from anon, authenticated;

revoke all
on table public.coach_messages
from anon, authenticated;

grant select, insert, update, delete
on table public.daily_client_metrics
to authenticated;

grant select, insert, update, delete
on table public.body_weight_entries
to authenticated;

grant select, insert, update, delete
on table public.workout_sessions
to authenticated;

grant select, insert
on table public.coach_messages
to authenticated;

alter table public.daily_client_metrics
  enable row level security;

alter table public.body_weight_entries
  enable row level security;

alter table public.workout_sessions
  enable row level security;

alter table public.coach_messages
  enable row level security;

-- ============================================================
-- DAILY METRICS POLICIES
-- ============================================================

drop policy if exists daily_client_metrics_select_own
  on public.daily_client_metrics;

drop policy if exists daily_client_metrics_insert_own
  on public.daily_client_metrics;

drop policy if exists daily_client_metrics_update_own
  on public.daily_client_metrics;

drop policy if exists daily_client_metrics_delete_own
  on public.daily_client_metrics;

create policy daily_client_metrics_select_own
on public.daily_client_metrics
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy daily_client_metrics_insert_own
on public.daily_client_metrics
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

create policy daily_client_metrics_update_own
on public.daily_client_metrics
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy daily_client_metrics_delete_own
on public.daily_client_metrics
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

-- ============================================================
-- BODY WEIGHT POLICIES
-- ============================================================

drop policy if exists body_weight_entries_select_own
  on public.body_weight_entries;

drop policy if exists body_weight_entries_insert_own
  on public.body_weight_entries;

drop policy if exists body_weight_entries_update_own
  on public.body_weight_entries;

drop policy if exists body_weight_entries_delete_own
  on public.body_weight_entries;

create policy body_weight_entries_select_own
on public.body_weight_entries
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy body_weight_entries_insert_own
on public.body_weight_entries
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

create policy body_weight_entries_update_own
on public.body_weight_entries
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy body_weight_entries_delete_own
on public.body_weight_entries
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

-- ============================================================
-- WORKOUT SESSION POLICIES
-- ============================================================

drop policy if exists workout_sessions_select_own
  on public.workout_sessions;

drop policy if exists workout_sessions_insert_own
  on public.workout_sessions;

drop policy if exists workout_sessions_update_own
  on public.workout_sessions;

drop policy if exists workout_sessions_delete_own
  on public.workout_sessions;

create policy workout_sessions_select_own
on public.workout_sessions
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy workout_sessions_insert_own
on public.workout_sessions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

create policy workout_sessions_update_own
on public.workout_sessions
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy workout_sessions_delete_own
on public.workout_sessions
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

-- ============================================================
-- COACH MESSAGE POLICIES
-- ============================================================

drop policy if exists coach_messages_select_own
  on public.coach_messages;

drop policy if exists coach_messages_insert_client
  on public.coach_messages;

create policy coach_messages_select_own
on public.coach_messages
for select
to authenticated
using (
  client_user_id = (select auth.uid())
);

create policy coach_messages_insert_client
on public.coach_messages
for insert
to authenticated
with check (
  client_user_id = (select auth.uid())
  and sender_user_id = (select auth.uid())
  and sender_role = 'client'
);

-- ============================================================
-- 8. RPC: LẤY TOÀN BỘ DASHBOARD BẰNG MỘT REQUEST
-- Không nhận user_id từ browser.
-- User luôn được xác định bằng auth.uid().
-- ============================================================

create or replace function public.get_client_dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with user_context as (
    select
      p.user_id,
      p.full_name,
      p.timezone,
      coalesce(
        p.onboarding_completed,
        false
      ) as onboarding_completed,

      fp.goal,
      fp.current_weight_kg,
      fp.target_weight_kg,

      fp.calorie_target,
      fp.protein_target_g,
      fp.carb_target_g,
      fp.fat_target_g,

      fp.water_target_ml,
      fp.step_target

    from public.profiles p

    left join public.fitness_profiles fp
      on fp.user_id = p.user_id

    where p.user_id = (select auth.uid())
  ),

  dashboard_context as (
    select
      u.*,

      (
        now()
        at time zone coalesce(
          nullif(u.timezone, ''),
          'UTC'
        )
      )::date as dashboard_date

    from user_context u
  )

  select jsonb_build_object(
    'dashboardDate',
    c.dashboard_date,

    'profile',
    jsonb_build_object(
      'fullName',
      c.full_name,

      'timezone',
      coalesce(
        nullif(c.timezone, ''),
        'UTC'
      ),

      'onboardingCompleted',
      c.onboarding_completed
    ),

    'fitness',
    jsonb_build_object(
      'goal',
      c.goal,

      'currentWeightKg',
      c.current_weight_kg,

      'targetWeightKg',
      c.target_weight_kg,

      'calorieTarget',
      c.calorie_target,

      'proteinTargetG',
      c.protein_target_g,

      'carbTargetG',
      c.carb_target_g,

      'fatTargetG',
      c.fat_target_g,

      'waterTargetMl',
      c.water_target_ml,

      'stepTarget',
      c.step_target
    ),

    'todayMetrics',
    (
      select jsonb_build_object(
        'caloriesConsumed',
        d.calories_consumed,

        'proteinConsumedG',
        d.protein_consumed_g,

        'waterMl',
        d.water_ml,

        'steps',
        d.steps,

        'sleepHours',
        d.sleep_hours,

        'energyLevel',
        d.energy_level,

        'sorenessLevel',
        d.soreness_level,

        'stressLevel',
        d.stress_level,

        'workoutCompleted',
        d.workout_completed,

        'recoveryScore',
        d.recovery_score,

        'adherenceScore',
        d.adherence_score
      )

      from public.daily_client_metrics d

      where d.user_id = c.user_id
        and d.metric_date = c.dashboard_date
    ),

    'todayWorkouts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            w.id,

            'title',
            w.title,

            'focus',
            w.focus,

            'startTime',
            w.start_time,

            'durationMinutes',
            w.duration_minutes,

            'status',
            w.status
          )

          order by
            w.start_time nulls last,
            w.created_at
        )

        from public.workout_sessions w

        where w.user_id = c.user_id
          and w.scheduled_date = c.dashboard_date
      ),

      '[]'::jsonb
    ),

    'weightTrend',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date',
            weights.logged_on,

            'weightKg',
            weights.weight_kg
          )

          order by weights.logged_on
        )

        from (
          select
            b.logged_on,
            b.weight_kg

          from public.body_weight_entries b

          where b.user_id = c.user_id

          order by b.logged_on desc

          limit 12
        ) weights
      ),

      '[]'::jsonb
    ),

    'weeklyAdherence',
    (
      select
        round(avg(d.adherence_score))::integer

      from public.daily_client_metrics d

      where d.user_id = c.user_id
        and d.metric_date between
          (c.dashboard_date - 6)
          and c.dashboard_date
        and d.adherence_score is not null
    ),

    'coachMessage',
    (
      select jsonb_build_object(
        'id',
        m.id,

        'senderName',
        m.sender_name,

        'senderRole',
        m.sender_role,

        'body',
        m.body,

        'createdAt',
        m.created_at,

        'isRead',
        m.read_at is not null
      )

      from public.coach_messages m

      where m.client_user_id = c.user_id
        and m.sender_role in (
          'coach',
          'system'
        )

      order by m.created_at desc

      limit 1
    )
  )

  from dashboard_context c;
$$;

revoke all
on function public.get_client_dashboard()
from public;

grant execute
on function public.get_client_dashboard()
to authenticated;

commit;