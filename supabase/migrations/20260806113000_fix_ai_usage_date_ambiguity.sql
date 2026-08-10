begin;

-- =========================================================
-- FIX AI USAGE RPC AMBIGUITY
--
-- Lỗi cũ:
-- column reference "usage_date" is ambiguous
--
-- Nguyên nhân:
-- RETURNS TABLE tạo output variable tên usage_date,
-- trong khi ON CONFLICT cũng dùng cột usage_date.
--
-- Cách sửa:
-- 1. Không dùng conflict target có tên cột bị trùng.
-- 2. Dùng ON CONFLICT DO NOTHING.
-- 3. Qualification đầy đủ bằng table alias.
-- 4. Giữ việc tăng usage atomic và an toàn khi có
--    nhiều request chạy đồng thời.
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
as $function$
declare
  v_user_id uuid;
  v_usage_date date;
  v_plan_code text;
  v_daily_limit integer;
  v_messages_used integer;
begin
  -- =======================================================
  -- AUTHENTICATION
  -- =======================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- =======================================================
  -- THREAD OWNERSHIP
  -- =======================================================

  if p_thread_id is not null
    and not exists (
      select 1
      from public.ai_threads as thread_row
      where
        thread_row.id = p_thread_id
        and thread_row.user_id = v_user_id
    )
  then
    raise exception 'Thread not found';
  end if;

  -- =======================================================
  -- USER LOCAL DATE
  -- =======================================================

  v_usage_date :=
    public.ai_usage_date_for(v_user_id);

  -- =======================================================
  -- CURRENT ENTITLEMENT
  -- =======================================================

  select
    entitlement_row.plan_code,
    entitlement_row.daily_message_limit
  into
    v_plan_code,
    v_daily_limit
  from public.ai_entitlements as entitlement_row
  where
    entitlement_row.user_id = v_user_id
    and entitlement_row.active = true

    and (
      entitlement_row.starts_at is null
      or entitlement_row.starts_at <= now()
    )

    and (
      entitlement_row.ends_at is null
      or entitlement_row.ends_at > now()
    )
  order by
    entitlement_row.updated_at desc
  limit 1;

  -- Người chưa có subscription record dùng Free plan.
  v_plan_code :=
    coalesce(
      v_plan_code,
      'free'
    );

  v_daily_limit :=
    greatest(
      coalesce(
        v_daily_limit,
        10
      ),
      0
    );

  -- =======================================================
  -- ENSURE DAILY USAGE ROW EXISTS
  --
  -- Không dùng:
  -- ON CONFLICT (user_id, usage_date)
  --
  -- vì usage_date trùng với output variable của function.
  -- =======================================================

  insert into public.ai_usage_daily (
    user_id,
    usage_date,
    plan_code,
    messages_used,
    request_limit,
    input_tokens,
    output_tokens,
    total_tokens
  )
  values (
    v_user_id,
    v_usage_date,
    v_plan_code,
    0,
    v_daily_limit,
    0,
    0,
    0
  )
  on conflict do nothing;

  -- Luôn đồng bộ plan và limit mới nhất.
  update public.ai_usage_daily as usage_row
  set
    plan_code = v_plan_code,
    request_limit = v_daily_limit,
    updated_at = now()
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date;

  -- =======================================================
  -- ATOMIC USAGE INCREMENT
  --
  -- Chỉ tăng khi messages_used vẫn thấp hơn daily limit.
  -- UPDATE sẽ khóa đúng row nên tránh hai request cùng lúc
  -- vượt quá giới hạn.
  -- =======================================================

  update public.ai_usage_daily as usage_row
  set
    messages_used =
      usage_row.messages_used + 1,

    updated_at = now()
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date
    and usage_row.messages_used < v_daily_limit
  returning
    usage_row.messages_used
  into
    v_messages_used;

  -- UPDATE thành công nghĩa là request được phép chạy.
  if found then
    return query
    select
      true,
      v_usage_date,
      v_plan_code,
      v_messages_used,
      v_daily_limit,
      greatest(
        v_daily_limit - v_messages_used,
        0
      );

    return;
  end if;

  -- =======================================================
  -- LIMIT REACHED
  -- =======================================================

  select
    usage_row.messages_used
  into
    v_messages_used
  from public.ai_usage_daily as usage_row
  where
    usage_row.user_id = v_user_id
    and usage_row.usage_date = v_usage_date
  limit 1;

  v_messages_used :=
    coalesce(
      v_messages_used,
      0
    );

  return query
  select
    false,
    v_usage_date,
    v_plan_code,
    v_messages_used,
    v_daily_limit,
    0;
end;
$function$;

-- =========================================================
-- PERMISSIONS
-- =========================================================

revoke all
  on function public.consume_ai_usage(uuid)
  from public;

revoke all
  on function public.consume_ai_usage(uuid)
  from anon;

grant execute
  on function public.consume_ai_usage(uuid)
  to authenticated;

-- Reload function definition in Supabase/PostgREST.
notify pgrst, 'reload schema';

commit;