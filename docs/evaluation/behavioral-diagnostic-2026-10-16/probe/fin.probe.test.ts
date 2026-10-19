import { it } from "vitest";
import { finalizeDanteResponse } from "@/lib/dante-core/runtime-convergence/finalize";
import { defaultPersonaContract } from "@/lib/dante-core/runtime-convergence/emit";
it("fin", () => {
  const out = finalizeDanteResponse({ draft: "I'd like to: **Add 150 g Greek Yogurt to snack**. Confirm to proceed, or cancel — nothing has been saved yet.", decisionObject: null, semanticState: null, contextCapsule: null, personaContract: defaultPersonaContract("en"), routeMetadata: { sourceBranch: "TOOL", timestamp: "2026-10-16T10:00:00.000Z" }, discourseState: null, toolState: { permission: "CONFIRMATION_REQUIRED", persisted: false } } as never);
  console.error("FIN:", out.response);
});
