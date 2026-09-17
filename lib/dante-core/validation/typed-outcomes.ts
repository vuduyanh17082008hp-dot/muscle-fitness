import type {
  DimensionEvaluation,
  OutcomeEvaluation,
  TypedOutcome,
} from "@/lib/dante-core/validation/types";

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function evaluateOutcomeDimension(
  dimension: string,
  expected: TypedOutcome | null,
  actual: TypedOutcome | null,
): DimensionEvaluation {
  if (!expected || !actual) {
    return { dimension, expected, actual, error: { kind: "unresolved", reason: "MISSING_VALUE" }, status: "UNRESOLVED" };
  }
  if (expected.kind !== actual.kind) {
    return { dimension, expected, actual, error: { kind: "unresolved", reason: "TYPE_MISMATCH" }, status: "UNRESOLVED" };
  }

  switch (expected.kind) {
    case "continuous": {
      if (actual.kind !== "continuous" || expected.unit !== actual.unit) {
        return { dimension, expected, actual, error: { kind: "unresolved", reason: "UNIT_MISMATCH" }, status: "UNRESOLVED" };
      }
      const absoluteError = Math.abs(expected.value - actual.value);
      const scale = expected.normalizationScale;
      const normalizedError = scale !== undefined && scale > 0 ? absoluteError / scale : null;
      return { dimension, expected, actual, error: { kind: "continuous", absoluteError, normalizedError }, status: absoluteError === 0 ? "ALIGNED" : "DIVERGENT" };
    }
    case "percentage": {
      const error = Math.abs(expected.value - (actual as typeof expected).value);
      return { dimension, expected, actual, error: { kind: "percentage", percentagePointError: error }, status: error === 0 ? "ALIGNED" : "DIVERGENT" };
    }
    case "categorical": {
      const matches = expected.value === (actual as typeof expected).value;
      return { dimension, expected, actual, error: { kind: "categorical", matches }, status: matches ? "ALIGNED" : "DIVERGENT" };
    }
    case "ordinal": {
      const observed = actual as typeof expected;
      if (expected.order.join("\u0000") !== observed.order.join("\u0000")) {
        return { dimension, expected, actual, error: { kind: "unresolved", reason: "ORDINAL_SCALE_MISMATCH" }, status: "UNRESOLVED" };
      }
      const expectedIndex = expected.order.indexOf(expected.value);
      const actualIndex = expected.order.indexOf(observed.value);
      if (expectedIndex < 0 || actualIndex < 0) {
        return { dimension, expected, actual, error: { kind: "unresolved", reason: "ORDINAL_VALUE_UNKNOWN" }, status: "UNRESOLVED" };
      }
      const distance = Math.abs(expectedIndex - actualIndex);
      return { dimension, expected, actual, error: { kind: "ordinal", distance }, status: distance === 0 ? "ALIGNED" : "DIVERGENT" };
    }
    case "boolean": {
      const correct = expected.value === (actual as typeof expected).value;
      return { dimension, expected, actual, error: { kind: "boolean", correct }, status: correct ? "ALIGNED" : "DIVERGENT" };
    }
    case "structured_subjective": {
      const observed = actual as typeof expected;
      const matches = expected.category === observed.category;
      return {
        dimension,
        expected,
        actual,
        error: { kind: "structured_subjective", matches, extractionConfidence: clampConfidence(observed.extractionConfidence) },
        status: matches ? "ALIGNED" : "DIVERGENT",
      };
    }
    case "raw_text":
      return { dimension, expected, actual, error: { kind: "unresolved", reason: "RAW_TEXT_NOT_GROUND_TRUTH" }, status: "UNRESOLVED" };
  }
}

export function evaluateTypedOutcome(
  dimensions: Array<{ dimension: string; expected: TypedOutcome | null; actual: TypedOutcome | null }>,
): OutcomeEvaluation {
  if (dimensions.length === 0) return { dimensions: [], status: "UNUSABLE" };
  const evaluated = dimensions.map((item) => evaluateOutcomeDimension(item.dimension, item.expected, item.actual));
  const aligned = evaluated.some((item) => item.status === "ALIGNED");
  const divergent = evaluated.some((item) => item.status === "DIVERGENT");
  const resolved = evaluated.filter((item) => item.status !== "UNRESOLVED");
  const status = resolved.length === 0
    ? "UNRESOLVED"
    : aligned && divergent
      ? "MIXED"
      : divergent
        ? "DIVERGENT"
        : "ALIGNED";
  return { dimensions: evaluated, status };
}
