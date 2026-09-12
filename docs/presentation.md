# Presentation Mode

`/presentation` — a dedicated, deterministic, offline-safe demo route.

## Design constraints (spec Part E §26, §30) and how they're met

| Requirement | How it's met |
|---|---|
| Deterministic | `lib/presentation/script.ts` is a fixed, hand-authored sequence — no randomness, no server-computed content. |
| Preloaded | Everything (script, demo data, avatar geometry) is bundled at build time. The route is statically prerendered (`○` in `next build`'s route table) — confirmed, not assumed. |
| Reliable / failure-safe | Zero Supabase calls, zero Groq/AI API calls, zero live network dependency anywhere in the render path. Demo data (`lib/presentation/demo-data.ts`) is hand-authored, not fetched. Works with Supabase down, the network down, or the AI/TTS APIs down — because none of them are ever called. |
| Fullscreen-friendly | 16:9 aspect-ratio container; a fullscreen toggle button and the `F` key call the Fullscreen API. |
| Keyboard-controllable | Space/→ next, ← previous, `P` play/pause, `F` fullscreen (see `components/presentation/presentation-stage.tsx`). |
| Public, not gated behind auth | Deliberate: a presenter shouldn't need to log in mid-demo, and the route needs zero user data anyway. |

## Intro sequence (spec §27-28)

`lib/presentation/script.ts` — 12 scripted "beats," the first 11 auto-
advancing (summing to ~43 seconds, inside the spec's 35-45s target), the
last two (`handoff`, `closed_loop`) advanced manually so a live presenter
controls pacing for the handoff and follow-up demo:

```
black → logo → dante_enter → dante_intro ("I am Dante.") → problem
  → setvision → hawkerlens → recovery → dante_core → recommendation
  → pose (front double biceps) → handoff ("...Duy Anh, take it from here.")
  → closed_loop (manually advanced, for Q&A / deeper demo)
```

The narrative text matches spec §28's core idea directly — the
intelligence thesis, not a page/feature tour.

## Visual transitions (spec §29)

Each beat's visual is rendered by `components/presentation/scene-content.tsx`,
which — deliberately — reuses the SAME production components the real
product uses, fed hand-authored demo data
(`lib/presentation/demo-data.ts`) instead of live Supabase data:

- **SetVision beat**: the real `components/setvision/results-panel.tsx`
  (`SetVisionResultsPanel`), fed a `DEMO_SETVISION_ANALYSIS` fixture
  matching the spec's bench-press/velocity-loss example.
- **HawkerLens beat**: a compact read-only view of `DEMO_HAWKERLENS_RESULT`
  (chicken rice, matching the spec's own output-schema example).
- **Recovery beat**: a compact readiness visualization from
  `DEMO_READINESS` (readiness 68, chest recovery 58% — matching spec §3's
  own example numbers).
- **Dante Core beat**: an animated "TRAINING / NUTRITION / RECOVERY"
  converging into "DANTE," per spec's exact diagram.
- **Recommendation beat**: a planned-vs-adapted comparison (85kg×4 →
  80kg×3) plus the real `components/dante/decision-card.tsx`
  (`DecisionCard`) fed `DEMO_TRACEABLE_DECISION` — the same traceability UI
  the live product uses for real Dante Core decisions.
- **Closed-loop beat**: the full plan → train → SetVision → Dante →
  retrain → improve → save narrative from spec §16, as a numbered sequence.

Every demo-fed scene carries a visible "Recorded Demo" badge — nothing
pretends to be a live measurement.

## Voice (spec §24)

`components/presentation/use-presentation-audio.ts` attempts to play a
pre-generated audio file per beat and silently falls back to caption-only
timing if the file is missing or fails — this is real, working fallback
logic, not a placeholder. **No actual narration audio has been generated**
(no TTS engine was available in this session) — see docs/dante-avatar.md
"Voice and lip sync" for what's needed to add it, and note that the
presentation is fully watchable and understandable via captions alone right
now.

## Controls

| Key | Action |
|---|---|
| Space / → | Advance to next beat |
| ← | Previous beat |
| P | Play/pause auto-advance |
| F | Toggle fullscreen |
| Esc | Exit fullscreen (browser default) |

On-screen buttons duplicate every keyboard control for presenters who
prefer a mouse/trackpad or are on a touch device.

## Accessibility (spec Part F §33)

- **Captions**: `components/presentation/caption-overlay.tsx` renders the
  beat's script text as a persistent, high-contrast subtitle — this is the
  primary way the narrative reaches the audience right now (see Voice
  above), not a secondary accommodation.
- **Reduced motion**: the avatar (`DanteAvatar`) itself already respects
  `prefers-reduced-motion` (see docs/dante-avatar.md) — a presenter or
  viewer with that OS setting gets a static Dante badge instead of the
  animated figure, everywhere it's used including here.
- **Keyboard**: every control has a keyboard equivalent (see above);
  buttons carry `aria-label`s.

## Testing performed

`npm run type-check`, `npm run lint`, `npm test`, `npm run build` all pass
with the presentation route included; `next build`'s route table confirms
`/presentation` prerenders as fully static (`○`), verifying no server-side
data dependency exists. **Not tested**: actual visual/timing correctness in
a real browser (no browser available in this environment) — a presenter
should do one full run-through before a live demo.

## Known limitations

- No real voice audio (see Voice above).
- Not manually verified in a real browser/projector — do a dry run before
  presenting live.
- The closed-loop beat is illustrative (fixed demo numbers), not a replay
  of a real historical session — see docs/architecture.md for the
  distinction between this demo and the live SetVision→Dante integration
  that already exists in the real product (`/dashboard/workouts/setvision`'s
  "Ask Dante" button, which calls the real APIs with real data).

## Future improvements

- Generate real narration audio and drop it at the `audioSrc` paths already
  referenced in `lib/presentation/script.ts`.
- Add a "replay with your own recent session" mode once a real historical
  closed-loop (plan → SetVision → Dante → retrain → compare) exists for a
  specific user, rather than always showing the fixed demo numbers.
