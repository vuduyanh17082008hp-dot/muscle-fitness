import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["26.169.20.28"],
  // Nutrition Coach reads the curated corpus from disk at runtime; keep it in the serverless bundle.
  outputFileTracingIncludes: { "/api/chatbot": ["./knowledge/nutrition/**/*", "./lib/nutrition/knowledge/vectors/*.json"] },
};

export default nextConfig;