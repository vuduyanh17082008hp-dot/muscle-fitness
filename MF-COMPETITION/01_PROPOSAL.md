Muscle Fitness — AI Competition Proposal

1. Project Title

Muscle Fitness — An Accessible, Evidence-Informed AI Fitness Coach

2. Challenge Alignment

Muscle Fitness addresses the challenge:

How might AI support wellbeing, accessibility, inclusion, and evidence-informed social impact?

The project focuses on making practical fitness guidance more accessible to people who do not have regular access to a personal trainer, while reducing the risks of generic, context-blind, or overconfident AI advice.

3. Real-World Problem

Fitness information is abundant, but useful personal guidance is not.

Beginners, students, and everyday gym users often face several problems at the same time:

professional personal training can be expensive or unavailable;

online advice is fragmented across training, nutrition, recovery, and progress tracking;

generic workout plans often ignore the user's current condition and goals;

beginners may struggle to understand technical fitness language;

users may receive conflicting advice from social media, websites, and AI chatbots;

AI systems can sound confident even when they lack the evidence needed for a personal claim;

safety-sensitive questions can be difficult for inexperienced users to interpret correctly.

The result is a gap between having access to information and having access to responsible, understandable, context-aware coaching.

Muscle Fitness is designed to reduce that gap.

4. Intended Users

The primary users are:

beginners who need clear and practical guidance;

students and young adults who may not be able to afford regular personal training;

everyday gym users who want training, nutrition, recovery, and progress information in one place;

multilingual users who benefit from communication that adapts to their language and level of understanding;

users who need simpler, more accessible explanations rather than technical fitness terminology.

Muscle Fitness is not intended to replace qualified healthcare professionals or personal trainers in situations that require professional assessment. Instead, it provides accessible day-to-day coaching and helps users recognise when professional support is more appropriate.

5. Proposed AI-Powered Solution

Muscle Fitness is a deployable web application that combines:

training planning and workout context;

nutrition tracking and guidance;

recovery and readiness information;

progress tracking;

personalised user state;

an AI coaching system called Dante.

Dante

Dante is not designed as a generic fitness chatbot.

Its role is to transform user questions and relevant product data into practical coaching while controlling:

what the user is currently asking;

which context is actually relevant;

which claims require evidence;

how certain a recommendation is;

when safety should override normal coaching;

how the answer should be communicated to the individual user.

For example, if a user asks Dante to consider only one factor, unrelated profile data should not be inserted simply because it is available. If the user asks not to see statistics, Dante can hide numerical metrics from the response while still using relevant authorised data internally. If a claim depends on a personal metric, Dante requires supporting data rather than inventing it.

The result is intended to feel closer to a responsible personal coach than a question-and-answer chatbot.

6. Core User Experience

A typical user journey is:

The user creates an account and completes their fitness profile.

Muscle Fitness organises training, nutrition, recovery, and progress information.

The user asks Dante a natural-language question.

Dante identifies the current intent and any explicit constraints.

The system selects only relevant and authorised context.

Evidence and safety controls are applied.

Dante produces a concise, personalised, accessible coaching response.

The user continues the conversation without needing to repeat the entire context.

Example

A beginner might ask:

“My knee hurts a little when I squat today. Don’t give me statistics and don’t diagnose me. Should I keep training?”

A responsible answer should not diagnose an injury, invent symptoms, or dump unrelated recovery metrics. Dante should provide simple training guidance, preserve appropriate safety boundaries, and explain when professional assessment is appropriate.

This illustrates the project's central goal: use AI to make guidance more useful without making it more reckless.

7. Meaningful Role of AI

AI is used where adaptive reasoning and communication provide value beyond fixed application logic.

Dante uses AI to:

understand natural-language questions;

maintain conversational context;

adapt explanations to the user's language and communication needs;

distinguish current questions from stale conversational context;

combine relevant training, nutrition, recovery, and progress information;

produce personalised coaching;

explain decisions in natural language;

support multilingual and simplified communication.

However, AI generation is constrained by deterministic product controls where appropriate.

The system does not rely on the language model alone to decide what data is trustworthy, relevant, or safe to expose.

8. AI Architecture

The high-level flow is:

User Message
    ↓
Intent / Current-Turn Understanding
    ↓
Obligation & Reasoning Scope
    ↓
Relevant User Context
    ↓
Evidence + Authority Controls
    ↓
Safety Controls
    ↓
Structured Decision State
    ↓
Accessible Communication Profile
    ↓
Dante Natural-Language Response

Key Controls

Current-Turn Binding
Responses must answer the user's active question rather than surfacing a valid answer from an older topic.

Explicit Reasoning Scope
If a user says “only consider X” or “do not use Y,” Dante restricts reasoning accordingly.

Evidence-Aware Guidance
General coaching guidance does not require unnecessary telemetry, but personal factual claims must be supported by available data.

Decision Certainty Preservation
A genuinely uncertain upstream decision cannot be rewritten into an overconfident command merely because the generated text contains words such as “train” or “go.”

Accessible Communication
Dante can simplify language, reduce jargon, hide statistics when requested, and adapt communication without changing the underlying evidence.

Safety Boundaries
Safety-sensitive situations can override normal coaching when necessary, while avoiding unsupported diagnosis.

9. Technical Approach

Frontend

Next.js

React

TypeScript

Tailwind CSS

Backend and Data

Supabase

authentication and user-scoped data;

structured fitness profile and product state;

Row Level Security for user-data isolation;

persisted application data for training, nutrition, recovery, and progress where applicable.

AI

OpenAI as the production language-model provider;

structured server-side context assembly;

deterministic scope, authority, evidence, and safety controls around model generation;

no additional model call is required for each control layer.

Deployment

deployable web application;

production-oriented environment configuration;

automated type checking, linting, test suites, and production builds used as release gates.

10. Responsible AI, Privacy, and Safety

Responsible AI is part of the system architecture rather than only a disclaimer.

Hallucination and Unsupported Claims

Dante distinguishes between:

general guidance;

user-state-dependent advice;

verified personal-data claims;

safety guidance;

diagnostic or medical claims.

Claims that depend on user data require appropriate evidence.

Safety

Dante is designed to:

avoid unsupported medical diagnosis;

preserve safety-relevant escalation guidance;

avoid encouraging users to push through potentially harmful symptoms;

distinguish ordinary coaching from situations that require professional support.

User Control

Users can constrain how Dante reasons and communicates.

Examples:

“Only consider the weather.”

“Do not use my recovery data.”

“Do not show me statistics.”

“Explain this in simple English.”

These instructions have different semantic meanings and are handled separately.

Privacy and Security

user-specific data is isolated through authenticated access patterns;

Supabase Row Level Security is used for owner-scoped persisted state;

secrets remain server-side;

personal information is not intentionally exposed across users.

Transparency

The final submission will include an AI and media disclosure statement describing:

AI models and tools used;

AI-assisted development workflows;

generated or edited media, where applicable;

relevant assets, licences, permissions, and review processes.

11. Expected Impact

Muscle Fitness aims to improve access to useful fitness guidance for users who may not have regular professional coaching.

Expected benefits include:

clearer day-to-day fitness decisions;

reduced dependence on fragmented generic advice;

more understandable guidance for beginners;

better accessibility through simplified and adaptive communication;

safer use of AI for fitness questions;

improved continuity between training, nutrition, recovery, and progress;

lower barriers to receiving personalised support.

The project does not claim to replace professional healthcare or personal training. Its intended social value is to make responsible first-line fitness guidance more accessible and easier to understand.

12. Innovation and Originality

The main innovation is not simply using a language model inside a fitness application.

Muscle Fitness treats personalised AI coaching as a controlled decision pipeline.

Instead of:

User → Prompt → AI Answer

the system is designed around:

User
→ Current Intent
→ Relevant Scope
→ Evidence
→ Safety
→ Structured Decision
→ Accessible Personal Coaching

This enables Dante to use personal context without treating every stored fact as relevant, preserve uncertainty instead of fabricating confidence, and adapt its communication without changing the underlying truth.

13. Current Prototype Status

Muscle Fitness already exists as a working web application with implemented product flows across major areas including:

authentication;

dashboard;

training;

nutrition;

recovery;

progress;

Dante AI coaching.

Development before the competition will prioritise:

stability;

responsible-AI regression testing;

a clean demonstration journey;

deployment readiness;

competition documentation.

The project will preserve integration points for the surprise feature requirements revealed during the live hackathon rather than guessing those features in advance.

14. Surprise Feature Strategy

The five surprise features will only be known at the official hackathon opening.

Muscle Fitness will therefore use an adapter-style integration strategy so that at least two selected features can be connected to the existing product without destabilising the core coaching system.

Selection criteria during the hackathon will be:

meaningful value to the user;

natural fit with the wellbeing/accessibility challenge;

implementation feasibility within the 24-hour period;

low risk to existing safety and stability;

strong live-demonstration value.

No surprise feature is claimed as implemented before it is officially revealed and completed.

15. Proposed Final Deliverables

The final project package is planned to include:

working deployed prototype;

source-code repository;

project README;

system architecture documentation;

responsible AI and risk statement;

AI/media disclosure statement;

final presentation deck;

short backup demonstration video;

surprise-feature implementation list;

access and run instructions.

16. One-Sentence Summary

Muscle Fitness uses AI to make personalised fitness coaching more accessible, understandable, evidence-aware, and responsible for people who may not have regular access to a personal trainer.