# UXR-1 — Design System Foundation

Contract: `docs/ux/UXR-0.md`.

## Step A — semantic token foundation + authenticated scope

Status: DONE. Step B (component migration) not started.

### Mechanism

- `components/dashboard/dashboard-shell.tsx` root `<div>` gets the class `mf-app`
  (the only shell edit). `/dashboard/*` only; `/account`, `/onboarding`,
  `/business/*` and public routes are not inside `.mf-app`.
- Tokens live in `app/ux-tokens.css`, imported by one line in `app/globals.css`.
  Public `:root` / `@theme` values are untouched.
- Tailwind v4 note: `@theme` utilities read `--color-*` variables whose
  `var(--mf-*)` references are resolved at `:root`. Overriding `--mf-*` inside
  `.mf-app` alone does nothing for `bg-mf-glass-*` / `amber-*`, so the final
  `--color-*` names are re-declared inside `.mf-app` as well.
- `html:has(.mf-app)` sets the canvas (overscroll/scrollbar) to the light theme
  only while the shell is mounted.

### Canonical tokens (starting values; none adjusted)

| Token | Value |
|---|---|
| `--app-bg-page` / `base` / `elevated` / `interactive` / `selected` | `#F4F2ED` / `#FBFAF8` / `#FFFFFF` / `#ECE9E2` / `#E5ECFB` |
| `--app-text-primary` / `secondary` / `muted` | `#191712` / `#4A463E` / `#6A655B` |
| `--app-border-default` / `strong` / `focus` | `#DDD8CD` / `#8F897C` / `#1F4FD8` |
| `--app-accent` / `-hover` / `-on` / `-soft` | `#1F4FD8` / `#1A43BD` / `#FFFFFF` / `#E5ECFB` |
| `--app-success` / `warning` / `danger` / `info` | `#17703F` / `#8A5200` / `#B3261E` / `#0B5FA5` |
| `--app-training` / `nutrition` / `recovery` / `ai` / `ai-soft` | `#B4400C` / `#2B7447` / `#6B46C1` / `#5B3FD0` / `#EFEBFB` |
| `--app-radius-sm/md/lg/pill` | 6 / 10 / 16 / 999 px |
| `--app-shadow-1` | `0 1px 2px rgba(25,23,18,.06), 0 1px 1px rgba(25,23,18,.04)` |
| `--app-motion-fast/normal/emphasis` | 120 / 200 / 320 ms (0.01 ms under reduced motion) |

### WCAG 2.2 AA contrast (computed, relative-luminance formula)

| Pair | Ratio | Need | Result |
|---|---|---|---|
| primary text / page | 16.01 | 4.5 | PASS |
| primary text / base | 17.17 | 4.5 | PASS |
| secondary text / base | 9.00 | 4.5 | PASS |
| muted text / base (page 5.18) | 5.55 | 4.5 | PASS |
| white / accent | 6.63 | 4.5 | PASS |
| accent / base (links) | 6.35 | 4.5 | PASS |
| danger / base | 6.27 | 4.5 | PASS |
| warning / base | 6.12 | 4.5 | PASS |
| info / base | 6.30 | 4.5 | PASS |
| AI / AI-soft | 5.85 | 4.5 | PASS |
| focus ring / page | 5.92 | 3 | PASS |
| focus ring / base | 6.35 | 3 | PASS |
| border-strong / base | 3.33 | 3 | PASS |

Values adjusted: **none** (`#1F4FD8` kept; every pair passes).

### Legacy alias classification

- **SAFE** (1:1 semantic mapping): `--mf-glass-*` (bg, surface, elevated, hover,
  text*, border*, brand*, dante, analytics, warning, danger) in both `--mf-*` and
  `--color-mf-*` forms; `--color-background/surface/text-*/accent*/success/danger/
  warning/border*/domain-*`; `--mf-bg/surface/text/violet/cyan/success/warning/
  danger/brand*` (+ `--color-mf-*`); glow shadows set to `none`.
- **TEMPORARY** (approximation; delete after pages migrate): `--mf-glass-bg-deep`,
  `--color-steel*`, `--mf-sunset/gold/coral` (→ accent / accent-light / danger),
  `--color-amber-*` and `--color-orange-*` (→ ink-blue ramp, 300–950 dark enough for
  text), `--color-white` (→ ink; flips `text-white`, `bg-white/x`, `border-white/x`
  to ink-on-light across ~1000 call sites), `backdrop-blur` neutralised.
- **PAGE_MIGRATION_REQUIRED** (cannot be solved by an alias): hardcoded dark
  surfaces (`bg-[#…]`, `from-…/to-…` gradients, `bg-black`) whose children now get
  ink text from the `white` flip; `text-black` / `text-white` placed on solid accent
  buttons; Radix/portal content rendered under `<body>` outside `.mf-app`
  (track-food modal, exercise-detail panel, bottom-sheet, floating Dante panel).

### Known visual debt after Step A (observed, 1440 + 390)

- `/dashboard/progress`: hardcoded dark cards now carry dark ink labels (low
  contrast). Dante Daily Brief on Today has the same issue; the dark mascot panel
  is hardcoded and unchanged. `/dashboard/ai-coach` uses the same dark telemetry
  scene.
- `/account` has no shell → still the old dark theme (UXR-2 adds a layout).
- These are Step B/page-migration work, not Step A bugs. Structure, nav, CTAs and
  routes are unchanged.

### Typography

- Inside `.mf-app`: `--font-body` and `--font-heading` → Inter; headings reset to
  `line-height 1.2`, `letter-spacing -0.01em`; metric classes get tabular numerals.
- Bebas Neue (`--font-brand`, `.font-brand`) unchanged: wordmark only.
- Barlow Condensed is still loaded (public pages + `/account` use it). Retire later.
- `app/layout.tsx`: Inter now loads `["latin", "vietnamese"]` (previously latin only,
  so Vietnamese diacritics fell back to a system font). Verified in-browser:
  the Vietnamese-range Inter face is registered and `document.fonts.check` is true
  after loading `ếệỗữƯơĐ`.

### Focus + motion

- `.mf-app :focus-visible { outline: 2px solid var(--app-border-focus); outline-offset: 2px }`
  (public global rule keeps 3px offset).
- `prefers-reduced-motion`: motion tokens → 0.01 ms; `animate-pulse/ping/bounce`
  disabled inside `.mf-app`. The pre-existing global rule already clamps all
  animation/transition durations.

## Step A.1 — compatibility stabilization

Status: DONE. Step B not started. No page redesigned.

### Root causes (exact class/token interaction)

| Surface | Class | Cause |
|---|---|---|
| `/dashboard/progress` | TOKEN_ALIAS + HARDCODED_LEGACY_SURFACE | `.pj-root` paints translucent dark cards (`--glass-from/to`) and `text-white` children; inside `.mf-app` `--color-white` -> ink, so `text-white` is ink-on-dark. Its fixed dark backdrop (`.pj-bg-base`, z-index -10) is hidden by the opaque `.mf-app` paint, leaving translucent dark cards over the light page (muddy grey, dim eyebrows/tabs). |
| Today Dante Daily Brief | TOKEN_ALIAS + HARDCODED_LEGACY_SURFACE | `from-[#131522] to-mf-glass-surface`: gradient start is hardcoded dark, end re-pointed to light; title uses `text-mf-glass-text` (now ink) and `border-white/10` is now an ink hairline. |
| `/dashboard/ai-coach` (DanteChat scene) | TOKEN_ALIAS + HARDCODED_LEGACY_SURFACE | `obsidianCanvas` is a hardcoded dark scene; heading `text-white` -> ink (invisible "Dante, Your Performance Coach"). |
| `/dashboard/recovery` hero | TOKEN_ALIAS (found in smoke) | Dark `PageVisual` hero with `text-white` title -> ink-on-dark. |
| Radix/sheet/dialog portals | PORTAL_SCOPE | Mount under `<body>`, outside `.mf-app`, so they keep the legacy dark `:root` tokens. Verified: Track Food dialog renders dark + readable. |

### Compatibility strategy (no global white decision reversed)

`--color-white -> ink` stays the default inside `.mf-app` (it is what flips the ~1000 `text-white` / `bg-white/x` / `border-white/x` call sites on LIGHT surfaces). Dark islands opt out with a scoped bridge in `app/ux-tokens.css`:

- `.mf-app .mf-legacy-dark` restores the original dark values of every token the light remap touched (white, glass text/border/surface, text-*, border, steel, amber/orange 300-500, violet/cyan, brand) for its subtree.
- Auto-matched, zero markup edits: `.mf-app .pj-root`, `.mf-app .pj-page` (Progress).
- DanteChat scene (locked file, no class edit): `.obsidianCanvas { composes: mf-legacy-dark from global; }` in `components/dante/holographic-telemetry-pod.module.css` (unlocked). **Why production-stable:** the CSS-module compiler itself emits the literal, un-hashed global class `mf-legacy-dark` on the element alongside the hashed one; the bridge selector is the plain `.mf-app .mf-legacy-dark` and never matches a generated name. The hashed name can change freely (build, minifier, Turbopack vs webpack) without affecting it. No `[class*=...]` substring selector remains anywhere.
- Hand-added class (non-behavioral): `dante-daily-brief.tsx` article, `app/dashboard/recovery/page.tsx` hero section, `components/dashboard/glass/muscle-intelligence-card.tsx` Dante AI / Anatomy Map toggle (also `bg-black/40` -> `bg-black/85`: lime-on-40%-black over the light page was ~1.3:1).
- `.mf-app main:has(.pj-root)` paints the content area `#040810` (clipped to content-box so the fixed sidebar stays light) because Progress's own backdrop is hidden.
- Not scoped to `.mf-app` would leak to public pages that reuse DanteChat, so every selector is `.mf-app`-prefixed.

TEMPORARY. Not for new components. Removal-phase mapping (UXR-4 is Workout Experience and owns no Dante migration):

| Island | Removed in |
|---|---|
| Today legacy Dante brief (+ Muscle Intelligence toggle) | UXR-3 |
| Progress legacy dark surfaces (`.pj-root`, `.pj-page`, `main:has(.pj-root)`) | UXR-6 |
| Dante legacy scene (`obsidianCanvas` + its `composes` line) | UXR-7 |
| Recovery legacy hero | UXR-6 |

When the last island is gone, delete the block and every `mf-legacy-dark` class.

### Portal strategy (frozen)

- PORTAL_STRATEGY: **A — render authenticated portals into an app portal root** (a dedicated element inside the shell that carries the semantic theme), passed as Radix `container` via one shared helper at UXR migration time.
- WHY: explicit, no global mutation of `<body>`/`<html>`, theme scope == DOM scope, so public portals can never inherit app tokens and nested dark islands still work through ancestor selectors.
- ACCESSIBILITY_IMPACT: neutral to positive; Radix focus trap/aria are unchanged. The root must sit outside any `aria-hidden`/`inert` main subtree and keep stacking above the shell (z-index >= 50).
- SSR/HYDRATION_RISK: low if the root is a static element rendered by the shell; Radix `container` must be resolved after mount (state/ref), so the first open is client-only anyway. Do not read `document` during render.
- MIGRATION_COST: medium — one helper + per-consumer `container` prop (track-food modal, exercise-detail panel, bottom-sheet, floating Dante panel, tooltips/popovers).
- IMPLEMENTATION CHANGED IN A.1: NO. Legacy portals stay readable on the legacy dark `:root` tokens until their component migrates (Step B / page phases).

### Account boundary

`ACCOUNT_THEME_STATUS = LEGACY / OUTSIDE MF-APP`. `/account` has no DashboardShell, so no `.mf-app` ancestor: dashboard tokens do not leak (verified: dark legacy theme intact, readable). Shell unification is UXR-2.

### Verification

Screenshots at 390 and 1440 for Today, Progress, Dante, Workouts, Nutrition, Recovery, Account: readable, no horizontal overflow, structure/nav unchanged. Public `/`, `/login`, `/meal-plan`: no `.mf-app` in DOM, `--color-white` is `#fff` (legacy), color-scheme unchanged. Locked-file integrity: the freeze hash is `sha256(git diff)` for tracked files / content for untracked (not file content) — 115/115 unchanged.

### Closeout (Step A.1 freeze)

- `components/dante-chat.tsx`: ACCEPTED_UNRELATED_CONCURRENT_CHANGE, OWNER_ACCEPTED = YES. Diff is exactly two comment lines (`Groq` -> `the provider` / `provider failure`, lines 596 and 663); no runtime/import/type/logic change. NEW_BASELINE = `fb76328cfbf11339b477b401a96f6c8a77d5f4022e4b225c3407d7855a9de208` (sha256 of `git diff`; identical to the pre-UXR inventory value). Protection: 114 locked unchanged + 1 accepted unrelated divergence.
- `components/dashboard/glass/muscle-intelligence-card.tsx`: TEMPORARY_COMPATIBILITY_FIX, removal phase UXR-3. Reason: 390px contrast failure (lime on `bg-black/40` over the light page, ~1.3:1) exposed by the light-theme migration. Change: toggle wrapper `bg-black/40` -> `bg-black/85` + `mf-legacy-dark` class. STRUCTURAL_CHANGE = NO, BUSINESS_LOGIC_CHANGE = NO.
