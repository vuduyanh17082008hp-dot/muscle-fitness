# MUSCLE FITNESS — HACKATHON PRODUCT ACCEPTANCE FINAL REPORT

Audit date 2026-10-18 (Asia/Singapore). Evidence root: this directory. Finding details: `findings/FINDINGS.md` (F-01…F-22).
No source, prompt, test, policy, migration or video asset was modified. All data is synthetic, on the local Supabase stack.

---

## SECTION A — AUDIT VALIDITY

| Item | Value |
|---|---|
| Repo | `C:\Dev\Projects\muscle-fitness-claude` |
| Branch | `video/one-day-in-the-life` (verified at start and end) |
| HEAD | `62084744aba6d44add9e64831912abef32838bef` (start = end) |
| Fingerprint START | `0ba068dd4ca62781f910c5379aa9759076c135fb687eb5dbac3931f53ed16f1c` (1616 files) — 18:25 SGT |
| Fingerprint END | `0ba068dd4ca62781f910c5379aa9759076c135fb687eb5dbac3931f53ed16f1c` (1616 files) — 19:51 SGT |
| Manifest `--check` END | PASS (fingerprint + rubric sha256) |
| `git status --porcelain` | identical at start and end (excluding this evidence dir) |
| Candidate stability | STABLE — no edits by this audit; no other writer observed |
| Browser | Playwright 1.63.0 (repo devDependency) + bundled Chromium, headless; 1440×900 desktop, 390×844 mobile (isMobile/hasTouch); real clicks, keyboard, navigation, reloads, offline emulation, video recordings (`*.webm`) |
| Backend | `next dev --webpack` on :3000 from the repo, `.env.local`; local Supabase `muscle-fitness-claude` (26.169.20.28:54331, PostgREST/DB containers healthy); OpenAI per `.env.local`. Hosted Supabase not touched. |
| Environment events | dev server restarted once (2.8 GB WS, ~1.1 GB free RAM, repeated `ChunkLoadError`); dev compile races (`Unexpected end of JSON input`, truncated-chunk `SyntaxError`) invalidated 8 browser reps — all re-run or replaced, none graded (`H8-demo-resilience/environment-events.txt`) |
| Duration | ~1 h 30 min of execution |
| Evidence | `journeys/`, `H1-truth/`, `H5-performance/`, `H6-accessibility-privacy/`, `H8-demo-resilience/`, `shots/`, harness in `candidate/` |

**AUDIT_VALIDITY: AUDIT_VALID**

---

## SECTION B — H1 TO H8

### H1 TRUTH — **FAIL**
- Tested: cross-coach fish allergy ×7 (4 valid browser + DB), low intake Gemma→Dante (5 API + 2 valid browser), weight correction (1 API + 2 browser), Scene-5 "why" ×5 (browser), Dante mutation path (pending/confirm/ambiguous/navigation), recovery Apply ×2.
- **P0 F-01**: after a throat-swelling fish allergy told to Dante, Gemma's chat correctly excludes fish but the same panel's
  *Suggested for you* shows two **Tuna** bowls; one tap → draft "Macro confidence: HIGH" → confirm without warning → logged. 4/4 valid reps.
- **P0 F-02** (also H2/H8): Apply on the morning adjustment always 404s — HMAC over non-canonical nested key order vs jsonb storage (verified).
- **P1 F-03**: 5/5 "why" answers accept "today's workout was adjusted"; 2/5 say "modified"; 1/5 inverts the user's 9/10 fatigue/soreness to "low".
- **P1 F-17**: 700 kcal/day disclosure never reaches Dante (0/7 mention it), outcome happens to be "don't".
- PASS evidence: log_food pending→confirm→1 row→receipt; ambiguous outcome correctly "couldn't confirm… may already be saved", no blind retry;
  no fake success on Apply failure, offline set, or chat failure; Dante's own allergy handling 7/7; weight correction honestly scoped.
- Residuals A–E from H1 closure, graded by user impact: A (Gemma ignores Dante allergy) → chat now PASS, **suggestion surface FAIL (P0)**;
  B (low intake) → reverse direction FAIL (P1); C (weight readback) → value kept, but not shared to Gemma (P2);
  D ("saved" vs "recalculated") → Dante now says "Nothing has been logged or saved" (PASS in 3/3); E not reproduced.
- Score: not awarded (P0). Evidence-based sub-score for reference: 8/25.

### H2 CONTINUITY — **FAIL**
| Journey | Result | Evidence |
|---|---|---|
| A Check-in → recovery → workout relevance | PARTIAL: score 60→30 persists, recovery page and pre-session tags update; dashboard brief contradicts ("consistent with your recent recovery") | `journeys/scene1-morning/` |
| B Start → log → leave → resume | Real user: PASS (Resume 1 tap, 1/15 restored). Seeded demo account: FAIL (stale `not_started` row; dashboard says "Start Workout", no Resume) | `scene2-gym-userB/`, `scene2-gym/` |
| C Complete → recovery/nutrition/progress | PASS for progress, history, recent activity, Training×Recovery; brief stale ("proceed with the upper strength session") | `scene3-completion/` |
| D Food → macros → dashboard | PASS (persists after refresh); Gemma-log path needs manual refresh (F-10) | `scene4-nutrition/` |
| E Dante proposal → leave → return → apply | **FAIL** — card gone, DB still pending, Dante says "tap Confirm" with nothing to tap (F-16) | `H1-truth/mutation/` |
| F Dante ↔ Gemma | Allergy Dante→Gemma chat PASS, suggestions FAIL; peanut handoff PASS; low intake Gemma→Dante FAIL | `H1-truth/` |
| G Correction → other surface | FAIL — Gemma asks for weight again / uses 156 g target (F-18) | `api-final.jsonl` XWT |
| H Refresh/close-reopen | Workout/food/check-in persist; Dante conversation and pending card lost (in-memory) | as above |
| I Offline logging | MISSING — offline set completion crashes the player, typed set lost; no false sync (F-06) | `scene2-gym/s2-04-*` |
- Fail triggers met: critical safety context lost (F-01 surface, F-17), persistent proposal disappears (F-16), active workout unreachable in demo account (F-04).

### H3 CONVENIENCE — **FAIL**
- Start workout: dashboard CTA 1 tap only on the seeded row, which dead-ends; real path 3 taps / ~10.5 s (Training → plan → Start). Real users see "SCHEDULED REST DAY" on a planned day (F-05).
- Resume 1 tap ✓. Log set 3 interactions (no prefill of the targets shown pre-session, F-08). Substitution 1 select ✓.
- Food: search→portion→add = 6 interactions, 10.1 s (target <10 s); "Add Again" 1 tap ✓; "chicken rice" returns no match (F-09).
- Apply proposal: 2 taps but fails (F-02). Undo: not present for food, sets, or proposals. Coach bounce for post-workout meal (F-19).
- One clear primary CTA on dashboard/workouts/recovery ✓; nutrition page has long empty gaps (`shots/tour-desktop/_dashboard_nutrition.png`).

### H4 TRUST — **FAIL**
- Strong: proposal preview "Preview only. Nothing changes until you apply."; Dante pending card "nothing has been saved yet"; honest failure copy
  everywhere tested; nutrition provenance (USDA vs "ESTIMATED · Entered manually"); HawkerLens references labelled "NOT MEASURED".
- Weak: "Why" explanation invents a modification (F-03); contradictory authoritative states (F-07: "HIGH CONFIDENCE significant_deviation" next to
  "GREEN — TRAIN NORMALLY"; brief vs recovery page; raw `significant_deviation`, "20.91 below"); the allergy-safe chat sits beside an allergen card (F-01).
- States distinguishable: suggestion / pending / confirmed / unknown — yes in Dante; recomputed vs saved targets — Dante now says it explicitly.

### H5 PERFORMANCE — **CONDITIONAL**
- Dashboard (warm, n=5): hero median 998 ms, worst 1376 ✓ (≤2 s). Cold first dashboard after login: 1.9 s DCL.
- Tab feedback (warm, n=5 each): Nutrition 185 ms, Recovery 181 ms ✓; Training 1005 (worst 5980), Progress 981, Overview 1236 ✗ (F-20).
- Set log: optimistic toggle 138 ms (target 100), server "Set saved." 0.9–1.3 s.
- Food confirm → visible macro change ≈3.0–3.3 s (target 0.5 s ✗); Gemma log requires refresh.
- AI: first feedback (bubble + "ANALYZING") 160–180 ms ✓; first answer text median ~2.4 s, worst 8.4 s (n=5, Scene 5); complete 4.5–10.9 s.
- Mutations: check-in 6.2 s cold; finish workout 7.7 s; Dante confirm receipt 6.5 s; Adjust button appears 5.9–6.9 s after check-in.

### H6 ACCESSIBILITY & PRIVACY — **CONDITIONAL**
- Privacy: RLS cross-user read sweep (49 tables) and anon sweep — **VERIFIED (local)**; all public tables RLS-enabled. Coach context isolation: per-user,
  no cross-user leak observed. Service-role client is `server-only`, absent from client chunks (docs drift F-15). Encryption at rest/TLS: PLATFORM_ASSUMED / NOT_VERIFIED (local http).
  Console: no sensitive payloads seen in captured browser logs. Correcting durable facts: weight not correctable from chat; allergies not persisted from chat.
- Accessibility (axe WCAG 2.2 AA tags, 11 screens × 2 viewports, keyboard sweep): no horizontal overflow at 390 px ✓; focus visible on dashboard ✓;
  logical order ✓; no skip link (14 tabs to Start Workout); check-in sliders unnamed (critical ×6); player inputs/buttons unnamed; "Set saved." not announced;
  contrast failures (History 57–59, Account 15); small touch targets on mobile dashboard/history; nested `<main>`; reduced-motion CSS present (not visually verified).

### H7 DIFFERENTIATION — **NOT_VERIFIED (H7_EXTERNAL_REVIEW = PENDING)**
- Internal observation only (not scored): a judge can see real state-aware AI (Dante cites score 30, logs, allergy), honest provenance and confirm-before-write.
  The intended differentiator — "AI proposes a change, I approve, the day re-plans" — fails live at Apply (F-02), and the concept film promises more than the app does (F-22).
- Reviewer packet: `H7-differentiation/REVIEWER-PACKET.md`. No reviewer results exist.

### H8 DEMO RESILIENCE — **FAIL**
- Seeded synthetic account via `npm run demo:seed-local` works without signup ✓, but its `not_started` session makes the main CTA a dead end (F-04) and its loads look fake (curl 79 kg > bench 47 kg, F-11).
- Live app must run on `next dev` against the local stack (production build rejects http); dev races/OOM observed repeatedly (F-13).
- OpenAI delay: indicator + Stop for 20 s ✓; request failure: honest message, input lost (F-21). No deterministic Dante fallback mode found.
- Recorded fallback: concept film exists and is labelled "Concept demo · representative UI" — usable only as concept, not as product backup (F-22).
- HUMAN_REHEARSAL_PENDING (0 of 2; cold-start rehearsal not performed).

---

## SECTION C — USER JOURNEYS (canonical 5 scenes)

| Scene | Implemented? | Live pass? | Notes / evidence |
|---|---|---|---|
| 1 Morning (check-in → readiness → adjust → Apply → real change → why) | YES | **NO** | Check-in, score, preview, WHY work; Apply 404 2/2 (F-02); `journeys/scene1-morning*` |
| 2 Gym (start → log → substitute → resume; offline) | YES (offline MISSING) | PARTIAL | Real user passes start/log/sub/resume; seeded demo account dead-ends (F-04); offline crashes (F-06) |
| 3 Completion | YES | PASS (with stale brief) | `journeys/scene3-completion/` |
| 4 Nutrition (search → source → portion → confirm → macros → refresh) | YES | PASS | USDA chicken breast 150 g; 10.1 s; local dish search fails (F-09) |
| 5 Intelligence ("Why did you change today's workout?") | YES | **NO** | 5/5 accept false premise, 2/5 "modified", no controls (F-03) |
| Coach continuity | PARTIAL | **NO** | F-01, F-16, F-17, F-18 |
| End-to-end | — | **NO** | blocked at Scene 1 Apply and by F-01 |

---

## SECTION D — METRICS

| Metric | Value (n, median, worst) |
|---|---|
| Start workout (real path) | 3 clicks, 10.5 s (n=1); seeded-dashboard CTA 1 click → read-only page |
| Resume workout | 1 click, URL 303 ms, state restored (n=2) |
| Log set | 3 interactions; optimistic 138 ms; saved 0.93–1.32 s (n=3) |
| Substitute exercise | 1 select; persisted (n=1) |
| Finish workout | 1 click; 7.7 s to History (n=1) |
| Food log (search) | 6 interactions; 10.1 s; macro visible ~3.3 s (n=1 complete + 4 searches: 1.5–7.1 s, 1 no-match) |
| Add Again | 1 click; ~3.0 s to macro change (n=1) |
| Check-in submit | 16 keyboard interactions; API 6.2 s cold (n=1), Adjust button 5.9–6.9 s (n=2) |
| Apply adjustment | 2 clicks; **0/2 successful mutations** (404) |
| Dante confirm (log_food) | 1 click; receipt 6.5 s; 1 row (n=1) + ambiguous case 1 row, correct "unknown" copy |
| Dashboard warm load | n=5, median 998 ms, worst 1376 ms |
| Tab nav (URL change) | n=5 each: Nutrition 185, Recovery 181, Training 1005 (5980), Progress 981 (2660), Overview 1236 (1391) ms |
| AI first feedback / first text / done | 160–180 ms / median ~2.4 s (worst 8.4) / 4.5–10.9 s (n=5) |
| Errors | dev full-page errors 3 (progress 500, dashboard JSON, chunk timeouts); env-invalid reps 8; product 404s 2 (Apply) |
| Successful real mutations verified in DB | check-in ×3, sets ×6, substitution ×1, completion ×1, food logs ×5 (incl. allergen tuna bowl), Dante log_food ×2 |

---

## SECTION E — UX/UI

- **Desktop 1440**: strong dark visual identity, clear hero CTA on dashboard; cards dense but readable; Dante daily brief and recovery page contradict each other (F-07); nutrition page has large empty vertical gaps.
- **Mobile 390**: no horizontal overflow on 11 screens; bottom quick-capture and floating Dante present; several text links under 24 px tall; History contrast poor.
- **CTA hierarchy**: dashboard ✓ (Start/Resume/Review); workouts page leads with "Build recommended plan" even with an active plan (F-05); recovery ✓ ("Adjust Today's Plan" / "Keep Original Plan").
- **Dead ends**: seeded not_started session page; lost Dante pending card; Apply failure leaves the modal open over the error text.
- **Loading/empty/error**: skeletons present; honest error copy ("Your account and saved information have not been removed"); offline crash replaces the whole player.
- **Accessibility**: see H6.

---

## SECTION F — CRITICAL FINDINGS

| ID | Sev | Dimension | First bad stage | Artifact |
|---|---|---|---|---|
| F-01 Allergen suggested + loggable after fish allergy | **P0** | H1 H2 H4 | suggestion cards loaded once on mount from stored prefs; chat allergy never persisted | `H1-truth/xcoach-fish/` |
| F-02 Apply adjustment always 404 | **P0** | H1 H2 H3 H8 | `canonicalProposalPayload` signs nested objects in JS key order; jsonb reorders | `journeys/scene1-morning-apply/`, `H1-truth/F-02-mac-check.txt` |
| F-03 "Why" claims workout was modified | P1 | H1 H4 H7 | LLM accepts user premise; engine output = HOLD load | `journeys/scene5-intelligence/` |
| F-04 Seeded demo: Start dead-ends, no Resume | P1 | H2 H3 H8 | seed writes `not_started` session; page renders it read-only | `journeys/scene2-gym/` |
| F-06 Offline set → player crash, data lost | P1 | H2 H3 | server action throws inside transition; error boundary | `journeys/scene2-gym/` |
| F-16 Pending proposal lost on navigation | P1 | H2 H4 | chat messages in React state only | `H1-truth/mutation/` |
| F-17 Low intake not used by Dante | P1 | H1 H2 | fact not shared Gemma→Dante | `H1-truth/api-final.jsonl` |
| F-05 Planned day = "SCHEDULED REST DAY" | P1 | H3 | today's session only exists as a row | `journeys/scene2-gym-userB/` |
| F-07, F-08, F-09, F-10, F-12, F-13, F-18, F-19, F-20, F-22 | P2 | see register | | `findings/FINDINGS.md` |
| F-11, F-14, F-15, F-21 | P3 | | | |

---

## SECTION G — TOP 10 HACKATHON GAPS (criticality · judge visibility · impact · effort)

1. **F-02 Apply 404** — kills the headline scene; tiny fix (canonicalize `before`/`after` keys or sign the stored JSON). Highest value per line of code.
2. **F-01 Allergen suggestion** — safety; visible on the nutrition screen judges will open; filter suggestions with session/chat-disclosed allergies and persist them (with user confirmation).
3. **F-04 Demo seed dead end** — first click in the demo fails; fix the seed (no `not_started` row, or give that state a Start button).
4. **F-03 False "why"** — the intelligence scene; ground the answer in the engine decision (HOLD vs APPLIED) and reject the premise when no change happened.
5. **F-16 Lost pending proposal** — re-hydrate pending `dante_tool_actions` into the chat on load.
6. **F-07 Contradictory states** — one decision source for brief, recovery page and pre-session tags; hide raw enums/decimals.
7. **F-17 Low-intake context** — share the nutrition risk signal with Dante's training answers.
8. **F-05 / F-08 Start friction** — show today's planned day on dashboard with a 1-tap Start (calls `start_workout`); prefill set rows with the shown targets.
9. **F-06 Offline** — at minimum keep typed values and show a retry banner instead of crashing; true offline queue is a larger feature (the film shows it).
10. **F-13 / F-22 Demo environment and film** — rehearse on a warm dev server with headroom (or a non-loopback HTTPS dev project, if approved); present the film only as concept.

---

## SECTION H — MINIMUM WINNING DEMO

- **Executable truthfully today** (use a fresh seeded account **with the `not_started` row removed**, or start via Training → plan):
  1. Poor check-in → score 30, "Why this score", recovery page explains; show the **preview** of the adjustment but do not press Apply (it fails).
  2. Training → plan → Start workout → log a set (Set saved.) → swap an exercise → go to dashboard → **Resume** → finish → History, streak, volume, Training×Recovery update.
  3. Track Food → "chicken breast" (USDA) → 150 g → Add → macros update; point at provenance labels.
  4. Ask Dante "Log 150 g grilled chicken breast for lunch" → pending card ("nothing has been saved yet") → Confirm → ✓ Done → row in log. Optionally show the honest "couldn't confirm" state.
  5. Tell Dante about a fish allergy → Dante's own advice respects it. **Do not open the Nutrition Coach suggestion cards** until F-01 is fixed.
- **Blocked scenes**: Scene 1 Apply (F-02), Scene 5 "why" (F-03), offline gym (F-06), Gemma suggestions after allergy (F-01).
- **Smallest coherent alternative path**: steps 1–4 above (≈4 min) — real state, real writes, honest receipts.
- **Fallback**: A live app (dev server, warm, nothing else running); B no deterministic Dante fallback exists; C concept film only with its "Concept demo" label read aloud.
- **Judge wow moment (once F-02 is fixed)**: poor sleep → "Adjust Today's Plan" preview 3×→2× with WHY → Apply → the workout they then start really has 2 sets.
- **What a judge would remember today**: a polished, honest tracker whose AI talks about your real numbers and asks before writing — plus, if they wander, a "Suggested: Tuna bowl" right after a fish-allergy disclosure.

---

## SECTION I — RECOMMENDED NEXT WORK (not implemented)

| Pri | Task | Agent / owner | Contract | Expected result | Validation | Depends |
|---|---|---|---|---|---|---|
| P0 | Fix proposal MAC canonicalization (F-02) | backend engineer (Claude, code-edit) | sign a key-sorted canonical form of `before`/`after` (or the stored jsonb text); keep tamper check; existing rows may be re-issued | Apply returns 200, sets 3→2 in DB, "Today's plan is updated." persists across reload | Scene 1 in browser ×3 + apply-proposal tests; H1+H2+H3/H4 Apply re-audit | — |
| P0 | Allergy-safe suggestions (F-01) | nutrition-coach owner | every suggestion/draft/log path filters against stored allergies **and** this-session disclosed reactions; offer "Save allergy to profile?" | no fish item in cards/drafts after disclosure; confirm dialog warns if user forces it | fish ×5, peanut ×3, shellfish ×3 cross-coach in browser; H1 re-audit | — |
| P0 | Demo seed fix (F-04) | demo owner | seed no `not_started` today session (or make `not_started` page startable) | dashboard Start → live player in 1 tap; Resume visible mid-workout | Scene 2 on fresh seed, cold start | — |
| P1 | Grounded "why" (F-03) | Dante owner | answer from engine decision object; if no change applied say so and offer the Adjust preview | 0/10 false "modified" claims | Scene 5 ×10 | F-02 |
| P1 | Rehydrate pending actions (F-16) | Dante owner | on chat mount, load pending `dante_tool_actions` for the user and render Confirm/Cancel | card survives navigation/refresh | Journey E ×3 | — |
| P1 | Low-intake signal to Dante (F-17) | intelligence-core owner | Gemma restriction disclosure becomes a shared context fact | Dante cardio answer cites intake 5/5 | XLOW ×5 API + ×2 browser | — |
| P1 | 1-tap start from plan day (F-05/F-08) | training owner | dashboard shows planned day with Start → `start_workout`; prefill set targets | ≤1 tap start, 2-interaction set log | H3 counts | F-04 |
| P1 | Offline-safe set logging (F-06) | training owner | catch action failure, keep inputs, show retry; queue optional | no crash, no data loss | offline emulation ×3 | — |
| P2 | Single decision source / copy cleanup (F-07), a11y labels (F-12), nav loading states (F-20), Gemma live macros (F-10), local dish search (F-09), Gemma weight sharing (F-18) | UI / a11y | per register | contradictions gone; axe critical = 0 on check-in & player | axe + screenshots; H4/H6 rerun | — |
| P2 | Demo environment + rehearsals (F-13, H8) | demo owner | warm dev server with memory headroom, rehearsal checklist, 2 human rehearsals incl. 1 cold start | rehearsal log | H8 rerun | P0s |
| P2 | External review (H7) | team lead | run `REVIEWER-PACKET.md` with 2 outsiders | 2 reviewer files | H7 | P0s |

Re-audit scope: F-02/F-03/F-16 touch the mutation layer → H1 + H2 + affected H3/H4/H5 + core demo; F-01/F-17 → H1 + H2 + H4; UI items → affected H3 + H5 + H6 + scene; messaging/film → H7 reviewers.

---

## SECTION J — FINAL

- **AUDIT_VALIDITY:** AUDIT_VALID (START = END `0ba068dd…`, HEAD `62084744`, branch `video/one-day-in-the-life`).
- **H1–H8:** H1 FAIL · H2 FAIL · H3 FAIL · H4 FAIL · H5 CONDITIONAL · H6 CONDITIONAL · H7 NOT_VERIFIED (external review pending) · H8 FAIL.
- **Blockers:** F-01 (P0, allergen suggested and loggable after disclosed fish allergy), F-02 (P0, morning Apply always fails).
  Release-blocking P1s: F-03, F-04, F-05, F-06, F-16, F-17.
- **H7 external review:** PENDING.
- **Evidence-based score (secondary, overridden by P0):** H1 8/25 · H2 8/20 · H3 7/15 · H4 7/15 · H5 4/8 · H6 4/7 · H7 — /7 (not scored) · H8 1/3 = **39 / 93 scored points**.
- **FINAL_VERDICT: NO**
- **READY_FOR_MINIMUM_WINNING_DEMO: NO** — a truthful reduced demo (Section H, steps 1–4) is executable today, but the canonical
  5-scene demo is not: Scene 1 Apply and Scene 5 "why" fail, and the nutrition screen can show an allergen recommendation on camera.
