import { NextResponse } from "next/server";
import { z } from "zod";

import { generateBusinessInsights } from "@/lib/ai/business-insights";


export const runtime = "nodejs";


const requestSchema = z.object({
  activeMembers:
    z.number().int().min(0),

  atRiskMembers:
    z.number().int().min(0),

  engagementRate:
    z.number().min(0).max(100),

  retentionRate:
    z.number().min(0).max(100),

  attendanceChangePercent:
    z.number().min(-100).max(1000)
      .optional(),

  peakHours:
    z.array(z.string()).max(24)
      .optional(),

  segmentMetrics:
    z.record(
      z.string(),
      z.number()
    ).optional(),
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
          error:
            "Invalid business insight payload",

          details:
            result.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const insights =
      await generateBusinessInsights(
        result.data
      );

    return NextResponse.json(
      insights,
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Business insight API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to generate business insights.",
      },
      {
        status: 500,
      }
    );
  }
}