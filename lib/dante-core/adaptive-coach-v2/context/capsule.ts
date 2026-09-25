import type { DanteContextCapsule } from "@/lib/dante-core/adaptive-coach-v2/types";

export type CreateCapsuleInput = Omit<DanteContextCapsule, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createCapsule(input: CreateCapsuleInput): DanteContextCapsule {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const identity = `${input.sourceType}|${input.raw ?? input.summary ?? JSON.stringify(input.structured ?? input.facts ?? {})}|${createdAt}`;
  return { ...input, id: input.id ?? `capsule_${stableHash(identity)}`, createdAt };
}

export function compressToSummary(capsule: DanteContextCapsule, maxLength = 280): DanteContextCapsule {
  const source = capsule.summary
    ?? capsule.raw
    ?? capsule.facts?.map((fact) => `${fact.concept}: ${fact.state}`).join("; ")
    ?? (capsule.structured === undefined ? "" : JSON.stringify(capsule.structured));
  const normalized = source.replace(/\s+/g, " ").trim();
  const summary = normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  return {
    id: capsule.id,
    summary,
    ...(capsule.facts ? { facts: capsule.facts } : {}),
    ...(capsule.structured !== undefined ? { structured: capsule.structured } : {}),
    ...(capsule.entities ? { entities: capsule.entities } : {}),
    ...(capsule.topics ? { topics: capsule.topics } : {}),
    provenance: capsule.provenance,
    sourceType: capsule.sourceType,
    ...(capsule.trustLevel ? { trustLevel: capsule.trustLevel } : {}),
    ...(capsule.temporalScope ? { temporalScope: capsule.temporalScope } : {}),
    ...(capsule.safetyRelevance ? { safetyRelevance: capsule.safetyRelevance } : {}),
    ...(capsule.fitnessRelevance ? { fitnessRelevance: capsule.fitnessRelevance } : {}),
    createdAt: capsule.createdAt,
    ...(capsule.lastConfirmedAt ? { lastConfirmedAt: capsule.lastConfirmedAt } : {}),
    ...(capsule.supersededBy ? { supersededBy: capsule.supersededBy } : {}),
    ...(capsule.authority ? { authority: capsule.authority } : {}),
    ...(capsule.commitments ? { commitments: capsule.commitments } : {}),
  };
}
