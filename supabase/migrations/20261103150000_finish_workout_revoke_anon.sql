-- finish_workout raises for a null auth.uid() anyway; anon never needs it. Supabase default privileges
-- granted it on hosted (`revoke ... from public` in 20261011150000 does not remove a direct anon grant).
-- Same treatment 20261030120000 gives start_workout.
revoke execute on function public.finish_workout(uuid, text, numeric) from anon;
