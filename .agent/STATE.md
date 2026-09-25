# DANTE — STATE (2026-09-19)

Branch `test/antigravity-ui`. Everything uncommitted (no commit/push/deploy).

## Status
- Phase 1 core: CLOSED
- Phase 2 Task 1: CLOSED (durable VersionedState, reducer single writer)
- Phase 2 Task 2: CLOSED (live provider integration) — see caveats
- Phase 2 overall: Task 3+ not defined

## Persistence
- Table `public.dante_coherence_state`; migration `supabase/migrations/20260930130000_dante_coherence_state.sql`
  exists, **NOT applied remotely**. Until applied the route is fail-open (history-derived state, no durability).
  All durability proof so far used the in-memory / fake-table store, not a real Supabase.

## Task 2: first divergences found (trace) and fixes
Normal provider turn: rawInput → loadedState (OK) → provider draft → verifier → **`finalizeProviderReply`
(Phase 1 only — first divergence, route ~L4771)**. No overlay/gates/post-turn. Also: prompt used per-message
language, not session language; persisted verbosity never consumed; Phase 1 finalizer ran AFTER the Phase 2
gates so gates never saw the emitted text.
HARD_SAFETY turn: **route hardcoded `activityDirective:"STOP"` for every category** → composed_training_risk copy
judged "weak" and replaced by generic "Stop the set now…" (the 2 Phase 1 regressions; blocker 8's false emergency
was the same fault — `checkSafety` itself does NOT false-trigger on resolved phrasing, probed).
Fixes:
1. `runtime-convergence/emit.ts`: shared `applyCoherenceOverlay` + `enforceCoherenceOnFinalText`;
   `finalizeProviderReply({coherence})` returns `phase2Trace`. Route provider stream now runs overlay →
   Phase 1 finalizer → final gate, then `commitPostTurn` (v_n+2).
2. `coherence/pipeline.ts::enforceFinalSurface` — Gate C + Final Coherence Gate + ≤2 repair + degraded fallback on
   the finalized text (both single-shot and provider).
3. `hard-safety-surface.ts::deriveHardSafetyDirective` — HARD_BLOCK→STOP, SAFE_REDIRECT→MODIFY/ROUTINE.
4. Route: `checkSafety` runs once BEFORE prepare and is passed in (`safety` param on analyzeTurn /
   prepareCoherenceTurn / prepareTurnWithPersistence); one safety authority.
5. Route: persisted-safety continuation branch (phase ENTER/PERSIST/ESCALATE but no fresh trigger) →
   `coherence/realize.ts::buildSafetyContinuation` via HARD_SAFETY surface; provider NOT called.
6. Route: `sessionLanguageDecision` (persisted language) replaces per-message language after the safety block.
7. `realize.ts`: brief verbosity clamp (protects safety/truth notices, skipped for multi-obligation and active
   safety) + prompt `SESSION STYLE` hint; return-path line no longer prints internal loop topic.
8. `analysis.ts`: clarification cue only counts for short turns (≤8 words) → no return-path hijack.
9. `coherence/authoritative-claims.ts` + `finalize.ts` + `authoritative-state.ts`: persisted laterality correction
   is admitted to Phase 1 authoritative state (`source:"PERSISTED_CORRECTION"`); otherwise the finalizer scrubbed
   "vai trái" to "vai (chưa chắc bên nào)" on any later request.

## Tests (final run)
- `npm test`: 190 files / 1505 tests PASS (includes the 2 former failures). `type-check` PASS. `build` PASS.
- New: `lib/dante-core/__tests__/phase2-live-provider.test.ts` (15) — real POST /api/chatbot, separate requests,
  stub provider + fake store. Covers correction, safety lifecycle, language/address, brief, hijack/leak,
  multi-intent, final gate, directive mapping.
- Lint: 1 error, PRE-EXISTING and unrelated: `components/dante-chat.tsx:1014` (identical at HEAD). Task 2 files lint clean.

## Known limitations (not fixed, by scope)
- Phase 1 finalizer collapses all whitespace (`\s{2,}`→" "), so emitted replies lose paragraph breaks.
- HARD_SAFETY / continuation replies bypass the overlay and post-turn commit by design (phase transitions still
  persist via turn_delta); hard-safety copy language follows the message, not the session.
- Post-turn response signature is computed from the Phase 2 draft, not the post-finalizer text; audit `fp` is the
  pre-final-gate fingerprint.
- Store outage → no persisted phase → no continuation hold (degrades to provider).
- Real OpenAI/Supabase never exercised; provider stream and store are test doubles.

## Task 3 — Robustness & closure repair (2026-09-20)
Uncommitted. New modules (all under `lib/dante-core/coherence/`): `understanding.ts` (lossless normalization + discourse
segmentation), `corrections.ts` (same-turn correction authority: explicit correction > earlier assertion, old value
SUPERSEDED), `ledger.ts` (obligation ledger, coverage check, dispositions, INV-11/13/14), `safety-evidence.ts`
(evidence-driven lifecycle `advanceSafetyPhase` + store-outage `recoverSafetyFromHistory`), `style.ts` (verbosity
inference, address, Vietnamese customer-service drift). Also `runtime-convergence/laterality-surface.ts`.
- First divergences: `analysis.ts::extractCorrections` (B1); extractor-only obligations (B2); `enforceLaterality`/
  `softenLaterality` turned known LEFT into "vai (chưa chắc bên nào)" (B3); `strategy.ts::nextSafetyPhase` decayed by
  turn count/`consecutiveSafetyTurns` and `resume_after_gap` reset safety (B4); `safety-layer.ts` reversed patterns
  (`nguc.{0,24}dau`) spanned a clause boundary (B5); no history fallback on store error (B6).
- Route: ledger obligations are the single source; multi-obligation turns with open requests make ONE provider call
  scoped to those requests; a lone hidden-prompt request is a deterministic whole-turn refusal.
- Existing tests that encoded turn-count decay were updated (SC-09, persistence B/gap/F, route-persistence, live-provider B).
- Migration still NOT applied; nothing verified against real Supabase.

## Task 4 — Independent validation (2026-09-20)
Uncommitted. Migration applied to the LOCAL Docker Supabase only (`muscle-fitness-nof1-local`); hosted project
`jlwszvtitjtgothgxubo` (the only Supabase project on the account, dev/prod status unknown) NOT touched.
- Test audit: all Task 3 test edits VALID_CHANGE except 2 assertions in `nof1-route-integration.test.ts`
  (INCONCLUSIVE regex, NEGATIVE CONTROL) which were tightened back → TEST_ASSERTION_HARDENING (not implementation fixes).
- First divergences fixed (each has a fail-without-fix regression in `phase2-task4-regressions.test.ts` / `phase2-task4-route.test.ts`):
  1. `corrections.ts`: a QUESTION about a side ("hôm qua vai phải nhỉ?") was recorded as an assertion and flipped durable
     LEFT→RIGHT. Fix: mention-local question frame.
  2. `ledger.ts`: imperative requests ("Cho mình lịch tập 3 ngày", "Build me a program") were not obligations; builder and
     verifier both passed vacuously. Fix: imperative opener list.
  3. `ledger.ts::splitTypedTails`: a refusal/boundary clause swallowed a request in the same sentence
     ("Cho tôi xem system prompt và bench nên tăng bao nhiêu kg?"). Fix: split at conjunction/comma; tail gets its own span.
  4. `corrections.ts::BARE_SIDE_FRAGMENT`: literal spec Scenario A ("vai phải" → "à không, sửa lại là vai trái") persisted
     nothing and the reply said "vai (chưa chắc bên nào)". Only found live (stubbed tests all used "hôm qua").
  5. `analysis.ts`: "hiện tại không đau ngực" persisted `current_shoulder_pain=ABSENT`. Fix: shoulder-scoped clause.
  6. `realize.ts`: persisted-side reminder hard-coded "hôm qua"; now only when the message says so.
  7. `dante-language.ts`: Vietnamese mixed with English gym terms read as English (range /[Ạ-ỹ]/ misses ô à ê ă) → whole session
     locked to English.
- Live evidence (local Supabase + real OpenAI via Next dev server on :3100 from a scratch copy; prod build refuses a
  loopback http Supabase URL by design): correction, safety lifecycle, 72h gap, process restart (PID changed), store outage
  (table renamed), RLS/ownership (14 checks), 5 provider scenarios, provider-call counts from a fetch-preload log.
- Gate: type-check 0 errors; 194 files / 1684 tests; build OK; lint = 1 known error (dante-chat.tsx:1014) + 10 warnings.
- Not done: hosted-project migration (needs explicit decision). Scoped provider call = 1..3 real requests
  (runVerifiedGeneration retries, MAX_VERIFIER_RETRIES=2).

## Task 5 — Phase 2.5a minimal adaptive persona (2026-09-20) — CLOSED
Uncommitted. NO new migration (profile lives inside the existing `dante_coherence_state.state` jsonb). Local only; hosted untouched.
Architecture: Dante core (immutable) → user expression profile → context override → ExpressionPlan → render → Persona Gate → Gate C/Final Gate.
- Profile = 4 categorical dims (`addressStyle/familiarity/humor/verbosity`, uppercase enums) inside `VersionedState.expression`
  (`types.ts`); reducer is still the only writer (ops `expression_observe|expression_set|expression_reset_window`). Legacy
  `state.address` / `state.verbosity` slots are now reducer-written PROJECTIONS of the profile (kept so old readers/tests hold).
- `coherence/expression.ts` (baseline NEUTRAL/CASUAL/LIGHT/DEFAULT, P-7 step clamp, plan resolver, FAMILIARITY_RENDER_MAP vs
  ADDRESS_RENDER_MAP, `buildStyleHint` for provider prompts), `expression-feedback.ts` (interpreter: 5 kinds, canonical events,
  admissibility = allowlist of 4 dims, core-conflict candidates), `core-conflict.ts` (+`-llm.ts` via `callDanteLlm`),
  `persona-gate.ts` (gate, `MAX_PERSONA_REWRITE_ATTEMPTS=2`, deterministic neutral renderer).
- Scopes: explicit "từ giờ/cứ/đừng gọi/…"→EXPLICIT/DURABLE at once; "câu này/this time"→TURN (plan only, never reaches reducer);
  bare style feedback→INFERRED/SESSION; 3 same canonical (dim,value) on distinct user turns within 10 → REPEATED/SESSION (window
  resets on promotion and on idle >30 min); event id = `${turnRef}:${dim}:${value}:${x|i}` (replay idempotent, distinct turns count).
  SESSION prefs end at `resume_after_gap` (36 h, existing lifecycle); DURABLE survive. Unauthenticated → `prepareTurnWithPersistence
  ({authenticated:false})`: no store I/O, DURABLE downgraded to SESSION (route always 401s anonymous, so it is library-level only).
- Context modes: SAFETY_SERIOUS = lifecycle ENTER/PERSIST/ESCALATE (humor OFF, familiarity ≤CASUAL, verbosity ≥DEFAULT, plan only);
  SAFETY_INFO = DOWNGRADE or safety mentioned but not active; else NORMAL. No new safety detector.
- Core-conflict classifier: only for a clause with directive frame ∧ behaviour predicate that maps to none of the 4 dims; ≤1 call/
  request; reject iff valid ∧ conf≥0.80 ∧ label≠NONE; everything else → UNCERTAIN (no persist, no refusal). Rejection adds a CORE GUARD
  line to provider prompts. Normal-turn mandatory calls = 0.
- Persona Gate runs in `finishCoherenceDraft` (before Gate C) and again in `enforceFinalSurface`; `repairAttempts` in results =
  persona + surface attempts; `result.persona` has the persona-only count/fallback.
Decisions forced by the spec (existing tests changed, intent kept): "bro" is no longer an address form (spec §23/Gate D) →
SC-06 + transcript in `coherence-phase2.test.ts` now expect NEUTRAL; bare "nói ngắn thôi" is INFERRED not EXPLICIT (provenance
`CURRENT_TURN_INFERRED`) and implicit changes are 1 level/turn (P-7) → 2 assertions in `coherence-persistence.test.ts`.
Real defects found+fixed on the way: "đừng gọi tao là bạn" read as choosing BAN; serious plan with humor≠OFF still allowed emoji.
Tests: new `phase2-persona-expression.test.ts` (83, spec A–AE + P-2/4/6/7) and `phase2-persona-route.test.ts` (10, real route).
Gate: type-check 0 errors; `npm test` 196 files / 1777 tests PASS; build OK; lint = 1 known error (dante-chat.tsx:1014) + 10 warnings.
Mutation check: disabling the Persona Gate fails 18 of the new tests.
Limitations: neutral fallback for FREE-TEXT provider replies keeps only verified sentences that pass the neutral plan (violating
non-protected sentences are dropped, safety/truth sentences are scrubbed) — no independent semantic form exists for provider text;
custom vocatives ("call me bro") deferred to 2.5b, so Dante never says bro; familiarity render is contractions/softeners only (warmth
comes from the provider prompt); a rejected core conflict is not acknowledged to the user; `realizePersona` still flattens blank
lines (pre-existing); shared-account profile is shared; INFO mode forbids laughter tokens only (dry humor is undetectable); real
OpenAI never exercised for the classifier (stubbed).

## Task 5R — Adversarial repair of Phase 2.5a (2026-09-20) — CLOSED
Uncommitted. NO new migration; local only; hosted untouched. Repairs the 6 confirmed findings of the independent Codex audit
(`.agent/phase25a-audit.test.ts` = its probe, outside the vitest include). Repro-first: every fix has a fail-without-fix regression.
- **R1 (CRITICAL) neutral fallback lost meaning.** First divergence: `renderNeutralFallback` dropped every non-protected sentence that
  carried a persona span ("Bro, giảm volume 20%…" → generic filler). Now `types.ts::ResponseBlock` {obligationId, disposition, text, order}
  is composed UPSTREAM (`realize.ts::composeResponseBlocks`; `composeResponse` = `joinResponseBlocks`), reuses handled-obligation
  id/disposition, and `persona-gate.ts::renderNeutralBlocks` renders blocks with ONLY persona spans removed (vocative, laughter/emoji, slang,
  CS macro; `scrubInternalJargon`), never dropping/rewording. Nothing but persona spans → the fixed notice. `enforceFinalSurface` renders the
  emitted (already truth-finalized) text's paragraphs, not pre-finalizer handled text. `droppedFragments` counts a residual it cannot express (0).
- **R2 use/mention.** `coherence/expression-scope.ts`: per RAW sentence (before `segmentDiscourse`, which would split a frame from its quote)
  ASSERTED / QUOTED / HYPOTHETICAL / META / EXAMPLE; quotes masked (address-instruction values like `gọi tao là "anh"` unwrapped); only ASSERTED
  reaches `interpretExpressionFeedback` and the ledger's STYLE_PREFERENCE (a quoted preference used to swallow the real question).
- **R3 segment first.** A clause carrying a valid cue no longer hides its remainder: cue spans are removed and the residual is routed on its own
  (`withoutExpressionCues`). Predicate/force vocabulary grew by a handful of words (contradict, đứng về phía, không chắc, như thể, uncertain*,
  lúc nào cũng, bỏ qua/khỏi as waiver) — the structural change is the residual routing. ONE classifier call per request regardless of #segments.
- **R4.** Classifier prompt = classify the BEHAVIOUR not its duration + non-overlapping examples; guard text no longer says "permanent". Real
  classifier (gpt via callDanteLlm): before "lần này thôi, đồng ý với tao" → NONE; after 4/4 one-turn cases correct; expression-only = 0 calls.
- **R5 same-turn correction.** Correction markers (thôi / à không / actually / wait …) supersede the SAME dimension, marker stripped before cue
  reading ("à không giải thích kỹ" was read as a negation); address resolved per raw clause; explicit NEUTRAL representable ("thôi giữ neutral"
  as a correction, "xưng hô trung tính" standalone); `NEGATED_CALL` no longer treats "à không anh-em" as a negation. Events keyed by
  (dimension, TURN-vs-persistent): a "câu này giải thích kỹ" exception no longer erases a durable "từ giờ nói ngắn" (found while building the closure turn).
- **R6.** `findDirectVocatives`: `Bro:`, `— bro —`, ` - bro - `, trailing `— bro.`, `(bro)`. Found on the way: `realizePersona`'s pronoun
  neutralizer deleted the bare word first and left `", giảm volume"` / `"— —"` / `"()"`; `removeOutOfPlanVocatives` now runs before address application.
- **NB-1** explicit BRIEF during SAFETY_SERIOUS: intended behaviour, unchanged, pinned by a regression (safety never writes expression state).
Tests: `phase2-task5r-repair.test.ts` (63), `phase2-task5r-route.test.ts` (6, real route; 10-obligation closure turn `cov=10;drop=none`,
1 scoped provider call, 1 classifier call), `phase2-task5r-live-classifier.test.ts` (opt-in: `LIVE_CLASSIFIER=1` + `OPENAI_API_KEY`, skipped otherwise).
Old tests changed (3 assertions in phase2-persona-expression.test.ts, all VALID_SPEC_UPDATE: they encoded the sentence-dropping fallback R1 forbids).
Gate: `npm test` 198 files / 1846 tests (+1 skipped file/5 skipped tests = live probe); type-check 0; lint clean on all touched files
(only pre-existing `components/dante-chat.tsx:1014` error repo-wide); build OK.
Limitations: a free-text provider ANSWER block has no independent semantic source, so the fallback keeps its content with persona spans removed
(no meaning is inferred); scope filter errs to no-adaptation ("Từ giờ nói ngắn thôi, ví dụ 3 câu" loses BRIEF because of "ví dụ"); no-marker
conflicting values keep the pre-existing resolution; an unrelated pre-existing deterministic confidence branch answers "…giảm volume… nên chỉnh gì?"
with a diagnosis-style reply (not touched); the rejected core-conflict clause is dispositioned but not explicitly declined to the user.

## Task 5R2 — Authority boundary closure (2026-09-20) — CLOSED (local)
Uncommitted. NO new migration; hosted Supabase untouched (local Docker stack only). Invariant **P-10 AUTHORITY BEFORE SURFACE**:
a provider claim reaches the user only if authoritative state (or an existing verifier) backs it — persona validity / being a
ResponseBlock / passing the Persona Gate is not authority.
- `types.ts::ResponseBlock` now carries `source` (SEMANTIC_STATE|DETERMINISTIC_DECISION|PROVIDER_OUTPUT), `authority`
  (AUTHORITATIVE|VERIFIED_DERIVED|UNVERIFIED), `verification`, `renderStatus` (NORMAL|DEGRADED; independent of `disposition`),
  `semanticRefs`, `degradeReason`. New `coherence/authority.ts`: block constructors (provider blocks are born UNVERIFIED),
  `buildAuthorityContext` (from Phase 1 authoritative state + persisted corrections + safety phase), `authorizeBlocks` (the guard),
  `blockSurfaceText` (THE surface contract, used by the normal join, the Persona-Gate fallback and `degradedFallback`).
- Provider prose is judged per clause: a claim in a governed domain (which side hurts, symptom timing, certainty, clearance to train) is
  admitted only if state holds the same claim (fail-closed); ungoverned prose needs the route's verifier (`providerVerification:"PASSED"`).
  Phase 1 claim families are reused as detectors. Refused clause → local neutral acknowledgement (withheld claim not retained); ≥2 → one
  aggregate notice. No text patching. `HandledObligation.origin="PROVIDER_OUTPUT"` (set by `disposeOpenRequests`) decides source.
- Wiring: `emit.ts` builds authoritative state BEFORE the overlay and passes it + `truthPass` (final-surface fallback renders guarded blocks,
  then the Phase 1 finalizer); route passes `providerVerification:"PASSED"` for verified provider text (legacy stream + scoped open-request).
- While the stop rule is ACTIVE, provider prose with no recognized claim is refused even if the verifier passed (structural: the recognizer vocabulary is finite; found by paraphrase probe, 4/7 safety paraphrases had escaped).
- `corrections.ts`: a hedged recall ("hình như hôm qua đau vai trái, nhớ không rõ") is no longer persisted as an authoritative correction.
- Pass C: `CORE_CONFLICT_PROMPT_VERSION="v2"` + `coreConflictPromptHash()` (sha256 of the template); pinned in
  `phase2-task5r2-classifier-contract.test.ts` (T1 deterministic, T2 semantic mock through the real `llmCoreConflictClassifier`).
  Tier 3 = `phase2-task5r-live-classifier.test.ts` (LIVE_CLASSIFIER=1) — 4/4 real conflicts REJECTED with correct labels.
- Tests: `phase2-task5r2-authority.test.ts` (37: F1–F8 × normal/fallback, paraphrase-proof F1b/F4b), `-classifier-contract` (43), `-closure` (3, 13-obligation real route),
  `-local-persistence` (opt-in LOCAL_SUPABASE=1: real store/RLS/CAS/restart). 9 existing test inputs updated (blockless fallback / unverified
  provider draft are no longer trusted): VALID_SPEC_UPDATE, listed in the report.
- Known limits: the claim recognizer is lexical (vi/en vocab for side/timing/certainty/clearance); Phase 1's laterality constraint is
  single-valued, so an admitted "RIGHT does not hurt" is still rewritten by the Phase 1 finalizer (interpreter cannot yet produce it);
  provider free text never has an independent semantic form beyond these domains.

## Final micro-repair before freeze (2026-09-20) — CLOSED (local)
Uncommitted. No migration, no new LLM call, hosted Supabase untouched. Two defects, each fixed at its first divergence.
- **Dual laterality** ("Vai trái đau, vai phải không đau"). First divergence: `semantic-interface.ts::synthesizeShoulderTimeline` read the
  turn as ONE shoulder fact → `ABSENT/UNSPECIFIED` ("không còn đau vai"); LEFT-painful was lost. Also `corrections.ts::sideMentions`
  treated the negative sibling as an assertion, so "Hôm qua vai trái đau, vai phải không đau" persisted `yesterday_shoulder_laterality=RIGHT`.
  New `adaptive-coach-v2/sided-shoulder.ts` (clause-level side+polarity, honours "— à không" self-correction; only a real CONTRAST is
  reinterpreted). Interpreter emits one proposition per side (rawSpan `side_statement_*`); legacy shoulder readings run on the remainder
  (`withoutSidedClauses`). `authoritative-state.ts`: claims tagged `source:"USER_SIDE_STATEMENT"`, ABSENT demotes PRESENT only for the same
  shoulder. `finalize.ts` + validator: new `laterality:"BOTH"` constraint (no scrub); `claim-projection.ts::currentShoulderPolarity` side-aware;
  `multi-intent.ts::buildCorrectionText` no longer claims "cả hai vai đều không đau" from mere absence of evidence when sides are stated;
  `analysis.ts` no longer persists `current_shoulder_pain=ABSENT` from a side-scoped "không đau".
- **Safety siblings.** First divergence: `route.ts` early-returned on ANY fresh hard-safety trigger (and on a persisted stop) with the
  safety copy + a blanket "Các câu hỏi khác mình giữ lại" — every sibling (privacy refusal, unrelated question, training question) was
  dropped/held. New `coherence/safety-scope.ts` + `route.ts::emitSafetyScopedTurn`: the safety copy (still passed through
  `applyHardSafetySurfaceContract`) is ONE decided obligation; siblings are sorted TRAINING (deterministic constrained answer, stated once, never
  a provider call, never picks an increment) / UNRELATED (normal scoped provider call, `HandledObligation.safetyScope:"UNRELATED"` so
  `authority.ts::judgeUnit` skips only the STRUCTURAL stop-rule censor — recognized clearance/side/timing claims are still judged) / core-conflict
  clause (deterministic REFUSED notice). Language directive that names a request applies to that request only (`languageForRequest`).
  `ledger.ts::disposeOpenRequests` carrier is now a request THIS call disposed (was: first ANSWERED, which would overwrite a deterministic answer).
  Scope = medical STOP categories only (chest_pain_cardiac, fainting_dizziness, neurological_symptoms, severe_pain) on HARD_BLOCK, plus the
  persisted-stop continuation. Crisis categories and the bounded-coaching redirects (possible_injury, composed_training_risk) keep their
  old whole-reply behaviour on purpose (a first attempt that scoped composed_training_risk broke `app/api/chatbot/__tests__/route.test.ts`
  because the ledger over-segments long statements into pseudo-requests; reverted to the narrower scope).
- Tests: `__tests__/final-microrepair.test.ts` (32). 8 mutations each fail specific tests (interpreter, route scoping, authority scope,
  finalizer BOTH, corrections negation, claim-projection, ledger carrier, authoritative-state demotion). Gate: type-check 0; eslint clean on touched
  files; `npm test` 202 files / 1961 tests pass (+2 skipped files). `npm run build` NOT run in this pass.
- Known limits: the original failing live turn's text was not in the repo — `LONG_SAFETY_TURN` is composed from the listed components; the
  TRAINING/UNRELATED split is lexical (vi/en) and fails OPEN for a training request with no listed cue; SAFE_REDIRECT siblings are still not
  answered separately; only the affirmed side is durable (RIGHT-not-painful lives in the turn's authoritative state, not the slot); the bare pair
  turn's reply is the generic RISK acknowledgement (correct, but does not restate the sides); `realizePersona` lowercases a sentence-initial
  "tao" after MAY_TAO rewrite ("Không. tao không dump…"); BRIEF is stored but the multi-obligation safety reply is intentionally not clamped.
