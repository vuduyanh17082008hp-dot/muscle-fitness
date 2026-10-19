-- DB-02-01: atomic account save.
--
-- Account identity fields (full_name, username, phone, date_of_birth, gender, timezone) live on
-- public.profiles; fitness fields (height_cm, weight_kg, goal) live on public.fitness_profiles.
-- One function = one transaction, so both writes commit together or neither does.
-- SECURITY INVOKER: RLS applies to both writes; the actor is auth.uid(), never a client user id.
-- A fitness_profiles row is only created when a fitness value is actually supplied, so saving
-- identity fields never fabricates an empty fitness profile.

create or replace function public.save_account_profile(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_height numeric := (p_payload ->> 'height_cm')::numeric;
  v_weight numeric := (p_payload ->> 'weight_kg')::numeric;
  v_goal public.fitness_goal := (p_payload ->> 'goal')::public.fitness_goal;
begin
  if v_user is null then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'INVALID_PAYLOAD' using errcode = '22023';
  end if;

  insert into public.profiles (
    user_id, email, full_name, username, phone, date_of_birth, gender, timezone
  ) values (
    v_user, v_email, p_payload ->> 'full_name', p_payload ->> 'username', p_payload ->> 'phone',
    (p_payload ->> 'date_of_birth')::date, (p_payload ->> 'gender')::public.gender_type,
    p_payload ->> 'timezone'
  )
  on conflict (user_id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = excluded.full_name,
    username = excluded.username,
    phone = excluded.phone,
    date_of_birth = excluded.date_of_birth,
    gender = excluded.gender,
    timezone = excluded.timezone;

  if v_height is not null or v_weight is not null or v_goal is not null
     or exists (select 1 from public.fitness_profiles where user_id = v_user) then
    insert into public.fitness_profiles (user_id, height_cm, weight_kg, goal)
    values (v_user, v_height, v_weight, v_goal)
    on conflict (user_id) do update set
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      goal = excluded.goal;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_account_profile(jsonb) from public, anon;
grant execute on function public.save_account_profile(jsonb) to authenticated;

notify pgrst, 'reload schema';
