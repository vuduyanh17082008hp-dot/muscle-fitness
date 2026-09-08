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

## Human Oversight

Users remain responsible for real-world decisions.

Qualified:

- physicians
- dietitians
- physiotherapists
- coaches

should remain involved where professional judgment is necessary.