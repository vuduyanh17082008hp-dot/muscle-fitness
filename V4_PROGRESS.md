# V4 Iron & Paper — integration progress

Branch `design/v4-iron-paper-integration` in worktree `C:\Dev\Projects\mf-v4-iron-paper`,
created from `e3b49e2` (repair/conflict-closure-2026-10-30, parent `86656e3`).
`demo/hackathon-2026-11-02` stays at `466f783`; nothing here is pushed, merged or deployed.

V4 is a design reference only. Nothing from `v4_source/src/context/AppContext.tsx`, its Vite
router, demo login, scripted Dante, MCP/skills panel, wearable/HRV/bar-velocity numbers or
`@google/genai` is ported. Every screen keeps its real server data, actions and guards.

## How the theme is applied

- `app/paper-theme.css` — every rule is gated on `:root:has([data-theme="paper"])`
  (enforced by `app/__tests__/paper-theme.test.ts`). With no marker on the page nothing in
  the file applies, so unconverted routes render exactly as before.
- Gating at `:root` (not on the marked element) is deliberate: `globals.css` and Tailwind's
  `@theme` chain tokens through `var()` on `:root`, so only a root override re-resolves them;
  portals (dialogs, toasts) outside the shell inherit it too.
- Inside the gate: `--mf-glass-*`, `--mf-pub-*`, `--mf-*` and legacy `--color-*` tokens take
  paper values; the hard-coded dark-only utilities (`text-white`, `bg-white/5`,
  `border-white/10`, `text-zinc-400`, `text-emerald-300`, `bg-red-950/40` …) are remapped by
  overriding the Tailwind colour variables they compile to (white→iron ink, black→white well,
  neutral scales onto a warm iron ramp, 200-400 text shades → 700/800, dark tints → light).
  Lime stays a fill only; its text/line uses become iron.
- Dashboard routes opt in through `PAPER_ROUTES` in `lib/paper-theme.ts` (read by
  `components/dashboard/dashboard-shell.tsx`). Public pages mark their own root element.
- Rollback for any route: remove it from `PAPER_ROUTES` (or the marker) — the dark UI returns.

## Palette and contrast (on paper / secondary / white)

| Role | Value | Min ratio |
|---|---|---|
| Iron text | `#181B19` | 13.8 (on lime) |
| Secondary text | `#3F4541` | 7.9 |
| Muted text | `#5C625D` (V4's `#646A65` is 4.48 on `#EAE7DE`, so darkened) | 5.05 |
| Dante ink / card | `#5E4790` on `#F3EBF9` | 6.1 |
| Hold / warning (rust) | `#A8461F` text, `#B34D27` fill (white text on it 5.2) | 4.77 |
| Input boundary | `#7E827B` | 3.5 |
| Lime action | `#D8F15A` fill, iron text | 13.76 |

## Phases

### Phase 0 — foundation — DONE (commit eb966bc)
Files: `app/paper-theme.css`, `app/layout.tsx` (import), `lib/paper-theme.ts`,
`components/dashboard/dashboard-shell.tsx` (marker attribute only),
`components/brand/athletic-figures.tsx` (squat / partners / planner; runner dropped; no numbers
in the art), `components/dante/dante-avatar.tsx` (static, aria-hidden), `app/__tests__/paper-theme.test.ts`.
Preserved: everything — `PAPER_ROUTES` is empty, so no route changes appearance.

Environment notes (verified 2026-10-31):
- Baseline Vitest in this worktree: 5,597 pass / 279 skip / 0 fail with Docker down (DB suites
  skip; the historical 5,660/209 had the stack up). A fresh checkout got CRLF from the system
  gitconfig and broke 2 source-regex tests; the worktree now has `core.autocrlf=false`
  (worktree-scoped config) and LF files, matching mf-ux-r1.
- DB guard baseline on `mf-lrg-7f83`: trigger `workout_sessions_training_hold` enabled,
  `private.training_hold_active`, history row `20261030120000`, anon cannot execute `start_workout`.
  Migration file sha256 `37b80076…ccd6`.
- After this boot Windows reserves TCP 57738-57837, so the stack's Kong (57831) is unpublished.
  A loopback-only relay container `mf-v4-kong-relay` (127.0.0.1:58831 → Kong) serves this
  worktree's dev server (:3830, `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` overridden in the
  process env only). Remove with `docker rm -f mf-v4-kong-relay`.
- BEFORE screenshots/metrics (dark UI): session scratchpad `v4/shots/survey-*-before-*`,
  `v4/out/survey-*-before.jsonl` (320/390/1440). Caveat: the shell file was being edited near
  the end of that run; the 390px rows show the old 6-tab bar (6 sub-12px labels per route).

### Phase 1 — shell + public experience — DONE
- Shell (`components/dashboard/dashboard-shell.tsx`, `app/dashboard/layout.tsx`): five primary
  tabs Today / Train / Fuel / Recovery / Dante; Train becomes **Active** (linking to the session)
  only when the layout finds a real `in_progress`/`paused` session for the user (read failure →
  plain Train). Progress, Calendar, History, Library ("Track") and Experiments, Settings
  ("More") live in the sidebar and in the mobile **More** drawer (visible labelled button).
  Most-specific active match (History no longer also lights Train). 12px labels, 64×56 tabs,
  44px drawer rows, Escape closes the drawer, scrim not a tab stop. Shared iron wordmark
  (`components/brand/wordmark.tsx`) replaces the lime logo mark (invisible on paper).
- Toasts: no `<Toaster>` was mounted anywhere, so Form Coach's camera/pose error toasts were
  dropped. One is now mounted in the shell, bottom-centre above the tab bar (never under the
  header), aria-live via react-hot-toast.
- Landing (`components/home/landing-page.tsx`, `signal-hero.tsx/.module.css`): paper; condensed
  black uppercase headings; lime highlighter instead of lime text; iron-bordered sample preview
  (still labelled "sample day, not your data"); squat / planner / partners figures. No orbitals,
  particles or LIVE claims (test-enforced). Signed-in CTA → /dashboard unchanged.
- Auth: `components/auth/auth-shell.tsx` (register, forgot/reset password, email confirmation)
  and `app/login/page.tsx` restyled; glow blobs removed; real Supabase flows, `#email`,
  `#password`, "Enter dashboard" and Google OAuth untouched. No demo login. Onboarding marked
  paper (visual check pending a fresh disposable user — see Phase 6).
- Lime buttons that used `text-black` now use `text-mf-brand-ink` (black is white on paper).
- Theme fixes found while verifying: neutral `-700` remapped to readable ink (it is text in 19
  of 24 uses); rust fill darkened to `#B34D27` so remapped `bg-amber-500 text-black` buttons
  give white-on-rust 5.2:1; **pre-existing cascade bug** — `globals.css`' unlayered
  `* { border-color }` overrides every Tailwind border-colour utility (coloured borders never
  rendered). Fixed inside the paper gate only (`@layer base` default + `revert-layer`).
- MF redefines `--radius-lg/xl` to 18/24px, so new V4 controls use `rounded-md` (12px).
- Gates: tsc 0; eslint 0 on touched files; 48 focused tests incl. new
  `app/dashboard/__tests__/v4-shell-nav.test.ts`; paper surveys of `/`, `/login`, `/register`,
  `/forgot-password`, `/reset-password`, `/email-confirmation` at 320/390/1440: 0 axe
  violations, no horizontal scroll, no sub-12px text, mobile inputs 16px. Nav probe at 320 and
  1440: all six secondary routes reached via More/sidebar, scroll reset to 0.
- Updated test: `quick-capture.test.ts` pinned Progress in the mobile bar (old 6-tab decision);
  it now asserts the 5 tabs plus Progress in the Track group / More button.
