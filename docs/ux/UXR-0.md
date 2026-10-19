# UXR-0 — UX/UI Redesign Contract (Design Freeze)

Status: FROZEN
Phase: UXR-0
Accepted for implementation: YES

> Provenance: restored from the canonical decision list in the UXR-1 entry
> resolution brief. No earlier verbatim UXR-0 file exists in the repository.
> Details not listed here (exact neutral ramp, spacing scale, component specs)
> are deliberately not invented; they are decided and documented in the phase
> that implements them (see `docs/ux/UXR-1.md` for tokens).

## 1. Product north star

- Light-first personal performance OS.
- Clarity > decoration.
- Decision > data dump.
- Action > card count.
- Contextual AI > chatbot island.
- `VISUAL_PROMINENCE <= FEATURE_RELIABILITY` — a feature never looks more
  finished than it is.

## 2. Information architecture

- Today
- Training
- Nutrition
- Progress
- Recovery — a dedicated, contextual workflow (not a primary destination)
- Dante — a 3-level contextual layer (see §10)

## 3. Navigation

- Four primary destinations: **Today / Training / Nutrition / Progress**.
- Recovery is secondary / contextual.
- Dante is contextual.
- Account is reached via account / avatar / settings.
- Routes are unchanged.

## 4. Today

- L1: one primary action.
- L2: Performance Strip.
- L3: supporting insights.
- L4: exploration.
- At most two main bordered containers, plus proposals.

## 5. Visual system

- Light-first, warm neutral.
- Ink-blue accent, starting value `#1F4FD8`.
- No glow, glass blur, orbit, or gradient shell.
- Semantic domain marks only.

## 6. Typography

- Inter only for the signed-in app shell.
- Bebas Neue for the wordmark only.
- Barlow Condensed is retired from the app shell.
- No text below 12px.

## 7. Card rule

- Containers by exception. A container must earn its place.

## 8. Training

Overview → Plans → Active session → History → Muscle intelligence.

### Active workout

- Proper set logging.
- Previous-set ghost values.
- Thumb-first controls.
- Automatic, timestamp-based rest timer.
- Finish flow.

## 9. Nutrition, Recovery, Progress

- **Nutrition:** Fuel Remaining. States are explicit: Logged / Estimated /
  Proposed / Simulated / Unresolved. No food moralization. Future-compatible
  with NL1.
- **Recovery:** an immediate decision workflow.
- **Progress:** longitudinal trends only.

## 10. Dante

- Level 1 — Insight.
- Level 2 — Proposal.
- Level 3 — Deep conversation.
- Mutation flow: Proposal → diff → explicit confirmation → mutation → result.

## 11. Mobile

- Bottom navigation.
- Mobile-first at 390px.
- No collapsed-desktop shell.

## 12. Accessibility

- WCAG 2.2 AA.
- Labels on all controls; semantic headings.
- Focus trap in dialogs; visible focus.
- Reduced motion respected.
- No color-only status.

## 13. Routes

Unchanged.

## 14. Hard constraints

- No route changes.
- No business-logic changes.
- No Supabase changes.
- No Nutrition behavior changes.
- No Dante behavior changes.

## 15. Roadmap

1. UXR-0 Design Freeze
2. UXR-1 Design System Foundation
3. UXR-2 App Shell + Navigation
4. UXR-3 Today Command Center
5. UXR-4 Workout Experience
6. UXR-5 Nutrition Experience
7. UXR-6 Recovery + Progress
8. UXR-7 Dante Integration
9. UXR-8 Mobile / Responsive
10. UXR-9 Accessibility / Motion / Polish
