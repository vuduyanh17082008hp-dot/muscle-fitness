# Responsible AI — Muscle Fitness / Dante

## Purpose

Dante is the AI coaching layer inside Muscle Fitness.

Its purpose is to help users understand and act on their:

- training
- nutrition
- recovery
- progress
- fitness goals

Dante is an educational fitness and wellness system.

It is not a physician and does not diagnose medical conditions.

## User Data

Dante may use authenticated client information such as:

- goals
- training experience
- height and weight
- training frequency
- session duration
- equipment
- priority muscles
- nutrition targets
- food preferences
- allergies
- workout history
- recovery information
- check-ins

Missing user information must not be invented.

## External Information

Depending on the active integration, Dante may use:

- PubMed / NCBI
- USDA FoodData Central
- Open Food Facts
- wger
- PubChem
- openFDA

Dante must never claim that a source was checked if no retrieval actually occurred.

## Hallucination Risk

Language models can generate plausible but incorrect information.

Mitigations include:

- evidence retrieval
- explicit uncertainty
- deterministic calculations where appropriate
- no fabricated PMID values
- no fabricated FDC IDs
- no invented client information
- no fabricated food values

## Nutrition Limitations

Food data varies according to:

- brand
- cooking method
- recipe
- restaurant preparation
- portion measurement
- database completeness

Values should be treated as estimates when exact product data is unavailable.

## Workout Limitations

Software cannot directly observe:

- exercise technique
- pain
- injury
- equipment setup
- acute fatigue

Users should stop or modify exercises that cause unexpected pain.

## Computer Vision (SetVision) Limitations

SetVision estimates rep count, range of motion, tempo, bar path and
technique consistency from a single uploaded video, using pose
estimation.

This means:

- It sees BODY LANDMARKS, not muscles, joints, or internal structures.
- Poor lighting, camera angle, clothing or occlusion can degrade or
  invalidate an estimate.
- Velocity is uncalibrated (relative units) unless the camera has been
  calibrated against a known distance.
- It cannot detect pain, and a technically "consistent" rep is not the
  same as a safe or pain-free one.

Every SetVision result reports its own confidence and known
limitations — never a bare number presented as ground truth.

## Wearable Sensor Limitations

The wearable layer (heart rate, HRV, sleep, steps, respiratory rate)
normalizes data from a connected device into one consistent shape.

This means:

- Consumer wearables measure HRV, sleep stages and respiratory rate
  indirectly, with real, published error margins vs. clinical
  equipment — not lab-grade accuracy.
- No real wearable integration exists yet in this product phase — only
  a clearly labeled DEMO provider using synthetic fixture data. A demo
  scenario is never presented as, or confusable with, a real device
  connection.
- Apple HealthKit and Android Health Connect are native, sandboxed
  platform APIs; this web app cannot read them directly. A real
  integration for either requires a native companion app.

## Prediction & Anomaly-Detection Limitations

The Performance Forecast and Recovery Radar compare a user's current
signals to THEIR OWN recent history — never a population average, and
never a medical assessment.

This means:

- Confidence is deliberately capped and explicitly stated; a
  prediction from a short personal history says so rather than
  implying certainty.
- The Recovery Radar's output is always one of three plain states —
  normal, watch, or a description of an "unusual recovery pattern" —
  never a disease name, and never phrased as "you are sick."
- Neither feature can diagnose illness, overtraining syndrome, or
  injury. A genuinely concerning or persistent pattern should prompt a
  conversation with a qualified professional, not a self-diagnosis
  from this app.

## Medical Limitations

Dante must not:

- diagnose diseases
- replace doctors
- instruct users to discontinue prescribed medication
- guarantee health outcomes
- present serious symptoms as ordinary fitness issues

## Supplements

Supplement evidence varies by:

- compound
- dose
- population
- health condition
- medication
- product quality

Dante should distinguish:

- evidence of effectiveness
- evidence of safety
- uncertainty

## Personal Experiment Lab Limitations

The Experiment Lab compares a user's own days (e.g. "days with late
caffeine" vs. "days without") to look for a pattern in an outcome like
sleep or training volume.

This is always an ASSOCIATION drawn from a small personal sample —
never a controlled experiment, and never proof of cause and effect.
Every result states its sample size and says so explicitly.

## Human Oversight

Users remain responsible for real-world decisions.

Qualified:

- physicians
- dietitians
- physiotherapists
- coaches

should remain involved where professional judgment is necessary.