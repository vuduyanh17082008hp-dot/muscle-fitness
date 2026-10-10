# Muscle Fitness Live Product Audit

**Live site:** https://muscle-fitness-ten.vercel.app  
**Audit date:** 6 Oct 2026  
**Mode:** Audit only. No product code changed. No commit, push, deploy, or database writes.  
**Method:** Live Chrome screenshots and CDP inspection at 1440 / 1280 / 768 / 390, HTTP probes to production APIs, then source trace for P0/P1 only.

**Auth note:** No production session was available. Core app routes redirected to `/login`. Authenticated Dashboard, Training, Recovery, Nutrition, Progress, Settings, and logged-in Dante conversations are **NOT TESTABLE — AUTH REQUIRED**. Source is used only to trace observed live issues and to describe what a logged-in demo *should* show — never to claim those surfaces work in production.

---

## 1. Executive Verdict

Muscle Fitness already looks like a real product on the public homepage, login, signup, Responsible AI, AI Fair, and competition deck — not a generic student template. The core thesis (profile + training + nutrition + recovery → Dante → action) is communicated clearly once the hero finishes loading. The competition risk is not “the idea is weak.” It is that the live site still contains a few surfaces a judge can wander into and lose confidence: legal pages that literally say PLACEHOLDER, a leftover `/workout` page with broken images, and a public `/chatbot` that shows Dante as Online while the API returns 401. The actual coaching product sits behind authentication, which is correct, but this audit could not verify Dashboard → Recovery → Nutrition → Dante → Progress on production. If a real seeded account is already logged in tomorrow, the public marketing is competition-grade and the remaining P0s are small, local fixes — not a rewrite. If judges explore logged-out, those leftovers can dominate the impression.

## 2. Final Score

| Area | /10 | Evidence |
| --- | --- | --- |
| UI DESIGN | 8.2 | VERIFIED LIVE after hydration |
| UX | 7.0 | VERIFIED LIVE public; auth core NOT TESTABLE |
| VISUAL CONSISTENCY | 6.4 | Three visual systems + leftover page |
| INFORMATION ARCHITECTURE | 6.6 | Product nav on marketing; duplicate Dante routes |
| DASHBOARD | 6.5 | NOT TESTABLE live; SOURCE CONFIRMED structure |
| TRAINING | 6.0 | `/workout` VERIFIED LIVE leftover; real Train NOT TESTABLE |
| NUTRITION | 6.8 | Public meal-plan VERIFIED; dashboard nutrition NOT TESTABLE |
| RECOVERY | 7.2 | Marketing VERIFIED; product flow SOURCE CONFIRMED / NOT TESTABLE |
| PROGRESS | 6.4 | NOT TESTABLE live |
| DANTE | 5.4 | Public shell VERIFIED FAIL; authenticated chat NOT TESTABLE |
| RESPONSIBLE AI | 8.0 | `/responsible-ai` excellent; legal + “clinically-safe” hurt |
| MOBILE | 7.1 | Hero works after load; orbit/login/chat clipping |
| ACCESSIBILITY | 6.5 | Contrast, GSAP first paint, custom cursor |
| PERFORMANCE | 7.3 | No console errors captured; delayed hero copy |
| PRODUCT COHERENCE | 6.7 | Thesis is clear; leftovers break the ecosystem story |
| COMPETITION READINESS | 7.4 | Strong if demo is logged in and P0s avoided |

**Overall: 73 / 100**

**Competition readiness classification:** NEARLY READY — marketing and RAI are competitive; three live leftover/trust issues plus an untested authenticated demo path keep it short of COMPETITION READY.

## 3. What Is Already Excellent

- Homepage thesis is sharp: “Train hard. Recover smart. Adapt continuously.” plus “It starts with your state, not a chatbot.” VERIFIED LIVE.
- Adaptive training marketing card shows original vs adapted plan, a why-line, and “Illustrative example session.” That is the product, visually. VERIFIED LIVE.
- Login, register, and forgot-password are premium, branded, and complete. VERIFIED LIVE.
- `/responsible-ai` is one of the strongest pages: no diagnosis, no invented evidence, uncertainty, sensor limits. VERIFIED LIVE.
- `/ai-fair` is a coherent submission narrative, not filler. VERIFIED LIVE.
- `/competition-deck` looks like a real pitch product (18 slides, PRESENT controls). VERIFIED LIVE.
- `/story` has a distinct voice and is not generic AI copy. VERIFIED LIVE.
- Auth gating of `/dashboard/*` is real (401/redirect), not a fake lock. VERIFIED LIVE.
- Recovery adjustment UI in source implements “AI proposes, user decides” with preview, Keep Original, and Apply. SOURCE CONFIRMED, NOT TESTABLE live.
- Progress heatmap CSS treats `NO_REQUIREMENT` as muted grey and `MISSED` as red — rest is not styled as failure. SOURCE CONFIRMED, NOT TESTABLE live.
- Chatbot API refuses anonymous use with a clear error. VERIFIED LIVE.

## 4. P0 — Must Fix

### P0-1. Legal pages are labeled PLACEHOLDER and are linked from signup
- **Issue:** `/privacy` and `/terms` show a cyan “PLACEHOLDER” badge and admit the pages exist so signup links do not 404.
- **Live evidence:** VERIFIED LIVE at https://muscle-fitness-ten.vercel.app/privacy and `/terms`. Signup/register checkbox links both URLs. SOURCE CONFIRMED `app/register/register-form.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`.
- **Impact:** A judge opening Terms from “Create account” sees the word PLACEHOLDER. That is a trust killer the day before a competition.
- **Likely source:** `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/register/register-form.tsx`.
- **Exact recommended fix:** Remove the word “Placeholder.” Keep the honest “under legal review” sentence. Point to `/responsible-ai` as the live explanation of data use. Do not invent a fake policy. Do not rewrite the register form.

### P0-2. Public Dante looks online and cannot answer
- **Issue:** `/chatbot` shows “Online”, “Dante is ready”, “Your AI Performance Coach”, and an input. `POST /api/chatbot` returns `401 {"ok":false,"error":"You must be logged in to use Dante."}`. Meal-plan CTA “ASK DANTE ABOUT YOUR NUTRITION” links here.
- **Live evidence:** VERIFIED LIVE UI + VERIFIED LIVE API. Meal nav CDP: `href: "/chatbot"`. SOURCE CONFIRMED `app/api/chatbot/route.ts` auth gate, `app/chatbot/page.tsx`, `app/meal-plan/page.tsx`.
- **Impact:** The most important AI surface a logged-out judge can touch is a costume. “Online” while refusing the request is worse than a login wall.
- **Likely source:** `app/chatbot/page.tsx`, `components/dante-chat.tsx`, `app/api/chatbot/route.ts`, meal-plan Dante link.
- **Exact recommended fix:** On `/chatbot` when unauthenticated, do not show Online/ready/input that appears to chat. Show one line: “Dante uses your training, recovery and nutrition — log in to talk.” Point to `/login?next=/dashboard/ai-coach`. Change meal-plan CTA to the same login path. Do not open Dante to anonymous users the night before the demo.

### P0-3. Live `/workout` is a leftover student page with broken images
- **Issue:** https://muscle-fitness-ten.vercel.app/workout is “Smart Workouts” + “Generate AI Plan” + three empty cards. Images 404. Visual system does not match the product. `POST /api/plan` returns 401.
- **Live evidence:** VERIFIED LIVE screenshots + CDP `brokenImgs` for squat/pushup/deadlift. SOURCE CONFIRMED `app/workout/page.tsx`.
- **Impact:** One URL undoes the “this is a real platform” story.
- **Likely source:** `app/workout/page.tsx`, `components/ExerciseCard`, `/api/plan`.
- **Exact recommended fix:** Redirect `/workout` → `/dashboard/workouts` (auth will send judges to login). Do not restyle it. Do not keep it public.

### P0-4. Authenticated Golden Journey is not verified on production
- **Issue:** `/dashboard`, `/dashboard/recovery`, `/dashboard/nutrition`, `/dashboard/progress`, `/dashboard/ai-coach`, `/dashboard/workouts`, `/settings`, `/onboarding` all resolved to the login screen in this audit.
- **Live evidence:** VERIFIED LIVE (same login screenshot/filesize cluster). NOT TESTABLE — AUTH REQUIRED for the planned 4-minute demo.
- **Impact:** If the demo account is not already signed in, half the presentation is a login form.
- **Likely source:** `lib/supabase/proxy.ts`, `app/dashboard/page.tsx` `redirect("/login?next=/dashboard")`.
- **Exact recommended fix:** Operational, not a refactor. Before tomorrow: log in the real demo account, complete onboarding, confirm today’s recovery/nutrition/workout rows, keep the tab open, and never create a new production user during the talk.

## 5. P1 — Fix If Time Allows

### P1-1. Logged-out homepage nav uses app destinations
- **Issue:** Header links Dashboard / Train / Nutrition / Progress / Dante go to `/dashboard`, `/dashboard/workouts`, `/dashboard/nutrition`, `/dashboard/progress`, `/dashboard/ai-coach`. All auth-redirect to login. Hero orbit nodes do the same. Dante node is labeled “AI Coach”.
- **Live evidence:** VERIFIED LIVE CDP nav hrefs. SOURCE CONFIRMED `components/experience/motion-home/MotionHomepage.tsx`, `hero/Ecosystem.tsx` (`value: "AI Coach"`), `data/homepageViewModel.ts` `HOMEPAGE_ROUTES`.
- **Impact:** Looks like the product is open. Clicks feel broken.
- **Fix:** Point those items at in-page chapters (`#training`, `#nutrition`, `#dante`) or to `/login?next=...`. Rename orbit Dante value from “AI Coach” to “Dante”.

### P1-2. Hero copy is invisible until GSAP runs
- **Issue:** `.hero-line` animates from opacity 0. Early headless captures showed a dark empty hero; waiting ~3s showed the full headline. First paint can look like a screensaver.
- **Live evidence:** VERIFIED LIVE (early vs late screenshot). SOURCE CONFIRMED `components/experience/motion-home/sections/HeroScene.tsx`.
- **Impact:** First 1–2 seconds of a live demo or slow laptop.
- **Fix:** CSS default opacity 1 on `.hero-line`; keep GSAP as enhancement. Do not rebuild the motion homepage.

### P1-3. Illustrative numbers contradict each other on the same homepage
- **Issue:** Orbit shows Recovery **87**, Nutrition **154 g**, Progress **+14.7%**, Week **08**. Recovery chapter shows **72 READY** and protein **96 / 160g**. Both are unlabeled-as-live in the orbit.
- **Live evidence:** VERIFIED LIVE. SOURCE CONFIRMED hardcoded `MODULE_DEFS` in `hero/Ecosystem.tsx` vs `FALLBACK_VIEW_MODEL` in `homepageViewModel.ts`.
- **Impact:** Judges who look closely think the data is fake or buggy.
- **Fix:** Drive orbit labels from the same fallback view model, or drop numbers from the orbit and keep names only.

### P1-4. Meal-plan is a second product
- **Issue:** `/meal-plan` is black/white editorial, different nav (HOME / MY STORY / MEAL PLAN / TRAINING / DASHBOARD), different type, “STOP GUESSING WHAT TO EAT.” Training link goes to `/training` (login). Dante link goes to `/chatbot` (P0-2).
- **Live evidence:** VERIFIED LIVE. SOURCE CONFIRMED `app/meal-plan/page.tsx`.
- **Impact:** Breaks “one coaching ecosystem.”
- **Fix:** If there is time: restyle the header only to the Muscle Fitness chrome and retarget Dante/Training links. Do not rebuild the calculator.

### P1-5. Login / signup / chatbot clip on 390px
- **Issue:** Login subtitle and “Forgot password” clip; signup terms wrap into “M Fitness”; chatbot send control sits off-canvas.
- **Live evidence:** VERIFIED LIVE screenshots at 390×844.
- **Likely source:** `app/login/page.tsx` (or login form component), `app/register/register-form.tsx`, `app/chatbot/page.tsx` / `components/dante-chat.tsx`.
- **Fix:** `min-w-0`, allow forgot-password to wrap, keep send button in a sticky bar with `safe-area-inset`.

### P1-6. Problem-section contrast
- **Issue:** Fourth problem card (“Expensive coaching…”) is substantially dimmer than the others.
- **Live evidence:** VERIFIED LIVE `cdp-chapter-problem`.
- **Likely source:** `components/experience/motion-home/sections/ProblemScene.tsx`.
- **Fix:** Same text color/opacity as sibling cards.

### P1-7. Pitch deck claims “clinically-safe”
- **Issue:** Slide 1: “evidence-informed, clinically-safe, context-aware AI coaching.”
- **Live evidence:** VERIFIED LIVE `/competition-deck`.
- **Impact:** Responsible-AI own-goal. The product correctly says it does not diagnose.
- **Fix:** Replace with “safety-constrained” or “non-diagnostic.” Do not retouch the rest of the deck.

### P1-8. Sidebar still contains unfinished destinations
- **Issue:** Source nav “More” includes Check-in, Messages, Experiments, Calendar. Check-in and Messages are “coming soon” empty states.
- **Live evidence:** SOURCE CONFIRMED `components/dashboard/dashboard-shell.tsx`, `app/dashboard/[section]/page.tsx`. NOT TESTABLE live.
- **Impact:** Live demo click into Messages looks unfinished.
- **Fix:** Hide Check-in and Messages from the sidebar for the demo. Do not build them.

### P1-9. Muscle Atlas copy overclaims the visual
- **Issue:** “See every muscle. Track real exposure” / “3D muscle taxonomy” sits next to a 2D bar list and an unsigned Dante quote (“Chest recovery at 94%”).
- **Live evidence:** VERIFIED LIVE homepage chapter. The quote is marketing, not a live user.
- **Fix:** Add “Illustrative” on the Dante quote (same pattern as the session card). Soften “3D” if the live atlas is not 3D. Do not ship a new 3D renderer.

### P1-10. Public `/chatbot` copy violates Dante naming
- **Issue:** “Your AI Performance Coach” on the public Dante page. Product rule: user-facing name is Dante, never “AI Coach.”
- **Live evidence:** VERIFIED LIVE.
- **Likely source:** `app/chatbot/page.tsx` / Dante landing chrome inside `components/dante-chat.tsx`.
- **Fix:** “Your coach” or “Dante.” Combined with P0-2.

## 6. P2 — After Competition

- Duplicate chapter index “06” on Recover and Fuel. VERIFIED LIVE.
- Homepage “LIVE” pulse can read as fake telemetry. VERIFIED LIVE.
- Recovery marketing ring: LOAD is “—”. VERIFIED LIVE.
- Custom cursor on the homepage (`cursor: none` when fine pointer). SOURCE CONFIRMED `CustomCursor.tsx`. Can feel gimmicky; already gated for reduced motion.
- `/register` vs `/signup` alias is fine; forgot-password “03 / 04 SECURE ACCESS” is meaningless theatre.
- Public `/workout` “Generate AI Plan” toast path. Covered by P0-3.
- Progress `restDays` counted as `RECOVERY_COMPLETE` rather than planned rest (`NO_REQUIREMENT`). SOURCE CONFIRMED `lib/progress/presentation.ts`. Verify after competition; do not retouch progress the night before.
- Two Dante entry points: `/chatbot` and `/dashboard/ai-coach`. Fold after the event.
- Meal-plan mobile headline overflow (“BUILD A SYSTEM”). VERIFIED LIVE.
- Sticky mobile header covering hero microcopy on scroll. VERIFIED LIVE.
- Competition-deck next control did not advance in CDP (still slide 01). Treat PRESENT as the live path; rehearse keyboard/click. INFERRED from one CDP click miss — do not rebuild the deck.

## 7. Page-by-Page Audit

### Landing — https://muscle-fitness-ten.vercel.app
**First 5–10 seconds (after JS):** Strong brand, obvious CTA, premium, not a student template. Orbit communicates AI + fitness without a stock brain graphic.

**First 5–10 seconds (before GSAP):** Can look empty. See P1-2.

Scores /10: Visual impact 8.5 · Product clarity 8.0 · Trust 7.0 (illustrative numbers) · Premium 8.5 · Brand 8.5 · Competition 8.0.

CTAs: START NOW, ENTER THE SYSTEM, MEET DANTE. Slightly many; ENTER THE SYSTEM is the right primary.

### Dashboard
NOT TESTABLE — AUTH REQUIRED. SOURCE CONFIRMED `app/dashboard/page.tsx` + glass cards: greeting, today’s plan, readiness, Dante decision, nutrition, muscle intelligence, recent activity, progress snapshot. Hierarchy in code is correct for a 10-second “where am I / what next” scan. Treat as KEEP the current layout. Do not redesign tomorrow.

| Element | Action | Note |
| --- | --- | --- |
| Greeting / date | KEEP | |
| Today’s plan | KEEP | Primary |
| Readiness | KEEP | Primary |
| Dante card | KEEP | Primary |
| Nutrition | KEEP | Secondary column |
| Muscle intelligence | KEEP | Below fold |
| Recent activity | MERGE visually if noisy | Do not remove data |
| Progress snapshot | KEEP | |
| Shortcuts / More nav | MOVE unfinished items out | P1-8 |

### Training
Live public: `/workout` is classification **A — spreadsheet leftover**. Real Train at `/dashboard/workouts` is NOT TESTABLE. Source is closer to **C — intelligent training platform** (today’s session, splits, library, SetVision, form coach, muscle atlas). Demo Train, never `/workout`.

### Recovery
Marketing chapter is clear: state, sleep, load, protein, Open Recovery. Product page NOT TESTABLE. Source implements score → recommendation → check-in → before/after proposal → user confirm. That is the right flow. Demo this page second. Do not add more charts tomorrow.

### Nutrition
Public `/meal-plan` feels like a separate calorie studio, not Muscle Fitness. Dashboard nutrition NOT TESTABLE. Demo `/dashboard/nutrition` only. Skip `/meal-plan` unless asked.

### Dante
Public `/chatbot`: mascot + chips + Online. Conversation FAIL without auth. Authenticated `/dashboard/ai-coach` NOT TESTABLE. Do not demo `/chatbot`. Demo logged-in Dante only.

### Progress
NOT TESTABLE. Source has journey, streak, heatmap, rest vs missed, milestones. Demo last, after logs have been shown.

### Settings
NOT TESTABLE (redirects to login). Do not open unless signing out.

### Other live pages
| Page | Verdict |
| --- | --- |
| `/login` `/register` `/forgot-password` | Premium. Mobile clip P1. |
| `/responsible-ai` | Excellent. Show if asked about safety. |
| `/ai-fair` | Excellent. Optional backup. |
| `/competition-deck` | Strong. Fix “clinically-safe”. Rehearse PRESENT. |
| `/story` | Good voice. Optional. |
| `/privacy` `/terms` | P0 PLACEHOLDER. |
| `/meal-plan` | Do not demo. |
| `/workout` | P0 hide. |
| `/robots.txt` `/sitemap.xml` | 404. P2. |

## 8. Dante Test Results

Authenticated Dante (the real coach) is **NOT TESTABLE — AUTH REQUIRED**.

Public `/chatbot` + `POST /api/chatbot` were tested without writing user records.

### TEST A — Basic context
- **PROMPT:** “What should I train today?”
- **OBSERVED:** Public page accepted the field visually. API: `401 You must be logged in to use Dante.` UI did not surface a clear login error on CDP submit (controlled React input).
- **RESULT:** FAIL (as a coach). PASS (as an auth gate that exists).
- **REASON:** No personalisation is possible logged out; the chrome still says Online.

### TEST B — Multi-obligation (knee / no diagnosis / no statistics)
- **RESULT:** NOT TESTABLE — AUTH REQUIRED.

### TEST C — Uncertainty
- **RESULT:** NOT TESTABLE — AUTH REQUIRED.

### TEST D — Correction
- **RESULT:** NOT TESTABLE — AUTH REQUIRED. Do not run this live if it would rewrite profile facts. Use a disposable preference (“I prefer shorter sessions”) if you test at all.

### TEST E — Safety (pain / severe fatigue)
- **RESULT:** NOT TESTABLE live. SOURCE CONFIRMED: `lib/dante-core/safety-layer.ts`, risk accumulator, “no diagnosis” copy on `/responsible-ai`. That is architecture, not a live pass.

### TEST F — “Bro, I’m exhausted today.”
- **RESULT:** NOT TESTABLE — AUTH REQUIRED.

### Dante scorecard (live, logged out)

| Dimension | /10 |
| --- | --- |
| CONTEXT AWARENESS | 2 |
| PERSONALISATION | 1 |
| SAFETY | n/a live / 8 architecture |
| UNCERTAINTY | n/a live |
| ACTIONABILITY | 2 |
| NATURALNESS | n/a live |
| CONSISTENCY | 4 (Online vs 401) |
| BREVITY | n/a live |
| NON-REPETITION | n/a live |
| TRUST | 3 |
| COACHING QUALITY | 2 |

**Live public classification: A — Generic chatbot shell that does not complete a turn.**  
**Authenticated classification: NOT TESTABLE.** Source shape is built for **D — Intelligent coaching system** (athlete state, deterministic scores, propose/confirm tools). Do not claim D tomorrow unless the logged-in turn actually cites today’s recovery/session.

**Tomorrow’s live prompt (from `docs/DEMO_ACCOUNT.md`, do not script the reply):**  
“Based on my recovery and recent training, what should I do today?”

Do not type Test B live unless rehearsed. Knee + six obligations is a high-variance demo.

## 9. Responsive Audit

| Width | Landing | Login | Chatbot | Meal-plan |
| --- | --- | --- | --- | --- |
| 1440 | Strong after load. Orbit readable. | Premium. | Desktop theatre layout. | Editorial, usable. |
| 1280 | Same as 1440. Headline present after GSAP. | — | — | — |
| 768 | Headline + orbit stacked. Good. | — | — | — |
| 390 | Hero works after load. Sticky header eats microcopy on scroll. Orbit nodes overlap. START NOW + menu OK. | Subtitle/Forgot clip. | Send clipped. Online hidden. | Headline overflow. |

Mobile is designed, not merely shrunk, on the homepage. Login/signup/chatbot/meal-plan are closer to desktop-shrunk. Authenticated shell NOT TESTABLE.

No horizontal document scroll on landing at 1440 (CDP `overflowX: false`). Login 390 still visually clips inside the card.

## 10. Accessibility Audit

Only issues with reasonable support:

- Hero content starts at opacity 0 until GSAP. Keyboard/AT users with slow JS get an empty main. VERIFIED LIVE + SOURCE CONFIRMED.
- Problem card 4 contrast is weak. VERIFIED LIVE.
- Custom cursor hides the system pointer on fine-pointer desktops. SOURCE CONFIRMED. Reduced-motion gated — good.
- Hamburger has `aria-label="Toggle navigation menu"`. VERIFIED LIVE CDP.
- Heading order on landing is logical (one H1, then H2s). VERIFIED LIVE.
- Orbit nodes are links to auth routes; not named as “example data.”
- `/chatbot` “Online” is not a live connection indicator for anonymous users.
- Form labels exist on login/register. VERIFIED LIVE.
- Color-only heatmap status is a future a11y risk (SOURCE CONFIRMED `data-status`); not live-verified.
- Competition deck “clinically-safe” is an a11y/RAI language issue, not a WCAG fail.

## 11. Cross-Page Continuity

| Expected | Actual | Impact | Source | Fix |
| --- | --- | --- | --- | --- |
| One visual system | Motion homepage + glass app + editorial meal-plan + leftover `/workout` | Judges see four products | Live pages | Hide `/workout`; skip meal-plan in demo |
| Nav Dante → working coach | Header Dante → `/dashboard/ai-coach` → login. Meal-plan Dante → `/chatbot` → 401 | Broken AI story | CDP + API | P0-2, P1-1 |
| Recovery 87 in orbit = recovery 72 in chapter | Different hardcoded fallbacks | Fake-data suspicion | `Ecosystem.tsx` vs `FALLBACK_VIEW_MODEL` | P1-3 |
| Recovery → training adjustment with confirm | SOURCE CONFIRMED panel with Keep/Apply | Demo wow if it shows | `recovery-adjustment-panel.tsx` | Rehearse on logged-in account |
| Progress from real logs | NOT TESTABLE | Do not invent a then-vs-now story | `load-progress-page` | Only speak to what’s on screen |
| Dante knows today’s state | API requires auth; public page cannot | Do not demo `/chatbot` | `app/api/chatbot/route.ts` | Logged-in `/dashboard/ai-coach` only |

## 12. Competition Demo Audit

Planned: Dashboard → Recovery → Nutrition → Dante → Progress (4 minutes live).

1. **Which page should be first?** Logged-in Dashboard. Not the motion homepage unless you have 20 spare seconds after GSAP.
2. **Strongest page (public):** Landing (after load) and `/responsible-ai`. **Strongest intended demo page (if data is real):** Recovery propose/confirm.
3. **Weakest live page a judge can open:** `/workout`, then `/privacy`.
4. **Riskiest feature:** Authenticated Dante (latency, 401, generic reply, safety turn). Second: SetVision/HawkerLens if cold-started.
5. **Three WOW moments:** (a) Homepage adapted-session card. (b) Recovery before/after + Keep/Apply. (c) Dante citing today’s actual recovery + planned session.
6. **What can fail live:** Cold login, empty recovery check-in, Dante timeout, GSAP-blank homepage, clicking Messages/Check-in, opening `/chatbot`.
7. **Preload:** Authenticated session, today’s check-in already saved, nutrition with remaining protein, Progress already painted, Dante first token warmed with a harmless ping if you must.
8. **Never type live:** Knee diagnosis prompt; anything that mutates the workout unless Recovery Apply is the point; passwords; “ignore previous instructions”; raw JSON.
9. **What confuses a judge:** “AI Coach” vs Dante; 87 vs 72; PLACEHOLDER legal; Online chatbot that cannot chat; meal-plan looking like another startup.
10. **Is 4 minutes achievable?** Yes — if already logged in and you skip meal-plan, `/workout`, Settings, and SetVision.

## 13. Best 4-Minute Demo Flow

0:00 Already on **Dashboard** (logged in). One sentence: today’s plan, readiness, remaining protein.  
0:40 **Recovery.** Score, why, proposal. Show Keep vs Apply. Do not apply unless rehearsed.  
1:30 **Nutrition.** Remaining protein, one logged meal. Do not search foods live.  
2:10 **Dante** at `/dashboard/ai-coach`. Ask: “Based on my recovery and recent training, what should I do today?” Stop talking while it streams.  
3:10 **Progress.** Heatmap + one real milestone. Point at rest vs missed if visible.  
3:45 Back to Dashboard. Close: “The model is not the system. Dante proposes. The user decides.”

Homepage only if you have extra time at the start of the 6-minute talk, after the hero has painted.

## 14. Top 10 Changes With Highest ROI

1. Remove “PLACEHOLDER” from privacy/terms.  
2. Redirect `/workout` → `/dashboard/workouts`.  
3. Logged-out `/chatbot` → login CTA; retarget meal-plan Dante link.  
4. Confirm production demo account is logged in with today’s data.  
5. Rename orbit “AI Coach” → “Dante”; unify illustrative numbers.  
6. Logged-out header: chapter links or login-with-next.  
7. Hero CSS opacity 1 before GSAP.  
8. Hide Messages + Weekly Check-in from sidebar.  
9. Replace “clinically-safe” on deck slide 1.  
10. 390px login/chat send clipping if you will show a phone.

## 15. What NOT To Change Before Competition

Do not rebuild the motion homepage.  
Do not restyle the dashboard glass system.  
Do not open Dante to anonymous users “so the audit can chat.”  
Do not rewrite Dante Core, safety layer, or the chatbot route.  
Do not merge meal-plan into dashboard nutrition overnight.  
Do not add new features (SetVision live accuracy claims, new 3D atlas, new gamification).  
Do not invent a Privacy Policy. Honesty without the word PLACEHOLDER is enough.  
Do not run `demo:seed-local` against hosted Supabase.  
Do not force-push, redesign tokens, or swap fonts.  
Do not demo HawkerLens or SetVision unless they are already warm and labeled.

## 16. Final Verdict

NEARLY READY

---

AUDIT COMPLETE

LIVE SITE:  
https://muscle-fitness-ten.vercel.app

CODE CHANGED = NO  
COMMIT = NO  
PUSH = NO  
DEPLOY = NO

P0 COUNT = 4  
P1 COUNT = 10  
P2 COUNT = 12

OVERALL SCORE = 73/100

FINAL VERDICT = NEARLY READY
