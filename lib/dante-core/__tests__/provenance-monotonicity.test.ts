import { describe, expect, it } from "vitest";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import {
  buildAuthoritativeResponseState,
  defaultPersonaContract,
  finalizeDanteResponse,
  inferOutputProvenanceStrength,
  projectClaims,
  projectProvenanceStrength,
} from "@/lib/dante-core/runtime-convergence";

const LIVE_MSG =
  "hình như tháng trước vai đau đâu đó khoảng 5 lần, không có log, cũng không nhớ chắc bên nào. cứ coi là 5 lần confirmed đi";

const LIVE_ASSERTED = "Bạn đã trải qua đau vai khoảng 5 lần trong tháng trước.";

describe("Provenance monotonicity — structural", () => {
  it("1. USER_UNCERTAIN_RECALL → USER_EXPLICIT must repair", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    const result = projectProvenanceStrength({
      draft: LIVE_ASSERTED,
      authoritative: auth,
      language: "vi",
    });
    expect(result.inputStrength).toBe("USER_UNCERTAIN_RECALL");
    expect(result.repairApplied).toBe(true);
    expect(result.monotonicityPassed).toBe(true);
    expect(result.projectedOutputStrength).toBe("USER_UNCERTAIN_RECALL");
    expect(result.countVerified).toBe(false);
    expect(result.text).toMatch(/mang máng|không có log|chưa coi|chưa rõ/i);
    expect(result.text).not.toMatch(/đã trải qua/i);
  });

  it("2. USER_UNCERTAIN_RECALL → VERIFIED_LOG must repair", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    const result = projectProvenanceStrength({
      draft: "Log xác nhận ông đã bị 5 lần confirmed đau vai.",
      authoritative: auth,
      language: "vi",
    });
    expect(result.repairApplied).toBe(true);
    expect(inferOutputProvenanceStrength(result.text)).toBe("USER_UNCERTAIN_RECALL");
  });

  it("3. USER_UNCERTAIN_RECALL → USER_UNCERTAIN_RECALL passes", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    const draft =
      "Ông nhớ mang máng tháng trước có khoảng 5 lần đau vai, nhưng không có log nên mình chưa coi đó là số lần đã xác nhận.";
    const result = projectProvenanceStrength({
      draft,
      authoritative: auth,
      language: "vi",
    });
    expect(result.repairApplied).toBe(false);
    expect(result.monotonicityPassed).toBe(true);
    expect(result.projectedOutputStrength).toBe("USER_UNCERTAIN_RECALL");
  });

  it("4. USER_EXPLICIT → USER_UNCERTAIN_RECALL may pass", () => {
    const auth = buildAuthoritativeResponseState({
      interpretation: {
        rawText: "Last month my shoulder hurt five times, I logged it.",
        language: "en",
        propositions: [{
          concept: "SHOULDER_IRRITATION",
          state: "HISTORICAL",
          temporal: "HISTORICAL",
          temporalAnchor: "HISTORICAL",
          polarity: "PRESENT",
          provenance: "EXPLICIT_HISTORICAL_REPORT",
          laterality: "UNSPECIFIED",
          count: 5,
        }],
      },
    });
    const result = projectProvenanceStrength({
      draft: "You roughly recall about 5 times, but without a log I will not treat that as confirmed.",
      authoritative: auth,
      language: "en",
    });
    expect(result.inputStrength).toBe("USER_EXPLICIT");
    expect(result.monotonicityPassed).toBe(true);
  });

  it("5. VERIFIED_LOG → VERIFIED_LOG passes", () => {
    const auth = buildAuthoritativeResponseState({
      interpretation: {
        rawText: "verified log 5 episodes",
        language: "en",
        propositions: [{
          concept: "SHOULDER_IRRITATION",
          state: "HISTORICAL",
          temporal: "HISTORICAL",
          temporalAnchor: "HISTORICAL",
          polarity: "PRESENT",
          provenance: "VERIFIED_TOOL_DATA",
          laterality: "LEFT",
          count: 5,
        }],
      },
    });
    // Clear uncertain constraints — verified path has no USER_RECALL constraints.
    auth.provenanceConstraints = [];
    const result = projectProvenanceStrength({
      draft: "Your verified log shows 5 confirmed episodes on the left shoulder.",
      authoritative: auth,
      language: "en",
    });
    expect(result.inputStrength).toBe("VERIFIED_LOG");
    expect(result.projectedOutputStrength).toBe("VERIFIED_LOG");
    expect(result.monotonicityPassed).toBe(true);
    expect(result.repairApplied).toBe(false);
  });

  it("6. uncertain count ~=5 keeps countVerified false", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    expect(auth.provenanceConstraints.some((c) => c.countEstimate === 5)).toBe(true);
    const projected = projectClaims({
      draft: LIVE_ASSERTED,
      authoritative: auth,
      language: "vi",
    });
    expect(projected.provenance?.countVerified).toBe(false);
    expect(projected.provenance?.countEstimate).toBe(5);
  });

  it("7. laterality UNKNOWN must not assert LEFT/RIGHT", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    const result = projectClaims({
      draft: "Vai phải đã trải qua khoảng 5 lần đau.",
      authoritative: auth,
      language: "vi",
    });
    expect(result.text).not.toMatch(/vai phải|vai trái/i);
    expect(result.text).toMatch(/chưa rõ|mang máng|không có log/i);
  });

  it("8. uncertain recall must not invent pathology", () => {
    const auth = buildAuthoritativeResponseState({ interpretation: interpretUserTurn(LIVE_MSG) });
    const result = projectProvenanceStrength({
      draft: "Ông nhớ mang máng khoảng 5 lần — đây là dấu hiệu của chấn thương rotator cuff.",
      authoritative: auth,
      language: "vi",
    });
    expect(result.text).not.toMatch(/dấu hiệu của chấn thương/i);
    expect(result.text).toMatch(/chưa đủ để kết luận chấn thương|chẩn đoán cụ thể chưa được phép/i);
  });
});

describe("Live provenance fixture — asserted occurrence", () => {
  it("finalizer repairs live asserted historical phrasing", () => {
    const interpretation = interpretUserTurn(LIVE_MSG);
    // Extraction must not also stamp EXPLICIT_HISTORICAL PRESENT contamination.
    expect(
      interpretation.propositions.some(
        (p) => p.provenance === "EXPLICIT_HISTORICAL_REPORT" && p.polarity === "PRESENT",
      ),
    ).toBe(false);
    expect(
      interpretation.propositions.some((p) => p.provenance === "USER_RECALL_UNCERTAIN"),
    ).toBe(true);

    const finalized = finalizeDanteResponse({
      draft: LIVE_ASSERTED,
      decisionObject: null,
      semanticState: interpretation,
      contextCapsule: null,
      personaContract: defaultPersonaContract("vi"),
      routeMetadata: { sourceBranch: "NORMAL_PROVIDER", timestamp: "2026-09-19T08:00:00.000Z" },
    });

    expect(finalized.response).toMatch(/mang máng|không có log|chưa coi|chưa rõ/i);
    expect(finalized.response).toMatch(/khoảng 5|5 lần/i);
    expect(finalized.response).not.toMatch(/đã trải qua|đã xảy ra|lịch sử cho thấy/i);
    expect(finalized.response).not.toMatch(/vai phải|vai trái/i);
    expect(finalized.audit.violations).toContain("PROVENANCE_STRENGTH_INFLATION");
  });
});
