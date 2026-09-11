# Muscle Fitness — Visual System

This is the reusable visual system introduced for the premium visual
upgrade. It builds on the design tokens and motion primitives that
already existed in the repo (`app/globals.css`, `components/animation/reveal.tsx`)
rather than replacing them.

## 1. Art direction

> Premium human performance intelligence. Dark graphite and near-black
> environment. Cinematic directional lighting. Restrained amber/gold
> rim illumination. Realistic human anatomy. Athletic but natural
> proportions. Sports-science editorial photography. Subtle biometric,
> biomechanical and performance-data overlays. Clean composition. High
> contrast. Deep blacks. Fine film grain. No text embedded in image. No
> logos. No cyberpunk neon. No generic blue AI aesthetic. No
> exaggerated bodybuilding proportions. No steroid-like physique. No
> cluttered futuristic HUD.

Existing brand tokens already match this direction and were **not**
changed:

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#070707` | near-black base |
| `--color-surface` | `#131313` | charcoal panels |
| `--color-accent` | `#b87333` | warm bronze/amber accent |
| `--color-text-primary` | `#f7f7f7` | primary text |
| `--color-text-secondary` | `#b5b5b5` | secondary text |

No blue, purple, cyan or rainbow gradients were introduced anywhere in
this upgrade.

## 2. Background layer system

Every `CinematicBackground` (`components/visual/cinematic-background.tsx`)
renders up to 5 layers, in this order:

1. **Dark base** — `#050505` solid fill.
2. **Page-specific image** *(optional)* — a real photo under
   `/public/visuals/*.webp` via `next/image`, OR a procedural
   gradient composition when no asset has been generated yet. Never a
   broken `<img>` — the component simply never references a file that
   doesn't exist.
3. **Gradient mask** — a left-to-right and top-to-bottom dark gradient
   that guarantees text stays readable regardless of what's under it.
4. **Technical/data overlay** — `components/visual/visual-overlay.tsx`,
   an SVG grid plus one of `telemetry` / `waveform` / `nodes`, in the
   amber accent color at low opacity.
5. **Optional amber glow** — a slow-breathing radial blur (6s ease
   loop), disabled automatically under `prefers-reduced-motion`.

## 3. Components

| Component | Purpose |
|---|---|
| `components/visual/cinematic-background.tsx` | The 5-layer stack described above. |
| `components/visual/visual-overlay.tsx` | Decorative SVG overlay variants: `grid`, `telemetry`, `waveform`, `nodes`. |
| `components/visual/page-visual.tsx` | Looks up a page in `config/page-visuals.ts` and renders the right `CinematicBackground`. **Use this in pages**, not `CinematicBackground` directly, so visual decisions stay centralized. |
| `components/visual/parallax-visual.tsx` | Subtle scroll parallax wrapper (0.15–0.4x relative speed). Disabled under reduced motion. |
| `components/visual/metric-reveal.tsx` | Count-up number, once, on scroll into view. |
| `components/visual/performance-grid.tsx` | Small stat-chip strip for page headers (the "data" half of the dashboard formula). |
| `components/animation/reveal.tsx` | **Already existed** — `Reveal`, `StaggerContainer`, `StaggerItem`. This *is* the scroll-reveal / stagger-group system; do not create a duplicate. |

`config/page-visuals.ts` is the `pageVisuals` map: one entry per page
key, holding the optional image path, overlay variant, intensity
(`secondary` | `prominent`) and a `promptRef` pointing at the matching
entry in `docs/AI_VISUAL_PROMPTS.md`.

## 4. Image usage rule

- **Public/marketing pages** (home, First Rep) may run `intensity: "prominent"`.
- **Dashboard/data pages** (Training Intelligence, Recovery, Business
  Insights, Training, Training Split) stay `intensity: "secondary"` and
  the visual is confined to the page header only — it never sits
  behind charts, tables, forms or logged values.

## 5. Motion rules

- Ease: `[0.22, 1, 0.36, 1]` (ease-out), matching the existing `Reveal`
  primitive.
- Duration: 0.5–0.8s. Stagger: 0.08–0.15s.
- Viewport trigger: `once: true` — nothing re-animates on re-scroll.
- No bounce, spring overshoot, large rotation, or constant motion.
- The only continuous animation is the amber glow "breathing" (opacity
  0.5→0.85→0.5 over 6s) and the count-up in `MetricReveal` (runs once).
- `prefers-reduced-motion` is already handled globally in
  `app/globals.css` (durations collapse to ~0) and individually in
  every new component via `useReducedMotion()` — parallax, the glow
  loop and the count-up animation all fall back to a static state.

## 6. Page → visual mapping

See `config/page-visuals.ts` for the authoritative mapping. Summary:

| Page key | Overlay | Intensity | Pages currently wired |
|---|---|---|---|
| `home` | telemetry | prominent | `/` hero + Dante section |
| `firstRep` | grid | secondary | `InspirationStory` (`/` `#inspiration`) |
| `dante` | nodes | secondary | `/` Dante panels, `/coach` |
| `training` | telemetry | secondary | `/training` header |
| `trainingSplit` | telemetry | secondary | `/dashboard/split` header |
| `trainingIntelligence` | telemetry | secondary | `/dashboard/training-intelligence` header |
| `recovery` | waveform | secondary | `/dashboard/recovery` header |
| `business` | nodes | secondary | `/business/insights` header |
| `responsibleAi` | grid | secondary | `/responsible-ai` header |
| `formCoach`, `nutrition`, `mealPlan`, `shoppingList`, `progress`, `onboarding` | — | secondary | **configured, not yet wired into a page** — next phase |

## 7. Performance

- No new heavy dependencies — `framer-motion` was already installed
  and used; the visual system reuses it rather than adding Three.js,
  WebGL or a second animation library.
- All decorative layers are inline SVG/CSS gradients (near-zero
  weight) until real photography is generated.
- `next/image` (`fill`, `sizes="100vw"`) is used for the one real
  asset currently wired (`firstRep` → `/story/images/the-beginning.jpg`)
  so it's automatically responsive/optimized.
- No autoplay video, no preloading of every image — only a page's own
  header visual loads, and only when that page is visited.

## 8. Accessibility

- Every `CinematicBackground` is `aria-hidden="true"` and
  `pointer-events-none` — it never intercepts focus or is announced by
  a screen reader; page content carries its own real headings/copy.
- Motion respects `prefers-reduced-motion` at both the global CSS
  layer and the component layer (see §5).
- No state is communicated by color alone anywhere in the new
  components.

## 9. What this phase did NOT touch

Per the "do not over-design the dashboard" and "do not break working
pages" rules, the following were intentionally left as-is this phase:
Nutrition, Meal Plan, Shopping List, Progress, Check-in, per-exercise
Workout Detail visuals, Form Coach's live overlay, and Onboarding/Login.
`config/page-visuals.ts` already has entries reserved for them so
wiring them in later is a small, contained change — not a redesign.
