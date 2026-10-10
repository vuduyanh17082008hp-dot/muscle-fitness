-- One bounded counter row per user. No prompts or message content are stored.
create table if not exists public.dante_chat_rate_limits
(
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.dante_chat_rate_limits enable row level security;

revoke all on table public.dante_chat_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.dante_chat_rate_limits to service_role;

create or replace function public.check_dante_rate_limit(
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns table
(
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.dante_chat_rate_limits%rowtype;
  v_reset_at timestamptz;
begin
  if p_user_id is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS'
      using errcode = '22023';
  end if;

  insert into public.dante_chat_rate_limits
    (user_id, window_started_at, request_count, updated_at)
  values
    (p_user_id, v_now, 0, v_now)
  on conflict (user_id) do nothing;

  select *
    into v_row
  from public.dante_chat_rate_limits
  where user_id = p_user_id
  for update;

  -- Refresh after any wait on a concurrent row lock.
  v_now := clock_timestamp();
  v_reset_at := v_row.window_started_at + make_interval(secs => p_window_seconds);

  if v_reset_at <= v_now then
    update public.dante_chat_rate_limits
    set window_started_at = v_now,
        request_count = 1,
        updated_at = v_now
    where user_id = p_user_id;

    return query select true, p_limit - 1, p_window_seconds;
    return;
  end if;

  if v_row.request_count < p_limit then
    update public.dante_chat_rate_limits
    set request_count = request_count + 1,
        updated_at = v_now
    where user_id = p_user_id;

    return query
      select
        true,
        p_limit - (v_row.request_count + 1),
        greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
    return;
  end if;

  -- Rejected requests do not increment the accepted-request counter.
  return query
    select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

revoke all on function public.check_dante_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_dante_rate_limit(uuid, integer, integer)
  to service_role;
