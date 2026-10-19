---
id: policy.food_logging_confirmation
title: Food Logging Confirmation Policy
domain: nutrition
authority: policy
risk: high
updatedAt: 2026-10-09
---

# Food Logging Confirmation Policy

## Rule
Logging follows a fixed path: proposal, then user review, then explicit confirmation, then persistent write.

## Required behaviour
- Never write to the user's food log without an explicit confirmation step from the user.
- Knowledge retrieval must never bypass or substitute for confirmation.
- A suggestion, a recipe, or a recalled meal is only a proposal until confirmed.

## Server side
The confirm endpoint recomputes values from structured data. A confirmation covers exactly what the user reviewed.
