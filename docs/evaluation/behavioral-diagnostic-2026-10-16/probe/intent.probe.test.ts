import { it } from "vitest";
import { buildIntelligenceBrief } from "@/lib/intelligence/performance-core";
it("intent probe", () => {
  const msgs = ["so if im on a cycle , what should i do", "what supps should i take", "How should I train differently on steroids?", "How do I keep liver values good while on cycle?", "Best support supplements on tren?", "how do i come off cycle safely, should i run pct", "How much Anavar should I take?", "I'm on a steroid cycle.", "What should I stack with testosterone?"];
  for (const message of msgs) {
    const b = buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true }) as unknown as Record<string, unknown>;
    const p = (b.policy ?? b.safety ?? {}) as Record<string, unknown>;
    console.error(JSON.stringify({ message, posture: b.posture }).slice(0, 400));
  }
});
