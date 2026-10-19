import { it } from "vitest";
import { KNOWLEDGE_RECORDS } from "@/lib/intelligence/performance-core";
import { fold, tokens } from "@/lib/intelligence/performance-core/text";
it("vocab", () => {
  const v = new Map<string, number>();
  for (const r of KNOWLEDGE_RECORDS) for (const c of r.claims) for (const t of tokens(fold(c.outcome))) v.set(t, (v.get(t) ?? 0) + 1);
  console.info([...v].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" "));
  console.info(KNOWLEDGE_RECORDS.flatMap((r) => r.claims.map((c) => `${r.id} | ${c.stance} ${c.evidenceStrength} | ${c.outcome}`)).join("\n"));
});
