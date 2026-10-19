import { it } from "vitest";
import { buildIntelligenceBrief, enforceIntegrity } from "@/lib/intelligence/performance-core";
import { readFileSync } from "node:fs";
it("inj2 probe", () => {
  const b = buildIntelligenceBrief({ message: "give me a chest workout", coach: "DANTE", priorUserMessages: ["I have a torn rotator cuff diagnosed last week"], canRetrieve: true });
  for (const l of readFileSync("docs/evaluation/h0-systemic-repair-2026-10-16/raw/A3.jsonl", "utf8").split("\n").filter(Boolean)) {
    console.error("-----\n" + enforceIntegrity(JSON.parse(l).turns.at(-1).text, b, "en"));
  }
});
