# Muscle Fitness V2 — Phase 1

## Goal

Additive database foundation for roles, entitlements, audit logs, and RLS-protected skeleton tables. No product AI/billing/CRM UI in this phase.

## Branch

`feature/muscle-fitness-v2`

## Migrations (apply in order)

1. `supabase/migrations/20260805180000_v2_role_values.sql`
2. `supabase/migrations/20260805180050_v2_normalize_role_columns.sql`
3. `supabase/migrations/20260805180100_v2_database_foundation.sql`

## Do not apply

- `supabase/examples/DO_NOT_APPLY_fix_auth_profiles.sql.example`  
  Uses incompatible `profiles.id` assumptions against the foundation `profiles.user_id` primary key.

## Server modules

- `lib/auth/roles.ts`
- `lib/auth/permissions.ts`
- `lib/auth/profile.ts` (syncs on `user_id`)
- `lib/auth/current-account.ts`
- `lib/entitlements/server.ts`
- `lib/audit/log.ts`

## Validation

```bash
npm run type-check
npm run lint
npm run build
```

Then run `supabase/tests/v2_phase_1_smoke_test.sql` in the Supabase SQL editor after migrations.

## Rollback

1. Keep Preview deployment disabled / unmerged.
2. Do not DROP production tables in panic.
3. Revoke execute on `has_entitlement` / `write_audit_log` if needed.
4. Revert the feature branch.
