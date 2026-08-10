begin;

create extension if not exists pgcrypto;

-- =========================================================
-- AI COACH PREFLIGHT
--
-- Mục đích:
-- 1. Chuẩn hóa ai_threads đã tồn tại.
-- 2. Chuẩn hóa ai_messages đã tồn tại.
-- 3. Bổ sung các cột mà migration cũ còn thiếu.
-- 4. Cho phép migration 20260806093000 chạy tiếp an toàn.
-- =========================================================

-- =========================================================
-- AI THREADS
-- =========================================================

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),

  user_id uuid,

  title text not null default 'New conversation',

  thread_type text not null default 'chat',

  status text not null default 'active',

  last_message_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

alter table public.ai_threads
  add column if not exists user_id uuid;

alter table public.ai_threads
  add column if not exists title text
  default 'New conversation';

alter table public.ai_threads
  add column if not exists thread_type text
  default 'chat';

alter table public.ai_threads
  add column if not exists status text
  default 'active';

alter table public.ai_threads
  add column if not exists last_message_at timestamptz;

alter table public.ai_threads
  add column if not exists created_at timestamptz
  default now();

alter table public.ai_threads
  add column if not exists updated_at timestamptz
  default now();

-- Backfill dữ liệu cũ nếu có.
update public.ai_threads
set
  title = coalesce(
    nullif(trim(title), ''),
    'New conversation'
  ),
  thread_type = coalesce(
    nullif(trim(thread_type), ''),
    'chat'
  ),
  status = coalesce(
    nullif(trim(status), ''),
    'active'
  ),
  created_at = coalesce(
    created_at,
    now()
  ),
  updated_at = coalesce(
    updated_at,
    now()
  );

alter table public.ai_threads
  alter column title
  set default 'New conversation';

alter table public.ai_threads
  alter column thread_type
  set default 'chat';

alter table public.ai_threads
  alter column status
  set default 'active';

alter table public.ai_threads
  alter column created_at
  set default now();

alter table public.ai_threads
  alter column updated_at
  set default now();

-- Thêm foreign key nếu bảng cũ chưa có.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where
      conrelid = 'public.ai_threads'::regclass
      and conname = 'ai_threads_user_id_fkey'
  ) then
    alter table public.ai_threads
      add constraint ai_threads_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

-- Chỉ tạo index sau khi đã chắc chắn cột tồn tại.
create index if not exists ai_threads_user_last_message_idx
  on public.ai_threads (
    user_id,
    last_message_at desc
  );

create index if not exists ai_threads_user_type_idx
  on public.ai_threads (
    user_id,
    thread_type
  );

create index if not exists ai_threads_user_status_idx
  on public.ai_threads (
    user_id,
    status
  );

-- =========================================================
-- AI MESSAGES
-- =========================================================

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),

  thread_id uuid,

  user_id uuid,

  role text not null default 'user',

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

alter table public.ai_messages
  add column if not exists thread_id uuid;

alter table public.ai_messages
  add column if not exists user_id uuid;

alter table public.ai_messages
  add column if not exists role text
  default 'user';

alter table public.ai_messages
  add column if not exists content text
  default '';

alter table public.ai_messages
  add column if not exists attachments jsonb
  default '[]'::jsonb;

alter table public.ai_messages
  add column if not exists tool_calls jsonb
  default '[]'::jsonb;

alter table public.ai_messages
  add column if not exists metadata jsonb
  default '{}'::jsonb;

alter table public.ai_messages
  add column if not exists openai_response_id text;

alter table public.ai_messages
  add column if not exists model text;

alter table public.ai_messages
  add column if not exists input_tokens integer
  default 0;

alter table public.ai_messages
  add column if not exists output_tokens integer
  default 0;

alter table public.ai_messages
  add column if not exists total_tokens integer
  default 0;

alter table public.ai_messages
  add column if not exists created_at timestamptz
  default now();

-- Backfill các row cũ.
update public.ai_messages
set
  role = coalesce(
    nullif(trim(role), ''),
    'user'
  ),
  content = coalesce(
    content,
    ''
  ),
  attachments = coalesce(
    attachments,
    '[]'::jsonb
  ),
  tool_calls = coalesce(
    tool_calls,
    '[]'::jsonb
  ),
  metadata = coalesce(
    metadata,
    '{}'::jsonb
  ),
  input_tokens = greatest(
    coalesce(input_tokens, 0),
    0
  ),
  output_tokens = greatest(
    coalesce(output_tokens, 0),
    0
  ),
  total_tokens = greatest(
    coalesce(total_tokens, 0),
    0
  ),
  created_at = coalesce(
    created_at,
    now()
  );

alter table public.ai_messages
  alter column role
  set default 'user';

alter table public.ai_messages
  alter column content
  set default '';

alter table public.ai_messages
  alter column attachments
  set default '[]'::jsonb;

alter table public.ai_messages
  alter column tool_calls
  set default '[]'::jsonb;

alter table public.ai_messages
  alter column metadata
  set default '{}'::jsonb;

alter table public.ai_messages
  alter column input_tokens
  set default 0;

alter table public.ai_messages
  alter column output_tokens
  set default 0;

alter table public.ai_messages
  alter column total_tokens
  set default 0;

alter table public.ai_messages
  alter column created_at
  set default now();

-- Foreign key tới thread.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where
      conrelid = 'public.ai_messages'::regclass
      and conname = 'ai_messages_thread_id_fkey'
  ) then
    alter table public.ai_messages
      add constraint ai_messages_thread_id_fkey
      foreign key (thread_id)
      references public.ai_threads(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

-- Foreign key tới authenticated user.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where
      conrelid = 'public.ai_messages'::regclass
      and conname = 'ai_messages_user_id_fkey'
  ) then
    alter table public.ai_messages
      add constraint ai_messages_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

create index if not exists ai_messages_thread_created_idx
  on public.ai_messages (
    thread_id,
    created_at
  );

create index if not exists ai_messages_user_created_idx
  on public.ai_messages (
    user_id,
    created_at desc
  );

create index if not exists ai_messages_metadata_gin_idx
  on public.ai_messages
  using gin (metadata);

-- =========================================================
-- BASIC RLS PREPARATION
--
-- Migration chính 20260806093000 sẽ tạo lại đầy đủ policy.
-- =========================================================

alter table public.ai_threads
  enable row level security;

alter table public.ai_messages
  enable row level security;

grant usage on schema public
  to authenticated, service_role;

grant select, insert, update, delete
  on table public.ai_threads
  to authenticated;

grant select, insert, delete
  on table public.ai_messages
  to authenticated;

grant all privileges
  on table
    public.ai_threads,
    public.ai_messages
  to service_role;

-- Reload PostgREST sau khi migration chính hoàn thành.
notify pgrst, 'reload schema';

commit;