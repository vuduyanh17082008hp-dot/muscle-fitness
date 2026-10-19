import { NextResponse } from "next/server";
import { z } from "zod";

import { generateCampaign } from "@/lib/ai/campaign-generation";
import { requireBusinessAdminApi } from "@/lib/business/require-business-admin";


export const runtime = "nodejs";


const requestSchema = z.object({
  objective:
    z.string().min(2).max(100),

  segmentName:
    z.string().min(2).max(100),

  segmentDescription:
    z.string().min(2).max(1000),

  memberCount:
    z.number().int().min(1).max(100000)
      .optional(),

  additionalContext:
    z.string().max(1500).optional(),
});


export async function POST(
  request: Request
) {
  const auth = await requireBusinessAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid campaign request" },
      { status: 400 },
    );
  }

  const result =
    requestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Invalid campaign request",
        details:
          result.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  try {
    const generated =
      await generateCampaign(
        result.data
      );

    return NextResponse.json(
      {
        ...generated,

        status: "draft",

        humanApprovalRequired: true,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Campaign generation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to generate campaign.",
      },
      {
        status: 500,
      }
    );
  }
}