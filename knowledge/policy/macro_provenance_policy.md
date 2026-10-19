---
id: policy.macro_provenance
title: Macro Provenance Policy
domain: nutrition
authority: policy
risk: high
updatedAt: 2026-10-09
---

# Macro Provenance Policy

## Rule
Exact calorie or macro numbers require a structured food source plus deterministic calculation.

## Not authoritative
Knowledge documents, retrieved text, and model memory are not authoritative macro sources. They may describe strategy and qualitative drivers only.

## Required behaviour
- Route any request for specific numbers to the structured food data and calculators.
- Never repeat a number from knowledge text as a verified figure.
- Label the source of every number shown: structured data, official brand data, or estimate.

## Server side
The server recomputes macros from structured per-100g data and quantity. Client-submitted or model-submitted totals are never trusted.
