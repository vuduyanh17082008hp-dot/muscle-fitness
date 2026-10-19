# MUSCLE FITNESS — HACKATHON PRODUCT REPAIR REPORT (2026-10-18)

Implementer report (not an independent audit). Evidence root: this directory. All data synthetic, local Supabase stack only.

## BASELINE
| Item | Value |
|---|---|
| Repo / branch | `C:\Dev\Projects\muscle-fitness-claude` / `video/one-day-in-the-life` |
| HEAD | `62084744aba6d44add9e64831912abef32838bef` (unchanged; nothing committed) |
| Initial fingerprint | `0ba068dd4ca62781f910c5379aa9759076c135fb687eb5dbac3931f53ed16f1c` (1616 files) — matched the audit |
| Final fingerprint A / B | `5bd4716be04513757a158f7900ad2da0d1d7345e2251b65b2f318757ac429dd2` (1626 files) — A == B |
| Manifest `--check` | PASS (fingerprint + rubric), migration parity true |
| Changed files | `changed-files.txt` (10 added, 42 modified vs `snapshot-START.json`) |
| Worktree | uncommitted (as instructed); no stash/reset/commit/push/deploy; hosted Supabase untouched |
| Local DB change | migration `20261018120000_start_workout_begins_planned_session.sql` applied to the local stack via `supabase migration up --local` (history row recorded). **Hosted: not applied — review before running.** |

## AUDIT FINDINGS LEDGER (F-01 … F-22)
| ID | Orig sev | Root cause (verified) | Status | Current sev |
|---|---|---|---|---|
| F-01 allergen cards/log | P0 | Chat disclosure lived only in Gemma prompt + `coach_signals` read by chat; `loadCoachContext`/`loadNutritionContext` (cards, drafts, plan, budget, propose, confirm) used stored prefs only. **Also found:** plan engine `isBlocked` was name-substring → a stored "fish" allergy never removed Salmon/Cod; "seafood like salmon and cod" extracted as shellfish only; Gemma fish-oil answer ignored a Dante-disclosed allergy; cards stayed clickable during the disclosing turn | FIXED | — |
| F-02 Apply 404 | P0 | (1) MAC over JS key order vs jsonb order (audit); **(2) found:** apply-side `loadSession` hard-coded `planUpdatedAt: null` → every apply = STALE_PLAN 409; **(3) found:** `start_workout` cloned a fresh session from the template, discarding the applied 3→2 | FIXED | — |
| F-03 false "why" | P1 | LLM answered the premise; no state lookup | FIXED (deterministic, from mutation/proposal rows) | — |
| F-04 seeded Start dead-end | P1 | `not_started` row rendered read-only; RPC ignored it | FIXED (RPC begins planned row; Start control on page) | — |
| F-05 planned day = rest day | P1 | dashboard knew only session rows | FIXED (plan weekday / flexible rotation → 1-tap Start; workouts CTA "Start from your plan") | — |
| F-06 offline crash/data loss | P1 | server actions threw inside `startTransition` → error boundary | FIXED (durable pending queue, idempotent resend, honest status) | — |
| F-07 contradictory states / raw internals | P2 | multiple decision sources; raw enums/decimals | PARTIAL: raw enums humanised, decimals rounded; brief-vs-recovery-page single decision source NOT done | P2 |
| F-08 targets not prefilled | P2 | — | DEFERRED | P2 |
| F-09 local dish search | P2 | — | DEFERRED | P2 |
| F-10 Gemma log needs refresh | P2 | no revalidation after confirm | FIXED (router.refresh + context re-read) | — |
| F-11 seed realism | P3 | `40 + index*8` loads | FIXED (per-exercise plausible loads) | — |
| F-12 a11y | P2 | unnamed sliders/inputs/buttons, no live region | PARTIAL: check-in sliders, player set inputs and complete-set buttons named; player messages `role=status`. Contrast/touch-target/nested-main NOT done; axe not re-run | P2 |
| F-13 dev instability | P2 | env (dev server ~2.2 GB, ~0.8 GB free RAM) | NOT A CODE FIX — still observed; mitigated in harness (fresh server per journey, recorded env reloads) | P2 (demo risk) |
| F-14 pre-hydration login | P3 | native submit before handler attached | FIXED (submit disabled until hydrated) | — |
| F-15 docs drift | P3 | CLAUDE.md stale | FIXED | — |
| F-16 pending proposal lost | P1 | chat state in memory only | FIXED (`GET /api/dante/tools/pending` + rehydration in DanteChat) | — |
| F-17 low intake Gemma→Dante | P1 | Gemma never published disclosures; Dante never read signals | FIXED (bidirectional `coach_signals` disclosures, withdrawal on retraction, merged into both coaches' working sets) | — |
| F-18 weight correction scope | P2 | — | DEFERRED (honestly scoped today) | P2 |
| F-19 coach bounce | P2 | — | DEFERRED (only "why did you change" now answered from state) | P2 |
| F-20 nav latency | P2 | — | DEFERRED | P2 |
| F-21 failed request clears input | P3 | — | FIXED (message restored to composer; never auto-resent) | — |
| F-22 concept film | P2 | film shows unbuilt features | REPORTED (video untouched) — see Demo truth | P2 |
| NEW-1 mobile "Complete workout" covered by bottom nav | (P1, found here) | player bar `fixed bottom-0 z-30` under nav `z-30` | FIXED (offset above nav, padding clear of FABs) | — |
| NEW-2 second stacked adjustment | (P1, found here) | after Apply the page re-offered Adjust (2→1) | FIXED (one adjustment per session, enforced server-side + UI applied state) | — |
| NEW-3 Apply error hidden behind modal | (P3, audit note) | — | FIXED | — |

## WHAT CHANGED (by root contract)
- **One shared safety-context store, no new store:** `coach_signals` `USER_DISCLOSED_*` now published by Dante *and* Gemma (`syncDisclosureSignals`), target NUTRITION+TRAINING, allergy valid 90 d / other 24 h, **withdrawn** on retraction (`retractedSafetyKeys`; third-party and questions never retract). Read fail-closed in `loadNutritionContext` (→ cards, drafts, plan, budget, shopping list, coach log propose, confirmed write, Dante nutrition tools) and merged into both coaches' working sets (`withDisclosedFacts`), so the existing policy/output-integrity layers apply. Extractor fixes: seafood, third-party clause.
- **Apply:** canonical key-sorted MAC; plan version inputs aligned; one adjustment per session; `start_workout` begins the planned row (its adjusted prescription survives Start).
- **Truthful why:** `lib/recovery/adjustment-status.ts` (APPLIED / PENDING / NONE / can't check) wired before any LLM.
- **Continuity:** pending Dante proposals rehydrate; offline set queue (localStorage → resend on `online`/load → "synced" only on server success).

## VERIFICATION (pre-freeze development evidence, repeated)
| Check | Result | Evidence |
|---|---|---|
| Apply browser (fresh users) | 3→2 in DB + UI, 200; revisit shows applied, no second Adjust | `journeys/scene1-apply/adj-r2c*`, `journeys/day/*` |
| Seeded Start → player, adjusted prescription kept | same row, in_progress, 10 sets (2×5) | `journeys/scene2-gym/start-r1*` |
| Fish allergy cards (browser) | 0 fish cards in 3/3 browser reps (+2 day journeys) | `H1-truth/xcoach-fish/fish-r1..r3`, `journeys/day/day-desktop6`, `day-mobile4` |
| Fish/allergy API reps | cards fish-free 8/8 valid (EN, VI, Gemma-disclosed, Dante-disclosed, seafood); fish-oil refused with algae alternative | `H1-truth/xcoach-fish/fish-api-*` |
| Stale card + direct endpoints | pre-disclosure pending log → confirm 422 ACTION_FORBIDDEN, 0 rows; re-propose 422 BLOCKED_INGREDIENT; picker blocks tuna/white fish | `H1-truth/stale-card/` |
| Counterfactuals | negation withdraws; retraction cross-coach withdraws; third-party ("my sister…") — defect found & fixed | `H1-truth/counterfactual/` |
| Whole nutrition page | plan "substituted or removed: Salmon"; no fish anywhere; picker hides Fish/Tuna | `H1-truth/nutrition-scan/` |
| F-17 low intake | Gemma→Dante cites intake 4/4 valid (EN×3, VI×1); Dante→Gemma 1/1; retraction stops it 1/1; unrelated (biceps) answers then caveats | `H1-truth/xcoach-lowcal/` |
| F-03 why | APPLIED / PENDING (EN+VI) / NONE all state-faithful | `journeys/scene5-why/` |
| F-16 pending | card after navigation + refresh; confirm → exactly +1 row; no stale card after | `H2-continuity/` |
| F-06 offline | no crash; values kept; honest offline + "1 set not synced"; reconnect "synced" → 1 row; reload-after-reconnect restores and syncs once | `journeys/scene2-gym/offline-r1*` |
| F-05 planned day | "TODAY'S TRAINING · not started yet" → 1 tap → player 2.9 s | `journeys/scene2-gym/planned-r1*` |
| Five-scene day | desktop PASS (day-desktop6), mobile PASS (day-mobile4) | `journeys/day/` |
| Tenant boundary | as user A: 0 other-user rows in coach_signals, dante_tool_actions, workout_mutation_records, workout_sessions; recovery_workout_proposals not granted to users; coach-signal DB test 26/26 (incl. RLS) | transcript |

## FINAL CANDIDATE GATES (fingerprint 5bd4716b…)
| Gate | Result |
|---|---|
| Freeze A / B / C | `5bd4716b…` = `5bd4716b…` = `5bd4716b…` (HEAD unchanged) |
| type-check | PASS |
| lint | 0 errors, 93 warnings — none in any changed file (all pre-existing) |
| Full Vitest (sequential, canonical) | 355 files / **4980 passed**, 0 failed, 209 opt-in skipped |
| coach_signals DB test (real local DB, incl. RLS) | 26/26 |
| Scratch production build (`next build --webpack`, HTTPS placeholder env) | PASS (`scratch-build.log`) |
| Manifest `--check` | PASS, migration parity true |
| Browser runs on the exact frozen source (no edits after them) | `day-mobile4` five scenes PASS; `planned-r1` PASS; final-batch `f-day-desktop` scene 1 PASS |
| **Final regression batch (`final.sh`)** | **INTERRUPTED** — Claude Code killed it for critically low system memory after scene 1 (dev server ≈2.2 GB, ≈0.8 GB free RAM; other user apps resident). Not restarted, per the memory guard. |

Everything else in VERIFICATION ran on candidates whose code for that path is identical to the frozen one, except UI-only changes made later
(player button names/bar position, DanteChat turn event + input restore, nutrition panel stale-card state). By the rule "do not reuse old
candidate PASS evidence", those must be rerun on `5bd4716b…`: `sh <scratchpad>/final.sh` (sequential, one runner, fresh dev server, ~25 min, nothing else running).

## DEMO VIDEO TRUTH (output/one-day/muscle-fitness-one-day.mp4 — not modified)
| Film scene | Live now? |
|---|---|
| Morning readiness, "reduce volume?" proposal, Apply → plan changes | **Live** (copy differs: "Today's plan is updated.", 3→2 sets, not "−25%") |
| Gym: log set; offline "Saved offline" → "Synced" | **Live, different copy** ("You're offline — … kept on this device" / "Back online — synced") |
| Post-workout "+20.8 g protein", "Add rice to close the carb gap?" | **Concept only** (no post-workout nutrition prompt) |
| "Why this adjustment?" showing signals | **Live as Dante chat answer** (state-faithful), not an in-card panel |
| Undo → "Reverted ✓" | **Concept only — no undo exists** |
Use the film only as a labelled concept; a real-product recording of the five live scenes is needed for any "this is the app" claim.

## OPEN LIMITATIONS
- P2: F-07 single decision source (dashboard brief vs recovery page), F-08 prefill, F-09 dish search, F-12 contrast/touch targets/nested main (axe not re-run), F-18, F-19, F-20; VI "why" reply embeds the English reason text.
- Disclosed allergies expire after 90 days and are not written to the profile (no "save to profile" prompt yet). Track Food / Dante `log_food` of a food the user names is recorded without an allergen warning (user-entered intake, not a recommendation).
- Offline queue: last write wins vs the server row; only set logging is queued (skip/swap/finish fail honestly offline).
- Demo environment: `next dev` on this machine hits dev-chunk races under memory pressure (F-13). Production build cannot target the local http stack.

## READINESS
- P0 remaining: **0 known** (F-01, F-02 fixed with browser + backend evidence; frozen-candidate repeat incomplete).
- Release-blocking P1 remaining: **0 known** (F-03, F-04, F-05, F-06, F-16, F-17, NEW-1, NEW-2 fixed).
- Candidate stable: yes (A = B = C).
- READY_FOR_INDEPENDENT_HACKATHON_REAUDIT: **after** the interrupted final regression batch is rerun green on `5bd4716b…`.
- **FINAL_VERDICT: HACKATHON_REPAIR_PARTIAL** — blocker: final frozen-candidate regression interrupted by system memory, not by a product failure.
