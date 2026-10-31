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
| Hold / warning (rust) | `#A8461F` text, `#C85A32` fill | 4.77 / 3.75 (non-text) |
| Input boundary | `#7E827B` | 3.5 |
| Lime action | `#D8F15A` fill, iron text | 13.76 |

## Phases

### Phase 0 — foundation  (status below)
Files: `app/paper-theme.css`, `app/layout.tsx` (import), `lib/paper-theme.ts`,
`components/dashboard/dashboard-shell.tsx` (marker attribute only),
`components/brand/athletic-figures.tsx` (squat / partners / planner; runner dropped; no numbers
in the art), `components/dante/dante-avatar.tsx` (static, aria-hidden), `app/__tests__/paper-theme.test.ts`.
Preserved: everything — `PAPER_ROUTES` is empty, so no route changes appearance.
