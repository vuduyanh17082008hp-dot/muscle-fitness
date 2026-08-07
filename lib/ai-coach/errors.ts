import { AiProviderConfigError } from "@/lib/ai-coach/provider";

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
  };

  if (typeof candidate.status === "number") {
    return candidate.status;
  }

  if (typeof candidate.statusCode === "number") {
    return candidate.statusCode;
  }

  return null;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? "");
}

/**
 * Map provider/runtime errors to safe Vietnamese UI copy.
 * Never forward billing URLs, API keys, or stack traces to clients.
 */
export function mapAiErrorToUserMessage(error: unknown): string {
  if (error instanceof AiProviderConfigError) {
    if (error.code === "not_configured") {
      return "AI Coach chưa được cấu hình máy chủ AI.";
    }

    if (error.code === "invalid_production_url") {
      return "AI Coach chưa được cấu hình máy chủ AI.";
    }

    if (error.code === "missing_model") {
      return "Model AI được cấu hình hiện không khả dụng.";
    }

    if (error.code === "missing_key") {
      return "AI Coach chưa được cấu hình máy chủ AI.";
    }
  }

  const message = readMessage(error).toLowerCase();
  const status = readStatus(error);

  if (
    status === 401 ||
    status === 403 ||
    message.includes("incorrect api key") ||
    message.includes("invalid api key") ||
    message.includes("unauthorized") ||
    message.includes("authentication")
  ) {
    return "AI Coach chưa được cấu hình máy chủ AI.";
  }

  if (
    status === 404 ||
    message.includes("model") &&
      (message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("unavailable"))
  ) {
    return "Model AI được cấu hình hiện không khả dụng.";
  }

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("overloaded")
  ) {
    return "AI Coach đang quá tải. Vui lòng thử lại sau.";
  }

  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("not configured") ||
    message.includes("inference server")
  ) {
    return "Máy chủ AI hiện không thể kết nối. Vui lòng thử lại.";
  }

  if (
    message.includes("no credits") ||
    message.includes("billing") ||
    message.includes("platform.openai.com") ||
    message.includes("insufficient_quota")
  ) {
    return "AI Coach hiện chưa sẵn sàng. Vui lòng thử lại sau.";
  }

  return "AI Coach gặp lỗi khi xử lý yêu cầu.";
}

export function getDevAiErrorDetail(error: unknown): string | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const message = readMessage(error).trim();

  if (!message) {
    return null;
  }

  // Keep details short and never echo key-like material.
  if (/sk-[a-z0-9_-]{10,}/i.test(message) || /bearer\s+/i.test(message)) {
    return null;
  }

  return message.slice(0, 240);
}
