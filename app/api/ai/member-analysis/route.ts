import { NextResponse } from "next/server";
import { z } from "zod";

import { analyseMember } from "@/lib/ai/member-analysis";


export const runtime = "nodejs";


const requestSchema = z.object({
  daysSinceLastVisit:
    z.number().min(0).max(3650),

  sessions30d:
    z.number().int().min(0).max(500),

  sessionsPrevious30d:
    z.number().int().min(0).max(500),

  workoutAdherence:
    z.number().min(0).max(100),

  engagementScore:
    z.number().min(0).max(100),

  progressSignal:
    z.number().min(0).max(100),
});


export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const result =
      requestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details:
            result.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const analysis =
      await analyseMember(
        result.data
      );

    return NextResponse.json(
      analysis,
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Member analysis API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to analyse member.",
      },
      {
        status: 500,
      }
    );
  }
}