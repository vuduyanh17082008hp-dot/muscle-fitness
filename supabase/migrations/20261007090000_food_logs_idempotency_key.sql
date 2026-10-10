-- Request idempotency for food_logs creates.
-- Existing rows stay NULL (Postgres UNIQUE allows multiple NULLs).
-- New writes require a key at the application layer.

alter table public.food_logs
  add column if not exists idempotency_key uuid;

create unique index if not exists food_logs_user_idempotency_key_uidx
  on public.food_logs (user_id, idempotency_key)
  where idempotency_key is not null;
