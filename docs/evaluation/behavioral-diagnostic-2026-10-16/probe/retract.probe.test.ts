import { it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import { classifySafetyEvidence } from "@/lib/dante-core/coherence/safety-evidence";
it("retract probe", () => {
  for (const t of ["I meant my chest muscles are sore after bench, no chest pain", "sorry, not chest pain, my pecs are just sore", "ý tôi là cơ ngực mỏi thôi, không đau ngực", "can I train chest again today?"]) {
    const c = checkSafety(t, { recentMessages: ["I have chest pain"] });
    console.error(JSON.stringify({ t, ev: classifySafetyEvidence(t), trig: c.triggered, cat: c.category, mode: c.responseMode }));
  }
});
