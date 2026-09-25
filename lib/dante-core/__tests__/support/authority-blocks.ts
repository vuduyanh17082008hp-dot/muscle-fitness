/**
 * Test helpers for the P-10 authority contract. A bare string has no provenance, so tests that exercise the
 * deterministic renderer supply it AS a decision (authoritative) block, and tests that exercise provider prose supply
 * it as a provider block that the real guard (`authorizeBlocks`) has judged — never a hand-set authority.
 */
import {
  authorizeBlocks,
  buildAuthorityContext,
  decisionBlock,
  providerBlock,
} from "@/lib/dante-core/coherence/authority";
import { createInitialState } from "@/lib/dante-core/coherence/reducer";
import type { ResponseBlock, VerificationStatus } from "@/lib/dante-core/coherence/types";

/** Deterministic-decision blocks, one per text, in order. */
export function decisionBlocks(texts: readonly string[]): ResponseBlock[] {
  return texts.map((text, order) => ({ ...decisionBlock(`o${order}`, "ANSWERED", text), order }));
}

/** Provider blocks judged by the real guard against an empty authority (no claims held), with the given verification. */
export function judgedProviderBlocks(
  texts: readonly string[],
  verification: VerificationStatus,
  language: "en" | "vi" = "vi",
): ResponseBlock[] {
  const state = createInitialState({ now: "2026-09-20T12:00:00.000Z", sessionId: "authority-helper" });
  const ctx = buildAuthorityContext({ state, safetyPhase: "NONE" });
  return authorizeBlocks({
    blocks: texts.map((text, order) => ({ ...providerBlock(`p${order}`, "ANSWERED", text), order })),
    ctx,
    handled: [],
    providerVerification: verification,
    language,
  });
}
