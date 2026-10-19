# Muscle Fitness — Full Defect & Weakpoint Audit

**Date:** 6 Oct 2026  
**Mode:** Audit only. Application code, config, database, and git were not modified.  
**Live:** https://muscle-fitness-ten.vercel.app  
**Previous product audit:** `MF_LIVE_PRODUCT_AUDIT.md` used as a lead only; every item was re-checked.

Authenticated Dashboard / Recovery / Nutrition / Progress / logged-in Dante were **not** exercised against production (no session). Those areas are source-reviewed and marked accordingly.

---

## 1. Executive Summary

Typecheck and production build pass. Lint has two `next/image` warnings. The test suite is large and mostly green: **2184 passed, 1 failed, 7 skipped**. The failing test is a real recovery-apply contract mismatch driven by clock time, not a flake of the runner. The most serious production finding is not Dante: **three business AI routes on the live host accept unauthenticated POSTs and, after a valid body, call OpenAI**. That is an abuse and cost hole. The real coaching APIs (`/api/chatbot`, recovery, nutrition log, sessions) do check `getUser()`. Public leftovers still contradict that discipline: `/chatbot` looks Online while the API returns 401; `/workout` is a broken student page; `/privacy` and `/terms` still say PLACEHOLDER; `/camera` is an old Form Coach. Recovery apply is correctly user-confirmed and idempotent by `proposalId`, but it applies **client-supplied `after` patches** after only matching `before` — it does not re-derive the proposal on the server. Daily intelligence still uses UTC `toISOString().slice(0,10)` after the rest of the app was moved to profile-local dates. Progress “rest days” count `RECOVERY_COMPLETE`, not planned rest. Dante Core itself is heavily tested (safety lifecycle, provenance, n-of-1, obligations) and should not be rewritten. Fix unauthenticated AI routes, hide leftovers, then the timezone/apply-contract issues. Do not treat “must log in to see the app” as a bug.

## 2. Baseline

| Item | Value |
| --- | --- |
| Branch | `main` tracking `origin/main` |
| HEAD | `9582217` `release: merge latest Muscle Fitness` (2026-09-25) |
| Git status | Deleted `MF-COMPETITION/*` (8 files). Untracked `MF_LIVE_PRODUCT_AUDIT.md`. Working tree otherwise clean of app code. |
| Package manager | npm (`package-lock.json`) |
| Node | v24.5.0 / npm 11.17.0 |
| Next.js | 16.3.5 (webpack) |
| React | 19.2.0 |
| TypeScript | 5.9.2, `strict: true` |
| Supabase | `@supabase/ssr` + `@supabase/supabase-js`; browser `lib/supabase/client.ts`, server `lib/supabase/server.ts`, env `lib/supabase/env.ts` (publishable key preferred). No service-role client in app code. Seed script may use local service role on loopback only. |
| Proxy | Root `proxy.ts` → `lib/supabase/proxy.ts` `updateSession` |
| Canonical product routes | Dashboard `/dashboard` · Train `/dashboard/workouts` · Nutrition `/dashboard/nutrition` · Recovery `/dashboard/recovery` · Progress `/dashboard/progress` · Dante `/dashboard/ai-coach` · Account `/account` · Settings `/dashboard/settings` (alias `/settings` redirects) |
| Live URL | https://muscle-fitness-ten.vercel.app |
| Typecheck | PASS (`tsc --noEmit`) |
| Lint | PASS, 2 warnings (`components/home/Hero.tsx`, `TrainingPreview.tsx` `<img>`) |
| Tests | 1 failed / 2184 passed / 7 skipped / 2 files skipped · 14.13s |
| Build | PASS · Next.js 16.3.5 · 52 static pages generated |

Env names observed (values not recorded): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY` / Dante OpenAI config, `DANTE_OPENAI_MODEL`, local demo `MF_DEMO_*`.

## 3. Final Counts

P0 = 1  
P1 = 8  
P2 = 14  
P3 = 11  

Verified = 9  
Source-confirmed = 18  
High-confidence risk = 6  
Suspected = 3 (listed only in sections, not as bugs)  
Not testable = authenticated product loop (dashboard, recovery UI, nutrition tracker, progress, logged-in Dante)

---

## 4. P0 — Critical

### [P0-1] Unauthenticated business AI routes call OpenAI

CATEGORY: Security / cost / availability  
SEVERITY: P0  
CONFIDENCE: High  
EVIDENCE LEVEL: VERIFIED (no auth on live host) + SOURCE-CONFIRMED (OpenAI client)

OBSERVED:  
Live unauthenticated POSTs:

- `POST /api/ai/business-insights` with `{}` → **400** validation errors (not 401).  
- `POST /api/ai/member-analysis` with `{}` → **400** validation errors (not 401).  
- `POST /api/ai/campaign` with a body → **500** `"Unable to generate campaign."` (not 401).  

None of these files call `createClient()` / `getUser()` / `requireBusinessAdmin()`. After a valid body they call `createOpenAiChatCompletion` in `lib/ai/client.ts`, which sends `Authorization: Bearer ${apiKey}` to OpenAI. There is no application rate limit.

EXPECTED: 401 unless a business-admin session exists. LLM spend only after role check.

REPRODUCTION:

```
curl -sS -X POST https://muscle-fitness-ten.vercel.app/api/ai/business-insights -H "Content-Type: application/json" -d "{}"
```

Returns 400 field errors. A valid payload was **not** sent (would spend the project key).

ROOT CAUSE: Business AI routes were wired for the gym portal without copying the auth pattern used by `/api/chatbot` and recovery/nutrition APIs.

AFFECTED FILES:

- `app/api/ai/campaign/route.ts`
- `app/api/ai/business-insights/route.ts`
- `app/api/ai/member-analysis/route.ts`
- `lib/ai/campaign-generation.ts`
- `lib/ai/business-insights.ts`
- `lib/ai/member-analysis.ts`
- `lib/ai/client.ts`
- `lib/business/require-business-admin.ts` (exists, unused here)

USER IMPACT: Anyone who can reach the deployment can trigger paid completions. Dante itself is not this path.

DATA IMPACT: These routes do not write user training/nutrition rows. Risk is API-key spend and resource exhaustion, not RLS bypass.

SECURITY/SAFETY IMPACT: Missing authentication on a privileged expensive endpoint. Not an auth-bypass of user data.

RECOMMENDED FIX: `requireBusinessAdmin()` or `getUser()` + role check **before** `request.json()`. Return 401. Add a coarse rate limit. Do not add anonymous “demo” generation.

REGRESSION RISK: Low if the business portal already sends cookies; high only if some UI called these routes logged-out (that UI should not).

TEST THAT SHOULD BE ADDED: Route tests asserting 401 without a session; 403 for a client role; 200 only for business admin.

---

## 5. P1 — High

### [P1-1] Public Dante UI claims Online; API requires login; errors are generic

CATEGORY: Auth / UX / AI credibility  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: VERIFIED + SOURCE-CONFIRMED

OBSERVED: `/chatbot` is a **static** public page (`○ /chatbot` in the build). It renders a green “Online” status and `DanteChat` with an input. Proxy `PROTECTED_ROUTES` does **not** include `/chatbot`. `POST /api/chatbot` returns 401 `"You must be logged in to use Dante."` (verified in the prior live session with a well-formed JSON file; this session’s PowerShell body was rejected as invalid JSON before auth). Meal-plan CTA `href="/chatbot"` (`app/meal-plan/page.tsx` ~1683). On 401, `dante-chat.tsx` throws then replaces empty content with `UNAVAILABLE_MESSAGE` (“Dante couldn't complete that response…”) — **not** the login error.

EXPECTED: Logged-out Dante is a login wall, or the status is “Sign in to talk”, and a 401 says so.

REPRODUCTION: Open `/chatbot` logged out; submit any prompt. Network 401 or generic failure copy.

ROOT CAUSE: Marketing chat page mounts the real client without a session check; error mapping swallows 401.

AFFECTED FILES: `app/chatbot/page.tsx`, `components/dante-chat.tsx`, `app/api/chatbot/route.ts` (auth is correct), `app/meal-plan/page.tsx`, `lib/supabase/proxy.ts`

USER IMPACT: The AI looks broken or dishonest.

DATA IMPACT: None (write path blocked).

SECURITY/SAFETY IMPACT: None beyond confusion. Do not “fix” this by opening Dante anonymously.

RECOMMENDED FIX: Redirect `/chatbot` → `/login?next=/dashboard/ai-coach`, or gate the component. Map 401 to an explicit sign-in message. Point meal-plan CTA at the same login URL.

REGRESSION RISK: Low.

TEST THAT SHOULD BE ADDED: Component/API test: unauthenticated POST → 401; UI does not show “Online”.

---

### [P1-2] Signup-linked legal pages are labeled PLACEHOLDER

CATEGORY: Privacy / trust  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: VERIFIED (live 200 HTML) + SOURCE-CONFIRMED

OBSERVED: `/privacy` and `/terms` are prerendered public pages. Source still renders a “Placeholder” eyebrow and states the pages exist so signup links do not 404. Register checkbox links both (`app/register/register-form.tsx`).

EXPECTED: Honest “under legal review” copy **without** the word PLACEHOLDER, plus a working link to `/responsible-ai`.

REPRODUCTION: Open https://muscle-fitness-ten.vercel.app/privacy

ROOT CAUSE: Intentional stub, still shipped.

AFFECTED FILES: `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/register/register-form.tsx`

USER IMPACT: Signup consent points at a page that admits it is not a policy.

DATA IMPACT: None.

SECURITY/SAFETY IMPACT: Trust / compliance optics, not an RLS hole.

RECOMMENDED FIX: Remove “Placeholder”. Keep the honest disclaimer. Do not invent legal text.

REGRESSION RISK: None.

TEST THAT SHOULD BE ADDED: Content test that `/privacy` does not contain `Placeholder`.

---

### [P1-3] Legacy public product surfaces: `/workout` and `/camera`

CATEGORY: Legacy / broken UX  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: VERIFIED

OBSERVED:  
- `/workout` is static, titled “Smart Workouts”, broken `/exercises/*.png` (live 200 HTML; images 404 in prior CDP). `Generate AI Plan` hits `/api/plan` which **does** 401 and no longer returns fake workouts.  
- `/camera` is static “AI Form Coach” (`PoseCameraClient`), not behind proxy protection. Canonical form coach is `/dashboard/workouts/form-coach`.

EXPECTED: These URLs redirect into the canonical authenticated product (login if needed).

REPRODUCTION: Open `/workout` and `/camera` logged out.

ROOT CAUSE: Early prototype pages never removed.

AFFECTED FILES: `app/workout/page.tsx`, `app/camera/page.tsx`, `components/ExerciseCard`, `components/PoseCameraClient`

USER IMPACT: Looks unfinished; conflicts with `/dashboard/workouts`.

DATA IMPACT: `/api/plan` POST does not persist fake plans (good). Camera is client-side.

RECOMMENDED FIX: `redirect('/dashboard/workouts')` and `redirect('/dashboard/workouts/form-coach')`.

REGRESSION RISK: Low if nothing in nav still depends on the old paths (grep before deleting).

TEST THAT SHOULD BE ADDED: Redirect tests.

---

### [P1-4] Daily intelligence “today” is UTC; the rest of the app is local

CATEGORY: Timezone / correctness  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: SOURCE-CONFIRMED

OBSERVED: `lib/dante-core/daily-intelligence.ts` `todayIso()` is `new Date().toISOString().slice(0, 10)` and session lookup uses `${todayIso()}T00:00:00.000Z` … `T23:59:59.999Z`. Nutrition `lib/nutrition/date-utils.ts` documents that this exact pattern showed **yesterday** in Singapore 00:00–08:00 and was fixed there. Training `localDateTimeParts` is the canonical local calendar. Dashboard daily narrative can therefore name the wrong session/day vs Recovery/Nutrition/Progress.

EXPECTED: Same `localDateTimeParts(now, profile.timezone)` as `loadTodaySession`.

REPRODUCTION: Reason: 16:00 UTC 6 Oct is 00:00 7 Oct in Singapore. UTC “today” is still 6 Oct; local training “today” is 7 Oct.

ROOT CAUSE: Daily intelligence not migrated when local-date helpers landed.

AFFECTED FILES: `lib/dante-core/daily-intelligence.ts`, `lib/events/emit.ts` (recompute trigger), contrast `lib/training/load-today-session.ts`

USER IMPACT: Dashboard Dante card / daily summary disagrees with today’s workout after midnight local.

DATA IMPACT: Wrong cache key `summaryDate`; stale or empty training focus.

RECOMMENDED FIX: Pass timezone into `getOrBuildDailyIntelligence`; key the cache on local date.

REGRESSION RISK: Medium (cache rows). Add a frozen-clock unit test first.

TEST THAT SHOULD BE ADDED: `todayIso` at `2026-10-06T16:30:00.000Z` + `Asia/Singapore` → `2026-10-07`.

---

### [P1-5] Recovery apply trusts client `after` prescriptions

CATEGORY: Data integrity  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: SOURCE-CONFIRMED

OBSERVED: `POST /api/recovery/adjustment/apply` authenticates, then `applyWorkoutAdjustment` checks `subjectRef === actorUserId`, loads the owned session, rejects expired/stale/`before` mismatch, then **writes `change.after` from the JSON body**. It does not regenerate the proposal from today’s check-in. A caller who owns the session can skip every exercise or set arbitrary `targetSets` while still labeling `appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL"`. Session editor (`mutateAdjustSetsReps` / skip) already lets the user change the same rows, so this is not cross-user IDOR (RLS `can_manage_workout_client` still applies). It **is** a lie in the audit trail and a bypass of recovery safety constraints on this endpoint.

EXPECTED: Server recomputes the proposal (or stores a server-side proposal id) and applies that snapshot.

REPRODUCTION: Source path in `lib/recovery/apply-proposal.ts` lines 151–188; schema in `app/api/recovery/adjustment/apply/route.ts`.

ROOT CAUSE: Preview payload reused as the mutation contract.

AFFECTED FILES: `lib/recovery/apply-proposal.ts`, `app/api/recovery/adjustment/apply/route.ts`, `components/recovery/recovery-adjustment-panel.tsx`

USER IMPACT: Safety-reduced session can be forged through the “Dante proposal” button path; UI still says Dante confirmed it.

DATA IMPACT: Own-account workout rows only.

SECURITY/SAFETY IMPACT: Integrity of “AI proposes, user decides” on **this** endpoint. Not a silent AI write — user still POSTs.

RECOMMENDED FIX: Persist proposal server-side at preview time; apply by `proposalId` only. Ignore client `after`.

REGRESSION RISK: Medium. The adaptive-loop tests already cover idempotency/stale/ownership.

TEST THAT SHOULD BE ADDED: Client `after` with inflated sets while `before` matches → reject or ignore, apply server proposal.

---

### [P1-6] Recovery stale-plan unit test fails on current clock

CATEGORY: Correctness / CI  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: VERIFIED

OBSERVED: `npm test` →

```
FAIL lib/recovery/__tests__/recovery-adaptive-loop.test.ts
R-I stale plan > rejects apply after an external plan change
expected 'EXPIRED' to be 'STALE_PLAN'
```

Fixture check-in date is `2026-09-25`. `proposal.ts` sets `expiresAtRef = createdAt + 12h`. Apply uses `now ?? new Date()` (6 Oct 2026). Expiry is checked **before** plan version. The test never reaches STALE_PLAN.

EXPECTED: Either freeze `now` in the test, or check STALE_PLAN before EXPIRED when the session version already diverged.

REPRODUCTION: `npx vitest run lib/recovery/__tests__/recovery-adaptive-loop.test.ts`

ROOT CAUSE: Time-dependent fixture + expire-first ordering.

AFFECTED FILES: `lib/recovery/__tests__/recovery-adaptive-loop.test.ts`, `lib/recovery/apply-proposal.ts`, `lib/recovery/proposal.ts`

USER IMPACT: CI red; expired copy can mask “your workout changed”.

DATA IMPACT: None in production by itself.

RECOMMENDED FIX: Pass `now: new Date("2026-09-25T06:00:00.000Z")` into apply in that test. Optionally reorder checks.

REGRESSION RISK: Low.

TEST THAT SHOULD BE ADDED: The existing test, with frozen `now`.

---

### [P1-7] Two live training products: `/training` and `/dashboard/workouts`

CATEGORY: IA / maintainability  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: SOURCE-CONFIRMED (auth) + build inventory

OBSERVED: `app/training/page.tsx` is ~3000 lines, has its own exercise database and redirects unauthenticated users to `/login?next=/training`. Canonical Train is `/dashboard/workouts`. Homepage “Train” goes to `/dashboard/workouts`. Meal-plan nav “TRAINING” goes to `/training`. Users can land in different UIs with different data.

EXPECTED: One training system.

REPRODUCTION: Compare `app/training/page.tsx` vs `app/dashboard/workouts/page.tsx`.

ROOT CAUSE: Historical page never redirected.

AFFECTED FILES: `app/training/page.tsx`, meal-plan header, `HOMEPAGE_ROUTES.training`

USER IMPACT: Conflicting plans / dead-end UX.

RECOMMENDED FIX: Redirect `/training` → `/dashboard/workouts`. Do not merge the 3000-line page.

REGRESSION RISK: Low if treated as alias.

TEST THAT SHOULD BE ADDED: Redirect test.

---

### [P1-8] Progress “rest days” count recovery check-ins, not rest

CATEGORY: Progress correctness  
SEVERITY: P1  
CONFIDENCE: High  
EVIDENCE LEVEL: SOURCE-CONFIRMED

OBSERVED: `heatmapInsight` sets `restDays = days.filter(status === "RECOVERY_COMPLETE")`. Planned rest is `NO_REQUIREMENT` (“No planned action”). Heatmap CSS correctly greys `NO_REQUIREMENT` and reds `MISSED`. The **number** labeled rest is check-in days. Streak logic skips `NO_REQUIREMENT` correctly in `lib/progress/streak.ts`.

EXPECTED: `restDays` = `NO_REQUIREMENT` (and/or explicit rest), not recovery-complete.

REPRODUCTION: Read `lib/progress/presentation.ts` `heatmapInsight`. Contrast `lib/progress/format.ts` labels.

ROOT CAUSE: Status enum reused as a rest counter.

AFFECTED FILES: `lib/progress/presentation.ts`, `components/progress/progress-experience.tsx`

USER IMPACT: Rest-day count and story are wrong; rest is not painted as failure (CSS is fine).

RECOMMENDED FIX: Count `NO_REQUIREMENT` as rest; keep recovery as its own metric.

REGRESSION RISK: Low. Update `presentation.test.ts`.

TEST THAT SHOULD BE ADDED: Fixture with only rest + one check-in → restDays = rest count.

---

## 6. P2 — Medium

### [P2-1] `/api/food` is a public hardcoded “test-database”
Live `GET /api/food?q=chicken` → 200, `source: "muscle-fitness-test-database"`. No auth. Canonical search is `/api/nutrition/foods/search`. Misleading if anything still calls `/api/food`. SOURCE-CONFIRMED + VERIFIED.

### [P2-2] No application rate limit on `/api/chatbot`
Provider 429 is mapped (`PROVIDER_RATE_LIMIT`) but there is no per-user throttle. Authenticated users can fan out expensive streams. HIGH-CONFIDENCE RISK.

### [P2-3] Homepage orbit numbers contradict fallback view-model
`Ecosystem.tsx` hardcodes Recovery 87, +14.7%, 154 g, Week 08. `FALLBACK_VIEW_MODEL` uses 72 / 160 g protein. VERIFIED live previously; SOURCE-CONFIRMED. Same page, two “illustrative” truths.

### [P2-4] Recovery apply: patch then audit insert is not one transaction
`applyPatches` then `mutations.insert`. If insert fails, session already changed; retry hits STALE_PLAN. HIGH-CONFIDENCE RISK. `lib/recovery/apply-proposal.ts`, `lib/recovery/supabase-apply.ts`.

### [P2-5] Finish workout: RPC success then `emitEvent` can fail the HTTP result
`mutateFinishWorkout` completes via `finish_workout` RPC (rejects if not `in_progress` — good idempotency), then `emitEvent`. If emit throws, the user sees failure while the session is completed. SOURCE-CONFIRMED `lib/workouts/session-mutations.ts`.

### [P2-6] Nutrition `logDate` accepts any valid ISO date
Zod `isValidDateIso` only. Far-future / far-past logs allowed. Server recomputes macros (good). P2 validation gap. `app/api/nutrition/log/route.ts`.

### [P2-7] Duplicate food logs are allowed
`food_logs` has a user/date index, not a uniqueness constraint on item+meal+date. Double-click can double-count. HIGH-CONFIDENCE RISK. `supabase/migrations/20260914090000_food_logs.sql`.

### [P2-8] Session set update filters set id, not session id
`mutateSaveSet` asserts session ownership then `update exercise_sets where id = setId`. Cross-user writes are blocked by RLS `exercise_sets_all_policy`. Defense-in-depth missing. HIGH-CONFIDENCE RISK, mitigated.

### [P2-9] Campaign route maps JSON parse failures to 500
`try { await request.json() }` catch returns `"Unable to generate campaign."` 500. Insights/member-analysis return 400. SOURCE-CONFIRMED; live campaign 500 consistent with this.

### [P2-10] Google Drive sync returns raw `error.message` to the client
`app/api/google-drive/sync/route.ts`. Auth is inside the helper (401 if “authentication required” in the message — brittle). P2 info leak / fragile auth detect.

### [P2-11] Sidebar “More” still exposes unfinished product
Messages and Weekly check-in are “coming soon” empty states (`app/dashboard/[section]/page.tsx`). Settings is a stub pointing at `/account`. SOURCE-CONFIRMED. NOT TESTABLE live.

### [P2-12] Meal-plan is a second visual/IA system
Different nav, `/training` and `/chatbot` targets. VERIFIED live previously. Product weakness more than a crash.

### [P2-13] Proxy `getClaims()` vs page `getUser()`
Documented fallback exists. Residual HIGH-CONFIDENCE RISK of rare “intermittently signed out” if both fail. `lib/supabase/proxy.ts`.

### [P2-14] `/api/sessions/[id]` returns Supabase `error.message` on GET
400 with driver text. P2. Other APIs genericize.

---

## 7. P3 — Low

- Lint: `<img>` in unused-looking `components/home/Hero.tsx` / `TrainingPreview.tsx` (no imports of Hero found; still compiled/linted).
- Duplicate chapter index “06” on the motion homepage.
- `/auth/comfirmed` typo alias (now redirects to `/auth/confirm` — keep, don’t feature).
- `/callback` duplicate of `/auth/callback` (same handler; documented).
- Admin home copy “Phase 1 foundation is live” and prints `userId`.
- `OPENAI_MODEL` deprecated compatibility alias in `lib/ai/client.ts`.
- Hero GSAP starts `.hero-line` at opacity 0 (first paint can be empty until JS).
- Login/signup/chatbot clipping at 390px (prior live screenshots).
- Pitch deck “clinically-safe” vs Responsible AI “no diagnosis”.
- Public `/api/health` is fine; `/robots.txt` 404.
- Design-system and docs/workout-system are public static extras.

---

## 8. Auth / Security Findings

**Strong:** Chatbot, nutrition log, recovery check-in/apply, hawkerlens, demo settings, Dante tool confirm, session mutations all use `getUser()`. `getSafeNext` rejects `//`, `javascript:`, control chars. `finish_workout` is `security definer` but checks `auth.uid()` and `session_state = 'in_progress'`. Exercise set RLS joins through session ownership. No `dangerouslySetInnerHTML`. No service-role import in app routes. Dante markdown uses `rehype-raw` **and** `rehype-sanitize`.

**Weak:** P0-1 unauthenticated OpenAI routes. Public `/chatbot` chrome. `/api/food` unauthenticated. No chatbot rate limit. Google Drive error strings. Campaign 500 on bad JSON.

**Not a bug:** Dashboard redirect to login. Chatbot 401. `/api/plan` 401.

## 9. Data Integrity Findings

- Recovery check-in upserts on `user_id,checkin_date` — good.
- Recovery apply idempotent on `proposalId` — good, but client `after` (P1-5).
- Double finish_workout rejected unless `in_progress` — good.
- Food log duplicates possible (P2-7).
- Daily intelligence date key UTC (P1-4).
- Progress rest counter (P1-8).
- Apply patch vs mutation insert not atomic (P2-4).

## 10. Dante Findings

**Strong (tests, not live chat):** Safety ENTER→EXIT (`phase2-live-provider.test.ts`), provenance monotonicity, n-of-1 consent, current-turn binding, verifier/known-facts, tool confirm is the only HTTP write (`/api/dante/tools/confirm`). Chatbot route refuses anonymous use.

**Weak:** Public shell (P1-1). 401 → generic unavailable copy. No app rate limit. Authenticated quality **NOT TESTABLE** here. Do not classify live Dante as D without a logged-in turn.

**SUSPECTED:** Timeout/retry storms under provider load — mapped in code (`PROVIDER_RATE_LIMIT`) but not production-probed.

## 11. Recovery Findings

Propose/confirm UI exists; apply is not silent. Score is `computeRecoveryScore` on the server at check-in, not LLM. Safety scope types exist. Gaps: P1-5, P1-6, P2-4. Authenticated UI **NOT TESTABLE**.

## 12. Training Findings

Canonical path is `/dashboard/workouts` + session RPC. Leftover `/workout`, `/camera`, `/training`. Set save ownership + RLS. Finish requires a completed set. Duplicate complete fails. **NOT TESTABLE** live logging.

## 13. Nutrition Findings

Server recomputes `per100g × quantityGrams`. Quantity `.positive().max(5000)`. Hawkerlens scan/confirm authenticated; confirm uses `createFoodLog`. Public meal-plan is disconnected. `/api/food` stub. Date helper for local today is correct; logDate range is not bounded. **NOT TESTABLE** live tracker.

## 14. Progress Findings

Deterministic loaders; Dante must not compute verified progress (architecture). Heatmap rest styling is responsible. Rest **count** is wrong (P1-8). Weekday-from-`T00:00:00.000Z` + `getUTCDay` is consistent with date-only ISO. **NOT TESTABLE** live.

## 15. Cross-Page State Findings

| Pair | Issue |
| --- | --- |
| Homepage orbit vs recovery scene | Different illustrative numbers |
| Meal-plan vs dashboard nutrition | Different product |
| `/training` vs `/dashboard/workouts` | Two trainers |
| `/chatbot` vs `/dashboard/ai-coach` | Two Dante doors |
| Daily intelligence vs loadTodaySession | UTC vs local “today” |
| Settings `/settings` → `/dashboard/settings` | Works via `[section]`; page is a stub |

## 16. UX / UI Weakpoints

**BUG:** P1-1, P1-2, P1-3, leftover Online, PLACEHOLDER, broken workout images.  
**PRODUCT WEAKNESS:** Meal-plan brand split; too many marketing CTAs; More-nav coming soon; Dante named “AI Coach” on the orbit.  
Do not rebuild the motion homepage for these.

## 17. Responsive Findings

Landing 1440/768 is strong after hydration. 390: sticky header overlap, orbit node collision, login/signup/chat send clipping (prior live screenshots; not re-shot this pass). Authenticated shell **NOT TESTABLE**.

## 18. Accessibility Findings

Hero opacity-0 until GSAP. Custom cursor hides system pointer (reduced-motion gated). Problem-card contrast on homepage. Hamburger has `aria-label`. Dante 401 not announced as “sign in”. Do not claim a full WCAG audit.

## 19. Performance Findings

**MEASURED:** `next build` compile ~79s; typecheck in build 24s; tests 14s. Lint img warnings.  
**POTENTIAL:** Motion homepage GSAP + particles; TensorFlow on form-coach/camera; Remotion in devDependencies; three.js; chatbot unbounded concurrency. Not load-tested.

## 20. API Findings

| Route | Auth | Notes |
| --- | --- | --- |
| `/api/ai/*` (3) | **None** | P0-1 |
| `/api/chatbot` | getUser 401 | Correct; no rate limit |
| `/api/food` | None | Stub DB |
| `/api/health` | None | OK |
| `/api/plan` | getUser | No fake workouts |
| `/api/nutrition/log` | getUser | Server macros |
| `/api/recovery/*` | getUser | Apply trusts client after |
| `/api/sessions/*` | getUser in mutations | GET leaks error.message |
| `/api/hawkerlens/*` | getUser | OK |
| `/api/dante/tools/confirm` | getUser | Only write confirm |
| `/api/demo/settings` | getUser | Per-user demo overlay |

## 21. Timezone / Date Findings

Fixed: nutrition `todayIso()` uses local getters; training `localDateTimeParts`.  
Broken: daily-intelligence UTC (P1-4); demo scenario helper still `toISOString().slice(0,10)` (`lib/demo/scenarios.ts`) — SOURCE-CONFIRMED, demo-only. Recovery check-in uses local date. Progress week uses `mondayOf(localDate)`.

## 22. Dead / Legacy Code

| Item | Class |
| --- | --- |
| `app/workout/page.tsx` | SAFE TO REMOVE LATER (redirect first) |
| `app/camera/page.tsx` | SAFE TO REMOVE LATER |
| `app/training/page.tsx` | REQUIRES INVESTIGATION then redirect |
| `app/chatbot/page.tsx` | STILL REFERENCED (meal-plan, marketing) |
| `app/api/food/route.ts` | REQUIRES INVESTIGATION (who fetches it) |
| `components/home/Hero.tsx` | SAFE TO REMOVE LATER if unused |
| `app/auth/comfirmed` | STILL REFERENCED (old email links) |
| `app/callback/route.ts` | STILL REFERENCED (possible Supabase allow-list) |
| `/coach` | STILL REFERENCED (redirects to ai-coach) |
| `/design-system`, `/docs/workout-system` | STILL REFERENCED public extras |
| Business “coming soon” pages | STILL REFERENCED portal |

## 23. Test Coverage Gaps

Covered well: Dante safety/provenance/n-of-1, recovery apply (except frozen now), progress engines, auth `getSafeNext`, nutrition date utils, chatbot route tests.  
Missing: unauthenticated `/api/ai/*` 401; chatbot UI 401 copy; recovery apply ignoring client `after`; daily-intelligence timezone; food-log double POST; finish_workout + failed emitEvent; progress restDays definition; live browser e2e (playwright installed, no app e2e suite run here).  
False confidence: stale-plan test currently fails; live-provider tests mock HTTP and are not production.

Skipped (env-gated): local Supabase / live classifier files (2 files, 7 tests).

## 24. Partial-Failure Risks

| Sequence | Result |
| --- | --- |
| Check-in upsert OK, dashboard daily intel UTC | Conflicting “today” |
| Apply patches OK, mutation insert fails | Session changed, no audit; retry STALE_PLAN |
| finish_workout OK, emitEvent throws | Session completed, client error |
| Food insert OK, UI refresh fails | Totals stale until reload |
| Dante stream OK, post-turn persist skipped | Reply shown; memory may miss (intentional in coherence comments) |
| Proposal generated, user never confirms | No mutation (correct) |

## 25. Concurrency / Idempotency Risks

- Recovery apply: proposalId unique + alreadyApplied — good.
- finish_workout: only `in_progress` — good.
- Check-in: upsert conflict — good.
- Food log: no idempotency key — double click duplicates.
- Chatbot: `isLoading` guard in UI; no server debounce.
- Two tabs applying the same proposal: first writes, second alreadyApplied.

## 26. Production vs Source Divergence

Build output matches the repo: `/workout`, `/camera`, `/chatbot`, `/privacy`, `/api/ai/*` are deployed. `/api/plan` no longer returns fake sample workouts (source disclaimer matches live 401 for anonymous POST). Competition markdown under `MF-COMPETITION/` is deleted in the working tree but not part of the app. Daily intelligence UTC bug is in source; live dashboard **NOT TESTABLE**.

## 27. Previous Audit Findings Revalidated

| Previous | This audit |
| --- | --- |
| P0 legal PLACEHOLDER | **CONFIRMED** — recast **P1-2** (trust, not data corruption) |
| P0 public Dante Online + 401 | **CONFIRMED** — **P1-1** (plus generic error mapping) |
| P0 `/workout` leftover | **CONFIRMED** — folded into **P1-3** |
| P0 “auth required for dashboard” | **REJECTED as a defect** — correct. **NOT TESTABLE** inner app |
| Hero empty before GSAP | **CONFIRMED** as P3 first-paint, not missing headline |
| Meal-plan second brand | **CONFIRMED** P2-12 |
| Login 390 clip | **CONFIRMED** P3 (not re-shot; prior evidence stands) |
| Orbit 87 vs recovery 72 | **CONFIRMED** P2-3 |
| Clinically-safe deck copy | **CONFIRMED** P3 |
| Sidebar coming soon | **CONFIRMED** P2-11 SOURCE-CONFIRMED |
| Chatbot API 401 | **CONFIRMED** (auth gate). This session’s curl body encoding produced 400 Invalid JSON — does not overturn the 401 result |
| `/api/plan` fake workouts | **CHANGED** — now 401 / no fake plan persistence |

## 28. Top 20 Highest-ROI Fixes

1. Auth-gate `/api/ai/campaign|business-insights|member-analysis`  
2. Redirect `/chatbot` to login; fix 401 copy  
3. Redirect `/workout` and `/camera`  
4. Strip PLACEHOLDER from legal pages  
5. Redirect `/training` → `/dashboard/workouts`  
6. Freeze `now` in stale-plan test (CI green)  
7. Daily intelligence local date  
8. Progress restDays = `NO_REQUIREMENT`  
9. Persist recovery proposals server-side  
10. Meal-plan CTA → `/login?next=/dashboard/ai-coach`  
11. Hide Messages / Weekly check-in from sidebar  
12. Unify homepage illustrative numbers  
13. Bound nutrition `logDate` to e.g. ±30 days  
14. Idempotency key or disable on food submit  
15. Transaction or compensating audit on apply  
16. emitEvent failure must not fail finish_workout HTTP  
17. Rate-limit `/api/chatbot`  
18. Deprecate `/api/food` or auth it  
19. Genericize Google Drive / session GET errors  
20. Campaign JSON parse → 400  

## 29. Root Cause Clusters

```
UNAUTHENTICATED EXPENSIVE AI
├─ P0-1 campaign / insights / member-analysis
└─ P2-9 campaign 500 on bad JSON

PUBLIC SHELL ≠ PRODUCT
├─ P1-1 /chatbot Online vs 401
├─ P1-3 /workout /camera
├─ P1-7 /training vs /dashboard/workouts
├─ P2-1 /api/food test database
└─ P2-12 meal-plan IA

LEGAL / TRUST COPY
├─ P1-2 PLACEHOLDER
└─ P3 clinically-safe

RECOVERY APPLY CONTRACT
├─ P1-5 client after
├─ P1-6 EXPIRED vs STALE_PLAN
└─ P2-4 non-atomic patch/audit

TIME AND COUNTERS
├─ P1-4 daily intelligence UTC
├─ P1-8 restDays
└─ demo scenarios UTC (P3-ish)

PARTIAL FAILURE
├─ P2-5 finish + emitEvent
└─ P2-7 duplicate foods
```

## 30. What Is Actually Strong

- `tsc` + production build clean.  
- Recovery score is deterministic and stored at check-in.  
- Nutrition server recomputes macros; never trusts client totals.  
- Chatbot/nutrition/recovery/session/hawkerlens/tool-confirm auth.  
- `getSafeNext` open-redirect tests.  
- `finish_workout` cannot double-complete.  
- Check-in upsert is idempotent per day.  
- Recovery apply has ownership, expiry, stale version, idempotent proposal id.  
- Dante Core test volume (safety lifecycle, provenance, n-of-1, obligations).  
- RLS on exercise_sets via session ownership.  
- No service-role in the Next bundle.  
- Homepage (after hydration), login, `/responsible-ai` are product-grade.

## 31. What NOT To Touch Yet

- `lib/dante-core/**` pipeline, safety, verifier, n-of-1 — tests are the safety net; a rewrite the night before a demo is unjustified.  
- Motion homepage GSAP system — first-paint opacity is enough.  
- Dashboard glass layout.  
- `computeRecoveryScore`.  
- Nutrition calculator / `createFoodLog`.  
- `getSafeNext` / OAuth callback pair.  
- `finish_workout` RPC.  
- Opening Dante to anonymous users.

## 32. Recommended Fix Order

**FIX PHASE A — P0**  
Auth on `/api/ai/*`.

**FIX PHASE B — P1**  
Redirect leftovers; legal copy; chatbot gate + 401 message; freeze recovery test `now`; local date in daily intelligence; restDays; server-side proposal snapshot (or clearly document that apply is “user patch”).

**FIX PHASE C — correctness / resilience**  
Food double-submit; apply transaction; emitEvent isolation; logDate bounds; chatbot rate limit.

**FIX PHASE D — UX / polish**  
Orbit numbers; meal-plan header; hide coming-soon nav; 390px clip; PLACEHOLDER-adjacent copy.

**FIX PHASE E — technical debt**  
Remove unused home Hero; `/api/food`; obsolete provider alias; design-system publicity if unused.

## 33. Final Engineering Verdict

| Area | /10 |
| --- | --- |
| Correctness | 7.2 |
| Reliability | 7.0 |
| Security | 6.0 |
| Data integrity | 7.4 |
| AI safety (architecture) | 8.2 |
| Dante quality (live) | 5.0 |
| Training | 6.8 |
| Recovery | 7.6 |
| Nutrition | 7.5 |
| Progress | 7.0 |
| UX | 6.6 |
| Mobile | 6.8 |
| Maintainability | 6.4 |
| Test confidence | 7.3 |
| Production readiness | 6.8 |

**OVERALL /100 = 71**

The core domain (auth’d APIs, deterministic recovery/nutrition math, Dante safety tests) is stronger than the public leftovers and the ungated business AI routes. Production is usable as a logged-in product; it is not yet tight as a public surface.
