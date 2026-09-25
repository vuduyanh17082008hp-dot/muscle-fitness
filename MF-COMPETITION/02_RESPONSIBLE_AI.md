Muscle Fitness — Responsible AI & Risk Statement

1. Purpose

Muscle Fitness uses AI to provide personalised fitness guidance through Dante, an AI coaching system integrated with training, nutrition, recovery, and progress data.

This document explains how Muscle Fitness manages AI-related risks across:

safety;

hallucination and unsupported claims;

privacy and security;

fairness and accessibility;

user autonomy;

medical boundaries;

transparency and disclosure;

generated media and intellectual property;

system reliability;

human oversight.

The goal is not to make AI appear infallible. The goal is to make its limits visible, constrain high-risk behaviour, and preserve useful guidance without overstating certainty.

2. Responsible AI Principle

Muscle Fitness follows one core rule:

Personalisation must never override truth, safety, evidence, or user control.

Dante is designed to adapt to the user, but the system must not:

invent personal facts;

strengthen uncertain claims into confident conclusions;

diagnose medical conditions without appropriate basis;

use irrelevant stored data simply because it is available;

ignore explicit user constraints;

expose private data across users;

present generated media or AI-assisted content as human-created when disclosure is required.

3. Scope of AI Use

AI is used for:

understanding natural-language questions;

interpreting user intent and conversational context;

combining relevant training, nutrition, recovery, and progress information;

generating personalised coaching responses;

adapting language, tone, complexity, and verbosity;

multilingual communication;

explaining recommendations in natural language.

AI is not given unrestricted authority over:

safety-critical decisions;

private-data access;

evidence provenance;

user ownership boundaries;

medical diagnosis;

permission to surface any stored personal information.

These areas are constrained by deterministic product rules and application logic.

4. Risk Register

Risk

Example

Impact

Control

Residual Risk

Hallucinated personal data

Dante claims a recovery score the user does not have

High

Evidence/authority checks; user-state provenance

Low–Medium

Unsupported medical diagnosis

“You have a meniscus tear”

High

Diagnostic boundary; safety escalation; no unsupported diagnosis

Low–Medium

Overconfident recommendation

Uncertain state becomes “You should definitely train”

High

Structured decision certainty preservation

Low

Irrelevant context leakage

Old recovery data appears in a weather-only question

Medium

Explicit reasoning scope; current-turn binding

Low

Stale answer surfacing

Dante answers a previous question instead of the current one

Medium

Current obligation binding; stale-answer prevention

Low

Unsafe persistence

Safety-critical state disappears too early

High

Safety lifecycle and escalation controls

Low–Medium

Over-refusal

Dante refuses general guidance because telemetry is missing

Medium

Claim-level grounding proportionality

Low

User preference confusion

“Don’t show stats” treated as “don’t use stats”

Medium

Presentation preference separated from reasoning exclusion

Low

Privacy leakage

One user sees another user’s state

High

Authenticated ownership + Supabase RLS

Low

Prompt injection / user manipulation

User attempts to override safety policy

High

Safety precedence and scoped authority

Medium

Bias / inaccessible language

Complex jargon disadvantages beginners or non-native speakers

Medium

Accessibility communication profile

Low

False emotional inference

Dante asserts motives or feelings not stated

Medium

Inference treated as inference, not fact

Low

Excessive dependence on AI

User treats Dante as medical or professional authority

High

Clear role boundaries and professional escalation

Medium

Model/service failure

AI provider unavailable during demo or use

Medium

Graceful failure path; demo backup video

Medium

Synthetic media confusion

Generated image/video presented without disclosure

Medium

AI media disclosure and consent rules

Low

Copyright/IP misuse

Unlicensed media used in final presentation

Medium

Asset provenance, licensing checks, disclosure

Low

5. Evidence and Hallucination Controls

5.1 Claim Types

Dante distinguishes between different types of claims:

General Guidance

Example:

“Do not push through a movement that causes pain.”

This can be provided without requiring personal telemetry.

User-State-Dependent Guidance

Example:

“Reduce today’s training load because your current recovery state is poor.”

This requires relevant user state.

Verified Personal-Data Claim

Example:

“Your recovery score is 72.”

This must be supported by actual authorised data.

Safety Guidance

Example:

“Stop training and seek professional assessment if the knee becomes unstable or you cannot bear weight normally.”

This comes from validated safety policy or approved guidance.

Diagnostic or Medical Claim

Example:

“You tore your ACL.”

Dante must not make unsupported diagnoses.

5.2 Evidence Rule

The system follows:

Only claims that depend on personal data must fail when that data is unavailable.

This prevents two common AI failures:

inventing personal facts;

refusing useful general advice simply because detailed telemetry is missing.

6. Current-Turn Relevance and Context Control

Dante may have access to multiple categories of user context, but context availability does not imply context relevance.

The system restricts reasoning to the current task.

Example:

User:

“Ignore everything else. Just because of the rain, should I skip the gym?”

Dante should not automatically introduce:

recovery score;

calorie intake;

sleep;

training frequency;

unrelated historical data.

Only context relevant to the scoped question should enter the surfaced reasoning, except where a genuine safety requirement must override that scope.

7. User-Controlled Reasoning

Muscle Fitness distinguishes between two different user requests.

Presentation Preference

“Don’t show me statistics.”

Effect:

statistics are hidden from the answer;

relevant authorised data may still be used internally.

Reasoning Exclusion

“Don’t use my recovery data.”

Effect:

recovery data is excluded from the reasoning process for that request.

This distinction improves both user control and semantic accuracy.

8. Decision Certainty Preservation

Dante must not become more confident during natural-language generation than the structured decision permits.

Conceptually, a recommendation can be:

resolved positive;

resolved negative;

conditional;

uncertain;

insufficient information;

not applicable.

An uncertain upstream state must not become a confident recommendation simply because generated wording sounds decisive.

This protects users from false certainty.

9. Safety Controls

9.1 Safety Priority

Safety has higher priority than style, humour, personalisation, or user preference when those conflict.

Dante may adapt tone and language, but it cannot make unsafe content acceptable through presentation.

9.2 Safety Lifecycle

Safety-relevant state is treated as a lifecycle rather than a single keyword trigger:

NONE
→ ENTER
→ PERSIST
→ ESCALATE
→ DOWNGRADE
→ EXIT

This reduces the risk that an important safety condition disappears simply because the user changes wording.

9.3 Exercise Pain / Injury Context

Dante may provide general training modification and escalation guidance, but must avoid unsupported diagnosis.

For example, when a user reports knee pain during squats, Dante may:

advise against continuing the painful movement;

recommend pain-free alternatives only where appropriate;

explain when to stop the session;

identify clear escalation signs;

suggest professional assessment when symptoms persist or worsen.

Dante should not invent symptom severity or diagnose the cause.

9.4 Emergency Boundaries

Where a user reports potentially serious symptoms, Dante should prioritise immediate safety guidance over normal training optimisation.

The system should not:

minimise serious warning signs;

encourage “pushing through” dangerous symptoms;

delay urgent professional care for the sake of completing a workout plan.

10. Accessibility and Inclusion

Muscle Fitness is designed for users with different levels of fitness literacy and language ability.

Dante can adapt:

language;

sentence complexity;

verbosity;

jargon level;

statistics visibility;

conversational register.

Example:

User:

“My English isn’t very good. Explain simply.”

Dante should use:

shorter sentences;

common words;

minimal jargon;

direct actions;

concise safety guidance.

The system should not infantilise the user or reduce factual quality.

11. Multilingual Support

Dante is intended to support multilingual conversation.

When a user communicates in another language, Dante may adapt the conversation to that language while preserving:

the same safety rules;

the same evidence requirements;

the same privacy constraints;

the same decision semantics.

Language adaptation must not change the underlying truth or level of certainty.

12. Fairness and Bias

Potential fairness risks include:

advice assuming all users have the same equipment;

assuming advanced fitness knowledge;

using language that excludes beginners;

treating one body type, training style, or demographic as the default;

making unsupported assumptions about user goals or ability.

Mitigations include:

explicit user preference capture;

current-turn context;

adaptive communication;

avoidance of unsupported demographic inference;

clarification when a relevant fact is unknown;

testing across beginner, advanced, multilingual, and low-context scenarios.

Muscle Fitness does not infer protected personal characteristics unless the user explicitly provides relevant information and its use is necessary for the requested task.

13. Privacy and Data Protection

13.1 Data Minimisation

Only data required for product functionality should be stored or retrieved.

Dante should not surface private information simply because it exists in the user profile.

13.2 User Isolation

Persisted user data is protected through authenticated access patterns and Supabase Row Level Security (RLS) where applicable.

The intended rule is:

A user may access their own authorised state, not another user’s state.

13.3 Secrets

API keys and other private credentials must remain server-side and must not be embedded in client code or public repository files.

Environment templates should contain variable names only, not real secrets.

13.4 Conversation Data

Raw conversation content should not be unnecessarily duplicated into long-term state.

Where structured memory/state is used, the system should prefer the smallest useful representation rather than storing unrestricted transcripts when not required.

14. Human Oversight and User Autonomy

Dante provides recommendations, not absolute authority.

The system should:

explain uncertainty when uncertainty matters;

preserve professional escalation boundaries;

allow users to correct inaccurate stored information;

respect explicit scope and presentation requests;

avoid manipulative language;

avoid pretending to know user motives as facts.

Dante may challenge a user in a coaching style, but inference should remain clearly framed as inference rather than certainty.

15. Personalisation Boundaries

The system follows:

TRUTH / SAFETY / EVIDENCE
        >
USER PREFERENCE
        >
STYLE / PERSONA

Personalisation can change:

tone;

wording;

verbosity;

level of explanation;

format.

Personalisation must not change:

factual truth;

evidence provenance;

safety requirements;

decision certainty;

privacy rules.

16. Generated Media and Responsible Media Use

If the final solution uses AI-generated or AI-assisted:

images;

videos;

animations;

audio;

avatars;

explainers;

campaign assets;

the team will:

clearly label AI-generated or AI-assisted media where relevant;

disclose the models and tools used;

avoid misleading synthetic media;

respect copyright and intellectual-property rights;

document asset sources and licences;

obtain consent before using a real person’s likeness, voice, or personal data;

review generated media before publication;

avoid generating content that could reasonably mislead users about professional endorsement or real events.

17. AI and Tool Disclosure

The final competition submission will include a disclosure note listing, where applicable:

production AI model/provider;

AI-assisted coding tools;

prompts or prompt classes used for generated media;

image/video/audio generation tools;

third-party datasets;

external assets;

licences;

permissions;

human review steps.

At the current production design level, Dante uses OpenAI as its AI model provider.

Development tools may assist with coding, testing, review, documentation, and design, but the team remains responsible for validating the final product.

18. Model and System Limitations

Muscle Fitness explicitly recognises that:

language models can hallucinate;

personal context may be incomplete or outdated;

user-reported information may be inaccurate;

fitness guidance cannot replace physical assessment;

safety classification can still fail;

multilingual quality can vary;

AI may misunderstand ambiguous user intent;

provider outages can affect availability;

recommendations may not generalise equally to all users.

These limitations are why the system combines AI generation with deterministic controls, testing, and professional escalation boundaries.

19. Testing and Red-Team Strategy

Dante is tested using both normal and adversarial cases.

Examples include:

medical-emergency prompts;

requests to ignore safety;

contradictory user state;

stale conversation context;

“only consider X” scope restrictions;

“do not use Y” reasoning exclusions;

missing evidence;

uncertain decisions;

multilingual prompts;

beginner/simple-language requests;

attempts to provoke the coach persona;

follow-up questions with ambiguous antecedents;

requests to hide statistics;

attempts to make Dante overstate personal data.

Key regression areas include:

safety;

evidence grounding;

current-turn binding;

scope control;

decision certainty;

accessibility;

privacy;

persona without loss of truth.

20. Reliability and Failure Handling

If the AI provider or required service is unavailable, the system should fail visibly rather than fabricate a response.

For the competition demo, the team will maintain:

a tested live demonstration path;

a stable deployed build;

a short recorded backup demonstration.

The backup video is for technical failure recovery, not to hide an incomplete product.

21. Security Controls

Key security expectations include:

authenticated access;

server-side secret management;

user-scoped database policies;

no plaintext secrets in the repository;

least-privilege data access;

input validation where applicable;

controlled API routes;

protection against accidental cross-user state exposure.

Security will be reviewed before final submission and deployment.

22. Risk Acceptance

No AI fitness system can eliminate all risk.

The project accepts residual risk only where:

the remaining risk is understood;

mitigation is proportionate;

the user is not misled about system capability;

higher-risk situations are escalated appropriately;

the benefit of providing useful guidance outweighs the residual risk.

High-severity unresolved safety, privacy, or security defects are release blockers.

23. Competition Disclosure Statement

For judging and final submission, Muscle Fitness will disclose:

Muscle Fitness uses AI to interpret user requests, combine relevant fitness context, and generate personalised coaching through Dante. AI outputs are constrained by product-level evidence, scope, safety, and privacy controls. Dante is not a medical diagnostic system and does not replace qualified healthcare professionals. Any AI-generated or AI-assisted media used in the project will be identified and documented together with the tools, assets, licences, permissions, and human review involved.

24. Responsible AI Summary

Muscle Fitness is designed around five practical safeguards:

1. CONTEXT CONTROL
   Use the right information for the current question.

2. EVIDENCE CONTROL
   Do not make personal factual claims without support.

3. DECISION CONTROL
   Do not turn uncertainty into false confidence.

4. SAFETY CONTROL
   Preserve safety boundaries and professional escalation.

5. COMMUNICATION CONTROL
   Adapt language and presentation without changing truth.

Final Principle

Dante should be useful enough to coach, constrained enough to trust, and transparent enough for users to understand its limits.