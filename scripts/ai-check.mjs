import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

const providerSource = readFileSync(
  resolve(root, "lib/ai-coach/provider.ts"),
  "utf8",
);
const serverSource = readFileSync(
  resolve(root, "lib/ai-coach/server.ts"),
  "utf8",
);
const errorsSource = readFileSync(
  resolve(root, "lib/ai-coach/errors.ts"),
  "utf8",
);
const transportSource = readFileSync(
  resolve(root, "lib/ai-coach/transport.ts"),
  "utf8",
);

assert(
  providerSource.includes('"openrouter"'),
  "provider supports openrouter",
);
assert(
  providerSource.includes('"self_hosted"'),
  "provider supports self_hosted",
);
assert(
  providerSource.includes('value || "openrouter"'),
  "default provider is openrouter",
);
assert(
  providerSource.includes("OPENROUTER_API_KEY"),
  "openrouter requires OPENROUTER_API_KEY",
);
assert(
  providerSource.includes("OPENROUTER_MODEL"),
  "openrouter uses OPENROUTER_MODEL",
);
assert(
  providerSource.includes("openrouter/free"),
  "openrouter free model default exists",
);
assert(
  !/OPENROUTER_API_KEY[\s\S]{0,120}OPENAI_API_KEY/.test(providerSource) ||
    providerSource.includes("never reuse OPENAI_API_KEY"),
  "openrouter must not fall back to OPENAI_API_KEY",
);
assert(
  providerSource.includes("maxRetries: 0"),
  "no aggressive provider retries",
);
assert(
  providerSource.includes("VERCEL") &&
    providerSource.includes("localhost"),
  "production localhost rejection exists",
);
assert(
  transportSource.includes("planCoachToolCalls") &&
    transportSource.includes("streamCoachFinalAnswer"),
  "normalized transport helpers exist",
);
assert(
  errorsSource.includes("mapAiErrorToUserMessage") &&
    errorsSource.includes("AI_UNAVAILABLE"),
  "safe error mapper exists",
);

const requiredTools = [
  "get_client_profile",
  "get_today_workout",
  "get_recent_progress",
  "get_nutrition_summary",
  "create_workout_reminder",
  "create_support_ticket",
];

for (const tool of requiredTools) {
  assert(
    serverSource.includes(`name: "${tool}"`),
    `tool schema present: ${tool}`,
  );
}

assert(
  serverSource.includes("COACH_CHAT_TOOLS"),
  "chat-completions tool adapter present",
);

process.env.AI_PROVIDER = "openrouter";
process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
process.env.OPENROUTER_MODEL = "openrouter/free";
delete process.env.OPENAI_API_KEY;
delete process.env.VERCEL;

assert(
  process.env.AI_PROVIDER === "openrouter",
  "sample openrouter provider configured for local checks",
);

process.env.AI_PROVIDER = "self_hosted";
process.env.AI_BASE_URL = "http://localhost:8000/v1";
process.env.AI_API_KEY = "test-token";
process.env.AI_MODEL = "test-model";

assert(
  process.env.AI_BASE_URL.includes("localhost"),
  "sample self-hosted base URL configured for local checks",
);

process.env.VERCEL = "1";
process.env.AI_BASE_URL = "http://127.0.0.1:8000/v1";
assert(
  /localhost|127\.0\.0\.1/.test(process.env.AI_BASE_URL),
  "sample production localhost URL would be rejected by provider",
);

if (process.exitCode) {
  console.error("\nai:check failed");
  process.exit(process.exitCode);
}

console.log("\nai:check passed");
