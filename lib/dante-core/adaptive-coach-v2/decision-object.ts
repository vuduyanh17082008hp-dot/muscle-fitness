import { gateUserSpecificClaims, type ProposedClaim } from "@/lib/dante-core/adaptive-coach-v2/claim-gate";
import { evaluateContrastiveSafety, semanticSafetySignals } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { extractRationaleCodes } from "@/lib/dante-core/adaptive-coach-v2/natural-response/repetition-detector";
import type {
  DanteDecision,
  DanteResponseIntent,
  OutputClaimConstraints,
  SemanticInterpretation,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type BuildDanteDecisionInput = {
  interpretation: SemanticInterpretation;
  responseIntent?: DanteResponseIntent;
  proposedClaims?: ProposedClaim[];
  safety?: Partial<DanteDecision["safety"]>;
  risk?: DanteDecision["risk"];
  experiment?: { userFacingMeaning: string; internalStatus?: string };
  tool?: DanteDecision["tool"];
  discourse?: Partial<DanteDecision["discourse"]>;
  style?: Partial<DanteDecision["style"]>;
  templateAttractor?: boolean;
  alreadyExplainedRationale?: boolean;
  claimConstraints?: OutputClaimConstraints;
};

function naturalExperimentMeaning(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bCONFOUNDED\b/gi, "too many things changed to isolate the cause"],
    [/\bACTIVE\b/gi, "currently underway"],
    [/\bPROPOSED\b/gi, "suggested but not started"],
    [/\bSUPPORTS\b/gi, "is consistent with"],
    [/\bDOES_NOT_SUPPORT\b/gi, "does not appear consistent with"],
    [/\bINCONCLUSIVE\b/gi, "has a signal but is not clean enough to conclude"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function buildDanteDecision(input: BuildDanteDecisionInput): DanteDecision {
  const contrastive = evaluateContrastiveSafety(input.interpretation.rawText);
  const relevantSignals = semanticSafetySignals(input.interpretation);
  const safetyAction = input.safety?.action ?? (contrastive.escalate ? "ESCALATE" : "NORMAL");
  const responseIntent = safetyAction === "ESCALATE" ? "SAFETY" : (input.responseIntent ?? "COACH");
  const evidence = gateUserSpecificClaims(input.interpretation, input.proposedClaims ?? []);
  const facts = input.interpretation.propositions
    .filter((item) => {
      const temporal = item.temporalAnchor ?? item.temporal;
      return temporal === "CURRENT" || temporal === "UNSPECIFIED" || temporal === "UNKNOWN" || !temporal;
    })
    .filter((item) => item.state !== "HISTORICAL")
    .map((item) => ({ concept: item.concept, state: item.state, provenance: item.provenance }));
  const resolvedHistory = input.interpretation.propositions
    .filter((item) => item.state === "RESOLVED" || item.state === "HISTORICAL" || item.temporalAnchor === "HISTORICAL")
    .map((item) => ({ concept: item.concept, state: item.state }));
  const language = input.interpretation.language === "vi" ? "vi" : input.interpretation.language === "mixed"
    ? (/[ăâđêôơưà-ỹ]/i.test(input.interpretation.rawText) ? "vi" : "en")
    : "en";

  const chest = input.interpretation.propositions.find((item) => item.concept === "CHEST_PAIN");
  const shoulder = input.interpretation.propositions.find((item) =>
    item.concept === "SHOULDER_IRRITATION" && (item.temporalAnchor === "CURRENT" || item.temporal === "CURRENT"));
  const uncertainCount = input.interpretation.propositions.find((item) => item.count === "UNKNOWN" || item.count === "UNVERIFIED");
  const laterality = input.interpretation.propositions.find((item) => item.laterality)?.laterality;

  const claimConstraints: OutputClaimConstraints = {
    episodeCount: uncertainCount?.count === "UNVERIFIED" ? "UNVERIFIED" : uncertainCount ? "UNKNOWN" : input.claimConstraints?.episodeCount ?? "UNKNOWN",
    laterality: laterality ?? input.claimConstraints?.laterality ?? "UNCERTAIN",
    persisted: input.tool?.persisted ?? input.claimConstraints?.persisted ?? false,
    sleepCausality: input.claimConstraints?.sleepCausality ?? "NOT_ESTABLISHED",
    currentChestPain: chest?.polarity ?? (chest?.state === "PRESENT" ? "PRESENT" : chest ? "ABSENT" : input.claimConstraints?.currentChestPain),
    currentShoulder: shoulder?.polarity ?? (shoulder?.state === "PRESENT" ? "PRESENT" : shoulder ? "ABSENT" : input.claimConstraints?.currentShoulder),
    experimentConclusion: (input.experiment?.internalStatus as OutputClaimConstraints["experimentConclusion"]) ?? input.claimConstraints?.experimentConclusion ?? "NONE",
    rejectedClaims: input.claimConstraints?.rejectedClaims ?? [],
  };

  const personaAttenuation = safetyAction === "ESCALATE" ? 0.9 : input.style?.personaAttenuation ?? 0;
  const rationaleCodes = extractRationaleCodes([
    input.experiment?.userFacingMeaning ?? "",
    ...(input.discourse?.alreadyExplained ?? []),
  ].join(" "));

  return {
    userLanguage: language,
    responseIntent,
    safety: {
      action: safetyAction,
      category: input.safety?.category ?? (relevantSignals.length > 0 || contrastive.escalate ? "current_red_flag" : null),
      relevantSignals: input.safety?.relevantSignals ?? (relevantSignals.length > 0 ? relevantSignals : contrastive.reasons),
      urgency: input.safety?.urgency ?? contrastive.urgency,
      epistemicCertainty: input.safety?.epistemicCertainty ?? contrastive.epistemicCertainty,
    },
    currentState: { facts, ...(resolvedHistory.length > 0 ? { resolvedHistory } : {}) },
    evidence,
    ...(input.risk ? { risk: input.risk } : {}),
    ...(input.experiment ? {
      experiment: {
        ...input.experiment,
        userFacingMeaning: naturalExperimentMeaning(input.experiment.userFacingMeaning),
      },
    } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    discourse: {
      alreadyExplained: input.discourse?.alreadyExplained ?? [],
      ...(input.discourse?.previousIntent ? { previousIntent: input.discourse.previousIntent } : {}),
      ...(input.discourse?.preferredDepth ? { preferredDepth: input.discourse.preferredDepth } : {}),
      rationaleCodes: input.discourse?.rationaleCodes ?? rationaleCodes,
    },
    style: {
      language,
      tone: input.style?.tone ?? (responseIntent === "SAFETY" ? "safety" : responseIntent === "BOUNDARY" ? "boundary" : responseIntent === "CORRECTION" ? "correction" : "calm_direct"),
      ...(input.style?.slangLevel !== undefined ? { slangLevel: Math.max(0, input.style.slangLevel * (1 - personaAttenuation)) } : {}),
      ...(input.style?.frustrated !== undefined ? { frustrated: input.style.frustrated } : {}),
      ...(input.style?.joking !== undefined ? { joking: personaAttenuation > 0.5 ? false : input.style.joking } : {}),
      personaAttenuation,
    },
    flags: {
      templateAttractor: input.templateAttractor ?? false,
      alreadyExplainedRationale: input.alreadyExplainedRationale ?? false,
      hideInternalJargon: true,
    },
    claimConstraints,
  };
}
