begin;

-- =========================================================
-- REMOTE MIGRATION HISTORY BASELINE
-- Version: 20260805000000
-- =========================================================
--
-- Migration version 20260805000000 đã được Supabase remote
-- ghi nhận là "applied", nhưng file local tương ứng đã bị mất.
--
-- File này chỉ dùng để đồng bộ migration history giữa:
--
--   supabase/migrations
--
-- và:
--
--   supabase_migrations.schema_migrations
--
-- Không tạo, sửa hoặc xóa bảng nào.
-- Không chạy lại SQL không xác định trên production.
--
-- Những thay đổi database thực tế được quản lý bởi
-- các migration đầy đủ ở phía sau file này.

do $migration$
begin
  raise notice
    'Migration 20260805000000 is a local baseline placeholder for an existing remote migration.';
end;
$migration$;

commit;