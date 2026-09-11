# Muscle Fitness — AI Visual Prompts

This environment has no image-generation capability, so no image
files were fabricated. `components/visual/cinematic-background.tsx`
renders a safe procedural fallback everywhere below until the real
asset exists — the site is fully functional with zero of these files
present.

**To activate an asset**: generate it with the prompt below, export as
WebP (target 150–500KB), save to the listed path under
`/public/visuals/`, then add `imageSrc: "/visuals/<file>"` to the
matching entry in `config/page-visuals.ts`. No other code change is
needed.

Shared base direction for every prompt (append if your tool supports a
persistent style/system prompt instead of repeating it):

> Premium human performance intelligence. Dark graphite and near-black
> environment. Cinematic directional lighting. Restrained amber/gold
> rim illumination. Realistic human anatomy. Athletic but natural
> proportions. Sports-science editorial photography. Subtle biometric,
> biomechanical and performance-data overlays. Clean composition. High
> contrast. Deep blacks. Fine film grain. No text embedded in image.
> No logos.

Shared negative prompt for every entry: `text, logos, watermark,
neon blue, purple, cyan, rainbow gradient, cyberpunk, distorted
anatomy, extra limbs, exaggerated/steroid-like muscularity, cluttered
futuristic HUD, glowing robot head, medical/hospital imagery`.

---

## 1. home-performance

- **PAGE**: Homepage (`/`) hero, right panel
- **FILE**: `/public/visuals/home-performance.webp`
- **ASPECT RATIO**: 4:5 (portrait, works as a right-column panel on desktop and a cropped strip on mobile)

**PROMPT**
- SUBJECT: an athletic adult, calm and composed, partially lit out of darkness — not posing for size.
- ACTION/POSE: standing, weight settled, relaxed athletic stance, chin level, gaze slightly off-camera.
- CAMERA: 3/4 angle, waist-up, shallow depth of field.
- ENVIRONMENT: dark performance-lab studio, plain graphite backdrop.
- LIGHT: single warm amber rim light from camera-right, soft fill left, deep shadow.
- OVERLAY: faint biomechanical joint markers and one or two thin data lines along the shoulder/arm — barely visible, not a HUD.
- STYLE: sports-science editorial photography, fine film grain, high contrast, deep blacks.
- COMPOSITION: subject placed right two-thirds of frame, negative space upper-left for UI text overlay.

**NEGATIVE**: bodybuilder posing, front double-biceps, oiled skin, gym signage, other people, bright studio lighting, colorful background.

**CROP GUIDANCE**: keep the subject's face and shoulders inside the top 60% of frame so the mobile crop (top-aligned) still reads as a person, not just a torso.

---

## 2. training-intelligence

- **PAGE**: `/training`, `/dashboard/training-intelligence` headers
- **FILE**: `/public/visuals/training-intelligence.webp`
- **ASPECT RATIO**: 21:9 (wide header strip)

**PROMPT**
- SUBJECT: athletic adult performing a controlled barbell back squat.
- ACTION/POSE: mid-rep, bottom-to-mid position, visible control and bracing.
- CAMERA: side 3/4 angle, wide enough to show full body and bar path.
- ENVIRONMENT: dark performance laboratory, minimal equipment visible.
- LIGHT: warm amber rim light tracing the bar and shoulders.
- OVERLAY: a subtle bar-path line and one joint-angle arc at the knee — restrained, not a full skeleton overlay.
- STYLE: premium sports-science editorial photography.
- COMPOSITION: subject on the right half, wide dark negative space on the left for a page header title.

**NEGATIVE**: crowded gym background, chalk clouds, competition platform, spotter, mirrors.

**CROP GUIDANCE**: bar and lifter must stay within the right 55% of the frame so a header can safely mask the left 45% with the readability gradient.

---

## 3. training-split

- **PAGE**: `/dashboard/split` header, future Muscle Map background
- **FILE**: `/public/visuals/training-split.webp`
- **ASPECT RATIO**: 3:4 (tall, for a stylized anatomical silhouette)

**PROMPT**
- SUBJECT: a stylized, non-clinical human silhouette (front-facing), used purely as an anatomical reference shape.
- ACTION/POSE: neutral standing anatomical pose, arms slightly away from torso.
- CAMERA: straight-on, full body.
- ENVIRONMENT: flat dark graphite background, no set.
- LIGHT: even, minimal — this asset relies on outline/silhouette contrast, not dramatic lighting.
- OVERLAY: restrained amber highlighting on 2-3 muscle regions (e.g. chest, quadriceps) to suggest "selected muscle group" without medical-illustration detail.
- STYLE: premium stylized silhouette — closer to a sports-brand icon system than an anatomy textbook.
- COMPOSITION: centered, generous margin on all sides so it can sit behind a card.

**NEGATIVE**: medical/anatomical textbook illustration, visible muscle striations, skinned/écorché figure, clinical labels.

**CROP GUIDANCE**: keep full figure centered with ~10% margin; this asset is meant to be used at low opacity behind UI, not as a standalone hero.

---

## 4. form-coach

- **PAGE**: `/dashboard/workouts/form-coach` header
- **FILE**: `/public/visuals/form-coach.webp`
- **ASPECT RATIO**: 16:9

**PROMPT**
- SUBJECT: athletic adult mid-repetition of a bodyweight exercise (e.g. squat or push-up).
- ACTION/POSE: clean technical form, mid-rep.
- CAMERA: side angle, full body in frame.
- ENVIRONMENT: dark studio, plain background so a pose-overlay reads clearly.
- LIGHT: cool-neutral key light with amber rim accent (this is the one page where a slightly more "instrumented" feel is appropriate).
- OVERLAY: joint landmark dots and connecting skeleton lines echoing a pose-estimation model, plus one angle measurement at a key joint.
- STYLE: computer-vision-meets-editorial — restrained, not a sci-fi HUD.
- COMPOSITION: subject centered, even margin, so it can sit behind a live camera/pose UI without competing with it.

**NEGATIVE**: real camera app UI, visible phone/webcam frame, multiple overlapping skeletons, neon scan lines.

**CROP GUIDANCE**: this is a background image behind a LIVE feature — keep it low-contrast/low-opacity-ready; real MediaPipe landmarks always take visual priority over this asset per docs/VISUAL_SYSTEM.md.

---

## 5. push-up-form

- **PAGE**: Workout detail — push-up category
- **FILE**: `/public/visuals/push-up-form.webp`
- **ASPECT RATIO**: 16:9

**PROMPT**
- SUBJECT: athletic adult performing a push-up.
- ACTION/POSE: mid-rep, straight line from shoulder to ankle.
- CAMERA: low side/3-quarter angle at floor level.
- ENVIRONMENT: dark performance studio floor.
- LIGHT: amber rim light along the body line.
- OVERLAY: one straight reference line (shoulder-hip-ankle) and a small elbow-angle arc.
- STYLE: sports-science editorial.
- COMPOSITION: subject fills the lower two-thirds of frame, horizontal negative space above for a title.

**NEGATIVE**: sagging hips, flared elbows (this is a TECHNIQUE reference — form must be clean), gym floor clutter.

**CROP GUIDANCE**: full body must stay visible corner-to-corner; do not crop feet or hands.

---

## 6. squat-form

- **PAGE**: Workout detail — squat category
- **FILE**: `/public/visuals/squat-form.webp`
- **ASPECT RATIO**: 16:9

**PROMPT**
- SUBJECT: athletic adult performing a bodyweight or barbell squat.
- ACTION/POSE: bottom position, controlled depth, upright torso.
- CAMERA: side angle, full body.
- ENVIRONMENT: dark performance studio.
- LIGHT: amber rim light along the torso and thigh.
- OVERLAY: a knee-angle arc, a hip-trajectory dot-path, and one torso-inclination reference line.
- STYLE: sports-science editorial.
- COMPOSITION: subject centered-right, negative space left.

**NEGATIVE**: rounded lower back, heels lifting, knees caving — again, this must depict clean technique.

**CROP GUIDANCE**: keep the full squat depth (hip crease at/below knee) inside frame.

---

## 7. nutrition-performance

- **PAGE**: `/dashboard/nutrition` header
- **FILE**: `/public/visuals/nutrition-performance.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: a premium editorial arrangement of whole foods — chicken breast, rice, oats, eggs, mixed vegetables, a portion of fish, potatoes.
- ACTION/POSE: n/a (still life).
- CAMERA: top-down or steep 45°, macro-adjacent.
- ENVIRONMENT: dark graphite surface/table.
- LIGHT: controlled top lighting with a warm amber edge highlight on the surface line.
- OVERLAY: none baked into the image — macro labels are rendered in HTML, not in the photo.
- STYLE: premium sports-nutrition editorial photography (not a restaurant or influencer flat-lay).
- COMPOSITION: ingredients arranged with clear negative space in one corner for a header title.

**NEGATIVE**: visible commercial brand packaging/logos, fast food, dessert, alcohol, cluttered composition, rustic wood surface (too "food blog").

**CROP GUIDANCE**: leave at least 30% of the frame as clean dark surface for text placement.

---

## 8. meal-system

- **PAGE**: `/meal-plan`
- **FILE**: `/public/visuals/meal-system.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: 3-4 prepared, portioned meals in simple meal-prep containers — grilled protein, rice/potato, vegetables.
- ACTION/POSE: n/a (still life).
- CAMERA: top-down.
- ENVIRONMENT: dark graphite counter.
- LIGHT: even top lighting, amber edge accent.
- OVERLAY: none in-image; meal number/macro badges are rendered in HTML.
- STYLE: practical, athletic, meal-prep-friendly — not restaurant plating.
- COMPOSITION: grid-like arrangement of containers with room at the edge for UI.

**NEGATIVE**: restaurant plating, garnish sprigs, wine glasses, branded containers.

**CROP GUIDANCE**: keep container edges away from the frame border so nothing looks cut off mid-container.

---

## 9. shopping-system

- **PAGE**: `/dashboard/nutrition/shopping-list`
- **FILE**: `/public/visuals/shopping-system.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: organized raw ingredients and a reusable shopping bag/basket — vegetables, eggs, grains, unbranded packaging.
- ACTION/POSE: n/a (still life).
- CAMERA: 45° angle.
- ENVIRONMENT: dark graphite counter or table.
- LIGHT: soft top light, amber edge accent.
- OVERLAY: none in-image.
- STYLE: organized, systematic, premium editorial — food-system photography, not a farmers-market lifestyle shot.
- COMPOSITION: neat grid/rows of ingredients, negative space top-left.

**NEGATIVE**: visible store branding, price tags, plastic clutter, people.

**CROP GUIDANCE**: keep ingredient rows aligned to a grid so the image reads as "organized system" even when cropped narrower on mobile.

---

## 10. recovery-intelligence

- **PAGE**: `/dashboard/recovery` header
- **FILE**: `/public/visuals/recovery-intelligence.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: athletic adult in a calm resting state — seated, eyes closed or gaze down, relaxed posture.
- ACTION/POSE: stillness, controlled breathing implied by posture.
- CAMERA: 3/4 angle, medium shot.
- ENVIRONMENT: dark, quiet performance-recovery space (not a clinical room).
- LIGHT: very soft warm amber light, low contrast compared to the Training asset — calmer overall.
- OVERLAY: a faint breathing/HR-style waveform line and a subtle readiness-ring arc.
- STYLE: sports-science editorial, calmer and softer grain than the Training visuals.
- COMPOSITION: subject lower-right, wide negative space upper-left.

**NEGATIVE**: hospital bed, medical monitors, IV lines, sleep mask close-up, clinical white light.

**CROP GUIDANCE**: keep the pose readable as "resting after training", not "sleeping in bed" — avoid literal bedroom staging.

---

## 11. progress-intelligence

- **PAGE**: `/dashboard/progress` header
- **FILE**: `/public/visuals/progress-intelligence.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: athletic adult silhouette, three-quarter figure, with a faint overlaid upward performance-trend line integrated into the composition (not a literal chart graphic).
- ACTION/POSE: standing, confident, looking slightly upward/forward.
- CAMERA: 3/4 angle, medium-wide.
- ENVIRONMENT: dark studio with subtle depth (soft background gradient, not flat).
- LIGHT: amber rim light tracing the silhouette edge.
- OVERLAY: one thin ascending line motif suggesting a trend, integrated subtly into the lighting/background — not a literal UI chart.
- STYLE: sports-science editorial, slightly more atmospheric/aspirational than Training.
- COMPOSITION: subject right-of-center, negative space left.

**NEGATIVE**: literal "before/after" split image, weight-loss transformation framing, visible scale/tape measure, chart UI baked into photo.

**CROP GUIDANCE**: silhouette must stay fully inside frame (no cropped head/feet) since this asset communicates a full-body trajectory.

---

## 12. dante-intelligence

- **PAGE**: `/` Dante section, `/coach`
- **FILE**: `/public/visuals/dante-intelligence.webp`
- **ASPECT RATIO**: 1:1 or 4:3

**PROMPT**
- SUBJECT: an abstract intelligence-network composition — NOT a robot face or human figure. Connected nodes and thin amber lines converging toward one focal point.
- ACTION/POSE: n/a (abstract).
- CAMERA: n/a.
- ENVIRONMENT: near-black background.
- LIGHT: amber line-light only, no ambient photography lighting needed.
- OVERLAY: is the entire image — a network diagram rendered as art, not literal UI.
- STYLE: restrained data-visualization-as-art, consistent with the existing Dante robot brand identity (this asset sits alongside it, never replaces it).
- COMPOSITION: focal convergence point placed to align with where the existing `DanteRobot` component will sit in the layout.

**NEGATIVE**: glowing blue robot head, humanoid AI face, sci-fi brain, circuit-board close-up, green matrix code.

**CROP GUIDANCE**: keep the convergence point centered so it works cropped to a square avatar-adjacent panel.

---

## 13. business-intelligence

- **PAGE**: `/business/insights` header (and other Business Portal headers)
- **FILE**: `/public/visuals/business-intelligence.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: abstract member-network topology — small nodes (members) connected to larger cluster nodes (segments/cohorts), NOT photography of people.
- ACTION/POSE: n/a (abstract data art).
- CAMERA: n/a.
- ENVIRONMENT: near-black background.
- LIGHT: amber node/line lighting only.
- OVERLAY: is the image itself.
- STYLE: analytical, restrained — more data than photography, explicitly avoiding a security/surveillance-dashboard look.
- COMPOSITION: nodes distributed across the frame with one denser cluster on the side that will be masked by the readability gradient.

**NEGATIVE**: literal face photos, surveillance-camera framing, red alert colors, crosshair/targeting reticles, stock-photo business handshake.

**CROP GUIDANCE**: keep node density lower in the text-safe zone (left 40-50% in a standard header) so labels stay legible.

---

## 14. responsible-ai

- **PAGE**: `/responsible-ai` header
- **FILE**: `/public/visuals/responsible-ai.webp`
- **ASPECT RATIO**: 21:9

**PROMPT**
- SUBJECT: a split/architectural composition representing data → deterministic engine → AI interpretation → human decision, expressed as a precise grid/panel layout with one human silhouette at the "decision" end.
- ACTION/POSE: the silhouette stands at a clear decision point, calm and in control (human-in-the-loop, not menaced by AI).
- CAMERA: architectural, symmetric framing.
- ENVIRONMENT: dark studio with a literal grid/panel motif.
- LIGHT: even, precise — amber accent only at the human decision point, to draw the eye there.
- OVERLAY: thin structural lines dividing the four stages; no literal text/labels in-image.
- STYLE: precise, architectural, calm — the opposite of a "scary AI" image.
- COMPOSITION: four-part horizontal division, human figure anchoring the final segment.

**NEGATIVE**: glowing robot brain, red warning imagery, menacing AI eye, dystopian tone, chains/control imagery (implies coercion rather than oversight).

**CROP GUIDANCE**: keep all four compositional segments visible even at a 21:9 crop — don't let the human figure get cropped out on narrow viewports; provide a secondary square crop centered on the human figure alone for mobile.

---

## 15. first-rep

- **PAGE**: `InspirationStory` ("The First Rep", `/` `#inspiration`)
- **FILE**: `/public/visuals/first-rep.webp` — **a real photo already exists** at `/public/story/images/the-beginning.jpg` and is wired into `config/page-visuals.ts` today. This prompt is for a future higher-fidelity replacement, not an urgent need.
- **ASPECT RATIO**: 4:5

**PROMPT**
- SUBJECT: a solitary figure at the entrance of a quiet, empty training space, or facing a mirror.
- ACTION/POSE: a first step forward, or a quiet moment of self-recognition — minimal, still.
- CAMERA: wide, so the empty space around the subject reads as significant.
- ENVIRONMENT: an empty gym/training space in early morning light.
- LIGHT: soft, natural-feeling morning light rather than dramatic studio rim light — this asset should feel more human than technical.
- OVERLAY: none — no data overlays on this one image (spec explicitly asks for fewer overlays here).
- STYLE: emotional, minimal, editorial — closer to documentary photography than sports-science photography.
- COMPOSITION: subject small within a large, quiet frame; generous negative space.

**NEGATIVE**: crowded gym, dramatic lighting, data overlays, motivational-poster text, other people, chess/pawn imagery (the quote is rendered in HTML, never depicted literally).

**CROP GUIDANCE**: keep the negative space intact — do not crop tight on the subject; the emptiness of the space is the point.

---

## 16. onboarding-performance

- **PAGE**: Onboarding / Login
- **FILE**: `/public/visuals/onboarding-performance.webp`
- **ASPECT RATIO**: 3:4

**PROMPT**
- SUBJECT: a restrained human silhouette with faint measurement/grid marks (height, stance width) — evokes a profile-setup moment without literal medical measurement imagery.
- ACTION/POSE: neutral standing pose.
- CAMERA: straight-on, full body, distant enough that the figure reads as small within the frame.
- ENVIRONMENT: near-black background, minimal.
- LIGHT: very restrained — this must not compete with a login/signup form.
- OVERLAY: faint grid/measurement tick marks only.
- STYLE: minimal, quiet, precise.
- COMPOSITION: figure occupies well under half the frame; the rest is empty dark space suitable for placing behind a form panel at low opacity.

**NEGATIVE**: any visible face detail (keep it anonymous/universal), clinical measuring tape, doctor's office imagery, bright colors.

**CROP GUIDANCE**: this asset should work at 15-20% opacity behind a form — verify legibility of any login/signup text before finalizing usage.
