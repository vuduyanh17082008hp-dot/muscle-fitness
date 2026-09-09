import "server-only";

import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error(
    "Missing GROQ_API_KEY. Add GROQ_API_KEY to .env.local."
  );
}

export const GROQ_MODEL =
  process.env.GROQ_MODEL?.trim() ||
  "openai/gpt-oss-120b";

export const groq = new Groq({
  apiKey,
});