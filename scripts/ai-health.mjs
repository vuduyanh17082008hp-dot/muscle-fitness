const base =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const url = `${base}/api/ai-coach/health`;

try {
  const response = await fetch(url);
  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
  process.exit(body.ok ? 0 : 1);
} catch (error) {
  console.error(
    "Unable to reach AI health endpoint. Is `npm run dev` running?",
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
