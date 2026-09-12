# Dante 3D Virtual Coach

## What this is — and isn't

**Real and production-ready**: the Three.js/React Three Fiber rendering pipeline,
the nested-group "rig" architecture, the pose state machine (named poses,
smooth damped transitions, no snap cuts), the app-state → pose mapping, lazy
loading, and the reduced-motion accessibility fallback.

**A placeholder, clearly labeled as such in the code**: the character model
itself. No 3D modeling tool was available in this development session to
author the actual "Golden Era bodybuilding + Roman/Renaissance influence +
dark steel/bronze/red" sculpted character the spec describes — that requires
a 3D artist or a generative-3D asset pipeline. What exists instead is a
primitive-geometry humanoid (capsules, spheres, cylinders) wearing
steel/bronze materials in roughly the right places, driven by a real
animation rig.

## Model pipeline (spec §21)

```
components/dante-avatar/
  poses.ts                — named pose → target joint rotations (data only)
  use-dante-pose.ts        — per-frame damped interpolation toward the active pose
  dante-figure.tsx         — the procedural placeholder mesh + nested-group rig
  dante-avatar-scene.tsx   — Canvas, lighting, camera (React Three Fiber)
  dante-avatar.tsx         — public component: lazy-loads the scene, handles
                             reduced-motion fallback
```

**Stack**: `three` + `@react-three/fiber` + `@react-three/drei` — added fresh
in this pass (none existed in the project before; evaluated against the
spec's "preferred conceptual stack" and matched exactly). Versions pinned to
`@react-three/fiber@9` + `@react-three/drei@10` for React 19 compatibility
(drei's `9.x` line still targets fiber `8`, which conflicts with this
project's React 19 — verified via `npm install` dependency resolution
before settling on the `10.x` pairing).

**Rig approach**: nested `<group>`s (spine → shoulders → elbows,
hips → knees), each independently rotatable — rotating a parent group
rotates everything attached to it, the same principle a bone hierarchy uses
in a real skeletal rig. `poses.ts` defines target rotations per named joint;
`use-dante-pose.ts` exponentially damps each joint's current rotation
toward the active pose's target every frame, so transitions blend instead of
snapping (spec's explicit requirement).

**Swapping in a real model later**: replace `dante-figure.tsx`'s contents
with a `useGLTF("/models/dante.glb")`-based component driven by the model's
own animation clips (`THREE.AnimationMixer`). The pose STATE MACHINE
(`poses.ts` + `use-dante-pose.ts` + the app-state mapping) stays valid in
spirit — only "how a pose is applied to the mesh" changes, since a real rig
uses named bones, not these placeholder group names. No other file
(`dante-avatar.tsx`, every page that renders `<DanteAvatar />`) needs to
change.

## Animation states implemented (spec §22)

`idle_breathing` (default, with a subtle chest-oscillation loop),
`walk_in` (a simple sine-wave leg/arm swing layered on neutral), `classic_vacuum`,
`front_double_biceps`, `side_chest`, `point_to_ui`, `explain_gesture`,
`handoff` — all eight named states from the spec, each a hand-authored set
of joint-angle targets in `poses.ts`.

## App-state responsiveness (spec §23)

```ts
APP_STATE_POSE = {
  ready: "idle_breathing",
  recovery_low: "idle_breathing",   // same base pose; a real model could differ its expression
  personal_best: "front_double_biceps",
  explanation: "explain_gesture",
  warning: "point_to_ui",
}
```

Deliberately narrow — not every app state gets a unique pose, matching the
spec's "do not overanimate every screen."

## Voice and lip sync (spec §24-25)

**Voice**: `components/presentation/use-presentation-audio.ts` implements
the "deterministic audio" architecture the spec requires — it attempts to
play a pre-generated audio file per presentation beat
(`lib/presentation/script.ts`'s `audioSrc` field) and silently, gracefully
continues on caption-only timing if the file doesn't exist or fails to
load. **No TTS audio has actually been generated** — no TTS engine was
available in this development session. The architecture is ready for real
audio the moment files exist at the paths already referenced in
`script.ts` (e.g. `/public/audio/presentation/01-dante-enter.mp3`); no code
changes would be needed.

**Lip sync**: not implemented. Building phoneme/viseme timing and morph
targets for a mouth that doesn't exist on the placeholder figure (a plain
sphere head, no facial geometry) would be pure theater. This is honestly
left as future work, gated on a real face-capable model existing first —
building it now would mean animating nothing anyone could see change.

## Performance considerations (spec §32)

- The entire Three.js/R3F bundle is behind `next/dynamic(..., {ssr:false})`
  — it is never included in the JS bundle of a page that doesn't render
  `<DanteAvatar />`, and even where it is, it's a separate chunk loaded
  only when needed.
- `dpr={[1, 1.5]}` caps device-pixel-ratio scaling (a common R3F mobile
  performance guard against unnecessarily rendering 3x resolution on
  high-DPI phones).
- The placeholder figure has no textures and ~10 low-poly primitives —
  trivially cheap to render; a real sculpted model would need explicit
  polygon-count/texture-size budgets before shipping, not addressed here
  since no such model exists yet.
- `prefers-reduced-motion` skips the Canvas/animation loop entirely,
  rendering a static badge instead (spec §33) — this is also a meaningful
  performance win on top of being an accessibility requirement.

## Where it's actually used right now

- `/coach` — a real, live integration (not just a demo): the avatar renders
  in the `explanation` pose alongside the existing page copy.
- `/presentation` — the primary showcase; every scene that mentions Dante
  renders the avatar in a context-appropriate pose (see docs/presentation.md).

## Known limitations

- Character model is a geometric placeholder, not sculpted art (see above).
- No lip sync, no facial animation surface to drive one.
- No real voice audio generated.
- Not unit-tested — R3F/Canvas rendering isn't practically unit-testable
  without a browser; verified via `npm run build`/`type-check` succeeding
  and manual reasoning about the render tree, not a rendered screenshot
  (no browser available in this environment).

## Future improvements

- Commission or generate a real sculpted GLB model matching the described
  aesthetic; wire it in per the "swapping in a real model" section above.
- Generate real narration audio (any TTS engine) for the presentation script.
- Once a real model with facial geometry exists, build the viseme/morph-
  target lip-sync layer the spec describes.
