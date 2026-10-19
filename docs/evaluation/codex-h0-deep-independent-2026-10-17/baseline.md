# Baseline

- Start: 2026-10-17 (Asia/Singapore; exact start noted in the run session).
- Repository: `C:\Dev\Projects\muscle-fitness-claude`
- Branch / HEAD: `main` / `62084744aba6d44add9e64831912abef32838bef`
- Canonical start fingerprint: `1e99979574363a9fa2aee8a4bd0a63aafdec9b0f29852ff5f0de8e3e21749cfa` (`1616 files`); manifest `--check` PASS.
- Manifest candidate: UNCOMMITTED; 176 tracked modified, 286 untracked at generation (including its own manifest).
- Rubric: `h0-release-rubric.md`, SHA-256 `68f883bdb5d8cb488efa1a442e06b12f1af7c85bd2c089a67573db8298db77f2`.
- PostgREST pin/container: `v14.18` / `public.ecr.aws/supabase/postgrest:v14.18`; guard PASS.
- Local migration ledger: independently queried all 53 entries; exact latest `20261012100000`; manifest reports 53/53 parity.
- Local app: `http://localhost:3000`, authenticated route returned HTTP 200 in live probe. Local stack only; hosted Supabase not accessed.
- Configured model: `gpt-4o-mini` alias; provider snapshot not pinned. Live probe used model field recorded in raw transcript.
- Resource check: no Vitest/build runner. Existing Next dev server, Docker Desktop and browser MCP processes were present; none were stopped. Max behavioral concurrency: 2 in initial probe.
- Existing evaluation output is excluded from canonical fingerprint under `docs/evaluation/`; this run writes only beneath its own directory.

## Initial harness issue

The first runner call did not create the output directory. One seeded duplicate-confirm fixture ran but was rejected because its argument object used legacy snake_case fields instead of the current strict camelCase schema. Read-back showed action status `failed`, result `Stored arguments failed validation`, and zero food rows. This is a harness-fixture error, not candidate evidence; it is excluded from scenario scoring. The fixture was corrected to the current tool contract and rerun successfully.
