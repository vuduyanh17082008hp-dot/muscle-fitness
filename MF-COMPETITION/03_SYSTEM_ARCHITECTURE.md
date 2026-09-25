Muscle Fitness — System Architecture

1. Architecture Goal

Muscle Fitness is designed as a deployable AI-enabled fitness platform that combines:

user profile and onboarding;

training;

nutrition;

recovery;

progress tracking;

an AI coaching system called Dante.

The architecture is built around one central idea:

AI should not receive every available user fact and simply generate an answer. It should receive the right context, under explicit evidence, scope, safety, and privacy controls.

This makes the system more reliable, explainable, and competition-ready than a simple chatbot wrapper.

2. Judge-Friendly Architecture Summary

USER
  ↓
WEB APPLICATION
  ↓
AUTHENTICATED USER CONTEXT
  ↓
DANTE AI ORCHESTRATION
  ↓
────────────────────────────────────────
1. CURRENT-TURN UNDERSTANDING
2. OBLIGATION / INTENT BINDING
3. REASONING SCOPE CONTROL
4. RELEVANT CONTEXT ASSEMBLY
5. EVIDENCE + AUTHORITY CONTROL
6. SAFETY CONTROL
7. STRUCTURED DECISION STATE
8. ACCESSIBLE COMMUNICATION PROFILE
────────────────────────────────────────
  ↓
OPENAI LANGUAGE MODEL
  ↓
CONTROLLED NATURAL-LANGUAGE RESPONSE
  ↓
USER

The model is used for natural-language understanding and response generation, while product-level logic constrains what context is eligible, what claims require evidence, what safety rules apply, and how uncertainty is preserved.

3. Product Architecture

┌─────────────────────────────────────────────┐
│              MUSCLE FITNESS                 │
├─────────────────────────────────────────────┤
│ Landing / Authentication / Onboarding       │
│ Dashboard                                   │
│ Training                                    │
│ Nutrition                                   │
│ Recovery                                    │
│ Progress                                    │
│ Dante AI Coach                              │
│ Settings / Preferences                      │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│            APPLICATION SERVICES             │
├─────────────────────────────────────────────┤
│ User Profile Service                        │
│ Training State Service                      │
│ Nutrition State Service                     │
│ Recovery State Service                      │
│ Progress State Service                      │
│ Conversation / Dante Context Service        │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│                SUPABASE                     │
├─────────────────────────────────────────────┤
│ Authentication                              │
│ User-scoped database state                  │
│ Row Level Security                          │
│ Persisted fitness context                   │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│            DANTE AI PIPELINE                │
└─────────────────────────────────────────────┘

4. Frontend Layer

Technology

Next.js

React

TypeScript

Tailwind CSS

Responsibilities

The frontend is responsible for:

user authentication flows;

onboarding and profile input;

dashboard rendering;

workout and training interfaces;

nutrition interfaces;

recovery information;

progress visualisation;

Dante conversation interface;

accessibility and responsive presentation;

user preference controls.

The frontend must not contain server secrets or directly bypass server-side authorisation rules.

5. Backend and Data Layer

Supabase

Supabase provides:

authentication;

persisted user data;

database access;

user-scoped state;

Row Level Security.

Privacy Boundary

The intended database rule is:

Authenticated User
      ↓
May access authorised data belonging to that user
      ↓
May not access another user's private state

Data Categories

Conceptually, Muscle Fitness may use:

User Profile
├── goals
├── experience
├── preferences
└── communication settings

Training State
├── program
├── completed sessions
├── current training context
└── training preferences

Nutrition State
├── meals
├── targets
└── nutrition context

Recovery State
├── user-reported recovery inputs
├── recovery context
└── readiness information

Progress State
├── body metrics
├── performance records
└── adherence / trends

Dante State
├── current conversation context
├── structured coaching state
├── communication preferences
└── selected relevant evidence

Not every field is necessarily used in every response.

6. Dante — AI Architecture

Dante is the core AI system inside Muscle Fitness.

Its runtime design is:

RAW USER LANGUAGE
        ↓
SEMANTIC STRUCTURE
        ↓
CURRENT-TURN STATE
        ↓
OBLIGATIONS / INTENT
        ↓
REASONING SCOPE
        ↓
RELEVANT CONTEXT
        ↓
EVIDENCE / AUTHORITY
        ↓
SAFETY
        ↓
STRUCTURED DECISION
        ↓
COMMUNICATION PROFILE
        ↓
LANGUAGE MODEL REALISATION
        ↓
FINAL COACHING RESPONSE

The important design choice is that natural-language generation is downstream of structured controls.

7. Layer 1 — Current-Turn Understanding

The system first determines what the user is asking now.

This prevents a common conversational-AI failure:

Previous question:
"Why did my performance drop?"

New question:
"Just because of the rain, should I skip the gym?"

BAD:
Answer the old performance question.

GOOD:
Bind the response to the current rain question.

Current-Turn Principle

Every surfaced answer must resolve to the current active user obligation or an explicitly open prior obligation.

This reduces stale-answer leakage.

8. Layer 2 — Obligation / Intent Binding

A user message may contain several obligations.

Example:

“My knee hurts when I squat. Don’t diagnose me. Should I keep training, what should I change, and when should I see someone?”

This contains multiple requirements:

O1 = Should I keep training?
O2 = What should I change?
O3 = When should I seek professional help?
Constraint = Do not diagnose me.

The system keeps these obligations represented until they are explicitly resolved.

This reduces partial answers and prevents one high-priority concern from accidentally erasing unrelated parts of the user's request.

9. Layer 3 — Explicit Reasoning Scope

Dante respects explicit scope constraints.

Examples:

"Only consider the weather."
→ reason using the weather factor only

"Don't use my recovery data."
→ exclude recovery data from reasoning

"Ignore everything except today's plan."
→ restrict eligible reasoning context

Core Rule

Context availability does not imply context relevance.

The system may know many facts about the user, but only relevant and permitted context should affect the current answer.

10. Layer 4 — Relevant Context Assembly

Once the current task and scope are known, Dante assembles the smallest useful context.

Conceptually:

Current Turn
    +
Relevant User State
    +
Relevant Training / Nutrition / Recovery Data
    +
Conversation State
    +
Safety Context
    =
Eligible Reasoning Context

This avoids sending a large uncontrolled profile dump to the language model.

Context Sources

Possible context sources include:

current user message;

current session conversation state;

user profile;

training state;

nutrition state;

recovery state;

progress state;

communication preferences;

validated safety policy.

Only relevant sources should be activated.

11. Layer 5 — Evidence and Authority Control

Dante separates claims by evidence need.

GENERAL_GUIDANCE
USER_STATE_DEPENDENT
VERIFIED_DATA_CLAIM
SAFETY_GUIDANCE
DIAGNOSTIC_OR_MEDICAL_CLAIM

Examples

General Guidance

“Do not continue a movement that causes pain.”

Can be provided without private telemetry.

Verified Data Claim

“Your recovery score is 72.”

Requires supporting user data.

User-State-Dependent Recommendation

“Reduce training volume because your recovery has declined.”

Requires relevant current user state.

Diagnostic Claim

“You tore your ACL.”

Must not be generated without appropriate clinical evidence and authority.

Evidence Rule

Claim
  ↓
Does this claim depend on personal evidence?
  ├── NO  → general/safety guidance may proceed
  └── YES → require authorised evidence

This reduces both hallucination and unnecessary refusal.

12. Layer 6 — Safety Control

Safety operates above style and personalisation.

TRUTH / SAFETY / EVIDENCE
            >
USER PREFERENCE
            >
STYLE / PERSONA

Dante may be casual, motivational, humorous, or concise, but those preferences cannot override safety boundaries.

Safety Lifecycle

Conceptually:

NONE
  ↓
ENTER
  ↓
PERSIST
  ↓
ESCALATE
  ↓
DOWNGRADE
  ↓
EXIT

This allows safety-relevant context to remain active until it is appropriate to clear it.

13. Layer 7 — Structured Decision State

Before final response generation, Dante preserves the state of the decision.

Conceptually:

NONE
RESOLVED_POSITIVE
RESOLVED_NEGATIVE
CONDITIONAL_RESOLVED
UNCERTAIN
INSUFFICIENT_INFORMATION

Why This Matters

Without structured decision state:

Upstream:
"Maybe train if you feel okay."

Language generation:
"Train."

The output becomes more confident than the evidence.

Dante prevents that certainty upgrade.

14. Layer 8 — Accessible Communication Profile

After the decision is known, Dante adapts how it communicates.

Example profile:

language
complexity
verbosity
jargon level
statistics visibility
register
accessibility mode

This allows:

"My English isn't very good."
→ simpler English

"Don't show me statistics."
→ hide metrics in the response

"Explain in Vietnamese."
→ Vietnamese output

"Keep it short."
→ brief answer

Important Boundary

Presentation preference does not automatically change reasoning.

"Don't show recovery numbers."
≠
"Don't use recovery data."

The first changes output presentation.

The second changes eligible reasoning context.

15. Layer 9 — Natural-Language Realisation

OpenAI is used after structured context, evidence, safety, and decision controls have been applied.

The model is responsible for:

producing natural language;

adapting tone;

explaining decisions;

multilingual communication;

maintaining a coach-like conversational experience.

The model should not independently decide:

which private facts it is allowed to use;

whether unsupported evidence is trustworthy;

whether stale context is still relevant;

whether uncertainty can be upgraded;

whether safety rules may be ignored.

16. Dante Response Architecture

The target output flow is:

Decision First
      ↓
Minimal Reason / Boundary
      ↓
Optional Coach Observation
      ↓
Stop

Example:

User:
"My knee hurts a little when I squat today."

Dante:
"Don't squat through the pain today. You can still train if you stick to
movements that feel fine. If the pain gets worse, the knee swells, locks,
gives way, or walking feels wrong, stop and get it checked."

The objective is concise, useful coaching rather than a long generic AI disclaimer.

17. Personal-PT Realisation

For normal coaching dialogue, Dante is designed to sound like a personal trainer rather than a clinical chatbot.

The target style is:

direct
warm
gym-native
human
brief
appropriately confident

while preserving:

evidence
safety
scope
privacy
decision certainty

This is a presentation layer, not a weakening of the underlying controls.

18. End-to-End Example

User Input

“Bro, I’m still pretty new to the gym and seeing people bench huge weights makes me feel behind. Don’t show me any statistics, but you can still use relevant data internally. My English isn’t great, and my knee hurts a little when I squat today. Don’t diagnose me. What should I do?”

Pipeline

1. CURRENT TURN
   beginner comparison + knee pain + current training decision

2. OBLIGATIONS
   emotional coaching
   immediate training action
   safety boundary
   no diagnosis

3. PRESENTATION
   statistics = hidden
   simple English = enabled
   casual register = allowed

4. REASONING
   relevant authorised data may still be used
   irrelevant profile metrics excluded

5. EVIDENCE
   no invented injury claim
   no unsupported personal statistic

6. SAFETY
   avoid painful movement
   preserve escalation boundary

7. DECISION
   conditional training recommendation

8. REALISATION
   short, natural personal-PT response

This demonstrates accessibility, inclusion, evidence awareness, safety, and personalisation in one interaction.

19. AI Call Strategy

The system is designed to avoid unnecessary model chaining.

Normal response generation should not require a separate model call for every control layer.

Instead:

Deterministic / structured preprocessing
            ↓
One controlled provider request
            ↓
Structured output validation / filtering
            ↓
Final response

Benefits:

lower latency;

lower cost;

simpler failure modes;

easier testing;

easier competition deployment.

20. Provider Strategy

Production Dante uses:

OpenAI

The architecture separates provider generation from core product policy so that:

evidence rules remain application-level;

safety state remains application-level;

context selection remains application-level;

communication preferences remain application-level.

The language model is an important component, but it is not the entire system.

21. Authentication and Security Architecture

Browser
  ↓
Supabase Authentication
  ↓
Authenticated Session
  ↓
Server/API Boundary
  ↓
User-scoped Database Access
  ↓
Dante Context Assembly

Security Principles

API keys remain server-side.

Real secrets must not be committed to Git.

User identity is checked before private-state access.

Row Level Security protects persisted owner-scoped data.

AI context assembly should only receive authorised data.

Private user information should not be logged unnecessarily.

22. Reliability Architecture

The competition version prioritises stable, demonstrable behaviour.

Release gates include:

Targeted AI regression tests
        ↓
Safety tests
        ↓
Authority / evidence tests
        ↓
Type checking
        ↓
Linting
        ↓
Full test suite
        ↓
Production build
        ↓
Browser smoke test

The team also maintains a backup recorded demonstration for live-presentation failure recovery.

23. Testing Architecture

Dante is tested against mutation and adversarial cases rather than only happy paths.

Key categories:

Current-turn regressions
Stale-answer regressions
Scope-control regressions
Evidence hallucination
Decision-certainty mutation
Safety suppression attempts
Presentation-vs-reasoning confusion
Multilingual behaviour
Simple-language accessibility
Persona / provocation
Follow-up antecedent binding
No-data general guidance
User-state conflict

A feature is not considered complete merely because the model produces one good example response.

24. Competition Architecture Mapping

Problem Definition & User Impact

Architecture supports:

users without regular PT access;

beginners;

multilingual users;

users with low fitness literacy.

Innovation & Originality

Key differentiator:

not:
User → Prompt → Chatbot

but:
User
→ Intent
→ Scope
→ Evidence
→ Safety
→ Decision
→ Accessible Coaching

AI Implementation

AI is used for:

language understanding;

contextual reasoning;

personalisation;

multilingual communication;

natural explanation.

AI is bounded by structured product controls.

Technical Execution

The product includes:

deployed web architecture;

authentication;

database;

user-scoped state;

AI runtime;

automated testing;

production build flow.

Responsible AI

Responsible AI is represented directly in architecture through:

evidence control;

safety control;

reasoning scope;

uncertainty preservation;

privacy;

accessibility.

25. Surprise Feature Integration Layer

The exact surprise features are not known before the live hackathon.

Muscle Fitness therefore keeps a lightweight integration seam:

SURPRISE FEATURE
      ↓
Adapter / Service Layer
      ↓
Existing Product State
      ↓
Dante or UI

Possible categories could include:

image;

audio;

speech;

video;

QR;

translation;

notifications;

accessibility;

data visualisation.

The team will choose at least two only after the organisers reveal the official options.

The surprise feature must add real user value rather than exist as an isolated demo gimmick.

26. Architecture Boundaries

The competition version intentionally avoids unnecessary complexity.

Not required for the current product:

large multi-agent orchestration;

autonomous self-modifying AI;

multiple model providers in production;

complex graph reasoning for every request;

unnecessary extra model calls;

speculative features that do not improve the core user journey.

This keeps Muscle Fitness:

understandable;

testable;

deployable;

stable within hackathon constraints.

27. High-Level Technology Stack

FRONTEND
Next.js
React
TypeScript
Tailwind CSS

BACKEND / DATA
Supabase
Authentication
PostgreSQL-backed state
Row Level Security

AI
OpenAI
Structured context assembly
Evidence control
Safety control
Decision state
Adaptive communication

DEPLOYMENT
Vercel-compatible web deployment

QUALITY
Automated tests
Type checking
Linting
Production build validation
Browser smoke testing

28. Architecture Narrative for Judges

A concise explanation during the presentation:

“Most AI fitness tools send a prompt to a model and hope the answer is good. Muscle Fitness inserts a control layer before the model speaks. Dante first understands the current question, limits the context to what is relevant, checks which claims have evidence, preserves safety and uncertainty, then adapts the final answer to the user’s language and level of understanding. The AI still provides the natural coaching experience, but it does not get uncontrolled authority over user data or safety.”

29. One-Slide Architecture Version

For the final presentation deck:

                    MUSCLE FITNESS

User
 │
 ▼
Intent + Current Question
 │
 ▼
Relevant Context ───── User Profile / Training / Nutrition / Recovery
 │
 ▼
Scope Control
 │
 ▼
Evidence + Safety
 │
 ▼
Structured Decision
 │
 ▼
OpenAI
 │
 ▼
Accessible Personal Coaching
 │
 ▼
Dante

Supporting platform:

Next.js + React + TypeScript
             │
          Supabase
   Auth + Data + RLS
             │
          Vercel

30. Final Architecture Principle

Muscle Fitness does not treat the language model as the product architecture. The language model is one reasoning and communication component inside a controlled, user-scoped, evidence-aware coaching system.