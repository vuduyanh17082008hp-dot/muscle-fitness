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
  providerSource.includes('"self_hosted"'),
  "provider supports self_hosted",
);
assert(
  providerSource.includes('value || "self_hosted"'),
  "default provider is self_hosted",
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
  errorsSource.includes("mapAiErrorToUserMessage"),
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

// Config validation sample (does not call network).
process.env.AI_PROVIDER = "self_hosted";
process.env.AI_BASE_URL = "http://localhost:8000/v1";
process.env.AI_API_KEY = "test-token";
process.env.AI_MODEL = "test-model";
delete process.env.VERCEL;

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
