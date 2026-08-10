import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const providerCandidates = [
  "lib/ai/provider.ts",
  "src/lib/ai/provider.ts",
  "app/lib/ai/provider.ts",

  // Legacy locations
  "lib/ai-coach/provider.ts",
  "src/lib/ai-coach/provider.ts",
];

const envCandidates = [
  ".env.local",
  ".env",
];

function printHeader(title) {
  console.log("");
  console.log("=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function warn(message) {
  console.warn(`⚠ ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
}

function findFirstExistingFile(candidates) {
  for (const relativePath of candidates) {
    const absolutePath = path.join(root, relativePath);

    if (fs.existsSync(absolutePath)) {
      return {
        relativePath,
        absolutePath,
      };
    }
  }

  return null;
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Very small .env parser.
 *
 * Important:
 * - Used only for diagnostics.
 * - Does not print secret values.
 * - Supports KEY=value and quoted values.
 */
function parseEnvFile(source) {
  const result = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = line
      .slice(0, equalsIndex)
      .trim();

    let value = line
      .slice(equalsIndex + 1)
      .trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function looksConfigured(value) {
  if (!value) {
    return false;
  }

  const normalized = value
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  const placeholders = [
    "your-api-key",
    "your_api_key",
    "replace-me",
    "replace_with",
    "changeme",
    "example",
    "sk-your",
  ];

  return !placeholders.some((placeholder) =>
    normalized.includes(placeholder),
  );
}

function containsAny(source, patterns) {
  return patterns.some((pattern) =>
    source.includes(pattern),
  );
}

function loadLocalEnvironment() {
  const envFile = findFirstExistingFile(
    envCandidates,
  );

  if (!envFile) {
    return {
      file: null,
      values: {},
    };
  }

  const source = readTextFile(
    envFile.absolutePath,
  );

  return {
    file: envFile,
    values: parseEnvFile(source),
  };
}

function checkProviderSource(providerSource) {
  printHeader("2. PROVIDER IMPLEMENTATION");

  const hasOpenRouterBaseUrl =
    providerSource.includes(
      "https://openrouter.ai/api/v1",
    );

  if (hasOpenRouterBaseUrl) {
    pass(
      "OpenRouter base URL is configured.",
    );
  } else {
    warn(
      "Could not find the OpenRouter base URL in provider source.",
    );
  }

  const hasOpenRouterKey =
    providerSource.includes(
      "OPENROUTER_API_KEY",
    );

  if (hasOpenRouterKey) {
    pass(
      "Provider references OPENROUTER_API_KEY.",
    );
  } else {
    fail(
      "Provider does not reference OPENROUTER_API_KEY.",
    );
  }

  const hasProviderSelector =
    providerSource.includes("AI_PROVIDER");

  if (hasProviderSelector) {
    pass(
      "Explicit AI_PROVIDER selector exists.",
    );
  } else {
    fail(
      "AI_PROVIDER selector was not found.",
    );
  }

  const dangerousFallbackPatterns = [
    "process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY",
    "process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY",

    "process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY",
    "process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY",
  ];

  if (
    containsAny(
      providerSource,
      dangerousFallbackPatterns,
    )
  ) {
    fail(
      "Detected API-key based provider fallback. Provider selection must use AI_PROVIDER explicitly.",
    );
  } else {
    pass(
      "No obvious API-key based OpenAI/OpenRouter fallback detected.",
    );
  }

  const openAiMentioned =
    providerSource.includes(
      "OPENAI_API_KEY",
    );

  if (openAiMentioned) {
    warn(
      "OPENAI_API_KEY exists in provider source. This is acceptable only as an explicitly selected optional provider.",
    );
  } else {
    pass(
      "Provider has no OPENAI_API_KEY dependency.",
    );
  }

  const exportsClient =
    /export\s+(async\s+)?function\s+getAiClient\b/.test(
      providerSource,
    ) ||
    /export\s+const\s+getAiClient\b/.test(
      providerSource,
    );

  const exportsModel =
    /export\s+(async\s+)?function\s+getAiModel\b/.test(
      providerSource,
    ) ||
    /export\s+const\s+getAiModel\b/.test(
      providerSource,
    );

  const exportsSafeInfo =
    /export\s+(async\s+)?function\s+getSafeProviderInfo\b/.test(
      providerSource,
    ) ||
    /export\s+const\s+getSafeProviderInfo\b/.test(
      providerSource,
    );

  if (exportsClient) {
    pass(
      "getAiClient export found.",
    );
  } else {
    fail(
      "getAiClient export not found.",
    );
  }

  if (exportsModel) {
    pass(
      "getAiModel export found.",
    );
  } else {
    fail(
      "getAiModel export not found.",
    );
  }

  if (exportsSafeInfo) {
    pass(
      "getSafeProviderInfo export found.",
    );
  } else {
    warn(
      "getSafeProviderInfo export not found.",
    );
  }
}

function checkEnvironment(env) {
  printHeader("3. LOCAL ENVIRONMENT");

  if (env.file) {
    pass(
      `Loaded ${env.file.relativePath}`,
    );
  } else {
    warn(
      "No .env.local or .env file found.",
    );
  }

  const provider =
    env.values.AI_PROVIDER
      ?.trim()
      .toLowerCase() || "openrouter";

  console.log(
    `AI provider: ${provider}`,
  );

  if (provider === "openrouter") {
    pass(
      "OpenRouter is selected.",
    );

    if (
      looksConfigured(
        env.values.OPENROUTER_API_KEY,
      )
    ) {
      pass(
        "OPENROUTER_API_KEY is configured.",
      );
    } else {
      fail(
        "OPENROUTER_API_KEY is missing or appears to be a placeholder.",
      );
    }

    if (
      looksConfigured(
        env.values.OPENROUTER_MODEL,
      )
    ) {
      pass(
        "OPENROUTER_MODEL is configured.",
      );
    } else {
      warn(
        "OPENROUTER_MODEL is not configured. Recommended: openrouter/free",
      );
    }

    if (
      looksConfigured(
        env.values.OPENAI_API_KEY,
      )
    ) {
      warn(
        "OPENAI_API_KEY is also present. Ensure provider.ts does not automatically select it.",
      );
    } else {
      pass(
        "OpenRouter does not depend on a configured OpenAI key.",
      );
    }

    return;
  }

  if (provider === "openai") {
    warn(
      "AI_PROVIDER=openai. Muscle Fitness will use OpenAI instead of OpenRouter.",
    );

    if (
      looksConfigured(
        env.values.OPENAI_API_KEY,
      )
    ) {
      pass(
        "OPENAI_API_KEY is configured.",
      );
    } else {
      fail(
        "OPENAI_API_KEY is missing.",
      );
    }

    return;
  }

  fail(
    `Unsupported AI_PROVIDER="${provider}". Expected "openrouter" or "openai".`,
  );
}

function checkSupabaseEnvironment(env) {
  printHeader("4. SUPABASE ENVIRONMENT");

  const url =
    env.values.NEXT_PUBLIC_SUPABASE_URL;

  if (!looksConfigured(url)) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL is missing.",
    );
  } else {
    pass(
      "NEXT_PUBLIC_SUPABASE_URL is configured.",
    );
  }

  const publicKey =
    env.values
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.values
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (looksConfigured(publicKey)) {
    pass(
      "Supabase browser/public key is configured.",
    );
  } else {
    fail(
      "Supabase browser/public key is missing.",
    );
  }

  if (
    looksConfigured(
      env.values.SUPABASE_SERVICE_ROLE_KEY,
    )
  ) {
    pass(
      "SUPABASE_SERVICE_ROLE_KEY is configured server-side.",
    );
  } else {
    warn(
      "SUPABASE_SERVICE_ROLE_KEY is not configured.",
    );
  }
}

function main() {
  printHeader(
    "MUSCLE FITNESS — AI PROVIDER CHECK",
  );

  console.log(
    `Project: ${root}`,
  );

  const provider =
    findFirstExistingFile(
      providerCandidates,
    );

  printHeader("1. PROVIDER FILE");

  if (!provider) {
    fail(
      "Could not find the AI provider file.",
    );

    console.error("");
    console.error(
      "Checked these locations:",
    );

    for (
      const candidate
      of providerCandidates
    ) {
      console.error(
        `  - ${candidate}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  pass(
    `Provider found: ${provider.relativePath}`,
  );

  const providerSource =
    readTextFile(
      provider.absolutePath,
    );

  checkProviderSource(
    providerSource,
  );

  const env =
    loadLocalEnvironment();

  checkEnvironment(env);

  checkSupabaseEnvironment(env);

  printHeader("5. NEXT STEPS");

  console.log(
    "Run:",
  );

  console.log(
    "  npx tsc --noEmit",
  );

  console.log(
    "  npm run build",
  );

  console.log("");
  console.log(
    "Then start the app:",
  );

  console.log(
    "  npm run dev",
  );

  console.log("");
  console.log(
    "Test:",
  );

  console.log(
    "  http://localhost:3000/api/ai/test",
  );

  console.log("");
  console.log(
    "No secret values were printed by this checker.",
  );
}

try {
  main();
} catch (error) {
  fail(
    "AI provider check crashed unexpectedly.",
  );

  if (error instanceof Error) {
    console.error(
      error.message,
    );
  }

  process.exitCode = 1;
}