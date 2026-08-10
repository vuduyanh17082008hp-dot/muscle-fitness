export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const responseBody = {
  error: "Legacy chatbot API has been removed.",
  replacement: "/api/ai-coach/chat",
};

export async function GET() {
  return Response.json(responseBody, {
    status: 410,
  });
}

export async function POST() {
  return Response.json(responseBody, {
    status: 410,
  });
}